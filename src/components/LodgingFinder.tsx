import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { useGoogle } from '../hooks'
import type { LatLng, Place } from '../types'
import type { DayPlan } from '../lib/schedule'
import { CANDIDATES, candidateToPlace } from '../candidates'
import { applyLodging, upsertPlace } from '../actions'
import { placeUrl } from '../lib/export'
import { haversineMeters } from '../lib/geo'
import { photonLodging } from '../lib/free'
import { searchLodging } from '../lib/google'
import { fmtDate, fmtKm } from '../lib/time'
import { uid } from '../lib/time'
import { Btn, cx, ExtLink, Modal } from './common'

type Row = {
  key: string
  name: string
  sub?: string
  location: LatLng
  rating?: number
  ratingCount?: number
  price?: string
  phone?: string
  mapsUrl: string
  place: Place // 고르면 등록할 장소
  tag?: string
}

const PRICE: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '¥',
  PRICE_LEVEL_MODERATE: '¥¥',
  PRICE_LEVEL_EXPENSIVE: '¥¥¥',
  PRICE_LEVEL_VERY_EXPENSIVE: '¥¥¥¥',
}

/** 이 숙소로 며칠 밤을 묵고 있는지 (같은 숙소가 이어지는 동안) */
function nightsOf(plans: DayPlan[], index: number): number {
  const id = plans[index].lodging?.id
  if (!id) return 1
  let n = 1
  while (plans[index + n]?.lodging?.id === id) n++
  return n
}

export function LodgingFinder({ plan, plans, onClose }: { plan: DayPlan; plans: DayPlan[]; onClose: () => void }) {
  const trip = useStore((s) => s.trip)!
  const apiKey = useStore((s) => s.apiKey)
  const notify = useStore((s) => s.notify)
  const google = useGoogle()

  // 근처를 찾을 기준점: 그날 방문지(마지막부터), 현재 숙소, 출발지
  const anchors = useMemo(() => {
    const list: Place[] = []
    const push = (p?: Place) => p && !list.some((x) => x.id === p.id) && list.push(p)
    ;[...plan.stops].reverse().forEach((s) => s.place?.kind !== 'hotel' && push(s.place))
    push(plan.lodging)
    push(plan.startPlace)
    return list
  }, [plan])
  const [anchorId, setAnchorId] = useState(anchors[0]?.id)
  const anchor = anchors.find((a) => a.id === anchorId) ?? anchors[0]
  const [radius, setRadius] = useState(10)
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [nights, setNights] = useState(() => nightsOf(plans, plan.index))
  const [remote, setRemote] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const maxNights = Math.max(1, plans.length - 1 - plan.index)

  useEffect(() => {
    if (!anchor) return
    let cancelled = false
    setLoading(true)
    setError(undefined)
    const run = async (): Promise<Row[]> => {
      if (google) {
        const found = await searchLodging(apiKey, anchor.location, radius, submitted)
        return found.map((f) => ({
          key: f.googlePlaceId,
          name: f.name,
          sub: f.address,
          location: f.location,
          rating: f.rating,
          ratingCount: f.ratingCount,
          price: f.priceLevel ? PRICE[f.priceLevel] : undefined,
          phone: f.phone,
          mapsUrl: f.mapsUri ?? `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: f.name, query_place_id: f.googlePlaceId })}`,
          place: {
            id: `p-${uid()}`,
            name: f.name,
            kind: 'hotel',
            location: f.location,
            address: f.address,
            googlePlaceId: f.googlePlaceId,
            googleMapsUri: f.mapsUri,
            rating: f.rating,
            ratingCount: f.ratingCount,
            phone: f.phone,
            website: f.website,
          },
        }))
      }
      const found = await photonLodging(anchor.location, radius, submitted)
      return found.map((f) => {
        const place: Place = { id: `p-${uid()}`, name: f.name, nameLocal: f.name, kind: 'hotel', location: f.location, address: f.secondary }
        return { key: f.key, name: f.name, sub: f.secondary, location: f.location, mapsUrl: `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: f.name })}`, place }
      })
    }
    run()
      .then((rows) => !cancelled && setRemote(rows))
      .catch((e) => !cancelled && (setRemote([]), setError((e as Error).message)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [anchor, radius, submitted, google, apiKey])

  // 이미 아는 숙소: 저장된 곳 + 추천 후보 (한국어 이름이 있어 검색 없이 바로 고를 수 있다)
  const saved = useMemo<Row[]>(() => {
    if (!anchor) return []
    const places = new Map<string, Place>()
    for (const p of Object.values(trip.places)) if (p.kind === 'hotel') places.set(p.nameLocal ?? p.name, p)
    for (const c of CANDIDATES) if (c.kind === 'hotel' && !places.has(c.nameLocal)) places.set(c.nameLocal, candidateToPlace(c))
    return [...places.values()]
      .filter((p) => haversineMeters(p.location, anchor.location) <= radius * 1000)
      .map((p) => ({ key: p.id, name: p.name, sub: p.nameLocal ?? p.address, location: p.location, rating: p.rating, ratingCount: p.ratingCount, phone: p.phone, mapsUrl: placeUrl(p), place: p, tag: trip.places[p.id] ? '저장됨' : '추천' }))
  }, [trip.places, anchor, radius])

  const sortByDistance = (rows: Row[]) => (anchor ? [...rows].sort((a, b) => haversineMeters(a.location, anchor.location) - haversineMeters(b.location, anchor.location)) : rows)
  // 저장된 숙소와 같은 곳(이름 같거나 80m 이내)은 검색 결과에서 뺀다
  const others = sortByDistance(remote.filter((r) => !saved.some((x) => x.name === r.name || x.sub === r.name || haversineMeters(x.location, r.location) < 80)))

  function pick(row: Row) {
    const id = trip.places[row.place.id] ? row.place.id : upsertPlace(row.place)
    applyLodging(plan.index, id, nights)
    const lastDate = plans[plan.index + nights - 1]?.date ?? plan.date
    notify(`${fmtDate(plan.date)}${nights > 1 ? ` ~ ${fmtDate(lastDate)}` : ''} 숙소를 ${row.name}(으)로 바꿨어요`)
    onClose()
  }

  const rowEl = (r: Row) => {
    const isCurrent = r.place.id === plan.lodging?.id
    return (
      <li key={r.key} className={cx('rounded-xl border px-3 py-2.5', isCurrent ? 'border-violet-300 bg-violet-50/60' : 'border-stone-200 bg-white')}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">
              🛏️ {r.name}
              {r.tag && <span className="ml-1.5 rounded bg-stone-100 px-1 py-0.5 text-[10.5px] font-medium text-stone-600">{r.tag}</span>}
            </div>
            {r.sub && <div className="truncate text-xs text-stone-500">{r.sub}</div>}
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-stone-600">
              {anchor && <span>기준에서 {fmtKm(haversineMeters(r.location, anchor.location))}</span>}
              {r.rating != null && (
                <span>
                  ★ {r.rating.toFixed(1)}
                  {r.ratingCount ? ` (${r.ratingCount.toLocaleString()})` : ''}
                </span>
              )}
              {r.price && <span>{r.price}</span>}
              {r.phone && <span>☎ {r.phone}</span>}
            </div>
            <div className="mt-1 flex gap-3 text-xs">
              <ExtLink href={r.mapsUrl}>구글맵 ↗</ExtLink>
              <ExtLink href={`https://www.google.com/travel/search?${new URLSearchParams({ q: r.place.nameLocal ?? r.name })}`}>가격·예약 ↗</ExtLink>
            </div>
          </div>
          {isCurrent ? (
            <span className="shrink-0 rounded-lg bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">현재 숙소</span>
          ) : (
            <Btn variant="primary" className="shrink-0 px-2.5 py-1 text-xs" onClick={() => pick(r)}>
              이 숙소로
            </Btn>
          )}
        </div>
      </li>
    )
  }

  return (
    <Modal title={`D${plan.index + 1} ${fmtDate(plan.date)} 숙소 찾기`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-stone-500">기준</span>
          {anchors.map((a) => (
            <button
              key={a.id}
              onClick={() => setAnchorId(a.id)}
              className={cx('max-w-44 truncate rounded-full border px-2.5 py-1 font-medium', anchor?.id === a.id ? 'border-violet-500 bg-violet-600 text-white' : 'border-stone-300 bg-white hover:bg-stone-50')}
            >
              {a.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-stone-500">반경</span>
            <select className="rounded-lg border border-stone-300 bg-white px-1.5 py-1 text-sm" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
              {[3, 10, 30].map((km) => (
                <option key={km} value={km}>
                  {km}km
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-stone-500">적용</span>
            <select className="rounded-lg border border-stone-300 bg-white px-1.5 py-1 text-sm" value={nights} onChange={(e) => setNights(Number(e.target.value))}>
              {Array.from({ length: maxNights }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {fmtDate(plan.date)}부터 {n}박
                </option>
              ))}
            </select>
          </label>
          <form
            className="flex min-w-48 flex-1 gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(query)
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 py-1 text-sm placeholder:text-stone-400"
              placeholder={google ? '이름·조건 검색 (예: 노천탕 료칸)' : '일본어·영어 이름 검색 (예: 旅館)'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Btn className="px-2.5 py-1 text-xs">검색</Btn>
          </form>
        </div>

        {saved.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-bold text-stone-500">저장된 숙소·추천 후보</h3>
            <ul className="space-y-1.5">{sortByDistance(saved).map(rowEl)}</ul>
          </section>
        )}
        <section>
          <h3 className="mb-1.5 text-xs font-bold text-stone-500">
            주변 검색 결과 {loading && <span className="font-normal text-violet-600">찾는 중…</span>}
          </h3>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">검색 실패: {error}</p>}
          {!loading && !error && others.length === 0 && <p className="rounded-xl border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-500">이 범위에서 더 찾지 못했어요. 반경을 넓혀보세요.</p>}
          <ul className="space-y-1.5">{others.map(rowEl)}</ul>
          {!google && <p className="mt-2 text-xs text-stone-500">지금은 OpenStreetMap 자료라 빠진 숙소가 있고 평점·가격이 없어요. 구글 키를 연결하면 평점과 더 많은 숙소가 나와요.</p>}
        </section>
      </div>
    </Modal>
  )
}
