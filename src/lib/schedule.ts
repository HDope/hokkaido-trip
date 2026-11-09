import type { Day, LegMode, Place, PlaceKind, RouteLeg, Stop, Trip } from '../types'
import { haversineMeters } from './geo'
import { checkHours, type HoursCheck } from './hours'
import { resolveLeg, type ResolvedLeg } from './routing'
import { sunTimes } from './sun'
import { dayDate, fmtDur, fmtHM, fmtKm, parseHM, WEEKDAYS_KO } from './time'

export type Level = 'critical' | 'serious' | 'warning' | 'info'

export type Fix =
  | { kind: 'setFixedTime'; stopId: string; dayId: string; value: string; label: string }
  | { kind: 'markAlwaysOpen'; placeId: string; label: string }
  | { kind: 'shiftStart'; dayId: string; value: string; label: string }
  | { kind: 'openPlace'; placeId: string; label: string }

export type Warning = { level: Level; text: string; fix?: Fix }

export type LegPlan = {
  from: Place
  to: Place
  mode: LegMode
  resolved: ResolvedLeg
  minutes: number // 표시·계산에 쓰는 이동시간 (확정값 또는 추정치)
  buffer: number // 주차·도보 여유
  meters: number
  tollYen?: number | null // 운전 구간의 예상 톨비
  start: number
  end: number
  confirmed: boolean
  warnings: Warning[]
}

export type StopPlan = {
  stop: Stop
  place: Place
  leg?: LegPlan
  arrive: number
  depart: number
  wait: number
  hours: HoursCheck
  warnings: Warning[]
  meal?: Meal
}

export type Meal = 'lunch' | 'dinner'

export type BreakfastPlan = { place: Place; start: number; end: number; minutes: number; known: boolean }

export const BREAKFAST_LABEL = '🍳 아침'
/** 조식에 잡는 시간과, 먹고 나서 출발할 때까지의 준비 시간(분) */
const BREAKFAST_MIN = 45
const BREAKFAST_READY = 10
/** 차에서 이보다 멀어지면 차를 가지러 걸어가야 한다 */
export const CAR_LEFT_M = 400
/** 해 진 뒤 이 시간 넘게 걸으면 알려준다(분) */
const NIGHT_WALK_MIN = 20
/** 시음이 있는 곳 */
const ALCOHOL = /와이너리|도멘|양조|주조|맥주|비어|ワイナリー|ワイン|ドメーヌ|酒造|ビール|winery|domaine|brewery/i

export type DayPlan = {
  day: Day
  title: string // 직접 쓴 제목, 없으면 일정에서 만든 제목
  autoTitle: string
  breakfast?: BreakfastPlan
  lunch?: StopPlan
  dinner?: StopPlan
  index: number
  date: Date
  weekday: number
  startPlace?: Place
  start: number
  stops: StopPlan[]
  endLeg?: LegPlan
  lodging?: Place
  end: number
  driveMin: number
  driveMeters: number
  tollYen: number // 하루 예상 톨비 합계
  tollUnknown: number // 톨비를 모르는 운전 구간 수
  stayMin: number
  waitMin: number
  sun?: { sunrise: number; sunset: number }
  warnings: Warning[] // 하루 단위 경고
  counts: Record<Level, number>
  pendingLegs: number
}

export function startPlaceIdFor(trip: Trip, index: number): string | undefined {
  const day = trip.days[index]
  if (day.startPlaceId) return day.startPlaceId
  return index > 0 ? trip.days[index - 1].lodgingPlaceId : undefined
}

const LEVEL_ORDER: Level[] = ['critical', 'serious', 'warning', 'info']

/** 점심·저녁 판단: 직접 표시한 값 우선, 없으면 식당의 도착 시각으로 */
export function mealOf(stop: Stop, place: Place | undefined, arrive: number): Meal | undefined {
  if (stop.meal === 'none') return undefined
  if (stop.meal) return stop.meal
  if (place?.kind !== 'food') return undefined
  if (arrive >= 10 * 60 + 30 && arrive < 15 * 60 + 30) return 'lunch'
  if (arrive >= 16 * 60 + 30 && arrive < 24 * 60) return 'dinner'
  return undefined
}

export const MEAL_LABEL: Record<Meal, string> = { lunch: '🍱 점심', dinner: '🍽️ 저녁' }

export const shortName = (name: string) => name.replace(/\s*[(（].*?[)）]\s*/g, ' ').trim() || name

const NOT_IN_TITLE: PlaceKind[] = ['hotel', 'airport', 'food', 'cafe', 'other']

/** 일정에서 그날 제목을 만든다. 장소를 넣고 빼면 제목도 따라 바뀐다 */
export function autoDayTitle(stops: StopPlan[], startPlace?: Place, lodging?: Place): string {
  const places = stops.map((s) => s.place).filter((p): p is Place => !!p)
  const names = [...new Set(places.filter((p) => !NOT_IN_TITLE.includes(p.kind)).sort((a, b) => Number(a.kind === 'shop') - Number(b.kind === 'shop')).map((p) => shortName(p.name)))]
  // 사이드바에 들어가도록 짧게: 최대 3곳, 글자가 길면 그보다 적게
  const shown = names.slice(0, 1)
  for (const name of names.slice(1, 3)) {
    if ([...shown, name].join(' · ').length > 30) break
    shown.push(name)
  }
  const arrive = startPlace?.kind === 'airport'
  const leave = places.some((p) => p.kind === 'airport')
  const parts = [...(arrive ? ['도착'] : []), ...shown, ...(leave ? ['출국'] : [])]
  if (!shown.length && arrive && lodging) parts.push(shortName(lodging.name))
  if (!parts.length) {
    const food = places.filter((p) => p.kind === 'food' || p.kind === 'cafe').map((p) => shortName(p.name))
    if (food.length) return food.slice(0, 2).join(' · ')
    return lodging ? `${shortName(lodging.name)}에서 쉬는 날` : '자유 일정'
  }
  return parts.join(' · ') + (names.length > shown.length ? ` 외 ${names.length - shown.length}곳` : '')
}

/** "톨 ¥3,020", "톨 없음", "톨비 미확인" 같은 짧은 표시 */
export function tollText(yen: number, unknown: number): string {
  if (yen > 0) return `톨 ¥${yen.toLocaleString()}${unknown ? ` + 미확인 ${unknown}구간` : ''}`
  return unknown ? '톨비 미확인' : '톨 없음'
}

export function worstLevel(ws: Warning[]): Level | undefined {
  return LEVEL_ORDER.find((l) => ws.some((w) => w.level === l))
}

export function computeDay(trip: Trip, routes: Record<string, RouteLeg>, index: number, hasGoogle: boolean): DayPlan {
  const day = trip.days[index]
  const s = trip.settings
  const date = dayDate(trip.startDate, index)
  const weekday = date.getUTCDay()
  const get = (id?: string) => (id ? trip.places[id] : undefined)
  const startPlace = get(startPlaceIdFor(trip, index))
  const lodging = get(day.lodgingPlaceId)

  const anchor = lodging ?? startPlace ?? get(day.stops[0]?.placeId)
  const sun = anchor ? (sunTimes(date, anchor.location.lat, anchor.location.lng) ?? undefined) : undefined

  let t = parseHM(day.startTime) ?? 9 * 60
  const start = t
  let prev = startPlace
  let driveMin = 0
  let driveMeters = 0
  let tollYen = 0
  let tollUnknown = 0
  let stayMin = 0
  let waitMin = 0
  let pendingLegs = 0
  let car = startPlace // 차가 지금 어디에 있는지

  const makeLeg = (from: Place, to: Place, mode: LegMode, manual: number | undefined, depart: number): LegPlan => {
    const resolved = resolveLeg(routes, from.location, to.location, mode, manual, s, hasGoogle)
    const confirmed = resolved.status === 'ok'
    const minutes =
      resolved.status === 'ok' ? resolved.minutes : resolved.status === 'needsManual' ? 0 : resolved.estimate
    const meters = resolved.meters
    // 바로 옆(400m 미만)은 차를 다시 대지 않으니 주차 여유를 붙이지 않는다
    const buffer = mode === 'DRIVE' && meters >= 400 ? s.parkingBuffer : 0
    const legToll = mode === 'DRIVE' && resolved.status === 'ok' ? resolved.tollYen : undefined
    const warnings: Warning[] = []
    if (!confirmed) pendingLegs++
    if (resolved.status === 'needsManual') {
      warnings.push({ level: 'warning', text: '구글이 일본 대중교통 경로를 주지 않아요 — 구글맵에서 확인해 시간을 직접 넣어주세요' })
    } else if (resolved.status === 'error') {
      warnings.push({ level: 'warning', text: `경로 계산 실패: ${resolved.message} (직선거리로 추정 중)` })
    }
    const end = depart + minutes + buffer
    if (mode === 'DRIVE') {
      driveMin += minutes
      driveMeters += meters
      if (legToll != null) tollYen += legToll
      else if (meters > 0) tollUnknown++
      if (minutes >= 120) {
        warnings.push({ level: 'info', text: `${fmtDur(minutes)} 연속 운전 — 중간에 휴게소(SA·PA)나 미치노에키에서 쉬어가세요` })
      }
      if (sun && end > sun.sunset + 15) {
        const afterDark = Math.min(end - (sun.sunset + 15), end - depart)
        warnings.push({
          level: depart > sun.sunset + 60 && minutes > 30 ? 'serious' : 'warning',
          text: `일몰(${fmtHM(sun.sunset)}) 이후 운전 ${fmtDur(afterDark)} — 사슴·여우 출몰, 가로등 없는 구간 주의`,
        })
      }
    }
    if (mode === 'WALK' && minutes >= NIGHT_WALK_MIN && sun && depart >= sun.sunset) {
      warnings.push({ level: 'info', text: `해 진 뒤 ${fmtDur(minutes)} 걷는 구간이에요 — 택시나 셔틀도 생각해 보세요` })
    }
    return { from, to, mode, resolved, minutes, buffer, meters, tollYen: legToll, start: depart, end, confirmed, warnings }
  }

  /** 운전을 시작하는 곳에 차가 있는지 보고, 차를 옮긴다 */
  const moveCar = (leg: LegPlan, to: Place | undefined) => {
    if (leg.mode !== 'DRIVE') return
    if (car) {
      const away = haversineMeters(car.location, leg.from.location)
      if (away > CAR_LEFT_M) leg.warnings.push({ level: 'warning', text: `차는 ${shortName(car.name)}에 있어요 (${fmtKm(away)} 떨어짐) — 차를 가지러 가는 구간을 넣으세요` })
    }
    car = to ?? car
  }

  const stops: StopPlan[] = day.stops.map((stop) => {
    const place = trip.places[stop.placeId]
    const warnings: Warning[] = []
    let leg: LegPlan | undefined
    if (prev && place) {
      leg = makeLeg(prev, place, stop.legMode ?? 'DRIVE', stop.manualMinutes, t)
      moveCar(leg, place)
      t = leg.end
    }
    let arrive = t
    let wait = 0
    const fixed = parseHM(stop.fixedTime)
    if (fixed != null) {
      if (arrive < fixed) {
        wait = fixed - arrive
        arrive = fixed
      } else if (arrive > fixed + 5) {
        warnings.push({ level: 'serious', text: `고정 시각 ${stop.fixedTime}보다 ${fmtDur(arrive - fixed)} 늦게 도착해요` })
      }
    }
    const meet = parseHM(stop.booking?.meet)
    if (meet != null && arrive > meet) warnings.push({ level: 'serious', text: `집합 ${stop.booking!.meet}보다 ${fmtDur(arrive - meet)} 늦게 도착해요` })
    const depart = arrive + stop.stay
    const hours = place ? checkHours(place, weekday, arrive, depart) : ({ status: 'unknown' } as HoursCheck)
    if (place) warnings.push(...placeWarnings(place, hours, weekday, stop, day.id))
    if (place && leg?.mode === 'DRIVE') {
      if (place.parking?.status === 'none') warnings.push({ level: 'warning', text: `차를 댈 곳이 없어요${place.parking.fee ? ` (${place.parking.fee})` : ''} — 근처 주차장을 정하거나 이동 수단을 바꾸세요` })
      else if (!place.parking) warnings.push({ level: 'info', text: '주차 정보 미확인', fix: { kind: 'openPlace', placeId: place.id, label: '주차 입력' } })
      if (!place.phone && !place.mapcode) warnings.push({ level: 'info', text: '내비에 넣을 전화번호·맵코드가 없어요', fix: { kind: 'openPlace', placeId: place.id, label: '입력' } })
    }
    waitMin += wait
    stayMin += stop.stay
    t = depart
    prev = place ?? prev
    return { stop, place, leg, arrive, depart, wait, hours, warnings, meal: mealOf(stop, place, arrive) }
  })

  let endLeg: LegPlan | undefined
  if (lodging && prev && prev.id !== lodging.id) {
    endLeg = makeLeg(prev, lodging, day.endLegMode ?? 'DRIVE', day.endManualMinutes, t)
    moveCar(endLeg, lodging)
    t = endLeg.end
  }
  const end = t

  // 시음이 있는 곳이나 저녁 뒤에 운전이 남아 있으면 운전자에게 알려준다
  stops.forEach((sp, i) => {
    if (!sp.place || (sp.meal !== 'dinner' && (sp.place.kind === 'hotel' || !ALCOHOL.test(`${sp.place.name} ${sp.place.nameLocal ?? ''}`)))) return
    const drivesLater = stops.slice(i + 1).some((x) => x.leg?.mode === 'DRIVE' && x.leg.meters >= CAR_LEFT_M) || (endLeg?.mode === 'DRIVE' && endLeg.meters >= CAR_LEFT_M)
    if (drivesLater) sp.warnings.push({ level: 'info', text: '이 뒤에 운전이 있어요. 운전자는 한 모금도 안 돼요' })
  })

  const warnings: Warning[] = []
  if (driveMin > s.dailyDriveLimit) {
    warnings.push({ level: 'serious', text: `하루 운전 ${fmtDur(driveMin)} — 너무 길어요. 일정을 나누거나 숙소를 옮겨보세요` })
  } else if (driveMin > s.dailyDriveWarn) {
    warnings.push({ level: 'warning', text: `하루 운전 ${fmtDur(driveMin)} — 신혼여행치고 빡빡해요` })
  }
  if (lodging && car && haversineMeters(car.location, lodging.location) > 500) {
    warnings.push({ level: 'warning', text: `차가 ${shortName(car.name)}에 남아 있어요 — 숙소로 가져오는 구간이 없어요` })
  }
  const checkedInEarlier = !!lodging && day.stops.some((x) => x.placeId === lodging.id)
  if (lodging && end > 21 * 60 && !checkedInEarlier) {
    warnings.push({ level: 'warning', text: `숙소 도착 ${fmtHM(end)} — 료칸 석식은 보통 18~19시 시작, 체크인 마감도 확인하세요` })
  }
  if (!lodging && index < trip.days.length - 1) {
    warnings.push({ level: 'info', text: '이 날 숙소가 아직 정해지지 않았어요' })
  }

  // 체크인: 이 날 처음 묵는 숙소면 처음 도착하는 시각을 체크인 시간과 맞춰 본다
  const prevLodgingId = index > 0 ? trip.days[index - 1].lodgingPlaceId : undefined
  if (lodging && lodging.id !== prevLodgingId) {
    const visit = stops.find((x) => x.place?.id === lodging.id)
    const arrive = visit ? visit.arrive : end
    const target = visit ? visit.warnings : warnings
    // 숙소 카드에 붙는 경고면 이름을 빼고, 하루 경고로 붙으면 이름을 넣는다
    const name = visit ? '' : `${shortName(lodging.name)} `
    const opens = parseHM(lodging.checkIn)
    const until = parseHM(lodging.checkInUntil)
    if (until != null && arrive > until) {
      target.push({ level: 'serious', text: `${name}체크인 마감 ${lodging.checkInUntil}보다 ${fmtDur(arrive - until)} 늦게 도착해요 — 숙소에 늦게 도착한다고 미리 알리세요` })
    } else if (until != null && until - arrive < 30) {
      target.push({ level: 'warning', text: `${name}체크인 마감 ${lodging.checkInUntil}까지 여유 ${fmtDur(until - arrive)} — 늦어질 수 있으면 숙소에 미리 알리세요` })
    }
    if (opens != null && opens - arrive > 15) {
      target.push({ level: 'info', text: `체크인 ${lodging.checkIn} 전 도착 — 짐 맡기기·주차만 될 수 있어요` })
    }
  }
  // 체크아웃: 전날 숙소를 떠나는 날이면 출발 시각을 체크아웃 시간과 맞춰 본다
  const prevLodging = prevLodgingId ? trip.places[prevLodgingId] : undefined
  if (prevLodging && prevLodging.id !== lodging?.id && startPlace?.id === prevLodging.id) {
    const out = parseHM(prevLodging.checkOut)
    if (out != null && start > out) {
      warnings.push({
        level: 'warning',
        text: `${shortName(prevLodging.name)} 체크아웃 ${prevLodging.checkOut}보다 늦게 출발해요`,
        fix: { kind: 'shiftStart', dayId: day.id, value: prevLodging.checkOut!, label: `${prevLodging.checkOut} 출발로` },
      })
    }
  }

  // 아침: 묵은 숙소에서 출발하는 날이면 출발 전에 조식을 넣고, 먹을 시간이 되는지 본다
  let breakfast: BreakfastPlan | undefined
  if (startPlace?.kind === 'hotel' && !day.noBreakfast) {
    const from = parseHM(startPlace.breakfastFrom)
    const until = parseHM(startPlace.breakfastUntil)
    const leaveBy = start - BREAKFAST_READY
    let bStart = leaveBy - BREAKFAST_MIN
    if (from != null && bStart < from) bStart = from
    if (until != null && bStart > until) bStart = until
    const bEnd = Math.min(bStart + BREAKFAST_MIN, Math.max(leaveBy, bStart))
    const minutes = bEnd - bStart
    breakfast = { place: startPlace, start: bStart, end: bEnd, minutes, known: from != null }
    if (from != null && minutes < 30) {
      const need = fmtHM(from + 30 + BREAKFAST_READY)
      warnings.push({
        level: 'warning',
        text: minutes > 0 ? `조식이 ${startPlace.breakfastFrom}부터라 ${day.startTime} 출발이면 ${fmtDur(minutes)}밖에 못 먹어요` : `조식이 ${startPlace.breakfastFrom}부터라 ${day.startTime} 출발이면 못 먹어요`,
        fix: { kind: 'shiftStart', dayId: day.id, value: need, label: `${need} 출발로` },
      })
    }
  }

  const all = [...warnings, ...stops.flatMap((x) => [...x.warnings, ...(x.leg?.warnings ?? [])]), ...(endLeg?.warnings ?? [])]
  const counts = { critical: 0, serious: 0, warning: 0, info: 0 }
  for (const w of all) counts[w.level]++

  const autoTitle = autoDayTitle(stops, startPlace, lodging)

  return {
    day,
    title: day.title?.trim() || autoTitle,
    autoTitle,
    breakfast,
    lunch: stops.find((x) => x.meal === 'lunch'),
    dinner: stops.find((x) => x.meal === 'dinner'),
    index,
    date,
    weekday,
    startPlace,
    start,
    stops,
    endLeg,
    lodging,
    end,
    driveMin,
    driveMeters,
    tollYen,
    tollUnknown,
    stayMin,
    waitMin,
    sun,
    warnings,
    counts,
    pendingLegs,
  }
}

function placeWarnings(place: Place, hours: HoursCheck, weekday: number, stop: Stop, dayId: string): Warning[] {
  const w: Warning[] = []
  if (place.businessStatus === 'CLOSED_PERMANENTLY') w.push({ level: 'critical', text: '구글에 "폐업"으로 표시된 곳이에요' })
  if (place.businessStatus === 'CLOSED_TEMPORARILY') w.push({ level: 'serious', text: '구글에 "임시 휴업"으로 표시돼 있어요' })
  if (place.matchWarning) w.push({ level: 'warning', text: place.matchWarning })
  switch (hours.status) {
    case 'closedDay':
      w.push({ level: 'critical', text: `${WEEKDAYS_KO[weekday]}요일은 휴무예요` })
      break
    case 'afterClose':
      w.push({ level: 'critical', text: `도착하면 이미 영업 종료 (${fmtHM(hours.closeAt)} 마감)` })
      break
    case 'closesDuring':
      w.push({ level: 'serious', text: `머무는 중 ${fmtHM(hours.closeAt)}에 마감 — ${fmtDur(hours.shortMin)} 부족` })
      break
    case 'beforeOpen':
      w.push({
        level: 'warning',
        text: `오픈 전 도착 — ${fmtHM(hours.openAt)} 오픈 (${fmtDur(hours.waitMin)} 대기)`,
        fix: { kind: 'setFixedTime', stopId: stop.id, dayId, value: fmtHM(hours.openAt), label: `${fmtHM(hours.openAt)} 도착으로 고정` },
      })
      break
    case 'unknown':
      if (place.kind !== 'hotel' && place.kind !== 'airport') {
        w.push({
          level: 'info',
          text: '영업시간 미확인',
          fix:
            place.kind === 'sight'
              ? { kind: 'markAlwaysOpen', placeId: place.id, label: '야외라 상시 개방' }
              : { kind: 'openPlace', placeId: place.id, label: '영업시간 입력' },
        })
      }
      break
  }
  return w
}

export function computeTrip(trip: Trip, routes: Record<string, RouteLeg>, hasGoogle: boolean): DayPlan[] {
  return trip.days.map((_, i) => computeDay(trip, routes, i, hasGoogle))
}

/** 경로 계산이 필요한 모든 구간 (RouteManager 가 미리 가져온다) */
export function neededLegs(plans: DayPlan[]): LegPlan[] {
  return plans.flatMap((p) => [...p.stops.map((s) => s.leg), p.endLeg].filter((l): l is LegPlan => !!l))
}
