import type { Day, Place, Trip } from '../types'
import { shortName, type DayPlan } from './schedule'
import { josa, travelersOf } from './people'

// 두 일정이 어떻게 다른지 사람이 읽을 수 있는 문장으로 만든다.
// 저장할 때 변경 기록의 제목으로 쓰고, 예전 버전을 볼 때 지금과 비교하는 데도 쓴다.

const nameOf = (t: Trip, id?: string) => (id && t.places[id] ? shortName(t.places[id].name) : '장소')

// 구글에서 다시 받아오면 저절로 바뀌는 값은 수정으로 치지 않는다
const AUTO_FIELDS: (keyof Place)[] = ['verifiedAt', 'rating', 'ratingCount', 'businessStatus', 'googleMapsUri', 'googleName', 'googlePlaceId', 'address', 'phone', 'website', 'hours', 'location', 'matchWarning']

function placeSignature(p: Place): string {
  const rest: Partial<Place> = { ...p }
  for (const k of AUTO_FIELDS) delete rest[k]
  return JSON.stringify(rest)
}

const stopSignature = (d: Day) => JSON.stringify(d.stops.map((s) => [s.placeId, s.stay, s.fixedTime, s.legMode, s.manualMinutes, s.meal]))

export function describeChanges(from: Trip, to: Trip): string[] {
  const out: string[] = []
  const people = travelersOf(to)
  const who = (id: string) => people.find((p) => p.id === id)?.name ?? id
  // 후보를 1순위로 올린 것: 장소가 바뀌었지만 서로 후보 자리를 맞바꾼 경우
  const swapped = new Set<string>()
  for (const d of to.days) {
    const old = from.days.find((x) => x.id === d.id)
    for (const s of d.stops) {
      const o = old?.stops.find((x) => x.id === s.id)
      if (!o || o.placeId === s.placeId) continue
      if (o.alts?.some((a) => a.placeId === s.placeId) && s.alts?.some((a) => a.placeId === o.placeId)) {
        swapped.add(`${d.id}|${o.placeId}`).add(`${d.id}|${s.placeId}`)
        out.push(`D${to.days.indexOf(d) + 1} ${josa(nameOf(to, s.placeId), '으로', '로')} 결정 (${josa(nameOf(from, o.placeId), '은', '는')} 후보로)`)
      }
    }
  }
  if (from.title !== to.title) out.push('여행 제목 변경')
  if (from.startDate !== to.startDate) out.push(`출발일을 ${to.startDate}로 변경`)
  if (from.days.length !== to.days.length) out.push(`일정이 ${from.days.length}일에서 ${to.days.length}일로 변경`)

  const label = (t: Trip, id: string) => `D${t.days.findIndex((d) => d.id === id) + 1}`
  const fromDays = new Map(from.days.map((d) => [d.id, d]))

  // 빠진 곳과 들어온 곳을 모아 두었다가, 같은 장소면 "옮김"으로 합친다
  const removed: { dayId: string; placeId: string }[] = []
  const added: { dayId: string; placeId: string }[] = []
  for (const d of to.days) {
    const old = fromDays.get(d.id)
    if (!old) {
      for (const s of d.stops) added.push({ dayId: d.id, placeId: s.placeId })
      continue
    }
    const before = old.stops.map((s) => s.placeId)
    const after = d.stops.map((s) => s.placeId)
    for (const id of after) if (!before.includes(id) && !swapped.has(`${d.id}|${id}`)) added.push({ dayId: d.id, placeId: id })
    for (const id of before) if (!after.includes(id) && !swapped.has(`${d.id}|${id}`)) removed.push({ dayId: d.id, placeId: id })
  }

  for (const r of removed) {
    const i = added.findIndex((a) => a.placeId === r.placeId)
    if (i >= 0) {
      out.push(`${nameOf(to, r.placeId)}을(를) ${label(to, r.dayId)}에서 ${label(to, added[i].dayId)}로 옮김`)
      added.splice(i, 1)
    } else out.push(`${label(to, r.dayId)}에서 ${nameOf(from, r.placeId)} 뺌`)
  }
  for (const a of added) out.push(`${label(to, a.dayId)}에 ${nameOf(to, a.placeId)} 추가`)

  for (const d of to.days) {
    const old = fromDays.get(d.id)
    if (!old) continue
    const tag = label(to, d.id)
    if (old.lodgingPlaceId !== d.lodgingPlaceId) out.push(d.lodgingPlaceId ? `${tag} 숙소를 ${nameOf(to, d.lodgingPlaceId)}(으)로 변경` : `${tag} 숙소 비움`)
    if (old.startTime !== d.startTime) out.push(`${tag} 출발 ${d.startTime}으로 변경`)
    if ((old.title ?? '') !== (d.title ?? '')) out.push(`${tag} 제목 변경`)
    if ((old.note ?? '') !== (d.note ?? '')) out.push(`${tag} 메모 변경`)
    const sameSet = old.stops.map((s) => s.placeId).sort().join() === d.stops.map((s) => s.placeId).sort().join()
    if (sameSet && stopSignature(old) !== stopSignature(d)) {
      const sameOrder = old.stops.every((s, i) => s.placeId === d.stops[i]?.placeId)
      out.push(sameOrder ? `${tag} 시간·이동 수단 변경` : `${tag} 순서 변경`)
    } else if (sameSet && old.stops.some((s, i) => (s.note ?? '') !== (d.stops[i]?.note ?? ''))) {
      out.push(`${tag} 장소 메모 변경`)
    }
  }

  // 후보와 픽
  for (const d of to.days) {
    const old = fromDays.get(d.id)
    if (!old) continue
    const tag = label(to, d.id)
    for (const s of d.stops) {
      const o = old.stops.find((x) => x.id === s.id)
      if (!o) continue
      const wasSwapped = o.placeId !== s.placeId
      const oldAlts = new Map((o.alts ?? []).map((a) => [a.placeId, a]))
      const newAlts = new Map((s.alts ?? []).map((a) => [a.placeId, a]))
      if (!wasSwapped) {
        for (const id of newAlts.keys()) if (!oldAlts.has(id)) out.push(`${tag} ${nameOf(to, s.placeId)} 후보에 ${nameOf(to, id)} 추가`)
        for (const id of oldAlts.keys()) if (!newAlts.has(id)) out.push(`${tag} ${nameOf(to, s.placeId)} 후보에서 ${nameOf(from, id)} 뺌`)
      }
      // 장소별로 픽이 바뀐 것 (지금 장소와 후보 모두)
      const picksBefore = new Map<string, string[]>([[o.placeId, o.picks ?? []], ...[...oldAlts].map(([id, a]) => [id, a.picks ?? []] as [string, string[]])])
      const picksAfter = new Map<string, string[]>([[s.placeId, s.picks ?? []], ...[...newAlts].map(([id, a]) => [id, a.picks ?? []] as [string, string[]])])
      for (const [id, now] of picksAfter) {
        const was = picksBefore.get(id) ?? []
        for (const p of now) if (!was.includes(p)) out.push(`${josa(who(p), '이', '가')} ${nameOf(to, id)} 픽`)
        for (const p of was) if (!now.includes(p) && picksBefore.has(id)) out.push(`${josa(who(p), '이', '가')} ${nameOf(to, id)} 픽 취소`)
      }
    }
  }

  for (const id of to.wishlist) if (!from.wishlist.includes(id)) out.push(`장소함에 ${nameOf(to, id)} 추가`)
  for (const id of from.wishlist) if (!to.wishlist.includes(id)) out.push(`장소함에서 ${nameOf(from, id)} 뺌`)

  for (const [id, p] of Object.entries(to.places)) {
    const old = from.places[id]
    if (old && placeSignature(old) !== placeSignature(p)) out.push(`${shortName(p.name)} 정보 수정`)
  }
  if (out.length === 0) {
    const refreshed = Object.entries(to.places).some(([id, p]) => from.places[id] && from.places[id].verifiedAt !== p.verifiedAt)
    if (refreshed) out.push('구글 영업정보 갱신')
  }

  if (JSON.stringify(from.checklist) !== JSON.stringify(to.checklist)) out.push('체크리스트 변경')
  if (JSON.stringify(from.settings) !== JSON.stringify(to.settings)) out.push('설정 변경')
  return out
}

/** 변경 기록에 남길 한 줄 */
export function changeSummary(changes: string[]): string {
  if (!changes.length) return '일정 저장'
  const shown = changes.slice(0, 2).join(', ')
  return changes.length > 2 ? `${shown} 외 ${changes.length - 2}건` : shown
}

/** 예전 기록은 자동 제목이 영어로 남아 있어 읽기 좋게 바꾼다 */
export function historyLabel(message: string): string {
  const title = message.split('\n')[0]
  if (title === 'update trip.json') return '일정 저장'
  if (title === 'add trip.json') return '처음 올린 일정'
  return title
}

/** 일정 내용이 같은지 빠르게 비교하기 위한 값 */
export function tripFingerprint(t: Trip): string {
  const text = JSON.stringify(t.days.map((d) => [d.startTime, d.startPlaceId, d.lodgingPlaceId, d.stops.map((s) => [s.placeId, s.stay, s.fixedTime, s.legMode, s.manualMinutes, s.meal])]))
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export type VersionSummary = {
  hotels: { name: string; nights: number }[]
  driveMin: number
  maxDriveMin: number
  carFreeDays: number
  tollYen?: number
  tollUnknown?: number
}

export function summarizePlans(plans: DayPlan[]): VersionSummary {
  const hotels: VersionSummary['hotels'] = []
  for (const p of plans) {
    if (!p.lodging) continue
    const name = shortName(p.lodging.name)
    const last = hotels[hotels.length - 1]
    if (last?.name === name) last.nights++
    else hotels.push({ name, nights: 1 })
  }
  return {
    hotels,
    driveMin: plans.reduce((sum, p) => sum + p.driveMin, 0),
    maxDriveMin: Math.max(0, ...plans.map((p) => p.driveMin)),
    carFreeDays: plans.filter((p) => p.stops.length > 0 && p.driveMin === 0).length,
    tollYen: plans.reduce((sum, p) => sum + p.tollYen, 0),
    tollUnknown: plans.reduce((sum, p) => sum + p.tollUnknown, 0),
  }
}

// ---------- 버전 비교 ----------

export type DigestPlace = { key: string; name: string; kind: Place['kind']; golf: boolean; days: number[]; nights: number; meals: ('lunch' | 'dinner')[] }
export type VersionDigest = { places: DigestPlace[] }

const GOLF = /골프|golf|\bGC\b|\bCC\b/i

/** 같은 장소를 버전끼리 맞춰 보기 위한 값. 구글 장소가 연결돼 있으면 그걸 쓴다 */
const placeKey = (p: Place) => p.googlePlaceId ?? p.id

/** 한 버전에서 어디를 며칠째에 가는지 뽑는다. 다 받지 않아도 비교할 수 있게 작게 만든다 */
export function digestTrip(t: Trip): VersionDigest {
  const map = new Map<string, DigestPlace>()
  const at = (p: Place) => {
    const key = placeKey(p)
    let d = map.get(key)
    if (!d) map.set(key, (d = { key, name: shortName(p.name), kind: p.kind, golf: GOLF.test(p.name), days: [], nights: 0, meals: [] }))
    return d
  }
  t.days.forEach((day, i) => {
    for (const s of day.stops) {
      const p = t.places[s.placeId]
      if (!p) continue
      const d = at(p)
      if (!d.days.includes(i + 1)) d.days.push(i + 1)
      if ((s.meal === 'lunch' || s.meal === 'dinner') && !d.meals.includes(s.meal)) d.meals.push(s.meal)
    }
    const stay = day.lodgingPlaceId ? t.places[day.lodgingPlaceId] : undefined
    if (stay) {
      const d = at(stay)
      d.nights++
      if (!d.days.includes(i + 1)) d.days.push(i + 1)
    }
  })
  return { places: [...map.values()] }
}

/** 연속된 날은 D2~4 로 줄여 쓴다 */
export function dayRange(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    let j = i
    while (sorted[j + 1] === sorted[j] + 1) j++
    out.push(i === j ? `D${sorted[i]}` : `D${sorted[i]}~${sorted[j]}`)
    i = j
  }
  return out.join(' ')
}
