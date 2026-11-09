import type { Trip } from '../types'
import type { DayPlan, StopPlan } from './schedule'
import { dayDate, isoDate } from './time'

// 여행 중 화면: 일정은 일본 시각 기준이라 기기 시간대와 상관없이 일본 시각으로 계산한다

const JST_MS = 9 * 3600 * 1000

/** 일본의 오늘 날짜(YYYY-MM-DD)와 0시부터 지난 분 */
export function japanNow(): { date: string; minutes: number } {
  // 개발 중에는 localStorage 의 hk-test-now("2027-06-18T14:00")로 시각을 바꿔 시험한다
  const fake = import.meta.env?.DEV ? localStorage.getItem('hk-test-now') : null
  const ms = fake ? new Date(`${fake}:00+09:00`).getTime() : Date.now()
  const jst = new Date(ms + JST_MS).toISOString()
  return { date: jst.slice(0, 10), minutes: Number(jst.slice(11, 13)) * 60 + Number(jst.slice(14, 16)) }
}

/** 오늘이 여행의 며칠째인지. 여행 기간이 아니면 -1 */
export function todayIndex(trip: Trip, date = japanNow().date): number {
  return trip.days.findIndex((_, i) => isoDate(dayDate(trip.startDate, i)) === date)
}

export type NextUp = { current?: StopPlan; next?: StopPlan; toLodging: boolean }

/** 지금 머무는 곳과 다음 목적지 */
export function nextUp(plan: DayPlan, minutes: number): NextUp {
  const i = plan.stops.findIndex((s) => s.depart > minutes)
  if (i < 0) return { toLodging: !!plan.lodging && !!plan.endLeg && minutes < plan.end }
  const s = plan.stops[i]
  if (s.arrive > minutes) return { next: s, toLodging: false }
  const next = plan.stops[i + 1]
  return { current: s, next, toLodging: !next && !!plan.lodging && !!plan.endLeg }
}
