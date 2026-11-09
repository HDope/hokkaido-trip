import { useEffect, useMemo, useState } from 'react'
import { hasGoogle, useStore } from './store'
import { computeTrip, type DayPlan } from './lib/schedule'
import { japanNow } from './lib/today'

export function useGoogle(): boolean {
  const apiKey = useStore((s) => s.apiKey)
  const googleStatus = useStore((s) => s.googleStatus)
  return hasGoogle({ apiKey, googleStatus })
}

export function usePlans(): DayPlan[] {
  const trip = useStore((s) => s.trip)
  const routes = useStore((s) => s.routes)
  const google = useGoogle()
  return useMemo(() => (trip ? computeTrip(trip, routes, google) : []), [trip, routes, google])
}

/** 일본의 지금 시각. 30초마다 다시 읽는다 */
export function useJapanNow() {
  const [now, setNow] = useState(japanNow)
  useEffect(() => {
    const timer = setInterval(() => setNow(japanNow()), 30 * 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** 일정과 지도가 나란히 보이는 넓이인지 */
export function useWideScreen() {
  const [wide, setWide] = useState(() => matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const m = matchMedia('(min-width: 768px)')
    const change = () => setWide(m.matches)
    m.addEventListener('change', change)
    return () => m.removeEventListener('change', change)
  }, [])
  return wide
}
