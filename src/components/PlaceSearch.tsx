import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { useGoogle } from '../hooks'
import type { Place } from '../types'
import { autocomplete, placeDetails, toPlaceFields, type Suggestion } from '../lib/google'
import { photonSearch, type FreeResult } from '../lib/free'
import { uid } from '../lib/time'
import { CANDIDATES, candidateToPlace, findCandidatePlace, THEME_BY_ID, type Candidate } from '../candidates'
import { KIND_ICON } from '../ui'
import { cx } from './common'

type Item =
  | { type: 'existing'; place: Place }
  | { type: 'candidate'; c: Candidate }
  | { type: 'google'; s: Suggestion }
  | { type: 'free'; r: FreeResult }

/** 장소 검색 → 선택하면 Place 객체(새 것 또는 기존 것)를 돌려준다 */
export function PlaceSearch({
  onPick,
  placeholder = '장소 검색해서 추가 (예: 팜 도미타, ラーメン, 비에이)',
  autoFocus,
}: {
  onPick: (p: Place, isExisting: boolean) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const trip = useStore((s) => s.trip)
  const apiKey = useStore((s) => s.apiKey)
  const notify = useStore((s) => s.notify)
  const google = useGoogle()
  const [q, setQ] = useState('')
  const [remote, setRemote] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const session = useRef(uid() + uid())
  const box = useRef<HTMLDivElement>(null)

  const existing: Item[] = useMemo(() => {
    if (!trip) return []
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    const all = Object.values(trip.places)
    const saved: Item[] = all
      .filter((p) => p.name.toLowerCase().includes(needle) || p.nameLocal?.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((place) => ({ type: 'existing', place }))
    // 후보 목록은 한국어 이름이 있어 무료 모드에서도 찾을 수 있다
    const curated: Item[] = CANDIDATES.filter((c) => !findCandidatePlace(trip, c) && (c.name.toLowerCase().includes(needle) || c.nameLocal.toLowerCase().includes(needle) || THEME_BY_ID[c.theme].label.includes(needle)))
      .slice(0, 6)
      .map((c) => ({ type: 'candidate', c }))
    return [...saved, ...curated]
  }, [trip, q])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setRemote([])
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        if (google) {
          const s = await autocomplete(apiKey, term, session.current)
          setRemote(s.map((x) => ({ type: 'google', s: x })))
        } else {
          const r = await photonSearch(term)
          setRemote(r.map((x) => ({ type: 'free', r: x })))
        }
      } catch (e) {
        setRemote([])
        notify(`검색 실패: ${(e as Error).message}`)
      } finally {
        setLoading(false)
      }
    }, 280)
    return () => clearTimeout(t)
  }, [q, google, apiKey, notify])

  useEffect(() => {
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const items = [...existing, ...remote]

  async function pick(item: Item) {
    setOpen(false)
    setQ('')
    if (item.type === 'existing') return onPick(item.place, true)
    if (item.type === 'candidate') return onPick(candidateToPlace(item.c), false)
    if (item.type === 'free') {
      const r = item.r
      return onPick({ id: `p-${uid()}`, name: r.name, kind: r.kind, location: r.location, address: r.secondary }, false)
    }
    try {
      setLoading(true)
      const g = await placeDetails(apiKey, item.s.placeId, session.current)
      session.current = uid() + uid() // 세션 종료 → 다음 검색은 새 세션
      const f = toPlaceFields(g)
      onPick(
        {
          id: `p-${uid()}`,
          name: g.displayName?.text ?? item.s.main,
          kind: f.kind ?? 'sight',
          location: f.location!,
          ...f,
        } as Place,
        false,
      )
    } catch (e) {
      notify(`장소 정보를 못 가져왔어요: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative" ref={box}>
      <div className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
        <span className="text-stone-400">🔍</span>
        <input
          autoFocus={autoFocus}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
          placeholder={placeholder}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1))
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            if (e.key === 'Enter' && items[active]) pick(items[active])
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />}
        <span className={cx('rounded px-1.5 py-0.5 text-[10.5px] font-semibold', google ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500')}>
          {google ? 'Google' : 'OSM'}
        </span>
      </div>
      {open && items.length > 0 && (
        <ul className="absolute z-[60] mt-1 max-h-80 w-full overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-xl">
          {items.map((it, i) => {
            const [icon, main, sub, tag] =
              it.type === 'existing'
                ? [KIND_ICON[it.place.kind], it.place.name, it.place.nameLocal ?? it.place.address ?? '', '저장된 장소']
                : it.type === 'candidate'
                  ? [THEME_BY_ID[it.c.theme].icon, it.c.name, it.c.nameLocal, '추천 후보']
                  : it.type === 'google'
                  ? ['📍', it.s.main, it.s.secondary, '']
                  : [KIND_ICON[it.r.kind], it.r.name, it.r.secondary, '']
            return (
              <li key={i}>
                <button
                  className={cx('flex w-full items-start gap-2 px-3 py-2 text-left', i === active ? 'bg-violet-50' : 'hover:bg-stone-50')}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(it)}
                >
                  <span className="mt-0.5">{icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{main}</span>
                    <span className="block truncate text-xs text-stone-500">{sub}</span>
                  </span>
                  {tag && <span className="mt-0.5 shrink-0 rounded bg-violet-100 px-1.5 text-[10.5px] text-violet-700">{tag}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open && !google && q.trim().length >= 2 && !loading && remote.length === 0 && (
        <div className="absolute z-[60] mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-500 shadow-xl">
          무료 검색은 일본어·영어 이름이 잘 찾아져요 (예: 青い池, Farm Tomita). 구글 키를 연결하면 한국어 검색도 정확해져요.
        </div>
      )}
    </div>
  )
}
