import type { Hours, Place } from '../types'
import { fmtHM, WEEKDAYS_KO } from './time'

const WEEK = 7 * 1440

export type HoursCheck =
  | { status: 'ok' }
  | { status: 'unknown' }
  | { status: 'always' }
  | { status: 'closedDay' }
  | { status: 'beforeOpen'; openAt: number; waitMin: number }
  | { status: 'afterClose'; closeAt: number }
  | { status: 'closesDuring'; closeAt: number; shortMin: number }

type Interval = [number, number]

function intervals(hours: Hours): Interval[] | 'always' {
  const out: Interval[] = []
  for (const p of hours.periods) {
    const o = p.open.day * 1440 + p.open.hour * 60 + p.open.minute
    if (!p.close) return 'always' // 구글: close 가 없으면 24시간 영업
    let c = p.close.day * 1440 + p.close.hour * 60 + p.close.minute
    if (c <= o) c += WEEK
    for (const shift of [-WEEK, 0, WEEK]) out.push([o + shift, c + shift])
  }
  return out
}

/** weekday(0=일) 에 arrive~depart(그날 0시 기준 분) 동안 머무를 수 있는지 */
export function checkHours(place: Place, weekday: number, arrive: number, depart: number): HoursCheck {
  if (place.alwaysOpen) return { status: 'always' }
  const hours = place.hours
  if (!hours) return { status: 'unknown' }
  if (hours.periods.length === 0) return { status: 'closedDay' }
  const iv = intervals(hours)
  if (iv === 'always') return { status: 'always' }
  const a = weekday * 1440 + arrive
  const d = weekday * 1440 + Math.max(depart, arrive)
  const dayStart = weekday * 1440
  const dayEnd = dayStart + 1440

  const covering = iv.find(([o, c]) => a >= o && a < c)
  if (covering) {
    if (d <= covering[1]) return { status: 'ok' }
    return { status: 'closesDuring', closeAt: covering[1] - dayStart, shortMin: d - covering[1] }
  }
  const sameDay = iv.filter(([o]) => o >= dayStart && o < dayEnd).sort((x, y) => x[0] - y[0])
  const later = sameDay.find(([o]) => o > a)
  if (later) return { status: 'beforeOpen', openAt: later[0] - dayStart, waitMin: later[0] - a }
  if (sameDay.length) return { status: 'afterClose', closeAt: sameDay[sameDay.length - 1][1] - dayStart }
  return { status: 'closedDay' }
}

/** 해당 요일의 영업시간 한 줄 요약 */
export function hoursForDay(place: Place, weekday: number): string {
  if (place.alwaysOpen) return '상시 개방'
  const hours = place.hours
  if (!hours) return '영업시간 미확인'
  if (hours.weekdayText?.length === 7) {
    // 구글 weekdayDescriptions 는 월요일부터 시작, "월요일: 오전 9:00~오후 5:00" 형태
    const line = hours.weekdayText[(weekday + 6) % 7]
    return line.replace(/^[^:：]+[:：]\s*/, '')
  }
  const iv = intervals(hours)
  if (iv === 'always') return '24시간'
  const dayStart = weekday * 1440
  const segs = iv
    .filter(([o]) => o >= dayStart && o < dayStart + 1440)
    .sort((x, y) => x[0] - y[0])
    .map(([o, c]) => `${fmtHM(o - dayStart).replace('익일 ', '')}–${c - dayStart >= 1440 ? '익일 ' : ''}${fmtHM((c - dayStart) % 1440)}`)
  return segs.length ? segs.join(', ') : '휴무'
}

export function weekLines(place: Place): { weekday: number; label: string; text: string }[] {
  const order = [1, 2, 3, 4, 5, 6, 0]
  return order.map((w) => ({ weekday: w, label: WEEKDAYS_KO[w], text: hoursForDay(place, w) }))
}

/** 간단 편집기용: 요일별 [open, close] (분) 또는 null(휴무) */
export type SimpleWeek = ({ open: number; close: number } | null)[]

export function toSimpleWeek(hours: Hours | undefined): SimpleWeek {
  const week: SimpleWeek = [null, null, null, null, null, null, null]
  if (!hours) return week
  for (const p of hours.periods) {
    if (!p.close) return week.map(() => ({ open: 0, close: 1440 }))
    const o = p.open.hour * 60 + p.open.minute
    let c = p.close.hour * 60 + p.close.minute
    if (p.close.day !== p.open.day) c += 1440
    if (!week[p.open.day]) week[p.open.day] = { open: o, close: c }
  }
  return week
}

export function fromSimpleWeek(week: SimpleWeek, note?: string): Hours {
  const periods = week.flatMap((v, day) => {
    if (!v) return []
    const closeTotal = v.close
    const closeDay = closeTotal >= 1440 ? (day + 1) % 7 : day
    const cm = closeTotal % 1440
    return [
      {
        open: { day, hour: Math.floor(v.open / 60), minute: v.open % 60 },
        close: { day: closeDay, hour: Math.floor(cm / 60), minute: cm % 60 },
      },
    ]
  })
  return { periods, source: 'manual', note }
}

/** 매일 같은 시간 영업하는 큐레이션 데이터용 헬퍼 */
export function dailyHours(open: string, close: string, closedDays: number[] = [], note?: string): Hours {
  const [oh, om] = open.split(':').map(Number)
  const [ch, cm] = close.split(':').map(Number)
  const periods = [0, 1, 2, 3, 4, 5, 6]
    .filter((d) => !closedDays.includes(d))
    .map((day) => ({
      open: { day, hour: oh, minute: om },
      close: { day: ch * 60 + cm <= oh * 60 + om ? (day + 1) % 7 : day, hour: ch, minute: cm },
    }))
  return { periods, source: 'curated', note }
}
