import type { Day, LegMode, Place, RouteLeg, Stop, Trip } from '../types'
import { checkHours, type HoursCheck } from './hours'
import { resolveLeg, type ResolvedLeg } from './routing'
import { sunTimes } from './sun'
import { dayDate, fmtDur, fmtHM, parseHM, WEEKDAYS_KO } from './time'

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
}

export type DayPlan = {
  day: Day
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
  let stayMin = 0
  let waitMin = 0
  let pendingLegs = 0

  const makeLeg = (from: Place, to: Place, mode: LegMode, manual: number | undefined, depart: number): LegPlan => {
    const resolved = resolveLeg(routes, from.location, to.location, mode, manual, s, hasGoogle)
    const confirmed = resolved.status === 'ok'
    const minutes =
      resolved.status === 'ok' ? resolved.minutes : resolved.status === 'needsManual' ? 0 : resolved.estimate
    const meters = resolved.meters
    // 바로 옆(400m 미만)은 차를 다시 대지 않으니 주차 여유를 붙이지 않는다
    const buffer = mode === 'DRIVE' && meters >= 400 ? s.parkingBuffer : 0
    const warnings: Warning[] = []
    if (!confirmed) pendingLegs++
    if (resolved.status === 'needsManual') {
      warnings.push({ level: 'warning', text: '대중교통 시간은 구글 키가 있어야 계산돼요 — 직접 입력하세요' })
    } else if (resolved.status === 'error') {
      warnings.push({ level: 'warning', text: `경로 계산 실패: ${resolved.message} (직선거리로 추정 중)` })
    }
    const end = depart + minutes + buffer
    if (mode === 'DRIVE') {
      driveMin += minutes
      driveMeters += meters
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
    return { from, to, mode, resolved, minutes, buffer, meters, start: depart, end, confirmed, warnings }
  }

  const stops: StopPlan[] = day.stops.map((stop) => {
    const place = trip.places[stop.placeId]
    const warnings: Warning[] = []
    let leg: LegPlan | undefined
    if (prev && place) {
      leg = makeLeg(prev, place, stop.legMode ?? 'DRIVE', stop.manualMinutes, t)
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
    const depart = arrive + stop.stay
    const hours = place ? checkHours(place, weekday, arrive, depart) : ({ status: 'unknown' } as HoursCheck)
    if (place) warnings.push(...placeWarnings(place, hours, weekday, stop, day.id))
    waitMin += wait
    stayMin += stop.stay
    t = depart
    prev = place ?? prev
    return { stop, place, leg, arrive, depart, wait, hours, warnings }
  })

  let endLeg: LegPlan | undefined
  if (lodging && prev && prev.id !== lodging.id) {
    endLeg = makeLeg(prev, lodging, day.endLegMode ?? 'DRIVE', day.endManualMinutes, t)
    t = endLeg.end
  }
  const end = t

  const warnings: Warning[] = []
  if (driveMin > s.dailyDriveLimit) {
    warnings.push({ level: 'serious', text: `하루 운전 ${fmtDur(driveMin)} — 너무 길어요. 일정을 나누거나 숙소를 옮겨보세요` })
  } else if (driveMin > s.dailyDriveWarn) {
    warnings.push({ level: 'warning', text: `하루 운전 ${fmtDur(driveMin)} — 신혼여행치고 빡빡해요` })
  }
  const checkedInEarlier = !!lodging && day.stops.some((x) => x.placeId === lodging.id)
  if (lodging && end > 21 * 60 && !checkedInEarlier) {
    warnings.push({ level: 'warning', text: `숙소 도착 ${fmtHM(end)} — 료칸 석식은 보통 18~19시 시작, 체크인 마감도 확인하세요` })
  }
  if (!lodging && index < trip.days.length - 1) {
    warnings.push({ level: 'info', text: '이 날 숙소가 아직 정해지지 않았어요' })
  }

  const all = [...warnings, ...stops.flatMap((x) => [...x.warnings, ...(x.leg?.warnings ?? [])]), ...(endLeg?.warnings ?? [])]
  const counts = { critical: 0, serious: 0, warning: 0, info: 0 }
  for (const w of all) counts[w.level]++

  return {
    day,
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
