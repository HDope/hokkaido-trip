import type { BusinessStatus, Hours, LatLng, LegMode, Place, PlaceKind } from '../types'
import { HOKKAIDO_BOUNDS } from './geo'

// Google Maps Platform — Places API (New) + Routes API 를 REST 로 직접 호출 (둘 다 브라우저 CORS 허용)
const PLACES = 'https://places.googleapis.com/v1'
const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes'

export const DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'googleMapsUri',
  'businessStatus',
  'regularOpeningHours',
  'nationalPhoneNumber',
  'rating',
  'userRatingCount',
  'websiteUri',
  'primaryType',
  'types',
].join(',')

export class GoogleApiError extends Error {
  status?: number
  reason?: string
  constructor(message: string, status?: number, reason?: string) {
    super(message)
    this.status = status
    this.reason = reason
  }
}

type GError = {
  message?: string
  status?: string
  details?: { reason?: string; metadata?: Record<string, string> }[]
}

function explain(err: GError | undefined, httpStatus: number): GoogleApiError {
  const detail = err?.details?.find((d) => d.reason)
  const reason = detail?.reason ?? err?.status
  const service = detail?.metadata?.serviceTitle ?? detail?.metadata?.service
  const msg: Record<string, string> = {
    API_KEY_INVALID: 'API 키가 올바르지 않아요. 복사할 때 공백이 섞이지 않았는지 확인하세요.',
    SERVICE_DISABLED: `구글 클라우드 콘솔에서 ${service ?? '해당 API'}를 "사용 설정"해야 해요.`,
    API_KEY_SERVICE_BLOCKED: `API 키의 "API 제한사항"에 ${service ?? '이 API'}가 빠져 있어요.`,
    API_KEY_HTTP_REFERRER_BLOCKED: `키의 "웹사이트 제한사항"에 ${location.origin}/* 를 추가하세요.`,
    BILLING_DISABLED: '프로젝트에 결제 계정이 연결되어 있지 않아요 (무료 한도 내라도 연결은 필요).',
    RESOURCE_EXHAUSTED: '요청 한도를 넘었어요. 잠시 후 다시 시도하세요.',
  }
  return new GoogleApiError((reason && msg[reason]) || err?.message || `요청 실패 (HTTP ${httpStatus})`, httpStatus, reason)
}

async function gfetch<T>(url: string, key: string, init: RequestInit, fieldMask?: string): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw explain(json?.error, res.status)
  return json as T
}

const rect = {
  rectangle: {
    low: { latitude: HOKKAIDO_BOUNDS.low.lat, longitude: HOKKAIDO_BOUNDS.low.lng },
    high: { latitude: HOKKAIDO_BOUNDS.high.lat, longitude: HOKKAIDO_BOUNDS.high.lng },
  },
}

export type Suggestion = { placeId: string; main: string; secondary: string }

export async function autocomplete(key: string, input: string, sessionToken: string): Promise<Suggestion[]> {
  type R = {
    suggestions?: {
      placePrediction?: {
        placeId: string
        text?: { text: string }
        structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }
      }
    }[]
  }
  const r = await gfetch<R>(`${PLACES}/places:autocomplete`, key, {
    method: 'POST',
    body: JSON.stringify({
      input,
      languageCode: 'ko',
      regionCode: 'jp',
      includedRegionCodes: ['jp'],
      locationBias: rect,
      sessionToken,
    }),
  })
  return (r.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }))
}

type GPlace = {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  googleMapsUri?: string
  businessStatus?: BusinessStatus
  regularOpeningHours?: {
    periods?: { open: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[]
    weekdayDescriptions?: string[]
  }
  nationalPhoneNumber?: string
  rating?: number
  userRatingCount?: number
  websiteUri?: string
  primaryType?: string
  types?: string[]
}

export async function placeDetails(key: string, placeId: string, sessionToken?: string): Promise<GPlace> {
  const qs = new URLSearchParams({ languageCode: 'ko', regionCode: 'JP' })
  if (sessionToken) qs.set('sessionToken', sessionToken)
  return gfetch<GPlace>(`${PLACES}/places/${encodeURIComponent(placeId)}?${qs}`, key, { method: 'GET' }, DETAIL_FIELDS)
}

export async function searchText(key: string, textQuery: string, near?: LatLng): Promise<{ id: string; name: string; location: LatLng }[]> {
  type R = { places?: { id: string; displayName?: { text: string }; location?: { latitude: number; longitude: number } }[] }
  const r = await gfetch<R>(
    `${PLACES}/places:searchText`,
    key,
    {
      method: 'POST',
      body: JSON.stringify({
        textQuery,
        languageCode: 'ko',
        regionCode: 'JP',
        pageSize: 5,
        locationBias: near
          ? { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 3000 } }
          : rect,
      }),
    },
    'places.id,places.displayName,places.location',
  )
  return (r.places ?? []).map((p) => ({
    id: p.id,
    name: p.displayName?.text ?? '',
    location: { lat: p.location?.latitude ?? 0, lng: p.location?.longitude ?? 0 },
  }))
}

export type LodgingResult = {
  googlePlaceId: string
  name: string
  location: LatLng
  address?: string
  rating?: number
  ratingCount?: number
  priceLevel?: string
  phone?: string
  mapsUri?: string
  website?: string
}

/** 어떤 지점 근처의 숙소 검색 */
export async function searchLodging(key: string, near: LatLng, radiusKm: number, query?: string): Promise<LodgingResult[]> {
  type R = {
    places?: (Pick<GPlace, 'id' | 'displayName' | 'formattedAddress' | 'location' | 'rating' | 'userRatingCount' | 'googleMapsUri' | 'websiteUri' | 'nationalPhoneNumber'> & {
      priceLevel?: string
    })[]
  }
  const r = await gfetch<R>(
    `${PLACES}/places:searchText`,
    key,
    {
      method: 'POST',
      body: JSON.stringify({
        textQuery: query?.trim() || '호텔 료칸 온천 숙소',
        includedType: 'lodging',
        languageCode: 'ko',
        regionCode: 'JP',
        pageSize: 20,
        locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: Math.min(radiusKm * 1000, 50000) } },
      }),
    },
    'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.websiteUri,places.nationalPhoneNumber',
  )
  return (r.places ?? []).map((p) => ({
    googlePlaceId: p.id,
    name: p.displayName?.text ?? '',
    location: { lat: p.location?.latitude ?? 0, lng: p.location?.longitude ?? 0 },
    address: p.formattedAddress,
    rating: p.rating,
    ratingCount: p.userRatingCount,
    priceLevel: p.priceLevel,
    phone: p.nationalPhoneNumber,
    mapsUri: p.googleMapsUri,
    website: p.websiteUri,
  }))
}

function kindFromTypes(types: string[] = []): PlaceKind {
  const has = (...t: string[]) => t.some((x) => types.includes(x))
  if (has('airport')) return 'airport'
  if (has('lodging', 'hotel', 'resort_hotel', 'japanese_inn', 'bed_and_breakfast')) return 'hotel'
  if (has('cafe', 'coffee_shop', 'bakery', 'dessert_shop', 'confectionery', 'ice_cream_shop')) return 'cafe'
  if (has('restaurant', 'food', 'meal_takeaway', 'ramen_restaurant', 'sushi_restaurant', 'bar')) return 'food'
  if (has('spa', 'public_bath', 'sauna')) return 'onsen'
  if (has('store', 'shopping_mall', 'market', 'gift_shop', 'department_store', 'supermarket')) return 'shop'
  return 'sight'
}

/** 구글 응답을 앱의 Place 필드로 변환 (기존 장소에 덮어쓸 부분만) */
export function toPlaceFields(g: GPlace): Partial<Place> {
  const hours: Hours | undefined = g.regularOpeningHours?.periods
    ? {
        periods: g.regularOpeningHours.periods.map((p) => ({ open: p.open, close: p.close })),
        weekdayText: g.regularOpeningHours.weekdayDescriptions,
        source: 'google',
      }
    : undefined
  return {
    googlePlaceId: g.id,
    googleName: g.displayName?.text,
    googleMapsUri: g.googleMapsUri,
    address: g.formattedAddress,
    location: g.location ? { lat: g.location.latitude, lng: g.location.longitude } : undefined,
    businessStatus: g.businessStatus,
    hours,
    phone: g.nationalPhoneNumber,
    rating: g.rating,
    ratingCount: g.userRatingCount,
    website: g.websiteUri,
    kind: kindFromTypes([g.primaryType ?? '', ...(g.types ?? [])]),
    verifiedAt: new Date().toISOString(),
  }
}

export async function computeRoute(
  key: string,
  from: LatLng,
  to: LatLng,
  mode: Exclude<LegMode, 'MANUAL'>,
  avoidTolls: boolean,
): Promise<{ seconds: number; meters: number; polyline?: string }> {
  type R = { routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[] }
  const ll = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })
  const body: Record<string, unknown> = {
    origin: ll(from),
    destination: ll(to),
    travelMode: mode,
    languageCode: 'ko',
    units: 'METRIC',
  }
  if (mode === 'DRIVE') {
    // 교통량 반영(TRAFFIC_AWARE)은 Pro 요금 → 홋카이도 지방도로는 정체가 적어 기본값으로 충분
    body.routingPreference = 'TRAFFIC_UNAWARE'
    body.routeModifiers = { avoidTolls }
  }
  const r = await gfetch<R>(ROUTES, key, { method: 'POST', body: JSON.stringify(body) }, 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline')
  const route = r.routes?.[0]
  if (!route?.duration) throw new GoogleApiError('경로를 찾지 못했어요')
  return {
    seconds: parseInt(route.duration, 10),
    meters: route.distanceMeters ?? 0,
    polyline: route.polyline?.encodedPolyline,
  }
}

/** 출발·도착을 고정하고 경유지 순서를 최적화 */
export async function optimizeWaypoints(key: string, from: LatLng, to: LatLng, stops: LatLng[]): Promise<{ seconds: number; order: number[] }> {
  type R = { routes?: { duration?: string; optimizedIntermediateWaypointIndex?: number[] }[] }
  const ll = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })
  const r = await gfetch<R>(
    ROUTES,
    key,
    {
      method: 'POST',
      body: JSON.stringify({
        origin: ll(from),
        destination: ll(to),
        intermediates: stops.map(ll),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        optimizeWaypointOrder: true,
      }),
    },
    'routes.duration,routes.optimizedIntermediateWaypointIndex',
  )
  const route = r.routes?.[0]
  if (!route?.duration) throw new GoogleApiError('경로를 찾지 못했어요')
  return { seconds: parseInt(route.duration, 10), order: route.optimizedIntermediateWaypointIndex ?? stops.map((_, i) => i) }
}

/** 키가 제대로 동작하는지 API 별로 점검 */
type TestResult = { api: string; ok: boolean; message: string; reason?: string }

export async function testKey(key: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  try {
    const s = await autocomplete(key, '札幌', 'test-' + Date.now())
    results.push({ api: 'Places API (New)', ok: true, message: `검색 정상 (${s.length}건)` })
  } catch (e) {
    results.push({ api: 'Places API (New)', ok: false, message: (e as Error).message, reason: (e as GoogleApiError).reason })
  }
  try {
    const r = await computeRoute(key, { lat: 42.7868, lng: 141.6830 }, { lat: 43.0682, lng: 141.3524 }, 'DRIVE', false)
    results.push({ api: 'Routes API', ok: true, message: `신치토세→삿포로 ${Math.round(r.seconds / 60)}분` })
  } catch (e) {
    results.push({ api: 'Routes API', ok: false, message: (e as Error).message, reason: (e as GoogleApiError).reason })
  }
  return results
}
