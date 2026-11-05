import { useStore } from '../store'
import type { Place } from '../types'
import { haversineMeters } from './geo'
import { placeDetails, searchText, toPlaceFields } from './google'

/** 장소 하나를 구글 데이터로 최신화 (place_id 가 없으면 이름+좌표로 찾아 연결) */
export async function verifyPlace(place: Place): Promise<{ ok: boolean; message: string }> {
  const { apiKey, mutate } = useStore.getState()
  if (!apiKey) return { ok: false, message: 'API 키가 없어요' }
  if (place.skipGoogle) return { ok: true, message: place.name }
  let placeId = place.googlePlaceId
  if (!placeId) {
    const queries = [place.nameLocal, place.name].filter((q): q is string => !!q)
    for (const q of queries) {
      const found = await searchText(apiKey, q, place.location)
      const near = found.find((f) => haversineMeters(f.location, place.location) < 5000)
      if (near) {
        placeId = near.id
        break
      }
    }
    if (!placeId) {
      mutate((t) => {
        t.places[place.id].matchWarning = '구글에서 같은 장소를 못 찾았어요 — 장소 상세에서 구글 장소를 직접 연결하세요'
      })
      return { ok: false, message: `${place.name}: 구글에서 못 찾음` }
    }
  }
  const g = await placeDetails(apiKey, placeId)
  const fields = toPlaceFields(g)
  mutate((t) => {
    const p = t.places[place.id]
    const moved = fields.location ? haversineMeters(fields.location, p.location) : 0
    Object.assign(p, {
      googlePlaceId: fields.googlePlaceId,
      googleName: fields.googleName,
      googleMapsUri: fields.googleMapsUri,
      address: fields.address ?? p.address,
      businessStatus: fields.businessStatus,
      phone: fields.phone ?? p.phone,
      rating: fields.rating,
      ratingCount: fields.ratingCount,
      website: fields.website ?? p.website,
      verifiedAt: fields.verifiedAt,
      matchWarning: undefined,
    })
    // 구글에 영업시간이 있으면 그걸 우선. 직접 입력한 시간은 덮어쓰지 않는다
    if (fields.hours && p.hours?.source !== 'manual') {
      p.hours = fields.hours
      p.alwaysOpen = false
    }
    // 큐레이션 좌표가 어긋나 있으면 구글 좌표로 보정 (300m 이상 차이)
    if (fields.location && moved > 300) p.location = fields.location
    if (!p.kind || p.kind === 'other') p.kind = fields.kind ?? p.kind
  })
  return { ok: true, message: place.name }
}

export async function verifyAll(placeIds: string[], onProgress?: (done: number, total: number) => void) {
  const results: { ok: boolean; message: string }[] = []
  let done = 0
  for (const id of placeIds) {
    const place = useStore.getState().trip?.places[id]
    if (!place) continue
    try {
      results.push(await verifyPlace(place))
    } catch (e) {
      results.push({ ok: false, message: `${place.name}: ${(e as Error).message}` })
      if (/API 키|사용 설정|결제|제한/.test((e as Error).message)) break
    }
    onProgress?.(++done, placeIds.length)
  }
  return results
}
