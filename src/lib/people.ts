import type { Trip, Traveler } from '../types'

// 이름은 비공개 일정 데이터(설정)에 두고, 코드에는 기본값만 둔다
export const DEFAULT_TRAVELERS: Traveler[] = [
  { id: 'a', name: '나' },
  { id: 'b', name: '짝꿍' },
]

export function travelersOf(trip: Pick<Trip, 'settings'>): Traveler[] {
  const t = trip.settings.travelers
  return t?.length ? t : DEFAULT_TRAVELERS
}

/** 받침에 맞는 조사: josa('희동', '이', '가') → '희동이' */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return `${word}${withFinal}(${withoutFinal})`
  return `${word}${code % 28 ? withFinal : withoutFinal}`
}
