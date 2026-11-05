import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { useGoogle } from '../hooks'
import type { PlaceKind } from '../types'
import type { DayPlan } from '../lib/schedule'
import { verifyAll } from '../lib/verify'
import { upsertPlace } from '../actions'
import { dayColor, KIND_ICON, KIND_LABEL } from '../ui'
import { Btn, cx, isWideScreen } from './common'
import { AddToDayMenu } from './AddToDayMenu'
import { PlaceSearch } from './PlaceSearch'

type Filter = 'wish' | 'all' | PlaceKind

export function PlacesView({ plans }: { plans: DayPlan[] }) {
  const trip = useStore((s) => s.trip)!
  const mutate = useStore((s) => s.mutate)
  const openPlace = useStore((s) => s.openPlace)
  const focusPlace = useStore((s) => s.focusPlace)
  const notify = useStore((s) => s.notify)
  const google = useGoogle()
  const [filter, setFilter] = useState<Filter>('wish')
  const [progress, setProgress] = useState<string>()

  const usage = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const p of plans) {
      for (const s of p.stops) if (s.place) (m[s.place.id] ??= []).push(p.index)
      if (p.lodging) (m[p.lodging.id] ??= []).push(p.index)
    }
    return m
  }, [plans])

  const all = Object.values(trip.places)
  const list =
    filter === 'wish'
      ? trip.wishlist.map((id) => trip.places[id]).filter(Boolean)
      : filter === 'all'
        ? all
        : all.filter((p) => p.kind === filter)
  const kinds = [...new Set(all.map((p) => p.kind))]

  async function verifyEverything() {
    const ids = all.map((p) => p.id)
    setProgress(`0/${ids.length}`)
    const res = await verifyAll(ids, (d, t) => setProgress(`${d}/${t}`))
    setProgress(undefined)
    const bad = res.filter((r) => !r.ok)
    notify(bad.length ? `완료 · 실패 ${bad.length}건 (장소 상세에서 확인)` : `${res.length}곳 모두 구글 정보로 최신화했어요`)
  }

  return (
    <div className="px-5 py-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">장소함</h2>
        {google ? (
          <Btn onClick={verifyEverything} disabled={!!progress} title="모든 장소의 영업시간·영업상태·전화번호를 구글에서 가져와요 (장소당 1회 호출)">
            {progress ? `확인 중 ${progress}` : `✓ 전체 ${all.length}곳 구글 검증`}
          </Btn>
        ) : (
          <span className="text-xs text-stone-500">구글 키 연결 시 영업정보 자동 확인</span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-stone-500">가고 싶은 곳을 모아두고, 일정 짤 때 꺼내 쓰세요.</p>

      <div className="mt-4">
        <PlaceSearch
          placeholder="가고 싶은 곳 검색해서 장소함에 담기"
          onPick={(p, existing) => {
            const id = existing ? p.id : upsertPlace(p)
            mutate((t) => {
              if (!t.wishlist.includes(id) && !usage[id]) t.wishlist.unshift(id)
            })
            notify(`${p.name} 담았어요`)
          }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(['wish', 'all', ...kinds] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', filter === f ? 'border-violet-500 bg-violet-600 text-white' : 'border-stone-300 bg-white hover:bg-stone-50')}
          >
            {f === 'wish' ? `미배정 ${trip.wishlist.length}` : f === 'all' ? `전체 ${all.length}` : `${KIND_ICON[f]} ${KIND_LABEL[f]}`}
          </button>
        ))}
      </div>

      <ul className="mt-3 space-y-2">
        {list.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 hover:border-violet-300" onClick={(e) => { if (!(e.target as HTMLElement).closest('button,input,a')) focusPlace(p.id) }}>
            <span className="text-lg">{KIND_ICON[p.kind]}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => { focusPlace(p.id); if (!isWideScreen()) openPlace(p.id) }}>
              <div className="truncate text-sm font-semibold">{p.name}</div>
              <div className="truncate text-xs text-stone-500">
                {p.nameLocal ?? p.address}
                {p.verifiedAt && <span className="text-emerald-700"> · ✓ 구글</span>}
                {p.businessStatus && p.businessStatus !== 'OPERATIONAL' && <span className="text-red-600"> · {p.businessStatus === 'CLOSED_PERMANENTLY' ? '폐업' : '임시휴업'}</span>}
              </div>
              {p.season && <div className="truncate text-xs text-violet-700">🌸 {p.season}</div>}
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button className="hidden rounded-md px-1.5 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 md:block" onClick={() => openPlace(p.id)}>
                상세
              </button>
              {(usage[p.id] ?? []).map((i) => (
                <span key={i} className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: dayColor(i) }}>
                  D{i + 1}
                </span>
              ))}
              <AddToDayMenu name={p.name} getPlaceId={() => p.id} label={p.kind === 'hotel' ? '＋ 숙소로' : '＋ 날짜'} />
            </div>
          </li>
        ))}
        {!list.length && <li className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">비어 있어요. 위에서 검색해 담아보세요.</li>}
      </ul>
    </div>
  )
}
