import { lazy, Suspense, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { DayPlan, LegPlan } from '../lib/schedule'
import { decodePolyline } from '../lib/geo'
import { dayColor } from '../ui'
import { CANDIDATES, filterCandidates, GROUP, REGIONS, THEMES, THEME_BY_ID, type Candidate, type RegionId } from '../candidates'
import { GoogleMap } from './map/GoogleMap'
import type { MapMarker, MapPath } from './map/types'
import { cx } from './common'

function MapMessage({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center bg-stone-100 px-6 text-center text-sm text-stone-500">{text}</div>
}

// 구글 지도를 못 쓸 때만 필요한 지도라 그때 불러온다
const LeafletMap = lazy(() =>
  import('./map/LeafletMap')
    .then((m) => ({ default: m.LeafletMap }))
    .catch(() => ({ default: () => <MapMessage text="지도를 불러오지 못했어요. 인터넷을 확인한 뒤 다시 열어주세요" /> })),
)

function legPath(l: LegPlan, color: string, dim: boolean): MapPath {
  const r = l.resolved
  const pts: [number, number][] =
    r.status === 'ok' && r.polyline
      ? decodePolyline(r.polyline)
      : [
          [l.from.location.lat, l.from.location.lng],
          [l.to.location.lat, l.to.location.lng],
        ]
  const confirmedLine = r.status === 'ok' && !!r.polyline
  return { id: `${l.from.id}-${l.to.id}-${l.mode}`, points: pts, color, dim, dashed: !confirmedLine || l.mode !== 'DRIVE' }
}

// 지역 요약 카드의 위치와, 서로 겹치지 않게 지점에서 밀어내는 방향
const REGION_CARD: Record<RegionId, { at: { lat: number; lng: number }; shift: string }> = {
  otaru: { at: { lat: 43.19, lng: 140.95 }, shift: 'translate(calc(-100% - 8px), -90%)' },
  sapporo: { at: { lat: 43.06, lng: 141.35 }, shift: 'translate(8px, -100%)' },
  airport: { at: { lat: 42.8, lng: 141.6 }, shift: 'translate(8px, -10%)' },
  furano: { at: { lat: 43.42, lng: 142.45 }, shift: 'translate(10px, -40%)' },
  asahikawa: { at: { lat: 43.78, lng: 142.39 }, shift: 'translate(10px, -80%)' },
  south: { at: { lat: 42.53, lng: 140.97 }, shift: 'translate(-50%, 10px)' },
  niseko: { at: { lat: 42.85, lng: 140.72 }, shift: 'translate(calc(-100% - 8px), -20%)' },
  east: { at: { lat: 43.7, lng: 144.2 }, shift: 'translate(-50%, -112%)' },
  hakodate: { at: { lat: 41.98, lng: 140.67 }, shift: 'translate(10px, -50%)' },
}

function regionCardHtml(id: RegionId, label: string, items: Candidate[]): string {
  const counts = THEMES.flatMap((t) => {
    const n = items.filter((c) => c.theme === t.id).length
    return n ? [`<span style="white-space:nowrap">${t.icon}<b style="font-weight:600;margin-left:1px">${n}</b></span>`] : []
  })
  return `<div style="position:relative;width:0;height:0;cursor:pointer">
<div style="position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:#1d1c1a;box-shadow:0 0 0 2px #fff"></div>
<div style="position:absolute;left:0;top:0;transform:${REGION_CARD[id].shift};width:max-content;max-width:128px;background:#fff;border:1px solid #d6d3cc;border-radius:10px;padding:5px 7px;box-shadow:0 2px 6px rgba(0,0,0,.18);font:500 11px/1.35 Pretendard,system-ui,sans-serif;color:#1d1c1a">
<div style="font-weight:700;margin-bottom:2px">${label}</div><div style="display:flex;flex-wrap:wrap;gap:1px 5px">${counts.join('')}</div></div></div>`
}

export function MapPanel({ plans }: { plans: DayPlan[] }) {
  const view = useStore((s) => s.view)
  const selectedDayId = useStore((s) => s.selectedDayId)
  const trip = useStore((s) => s.trip)!
  const apiKey = useStore((s) => s.apiKey)
  const openPlace = useStore((s) => s.openPlace)
  const focusPlaceId = useStore((s) => s.focusPlaceId)
  const focusNonce = useStore((s) => s.focusNonce)
  const notify = useStore((s) => s.notify)
  const [jsFailed, setJsFailed] = useState(false)
  const offline = useStore((s) => !!s.offlineSince)
  const [showOthers, setShowOthers] = useState(false)
  const candThemes = useStore((s) => s.candThemes)
  const candRegion = useStore((s) => s.candRegion)
  const candPanId = useStore((s) => s.candPanId)
  const setCand = useStore((s) => s.setCand)
  const [fitNonce, setFitNonce] = useState(0)
  const isCand = view === 'candidates'

  const { markers, paths, fitKey } = useMemo(() => {
    const markers: MapMarker[] = []
    const paths: MapPath[] = []
    const selected = plans.find((p) => p.day.id === selectedDayId)
    const dayMode = view === 'day' && selected
    if (isCand) {
      // 현재 동선을 옅게 깔고 그 위에 후보를 올려 겹치는 곳을 본다
      for (const p of plans) for (const l of [...p.stops.map((s) => s.leg), p.endLeg]) if (l) paths.push({ ...legPath(l, '#52514e', true), dashed: false })
      const list = filterCandidates(candThemes, candRegion)
      if (candRegion || (candThemes.length >= 1 && candThemes.length <= 2)) {
        for (const c of list) {
          const t = THEME_BY_ID[c.theme]
          markers.push({
            id: c.id,
            position: c.location,
            label: t.icon,
            color: GROUP[t.group].color,
            title: `${c.name} · ${REGIONS.find((r) => r.id === c.region)?.label}`,
            ring: true,
          })
        }
      } else {
        // 한꺼번에 찍으면 오타루·삿포로에서 핀이 겹쳐 분포가 안 보이므로 지역 단위 카드로 요약
        for (const r of REGIONS) {
          const items = list.filter((c) => c.region === r.id)
          if (items.length) markers.push({ id: `region:${r.id}`, position: REGION_CARD[r.id].at, label: '', color: '#fff', title: `${r.label} — 눌러서 자세히`, html: regionCardHtml(r.id, r.label, items) })
        }
      }
      return { markers, paths, fitKey: `cand|${candThemes.join()}|${candRegion}|${fitNonce}` }
    }
    for (const p of plans) {
      const isSel = !!dayMode && p === selected
      const show = !dayMode || isSel || showOthers
      if (!show) continue
      const dim = !!dayMode && !isSel
      const color = dayColor(p.index)
      for (const l of [...p.stops.map((s) => s.leg), p.endLeg]) if (l) paths.push(legPath(l, color, dim))
      p.stops.forEach((s, i) => {
        if (!s.place) return
        markers.push({
          id: s.place.id,
          position: s.place.location,
          label: dayMode ? String(i + 1) : String(p.index + 1),
          color,
          title: `D${p.index + 1}-${i + 1} ${s.place.name}`,
          dim,
        })
      })
      if (p.lodging) {
        markers.push({ id: p.lodging.id, position: p.lodging.location, label: '', color, title: `D${p.index + 1} 숙소 · ${p.lodging.name}`, dim, lodging: true })
      }
      if (isSel && p.startPlace) {
        markers.push({ id: p.startPlace.id, position: p.startPlace.location, label: 'S', color: '#52514e', title: `출발 · ${p.startPlace.name}` })
      }
    }
    if (view === 'places') {
      for (const id of trip.wishlist) {
        const pl = trip.places[id]
        if (pl) markers.push({ id, position: pl.location, label: '★', color: '#6250d6', title: `장소함 · ${pl.name}` })
      }
    }
    const fitKey = `${view}|${dayMode ? selected.day.id : 'all'}|${showOthers}|${markers.filter((m) => !m.dim).length}`
    return { markers, paths, fitKey }
  }, [plans, view, selectedDayId, showOthers, trip.wishlist, trip.places, isCand, candThemes, candRegion, fitNonce])

  const focusPlace = focusPlaceId ? trip.places[focusPlaceId] : undefined
  const panned = CANDIDATES.find((c) => c.id === candPanId)
  const focus = isCand
    ? panned && { position: panned.location, key: panned.id }
    : focusPlace && { position: focusPlace.location, key: `${focusPlace.id}:${focusNonce}` }
  // 후보 핀을 누르면 지도는 그대로 두고 목록에서 그 항목을 보여준다
  const onMarkerClick = isCand
    ? (id: string) => (id.startsWith('region:') ? setCand({ candRegion: id.slice(7) as RegionId, candActiveId: undefined }) : setCand({ candActiveId: id }))
    : openPlace
  const fitPadding = isCand && markers.some((m) => m.html) ? 90 : undefined
  const googleStatus = useStore((s) => s.googleStatus)
  const googleReason = useStore((s) => s.googleReason)
  // 키 자체가 무효면 지도도 못 그리므로 바로 무료 지도로
  const keyBroken = googleStatus === 'error' && ['API_KEY_INVALID', 'API_KEY_HTTP_REFERRER_BLOCKED', 'BILLING_DISABLED'].includes(googleReason ?? '')
  const useGoogleMap = !!apiKey && !jsFailed && !keyBroken

  return (
    <div className="relative h-full w-full">
      {offline ? (
        <MapMessage text="지도는 인터넷에 연결되면 보여요. 일정과 시간은 그대로 볼 수 있어요" />
      ) : useGoogleMap ? (
        <GoogleMap
          apiKey={apiKey}
          onAuthFailure={() => {
            setJsFailed(true)
            notify('구글 지도 표시 실패 — Maps JavaScript API 사용 설정·키 제한을 확인하세요. 무료 지도로 대신 보여드려요.')
          }}
          markers={markers}
          paths={paths}
          fitKey={fitKey}
          fitPadding={fitPadding}
          focus={focus}
          onMarkerClick={onMarkerClick}
        />
      ) : (
        <Suspense fallback={<MapMessage text="지도를 불러오는 중…" />}>
          <LeafletMap markers={markers} paths={paths} fitKey={fitKey} fitPadding={fitPadding} focus={focus} onMarkerClick={onMarkerClick} />
        </Suspense>
      )}
      {isCand && (
        <button
          className="absolute top-3 right-3 z-[500] rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 shadow"
          onClick={() => {
            setCand({ candRegion: undefined, candPanId: undefined })
            setFitNonce((n) => n + 1)
          }}
        >
          전체 보기
        </button>
      )}
      {view === 'day' && (
        <button
          className={cx('absolute top-3 right-3 z-[500] rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold shadow', showOthers ? 'border-violet-300 text-violet-800' : 'border-stone-200 text-stone-700')}
          onClick={() => setShowOthers(!showOthers)}
        >
          {showOthers ? '✓ ' : ''}다른 날도 흐리게 보기
        </button>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-x-2.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] text-stone-600 shadow">
        {isCand ? (
          <>
            {Object.values(GROUP).map((g) => (
              <span key={g.label} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full border-2 bg-white" style={{ borderColor: g.color }} />
                {g.label}
              </span>
            ))}
            <span>─ 현재 동선</span>
          </>
        ) : (
          '─ 실제 경로 · ┄ 계산 중/도보·기타 · 🛏 숙소'
        )}
      </div>
    </div>
  )
}
