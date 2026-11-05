import type { LatLng } from '../types'

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Google encoded polyline — Routes API·OSRM 은 정밀도 5, Valhalla 는 6 */
export function decodePolyline(str: string, precision = 5): [number, number][] {
  const f = 10 ** precision
  const out: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0
      let shift = 0
      let b: number
      do {
        b = str.charCodeAt(index++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (which === 0) lat += delta
      else lng += delta
    }
    out.push([lat / f, lng / f])
  }
  return out
}

export function encodePolyline(points: [number, number][]): string {
  let out = ''
  let pLat = 0
  let pLng = 0
  const enc = (v: number) => {
    let s = v < 0 ? ~(v << 1) : v << 1
    let r = ''
    while (s >= 0x20) {
      r += String.fromCharCode((0x20 | (s & 0x1f)) + 63)
      s >>= 5
    }
    return r + String.fromCharCode(s + 63)
  }
  for (const [la, ln] of points) {
    const lat = Math.round(la * 1e5)
    const lng = Math.round(ln * 1e5)
    out += enc(lat - pLat) + enc(lng - pLng)
    pLat = lat
    pLng = lng
  }
  return out
}

export const HOKKAIDO_BOUNDS = { low: { lat: 41.3, lng: 139.3 }, high: { lat: 45.6, lng: 145.9 } }
export const HOKKAIDO_CENTER: LatLng = { lat: 43.2, lng: 142.4 }
