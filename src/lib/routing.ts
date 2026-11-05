import type { LatLng, LegMode, RouteLeg, Settings } from '../types'
import { haversineMeters } from './geo'

export function legKey(from: LatLng, to: LatLng, mode: LegMode, avoidTolls: boolean): string {
  const p = (x: LatLng) => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`
  return `${mode}|${mode === 'DRIVE' && avoidTolls ? 'notoll' : 'toll'}|${p(from)}|${p(to)}`
}

export type ResolvedLeg =
  | { status: 'ok'; minutes: number; meters: number; provider: RouteLeg['provider']; polyline?: string; key?: string; stale?: boolean }
  | { status: 'pending'; key: string; estimate: number; meters: number }
  | { status: 'needsManual'; meters: number }
  | { status: 'error'; key: string; message: string; estimate: number; meters: number }

const WALK_M_PER_MIN = 70

/** 직선거리 기반 대략치 (경로 계산 전·실패 시 표시용) */
export function roughMinutes(from: LatLng, to: LatLng, mode: LegMode): number {
  const m = haversineMeters(from, to)
  if (mode === 'WALK') return (m * 1.3) / WALK_M_PER_MIN
  return ((m * 1.35) / 1000 / 50) * 60 // 우회 계수 1.35, 평균 50km/h
}

export function resolveLeg(
  cache: Record<string, RouteLeg>,
  from: LatLng,
  to: LatLng,
  mode: LegMode,
  manualMinutes: number | undefined,
  settings: Settings,
  hasGoogle: boolean,
): ResolvedLeg {
  const straight = haversineMeters(from, to)
  if (mode === 'MANUAL') return { status: 'ok', minutes: manualMinutes ?? 0, meters: straight, provider: 'estimate' }
  if (straight < 30) return { status: 'ok', minutes: 0, meters: 0, provider: 'estimate' }
  const key = legKey(from, to, mode, settings.avoidTolls)
  const leg = cache[key]
  const estimate = roughMinutes(from, to, mode)
  if (mode === 'TRANSIT' && !hasGoogle && !leg) {
    return manualMinutes != null
      ? { status: 'ok', minutes: manualMinutes, meters: straight, provider: 'estimate' }
      : { status: 'needsManual', meters: straight }
  }
  if (!leg) return { status: 'pending', key, estimate, meters: straight }
  if (leg.error) return { status: 'error', key, message: leg.error, estimate, meters: straight }
  const factor = leg.provider === 'osrm' || leg.provider === 'valhalla' ? settings.freeModeFactor : 1
  return {
    status: 'ok',
    minutes: (leg.seconds / 60) * factor,
    meters: leg.meters,
    provider: leg.provider,
    polyline: leg.polyline,
    key,
    stale: hasGoogle && leg.provider !== 'google',
  }
}

export const MODE_LABEL: Record<LegMode, string> = {
  DRIVE: '운전',
  WALK: '도보',
  TRANSIT: '대중교통',
  MANUAL: '직접 입력',
}

export const MODE_ICON: Record<LegMode, string> = {
  DRIVE: '🚗',
  WALK: '🚶',
  TRANSIT: '🚆',
  MANUAL: '⏱️',
}
