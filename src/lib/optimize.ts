import type { Stop } from '../types'
import { optimizeWaypoints } from './google'
import type { DayPlan } from './schedule'

export type OptimizeResult = { order: string[]; savedMinutes: number; names: string[] }

// 하루 안의 운전 구간 순서만 바꾼다.
// 시각을 고정한 곳, 숙소, 도보·택시로 가는 곳은 제자리에 두고 그 사이 구간만 최적화한다.
export async function optimizeDay(apiKey: string, plan: DayPlan): Promise<OptimizeResult | null> {
  const movable = (s: DayPlan['stops'][number]) => !!s.place && !s.stop.fixedTime && s.place.kind !== 'hotel' && (s.stop.legMode ?? 'DRIVE') === 'DRIVE'
  const order: Stop[] = plan.stops.map((s) => s.stop)
  let saved = 0
  let i = 0
  while (i < plan.stops.length) {
    if (!movable(plan.stops[i])) {
      i++
      continue
    }
    let j = i
    while (j + 1 < plan.stops.length && movable(plan.stops[j + 1])) j++
    const run = plan.stops.slice(i, j + 1)
    const origin = i > 0 ? plan.stops[i - 1].place : plan.startPlace
    const next = plan.stops[j + 1]
    const destination = next?.place ?? plan.lodging
    if (run.length >= 2 && origin && destination) {
      const lastLeg = next ? next.leg : plan.endLeg
      const before = run.reduce((sum, s) => sum + (s.leg?.minutes ?? 0), 0) + (lastLeg?.mode === 'DRIVE' ? lastLeg.minutes : 0)
      const r = await optimizeWaypoints(apiKey, origin.location, destination.location, run.map((s) => s.place.location))
      const after = r.seconds / 60
      if (after < before - 1 && r.order.some((v, k) => v !== k)) {
        r.order.forEach((from, k) => (order[i + k] = run[from].stop))
        saved += before - after
      }
    }
    i = j + 1
  }
  if (saved < 1) return null
  const placeOf = new Map(plan.stops.map((s) => [s.stop.id, s.place?.name ?? '']))
  return { order: order.map((s) => s.id), savedMinutes: saved, names: order.map((s) => placeOf.get(s.id) ?? '') }
}
