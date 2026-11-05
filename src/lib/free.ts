import type { LatLng, PlaceKind } from '../types'
import { decodePolyline, encodePolyline, HOKKAIDO_BOUNDS, HOKKAIDO_CENTER } from './geo'

// API 키가 없을 때 쓰는 무료 대체 서비스 (OpenStreetMap 기반)
//  - 검색: Photon (komoot)
//  - 운전 경로: Valhalla 공개 서버 (FOSSGIS) — 도로 등급별 속도라 구글과 오차가 작음, 실패 시 OSRM
//    둘 다 교통·신호 대기는 반영하지 않아 약간 빠르게 나옴 → 설정의 보정값을 곱한다

export type FreeResult = { key: string; name: string; secondary: string; location: LatLng; kind: PlaceKind }

export async function photonSearch(q: string): Promise<FreeResult[]> {
  const b = HOKKAIDO_BOUNDS
  const qs = new URLSearchParams({
    q,
    limit: '8',
    lat: String(HOKKAIDO_CENTER.lat),
    lon: String(HOKKAIDO_CENTER.lng),
    bbox: `${b.low.lng},${b.low.lat},${b.high.lng},${b.high.lat}`,
  })
  const res = await fetch(`https://photon.komoot.io/api/?${qs}`)
  if (!res.ok) throw new Error(`검색 실패 (HTTP ${res.status})`)
  type F = { properties: Record<string, string | undefined>; geometry: { coordinates: [number, number] } }
  const json = (await res.json()) as { features?: F[] }
  return (json.features ?? []).map((f) => {
    const p = f.properties
    const v = `${p.osm_key}:${p.osm_value}`
    const kind: PlaceKind = /tourism:(hotel|guest_house|hostel|motel)/.test(v)
      ? 'hotel'
      : /amenity:(restaurant|fast_food|food_court|bar|pub)/.test(v)
        ? 'food'
        : /amenity:cafe/.test(v)
          ? 'cafe'
          : /^shop:/.test(v)
            ? 'shop'
            : /aeroway:aerodrome/.test(v)
              ? 'airport'
              : 'sight'
    return {
      key: `${p.osm_type}${p.osm_id}`,
      name: p.name ?? q,
      secondary: [p.city ?? p.county, p.locality, p.street].filter(Boolean).join(' · '),
      location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
      kind,
    }
  })
}

const LODGING_VALUES = new Set(['hotel', 'guest_house', 'hostel', 'motel', 'apartment'])

/** OSM 에 등록된 숙소를 지점 근처에서 찾는다 (평점·가격 정보는 없음) */
export async function photonLodging(near: LatLng, radiusKm: number, query?: string): Promise<FreeResult[]> {
  const dLat = radiusKm / 111
  const dLng = radiusKm / (111 * Math.cos((near.lat * Math.PI) / 180))
  const bbox = `${near.lng - dLng},${near.lat - dLat},${near.lng + dLng},${near.lat + dLat}`
  const terms = query?.trim() ? [query.trim()] : ['ホテル', '旅館', 'hotel', 'リゾート', 'ゲストハウス', 'INN']
  const found = new Map<string, FreeResult>()
  for (const q of terms) {
    const qs = new URLSearchParams({ q, limit: '15', lat: String(near.lat), lon: String(near.lng), osm_tag: 'tourism', bbox })
    const res = await fetch(`https://photon.komoot.io/api/?${qs}`)
    if (!res.ok) continue
    type F = { properties: Record<string, string | undefined>; geometry: { coordinates: [number, number] } }
    const json = (await res.json()) as { features?: F[] }
    for (const f of json.features ?? []) {
      const p = f.properties
      if (!p.name || !LODGING_VALUES.has(p.osm_value ?? '')) continue
      found.set(`${p.osm_type}${p.osm_id}`, {
        key: `${p.osm_type}${p.osm_id}`,
        name: p.name,
        secondary: [p.city ?? p.county, p.locality, p.street].filter(Boolean).join(' · '),
        location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
        kind: 'hotel',
      })
    }
  }
  return [...found.values()]
}

let lastCall = 0
async function throttle() {
  // 공개 서버 이용 규칙: 초당 1회 이하
  const wait = lastCall + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

export async function valhallaRoute(from: LatLng, to: LatLng): Promise<{ seconds: number; meters: number; polyline?: string }> {
  await throttle()
  const q = {
    locations: [
      { lat: from.lat, lon: from.lng },
      { lat: to.lat, lon: to.lng },
    ],
    costing: 'auto',
    units: 'kilometers',
    directions_type: 'none',
  }
  const res = await fetch(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(q))}`)
  if (!res.ok) throw new Error(`무료 경로 서버 오류 (HTTP ${res.status})`)
  const json = (await res.json()) as { trip?: { summary: { time: number; length: number }; legs: { shape: string }[] } }
  const trip = json.trip
  if (!trip) throw new Error('경로를 찾지 못했어요')
  const shape = trip.legs.flatMap((l) => decodePolyline(l.shape, 6))
  // 화면용으로 점을 솎아서 정밀도 5 포맷으로 저장 (파일 크기 절약)
  const step = Math.max(1, Math.floor(shape.length / 400))
  const thin = shape.filter((_, i) => i % step === 0 || i === shape.length - 1)
  return { seconds: trip.summary.time, meters: trip.summary.length * 1000, polyline: encodePolyline(thin) }
}

export async function osrmRoute(from: LatLng, to: LatLng): Promise<{ seconds: number; meters: number; polyline?: string }> {
  await throttle()
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=polyline`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`무료 경로 서버 오류 (HTTP ${res.status})`)
  const json = (await res.json()) as { code: string; routes?: { duration: number; distance: number; geometry?: string }[] }
  const r = json.routes?.[0]
  if (json.code !== 'Ok' || !r) throw new Error('경로를 찾지 못했어요')
  return { seconds: r.duration, meters: r.distance, polyline: r.geometry }
}
