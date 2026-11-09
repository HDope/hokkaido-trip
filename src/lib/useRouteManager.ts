import { useEffect, useState } from 'react'
import { hasGoogle, useStore } from '../store'
import type { RouteLeg } from '../types'
import { computeRoute, GoogleApiError } from './google'
import { osrmRoute, valhallaRoute } from './free'
import { roughMinutes } from './routing'
import { haversineMeters } from './geo'
import { neededLegs, type DayPlan, type LegPlan } from './schedule'

// 화면에 필요한 구간 경로를 뒤에서 차례로 가져와 캐시에 넣는다.
// 구글 키가 있으면 Routes API, 없으면 OSRM(운전)·직선거리 추정(도보).
const inFlight = new Set<string>()
const queue: { key: string; leg: LegPlan }[] = []
let running = 0
/** 잠깐 실패한 구간은 저장하지 않고 이 시각이 지나면 다시 받는다 */
const retryAt = new Map<string, number>()
const RETRY_MS = 5 * 60 * 1000
const AUTH_REASONS = new Set([
  'API_KEY_INVALID',
  'SERVICE_DISABLED',
  'API_KEY_SERVICE_BLOCKED',
  'API_KEY_HTTP_REFERRER_BLOCKED',
  'BILLING_DISABLED',
  'PERMISSION_DENIED',
])

/** 통신 끊김, 요청 한도, 서버 오류는 다시 받으면 될 수 있다 */
function isTemporary(e: unknown): boolean {
  if (!(e instanceof GoogleApiError)) return true
  return e.status === 429 || (e.status ?? 0) >= 500
}

/** 받은 경로. 잠깐 실패했으면 null */
async function fetchLeg(leg: LegPlan, cached?: RouteLeg): Promise<RouteLeg | null> {
  const st = useStore.getState()
  const now = new Date().toISOString()
  const google = hasGoogle(st)
  const avoid = st.trip?.settings.avoidTolls ?? false
  const mode = leg.mode === 'MANUAL' ? 'DRIVE' : leg.mode
  if (google) {
    try {
      const r = await computeRoute(st.apiKey, leg.from.location, leg.to.location, mode, avoid)
      if (st.googleStatus !== 'ok') st.setGoogleStatus('ok')
      return { provider: 'google', ...r, fetchedAt: now }
    } catch (e) {
      if (e instanceof GoogleApiError && e.reason && AUTH_REASONS.has(e.reason)) {
        st.setGoogleStatus('error', e.message, e.reason)
        // 이미 무료 경로로 계산해 둔 구간이면 그대로 쓰고, 없으면 아래에서 무료로 계산
        if (cached && !cached.error) return cached
      } else {
        if (isTemporary(e)) return null
        // 톨비만 새로 받다 실패하면 경로는 그대로 두고 톨비만 모른다고 표시한다
        if (cached && !cached.error && cached.provider === 'google') return { ...cached, tollYen: null }
        return { provider: 'google', seconds: 0, meters: 0, fetchedAt: now, error: (e as Error).message }
      }
    }
  }
  if (mode === 'WALK') {
    const minutes = roughMinutes(leg.from.location, leg.to.location, 'WALK')
    return { provider: 'estimate', seconds: minutes * 60, meters: haversineMeters(leg.from.location, leg.to.location) * 1.3, fetchedAt: now }
  }
  if (mode === 'TRANSIT') {
    return { provider: 'estimate', seconds: 0, meters: 0, fetchedAt: now, error: '대중교통은 구글 키가 필요해요' }
  }
  try {
    const r = await valhallaRoute(leg.from.location, leg.to.location)
    return { provider: 'valhalla', ...r, fetchedAt: now }
  } catch {
    try {
      const r = await osrmRoute(leg.from.location, leg.to.location)
      return { provider: 'osrm', ...r, fetchedAt: now }
    } catch {
      return null
    }
  }
}

function pump() {
  const limit = hasGoogle(useStore.getState()) ? 4 : 1
  while (running < limit && queue.length) {
    const job = queue.shift()!
    running++
    fetchLeg(job.leg, useStore.getState().routes[job.key])
      .then((leg) => {
        if (leg) useStore.getState().setRoute(job.key, leg)
        else retryAt.set(job.key, Date.now() + RETRY_MS)
      })
      .finally(() => {
        running--
        inFlight.delete(job.key)
        pump()
      })
  }
}

export function useRouteManager(plans: DayPlan[]) {
  const apiKey = useStore((s) => s.apiKey)
  const googleStatus = useStore((s) => s.googleStatus)
  const offline = useStore((s) => !!s.offlineSince)
  const [retryTick, setRetryTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      if (retryAt.size) setRetryTick((n) => n + 1)
    }, 60 * 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (offline) return // 인터넷이 끊겼으면 저장된 경로만 쓴다
    const now = Date.now()
    for (const leg of neededLegs(plans)) {
      const r = leg.resolved
      const key = r.status === 'pending' ? r.key : r.status === 'ok' && r.stale ? r.key : undefined
      if (!key || inFlight.has(key) || (retryAt.get(key) ?? 0) > now) continue
      retryAt.delete(key)
      if (leg.mode === 'MANUAL') continue
      inFlight.add(key)
      queue.push({ key, leg })
    }
    pump()
  }, [plans, apiKey, googleStatus, offline, retryTick])
}
