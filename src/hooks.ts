import { useMemo } from 'react'
import { hasGoogle, useStore } from './store'
import { computeTrip, type DayPlan } from './lib/schedule'

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
