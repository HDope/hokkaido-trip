import type { Booking, Place, Stop, Trip } from '../types'
import { dayDate, fmtDate, isoDate } from './time'

// 예약 달력: 며칠 전부터 예약할 수 있는지를 방문일에서 계산하므로, 일정을 옮겨도 날짜가 따라간다

export type BookingState = 'late' | 'open' | 'wait' | 'done'

export type BookingRow = {
  dayId: string
  dayIndex: number
  stop: Stop
  place: Place
  booking: Booking
  visit: string
  opens?: string
  closes?: string
  state: BookingState
}

const before = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return isoDate(d)
}

export const fmtIso = (iso: string) => fmtDate(new Date(`${iso}T00:00:00Z`))

const RANK: Record<BookingState, number> = { late: 0, open: 1, wait: 2, done: 3 }

/** 예약이 필요한 곳을 지금 할 수 있는 순서로 */
export function bookingRows(trip: Trip, today: string): BookingRow[] {
  const rows = trip.days.flatMap((day, dayIndex) =>
    day.stops.flatMap((stop): BookingRow[] => {
      const place = trip.places[stop.placeId]
      const booking = stop.booking
      if (!booking || !place) return []
      const visit = isoDate(dayDate(trip.startDate, dayIndex))
      const opens = booking.opensDaysBefore != null ? before(visit, booking.opensDaysBefore) : undefined
      const closes = booking.closesDaysBefore != null ? before(visit, booking.closesDaysBefore) : undefined
      const state: BookingState = booking.done ? 'done' : closes && today > closes ? 'late' : opens && today < opens ? 'wait' : 'open'
      return [{ dayId: day.id, dayIndex, stop, place, booking, visit, opens, closes, state }]
    }),
  )
  return rows.sort((a, b) => RANK[a.state] - RANK[b.state] || (a.opens ?? a.visit).localeCompare(b.opens ?? b.visit) || a.visit.localeCompare(b.visit))
}

/** "5/19 (수) 08:00부터 · 6/15 (화) 15:00까지" */
export function windowText(row: BookingRow): string {
  const from = row.opens ? `${fmtIso(row.opens)}${row.booking.opensTime ? ` ${row.booking.opensTime}` : ''}부터` : ''
  const until = row.closes ? `${fmtIso(row.closes)}${row.booking.closesTime ? ` ${row.booking.closesTime}` : ''}까지` : ''
  return [from, until].filter(Boolean).join(' · ')
}
