export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

export function parseHM(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return undefined
  return Number(m[1]) * 60 + Number(m[2])
}

export function fmtHM(min: number): string {
  const total = Math.round(min)
  const dayOffset = Math.floor(total / 1440)
  const m = ((total % 1440) + 1440) % 1440
  const hm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return dayOffset > 0 ? `익일 ${hm}` : hm
}

export function fmtDur(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}시간 ${r}분` : `${h}시간`
}

export function fmtKm(meters: number): string {
  return meters >= 10000 ? `${Math.round(meters / 1000)}km` : `${(meters / 1000).toFixed(1)}km`
}

/** YYYY-MM-DD + i일 → UTC 자정 Date (현지 날짜 계산 전용, 시간대 영향 없음) */
export function dayDate(startDate: string, i: number): Date {
  const d = new Date(`${startDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + i)
  return d
}

export function fmtDate(d: Date, withYear = false): string {
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
  return `${withYear ? d.getUTCFullYear() + '.' : ''}${md} (${WEEKDAYS_KO[d.getUTCDay()]})`
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}
