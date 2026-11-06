import { hasGoogle, useStore } from './store'
import type { Day, Place, PlaceKind, Stop } from './types'
import { shortName, type Fix } from './lib/schedule'
import { bestPlacement, betterDay, placeAt, removeWithRepair, reorderWithLegs, type Placement } from './lib/placement'
import { candidateToPlace, findCandidatePlace, type Candidate } from './candidates'
import { haversineMeters } from './lib/geo'
import { fmtDur, uid } from './lib/time'

const DEFAULT_STAY: Record<PlaceKind, number> = {
  sight: 60,
  food: 60,
  cafe: 40,
  shop: 40,
  onsen: 90,
  hotel: 30,
  airport: 0,
  other: 45,
}

export function defaultStay(p: Place) {
  return p.defaultStay ?? DEFAULT_STAY[p.kind]
}

/** 같은 구글 장소·같은 위치가 이미 있으면 그걸 재사용 */
export function upsertPlace(p: Omit<Place, 'id'> & { id?: string }): string {
  const { trip, mutate } = useStore.getState()
  if (!trip) return ''
  const existing = Object.values(trip.places).find(
    (x) =>
      (p.googlePlaceId && x.googlePlaceId === p.googlePlaceId) ||
      (x.name === p.name && haversineMeters(x.location, p.location) < 150),
  )
  if (existing) return existing.id
  const id = p.id ?? `p-${uid()}`
  mutate((t) => {
    t.places[id] = { ...p, id }
  })
  return id
}

/** 자동으로 넣은 자리를 사람이 읽을 말로. 그날 동선과 멀면 더 맞는 날도 알려준다 */
function placementText(p: Placement, stayBefore: number, better?: { dayIndex: number; addedDrive: number }): string {
  const where = p.afterName ? `${shortName(p.afterName)} 다음` : '맨 앞'
  const how = p.mode === 'WALK' ? ', 걸어서' : p.mode === 'MANUAL' ? ', 택시로' : ''
  const stay = p.stay < stayBefore ? `, 체류는 ${fmtDur(p.stay)}으로 줄였어요` : ''
  const far = better
    ? `. 이 날 동선에서 멀어 운전이 ${fmtDur(p.addedDrive)} 늘어요. D${better.dayIndex + 1}에 넣으면 ${better.addedDrive >= 1 ? `${fmtDur(better.addedDrive)}만 늘어요` : '거의 늘지 않아요'}`
    : ''
  return `${where}${how}${stay}${far}`
}

/**
 * 장소를 하루에 넣는다. index 를 주면 그 자리에, 안 주면 가장 맞는 자리를 찾아 넣고 어디에 넣었는지 돌려준다.
 */
export function addStop(dayId: string, placeId: string, index?: number): string | undefined {
  const st = useStore.getState()
  const { trip, routes, mutate } = st
  const place = trip?.places[placeId]
  const dayIndex = trip ? trip.days.findIndex((d) => d.id === dayId) : -1
  if (!trip || !place || dayIndex < 0) return
  const google = hasGoogle(st)
  const stop: Stop = { id: uid(), placeId, stay: defaultStay(place) }
  const placement = index == null ? bestPlacement(trip, routes, dayIndex, stop, google) : undefined
  const stops = placement?.stops ?? placeAt(trip, routes, dayIndex, stop, index!, google)
  mutate((t) => {
    t.days[dayIndex].stops = stops
    t.wishlist = t.wishlist.filter((w) => w !== placeId)
  })
  return placement && placementText(placement, stop.stay, betterDay(trip, routes, dayIndex, stop, placement, google))
}

export function updateStop(dayId: string, stopId: string, patch: Partial<Stop>) {
  useStore.getState().mutate((t) => {
    const s = t.days.find((d) => d.id === dayId)?.stops.find((x) => x.id === stopId)
    if (!s) return
    Object.assign(s, patch)
    for (const k of Object.keys(patch) as (keyof Stop)[]) if (patch[k] === undefined) delete s[k]
  })
}

export function removeStop(dayId: string, stopId: string, toWishlist = false) {
  useStore.getState().mutate((t) => {
    const d = t.days.find((x) => x.id === dayId)
    if (!d) return
    const s = d.stops.find((x) => x.id === stopId)
    d.stops = d.stops.filter((x) => x.id !== stopId)
    if (toWishlist && s && !t.wishlist.includes(s.placeId)) t.wishlist.unshift(s.placeId)
  })
}

/** 다른 날로 옮긴다. 맨 뒤가 아니라 그날에서 가장 맞는 자리에 넣고, 어디에 넣었는지 돌려준다 */
export function moveStopToDay(fromDayId: string, stopId: string, toDayId: string): string | undefined {
  const st = useStore.getState()
  const { trip, routes, mutate } = st
  if (!trip) return
  const a = trip.days.findIndex((d) => d.id === fromDayId)
  const b = trip.days.findIndex((d) => d.id === toDayId)
  const stop = trip.days[a]?.stops.find((s) => s.id === stopId)
  if (a < 0 || b < 0 || !stop || a === b) return
  const google = hasGoogle(st)
  const placement = bestPlacement(trip, routes, b, stop, google)
  const remaining = removeWithRepair(trip, routes, a, stopId, google)
  mutate((t) => {
    t.days[a].stops = remaining
    t.days[b].stops = placement.stops
  })
  // 원래 날을 뺀 상태에서 더 맞는 날을 찾는다 (원래 날이 가장 맞으면 그날을 알려준다)
  const without = { ...trip, days: trip.days.map((d, i) => (i === a ? { ...d, stops: remaining } : d)) }
  return placementText(placement, stop.stay, betterDay(without, routes, b, stop, placement, google))
}

/** 같은 날 안에서 순서를 바꾼다. 옮긴 곳의 이동 수단은 새 자리에 맞춘다 */
export function reorderStops(dayId: string, fromIndex: number, toIndex: number) {
  const st = useStore.getState()
  const { trip, routes, mutate } = st
  if (!trip) return
  const dayIndex = trip.days.findIndex((d) => d.id === dayId)
  const count = trip.days[dayIndex]?.stops.length ?? 0
  if (dayIndex < 0 || fromIndex === toIndex || toIndex < 0 || toIndex >= count) return
  const stops = reorderWithLegs(trip, routes, dayIndex, fromIndex, toIndex, hasGoogle(st))
  mutate((t) => {
    t.days[dayIndex].stops = stops
  })
}

export function updateDay(dayId: string, patch: Partial<Day>) {
  useStore.getState().mutate((t) => {
    const d = t.days.find((x) => x.id === dayId)
    if (!d) return
    Object.assign(d, patch)
    for (const k of Object.keys(patch) as (keyof Day)[]) if (patch[k] === undefined) delete d[k]
  })
}

export function updatePlace(placeId: string, patch: Partial<Place>) {
  useStore.getState().mutate((t) => {
    const p = t.places[placeId]
    if (!p) return
    Object.assign(p, patch)
    for (const k of Object.keys(patch) as (keyof Place)[]) if (patch[k] === undefined) delete p[k]
  })
}

export function deletePlace(placeId: string) {
  useStore.getState().mutate((t) => {
    delete t.places[placeId]
    t.wishlist = t.wishlist.filter((w) => w !== placeId)
    for (const d of t.days) {
      d.stops = d.stops.filter((s) => s.placeId !== placeId)
      if (d.lodgingPlaceId === placeId) delete d.lodgingPlaceId
      if (d.startPlaceId === placeId) delete d.startPlaceId
    }
  })
  useStore.getState().openPlace(undefined)
}

export function addDay(afterIndex?: number) {
  const { mutate } = useStore.getState()
  let newId = ''
  mutate((t) => {
    const at = afterIndex == null ? t.days.length : afterIndex + 1
    const day: Day = { id: uid(), title: '', startTime: '09:00', stops: [] }
    newId = day.id
    t.days.splice(at, 0, day)
  })
  useStore.getState().selectDay(newId)
}

export function deleteDay(dayId: string) {
  const { trip, mutate, selectDay } = useStore.getState()
  if (!trip || trip.days.length <= 1) return
  const idx = trip.days.findIndex((d) => d.id === dayId)
  mutate((t) => {
    const d = t.days[idx]
    for (const s of d.stops) if (!t.wishlist.includes(s.placeId)) t.wishlist.push(s.placeId)
    t.days.splice(idx, 1)
  })
  const next = useStore.getState().trip!.days[Math.max(0, idx - 1)]
  selectDay(next.id)
}

export function moveDay(dayId: string, dir: -1 | 1) {
  useStore.getState().mutate((t) => {
    const i = t.days.findIndex((d) => d.id === dayId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= t.days.length) return
    ;[t.days[i], t.days[j]] = [t.days[j], t.days[i]]
  })
}

/** 테마 후보를 일정 데이터의 장소로 등록하고 id 를 돌려준다 */
export function ensureCandidatePlace(c: Candidate): string {
  const { trip, mutate } = useStore.getState()
  if (!trip) return ''
  const existing = findCandidatePlace(trip, c)
  if (existing) return existing.id
  const place = candidateToPlace(c)
  mutate((t) => {
    t.places[place.id] = place
  })
  return place.id
}

/** 테마 후보를 장소함에 담는다 (이미 있는 장소면 그대로 쓰고, 일정에 있으면 장소함엔 넣지 않음) */
export function addCandidate(c: Candidate) {
  const id = ensureCandidatePlace(c)
  useStore.getState().mutate((t) => {
    const scheduled = t.days.some((d) => d.lodgingPlaceId === id || d.startPlaceId === id || d.stops.some((s) => s.placeId === id))
    if (!scheduled && !t.wishlist.includes(id)) t.wishlist.unshift(id)
  })
}

/**
 * dayIndex 밤부터 nights 박을 이 숙소로 바꾼다.
 * 체크인·체크아웃처럼 일정 안에 들어 있던 이전 숙소 방문도 함께 바꾸고, 이전 숙소는 장소함에 남긴다.
 */
export function applyLodging(dayIndex: number, placeId: string, nights = 1) {
  useStore.getState().mutate((t) => {
    const end = Math.min(dayIndex + nights, t.days.length)
    const replaced = new Set<string>()
    for (let i = dayIndex; i < end; i++) {
      const old = t.days[i].lodgingPlaceId
      if (old && old !== placeId) replaced.add(old)
      t.days[i].lodgingPlaceId = placeId
    }
    for (let i = dayIndex; i <= end && i < t.days.length; i++) {
      const d = t.days[i]
      for (const s of d.stops) if (replaced.has(s.placeId)) s.placeId = placeId
      if (d.startPlaceId && replaced.has(d.startPlaceId)) delete d.startPlaceId
    }
    for (const old of replaced) {
      const stillUsed = t.days.some((d) => d.lodgingPlaceId === old || d.startPlaceId === old || d.stops.some((s) => s.placeId === old))
      if (!stillUsed && !t.wishlist.includes(old)) t.wishlist.push(old)
    }
    t.wishlist = t.wishlist.filter((w) => w !== placeId)
  })
}

/** 장소를 하루에 넣는다. 숙소는 그날 밤 숙소로, 나머지는 방문지로. 넣은 자리를 말로 돌려준다 */
export function addPlaceToDay(dayIndex: number, placeId: string): string | undefined {
  const { trip } = useStore.getState()
  const day = trip?.days[dayIndex]
  if (!day) return
  if (trip.places[placeId]?.kind === 'hotel') {
    applyLodging(dayIndex, placeId, 1)
    return '그날 밤 숙소'
  }
  return addStop(day.id, placeId)
}

export function applyFix(fix: Fix) {
  if (fix.kind === 'setFixedTime') updateStop(fix.dayId, fix.stopId, { fixedTime: fix.value })
  if (fix.kind === 'markAlwaysOpen') updatePlace(fix.placeId, { alwaysOpen: true })
  if (fix.kind === 'shiftStart') updateDay(fix.dayId, { startTime: fix.value })
  if (fix.kind === 'openPlace') useStore.getState().openPlace(fix.placeId)
}
