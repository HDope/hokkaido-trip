import { useState } from 'react'
import { useStore } from '../store'
import { useGoogle } from '../hooks'
import type { Place, Stop, StopAlt } from '../types'
import { addAlt, promoteAlt, removeAlt, togglePick, updateAlt, upsertPlace } from '../actions'
import { searchNear, toPlaceFields, type GPlace } from '../lib/google'
import { checkHours, hoursAsOf, hoursForDay } from '../lib/hours'
import { haversineMeters } from '../lib/geo'
import { MODE_ICON } from '../lib/routing'
import { shortName } from '../lib/schedule'
import type { AltPreview } from '../lib/placement'
import { travelersOf } from '../lib/people'
import { fmtDur, fmtHM, fmtKm } from '../lib/time'
import { KIND_ICON } from '../ui'
import { Btn, cx, isWideScreen, WarningList } from './common'
import { ParkingChip } from './ParkingInfo'
import { PlaceSearch } from './PlaceSearch'

// 한 자리(예: D1 저녁)에 갈 수 있는 후보들. 카드를 옆으로 넘기면 후보가 차례로 나오고,
// 두 사람이 각자 픽을 누른 뒤 "1순위로"를 누르면 그 후보가 일정에 들어간다.

/** 두 사람 픽 버튼 */
export function PickButtons({ picks, onToggle }: { picks?: string[]; onToggle: (travelerId: string) => void }) {
  const trip = useStore((s) => s.trip)!
  const people = travelersOf(trip)
  const all = people.every((p) => picks?.includes(p.id))
  return (
    <span className="flex flex-wrap items-center gap-1">
      {people.map((p) => {
        const on = !!picks?.includes(p.id)
        return (
          <button
            key={p.id}
            aria-pressed={on}
            className={cx(
              'rounded-full border px-2 py-0.5 text-[11.5px] font-semibold transition',
              on ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-stone-200 text-stone-500 hover:border-rose-200 hover:text-rose-500',
            )}
            onClick={() => onToggle(p.id)}
          >
            {on ? '♥' : '♡'} {p.name}픽
          </button>
        )
      })}
      {all && <span className="text-[11.5px] font-semibold text-rose-600">둘 다 픽</span>}
    </span>
  )
}

/** 지금 몇 번째 후보를 보고 있는지, 앞뒤로 넘기는 버튼 */
export function AltNav({ count, active, onGo, picksOf }: { count: number; active: number; onGo: (i: number) => void; picksOf: (i: number) => number }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11.5px]">
      <button className="rounded px-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" disabled={active === 0} aria-label="이전 후보" onClick={() => onGo(active - 1)}>
        ◀
      </button>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          aria-label={i === 0 ? '지금 일정' : `후보 ${i + 1}`}
          className={cx('relative h-1.5 rounded-full transition-all', i === active ? 'w-4 bg-violet-600' : 'w-1.5 bg-stone-300 hover:bg-stone-400')}
          onClick={() => onGo(i)}
        >
          {picksOf(i) > 0 && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] leading-none text-rose-500">♥</span>}
        </button>
      ))}
      <button className="rounded px-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" disabled={active === count - 1} aria-label="다음 후보" onClick={() => onGo(active + 1)}>
        ▶
      </button>
      <span className="ml-1 font-semibold text-stone-700">{active === 0 ? '1순위 · 지금 일정' : `후보 ${active + 1} / ${count}`}</span>
      <span className="text-stone-400">밀어서 넘기기</span>
    </div>
  )
}

const signed = (min: number) => (Math.abs(min) < 1 ? '그대로' : `${min > 0 ? '+' : '−'}${fmtDur(Math.abs(min))}`)

/** 후보 한 장: 이 후보로 바꾸면 몇 시에 도착하고 하루가 어떻게 달라지는지 */
export function AltSlide({ dayId, stopId, alt, preview, weekday, date }: { dayId: string; stopId: string; alt: StopAlt; preview?: AltPreview; weekday: number; date: Date }) {
  const trip = useStore((s) => s.trip)!
  const openPlace = useStore((s) => s.openPlace)
  const focusPlace = useStore((s) => s.focusPlace)
  const place = trip.places[alt.placeId]
  if (!place) return null
  const sp = preview?.stop
  const open = sp && (sp.hours.status === 'ok' || sp.hours.status === 'always')
  return (
    <div className="flex gap-3">
      <div className="w-12 shrink-0 pt-0.5 text-right text-stone-400 tabular-nums">
        {sp && (
          <>
            <div className="text-[15px] font-bold leading-tight">{fmtHM(sp.arrive)}</div>
            <div className="text-xs">{fmtHM(sp.depart)}</div>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              focusPlace(place.id)
              if (!isWideScreen()) openPlace(place.id)
            }}
          >
            <div className="text-xs font-bold text-amber-700">후보 · 이걸로 바꾸면</div>
            <div className="truncate text-[15px] font-semibold hover:text-violet-700">
              {KIND_ICON[place.kind]} {place.name}
            </div>
            {place.nameLocal && <div className="truncate text-xs text-stone-400">{place.nameLocal}</div>}
          </button>
          <button className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 md:block" onClick={() => openPlace(place.id)}>
            상세
          </button>
        </div>
        {preview && sp && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-stone-600">
            {sp.leg && (
              <span>
                {MODE_ICON[sp.leg.mode]} {fmtDur(sp.leg.minutes)}
                {sp.leg.meters > 0 && <span className="text-stone-400"> · {fmtKm(sp.leg.meters)}</span>}
              </span>
            )}
            <span>
              그날 운전 <b className="text-stone-800">{signed(preview.driveDelta)}</b>
            </span>
            {Math.abs(preview.endDelta) >= 1 && (
              <span>
                하루 끝 <b className="text-stone-800">{signed(preview.endDelta)}</b>
              </span>
            )}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className={cx('rounded-md px-1.5 py-0.5', hoursAsOf(place, date) ? 'bg-amber-50 text-amber-900' : open ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600')}>
            🕘 {hoursForDay(place, weekday)}
            {hoursAsOf(place, date) && <span className="font-semibold"> · {hoursAsOf(place, date)}</span>}
          </span>
          {place.rating && (
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-stone-600">
              ★ {place.rating.toFixed(1)}
              {place.ratingCount ? ` (${place.ratingCount.toLocaleString()})` : ''}
            </span>
          )}
          {place.phone && <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-stone-600">☎ {place.phone}</span>}
          <ParkingChip place={place} byCar={!sp?.leg || sp.leg.mode === 'DRIVE'} onClick={() => openPlace(place.id)} />
        </div>
        <WarningList warnings={(sp?.warnings ?? []).filter((w) => w.level !== 'info')} />
        <textarea
          className="mt-1.5 field-sizing-content w-full resize-none rounded-md border border-stone-200 px-2 py-1 text-[12.5px] leading-snug placeholder:text-stone-400"
          placeholder="후보 메모 (추천 메뉴, 예약 여부 등)"
          rows={1}
          value={alt.note ?? ''}
          onChange={(e) => updateAlt(dayId, stopId, alt.id, { note: e.target.value || undefined })}
        />
      </div>
    </div>
  )
}

/** 후보를 보고 있을 때 아래 버튼들 */
export function AltActions({ dayId, stopId, alt, onPromoted }: { dayId: string; stopId: string; alt: StopAlt; onPromoted: () => void }) {
  const notify = useStore((s) => s.notify)
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs">
      <PickButtons picks={alt.picks} onToggle={(id) => togglePick(dayId, stopId, alt.id, id)} />
      <span className="flex-1" />
      <button
        className="rounded-md bg-violet-600 px-2 py-0.5 font-semibold text-white hover:bg-violet-700"
        onClick={() => {
          const msg = promoteAlt(dayId, stopId, alt.id)
          if (msg) notify(`${msg} (↶ 되돌리기)`)
          onPromoted()
        }}
      >
        ⭐ 1순위로
      </button>
      <button
        className="rounded-md px-1.5 py-0.5 text-stone-500 hover:bg-stone-100"
        onClick={() => {
          removeAlt(dayId, stopId, alt.id)
          notify('후보에서 뺐어요. 장소함에 남겨 뒀어요 (↶ 되돌리기)')
        }}
      >
        후보 빼기
      </button>
    </div>
  )
}

const KIND_SEARCH: Partial<Record<Place['kind'], { label: string; query: string; type?: string }>> = {
  food: { label: '식당', query: '식당 레스토랑', type: 'restaurant' },
  cafe: { label: '카페', query: '카페 디저트', type: 'cafe' },
  onsen: { label: '온천', query: '온천 당일 입욕' },
  sight: { label: '볼거리', query: '관광 명소' },
  shop: { label: '가게', query: '쇼핑' },
}

/** 후보 추가: 검색, 장소함, 근처 추천 */
export function AltAddBox({ dayId, stop, place, arrive, weekday, onClose, onAdded }: { dayId: string; stop: Stop; place: Place; arrive: number; weekday: number; onClose: () => void; onAdded: () => void }) {
  const trip = useStore((s) => s.trip)!
  const apiKey = useStore((s) => s.apiKey)
  const notify = useStore((s) => s.notify)
  const google = useGoogle()
  const [recs, setRecs] = useState<Place[]>()
  const [loading, setLoading] = useState(false)
  const already = new Set([stop.placeId, ...(stop.alts ?? []).map((a) => a.placeId)])
  const search = KIND_SEARCH[place.kind] ?? { label: '장소', query: '추천 장소' }
  const add = (id: string) => {
    notify(addAlt(dayId, stop.id, id))
    onAdded()
  }
  // 장소함에서는 이 자리 근처(20km 안)에 있는 같은 종류만 가까운 순으로
  const wish = trip.wishlist
    .map((id) => trip.places[id])
    .filter((p) => p && !already.has(p.id) && (p.kind === place.kind || (place.kind === 'food' && p.kind === 'cafe')))
    .map((p) => ({ p, d: haversineMeters(place.location, p.location) }))
    .filter((x) => x.d < 20000)
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
    .map((x) => x.p)

  async function recommend() {
    setLoading(true)
    try {
      const found: GPlace[] = await searchNear(apiKey, place.location, search.query, 1500, search.type)
      const places = found
        .filter((g) => g.businessStatus !== 'CLOSED_PERMANENTLY' && g.location)
        .map((g) => {
          const f = toPlaceFields(g)
          return { id: `rec-${g.id}`, name: g.displayName?.text ?? '', kind: f.kind ?? place.kind, location: f.location!, ...f } as Place
        })
        .filter((p) => !Object.values(trip.places).some((x) => x.googlePlaceId && x.googlePlaceId === p.googlePlaceId && already.has(x.id)))
        .filter((p) => haversineMeters(place.location, p.location) < 3000)
      setRecs(places.slice(0, 10))
      if (!places.length) notify('근처에서 찾은 곳이 없어요. 검색으로 넣어 보세요')
    } catch (e) {
      notify(`추천을 못 가져왔어요: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50/60 p-2.5">
      <div className="mb-1.5 text-xs font-semibold text-amber-900">＋ {shortName(place.name)} 대신 갈 후보 추가</div>
      <PlaceSearch autoFocus placeholder="후보 검색 (예: 스시, 이자카야, 가게 이름)" onPick={(p, existing) => add(existing ? p.id : upsertPlace(p))} />
      {wish.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-stone-500">장소함에서:</span>
          {wish.map((p) => (
            <button key={p.id} className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs hover:border-amber-300 hover:bg-amber-50" onClick={() => add(p.id)}>
              {KIND_ICON[p.kind]} {p.name}
            </button>
          ))}
        </div>
      )}
      {google && !recs && (
        <div className="mt-2">
          <Btn onClick={recommend} disabled={loading} className="px-2.5 py-1 text-xs">
            {loading ? '찾는 중…' : `🔎 근처 ${search.label} 추천 받기`}
          </Btn>
        </div>
      )}
      {recs && recs.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-xs text-stone-500">근처 {search.label} · 이 시간({fmtHM(arrive)}) 영업 여부</div>
          {recs.map((p) => {
            const h = checkHours(p, weekday, arrive, arrive + stop.stay)
            const status =
              h.status === 'ok' || h.status === 'always'
                ? { t: '영업', c: 'text-emerald-700' }
                : h.status === 'closedDay'
                  ? { t: '휴무일', c: 'text-red-600' }
                  : h.status === 'afterClose' || h.status === 'closesDuring'
                    ? { t: '그 시간엔 마감', c: 'text-red-600' }
                    : h.status === 'beforeOpen'
                      ? { t: '오픈 전', c: 'text-amber-700' }
                      : { t: '시간 미확인', c: 'text-stone-400' }
            const taken = Object.values(trip.places).find((x) => x.googlePlaceId && x.googlePlaceId === p.googlePlaceId)
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[12.5px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {KIND_ICON[p.kind]} {p.name}
                  </div>
                  <div className="text-stone-500">
                    {p.rating ? `★ ${p.rating.toFixed(1)}${p.ratingCount ? ` (${p.ratingCount.toLocaleString()})` : ''} · ` : ''}
                    {fmtKm(haversineMeters(place.location, p.location))} · <span className={status.c}>{status.t}</span>
                  </div>
                </div>
                <button
                  className="shrink-0 rounded-md border border-amber-300 px-1.5 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  onClick={() => {
                    const { id: _tmp, ...rest } = p
                    add(taken ? taken.id : upsertPlace(rest))
                    setRecs(recs.filter((r) => r.id !== p.id))
                  }}
                >
                  ＋ 후보
                </button>
              </div>
            )
          })}
        </div>
      )}
      <button className="mt-1.5 text-xs text-stone-500 hover:underline" onClick={onClose}>
        닫기
      </button>
    </div>
  )
}
