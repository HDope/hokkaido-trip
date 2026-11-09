import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store'
import type { DayPlan } from '../lib/schedule'
import { CANDIDATES, candidateMapUrl, filterCandidates, findCandidatePlace, GROUP, REGIONS, THEMES, THEME_BY_ID, type Candidate, type RegionId, type ThemeId } from '../candidates'
import { addCandidate, ensureCandidatePlace } from '../actions'
import { dayDate, fmtDate } from '../lib/time'
import { CELL_SHADE, dayColor } from '../ui'
import { Btn, cx, ExtLink } from './common'
import { AddToDayMenu } from './AddToDayMenu'

export function CandidatesView({ plans }: { plans: DayPlan[] }) {
  const trip = useStore((s) => s.trip)!
  const themes = useStore((s) => s.candThemes)
  const region = useStore((s) => s.candRegion)
  const setCand = useStore((s) => s.setCand)
  const list = filterCandidates(themes, region)
  const end = dayDate(trip.startDate, trip.days.length - 1)

  const matrix = useMemo(() => {
    const rows = REGIONS.map((r) => {
      const inRegion = CANDIDATES.filter((c) => c.region === r.id)
      const counts = Object.fromEntries(THEMES.map((t) => [t.id, inRegion.filter((c) => c.theme === t.id)])) as Record<ThemeId, Candidate[]>
      return { ...r, counts, covered: THEMES.filter((t) => counts[t.id].length).length }
    })
    return rows.sort((a, b) => b.covered - a.covered)
  }, [])

  const toggleTheme = (id: ThemeId) => setCand({ candThemes: themes.includes(id) ? themes.filter((t) => t !== id) : [...themes, id], candActiveId: undefined, candPanId: undefined })
  const toggleRegion = (id: RegionId) => setCand({ candRegion: region === id ? undefined : id, candActiveId: undefined, candPanId: undefined })

  return (
    <div className="px-5 py-5 pb-24">
      <h2 className="text-xl font-bold">테마 후보 지도</h2>
      <p className="mt-0.5 text-sm text-stone-500">
        {fmtDate(dayDate(trip.startDate, 0))} – {fmtDate(end)} 기준 · 후보 {CANDIDATES.length}곳 · 일정은 그대로 두고 비교만 해요
      </p>

      <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-bold text-stone-700">지역별 분포</h3>
        <p className="mt-0.5 text-xs text-stone-500">숫자는 후보 수, 지역을 누르면 그 지역만 표시해요</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-separate border-spacing-[1px] text-xs">
            <thead>
              <tr>
                <th />
                {THEMES.map((t) => (
                  <th key={t.id} className="pb-1 text-center text-sm font-normal" title={t.label}>
                    {t.icon}
                  </th>
                ))}
                <th className="pb-1 text-right font-medium text-stone-500">테마</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => toggleRegion(r.id)}>
                  <td className={cx('rounded-md px-1 py-1 font-medium whitespace-nowrap hover:bg-stone-100', region === r.id && 'bg-violet-100 text-violet-900')}>{r.label}</td>
                  {THEMES.map((t) => {
                    const items = r.counts[t.id]
                    return (
                      <td
                        key={t.id}
                        title={items.length ? `${t.label}: ${items.map((c) => c.name).join(', ')}` : undefined}
                        className={cx('h-6 w-[19px] rounded text-center font-semibold tabular-nums', items.length ? CELL_SHADE[Math.min(items.length, 5)] : 'bg-stone-50')}
                      >
                        {items.length || ''}
                      </td>
                    )
                  })}
                  <td className="pl-1 text-right font-bold whitespace-nowrap tabular-nums">{r.covered}/{THEMES.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setCand({ candThemes: [], candRegion: undefined, candActiveId: undefined, candPanId: undefined })}
          className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', !themes.length && !region ? 'border-violet-500 bg-violet-600 text-white' : 'border-stone-300 bg-white hover:bg-stone-50')}
        >
          전체
        </button>
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => toggleTheme(t.id)}
            className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', themes.includes(t.id) ? 'border-violet-500 bg-violet-600 text-white' : 'border-stone-300 bg-white hover:bg-stone-50')}
          >
            {t.icon} {t.label} {CANDIDATES.filter((c) => c.theme === t.id).length}
          </button>
        ))}
      </div>

      <p className="mt-3 rounded-lg border-l-[3px] border-[#fab219] bg-[#fff6e0] px-2.5 py-1.5 text-[12.5px] leading-snug">
        ⚠️ 와이너리·맥주·사케 시음은 운전자 제외예요. 둘 다 마시려면 그날은 JR·택시로 움직이는 일정이 필요해요.
      </p>

      {THEMES.filter((t) => list.some((c) => c.theme === t.id)).map((t) => (
        <section key={t.id} className="mt-6">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-stone-700">
            <span className="h-2 w-2 rounded-full" style={{ background: GROUP[t.group].color }} />
            {t.icon} {t.label}
          </h3>
          <ul className="space-y-2">
            {list
              .filter((c) => c.theme === t.id)
              .map((c) => (
                <CandidateCard key={c.id} c={c} plans={plans} />
              ))}
          </ul>
        </section>
      ))}
      {!list.length && <p className="mt-6 rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">이 조건에 맞는 후보가 없어요. 필터를 풀어보세요.</p>}
    </div>
  )
}

function CandidateCard({ c, plans }: { c: Candidate; plans: DayPlan[] }) {
  const trip = useStore((s) => s.trip)!
  const active = useStore((s) => s.candActiveId === c.id)
  const setCand = useStore((s) => s.setCand)
  const notify = useStore((s) => s.notify)
  const ref = useRef<HTMLLIElement>(null)
  const place = findCandidatePlace(trip, c)
  const usedOn = place ? plans.filter((p) => p.lodging?.id === place.id || p.startPlace?.id === place.id || p.stops.some((s) => s.place?.id === place.id)) : []
  const wished = !!place && trip.wishlist.includes(place.id)
  const regionLabel = REGIONS.find((r) => r.id === c.region)?.label

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [active])

  return (
    <li ref={ref} className={cx('rounded-xl border bg-white px-3 py-2.5', active ? 'border-violet-400 ring-2 ring-violet-100' : 'border-stone-200')}>
      <div className="flex items-start gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => setCand({ candActiveId: c.id, candPanId: c.id })} title="지도에서 보기">
          <div className="text-[14px] font-semibold hover:text-violet-700">
            {THEME_BY_ID[c.theme].icon} {c.name}
          </div>
          <div className="truncate text-xs text-stone-400">
            {c.nameLocal} · {regionLabel}
          </div>
        </button>
        <span className={cx('shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold', place?.verifiedAt || c.status === 'web' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
          {place?.verifiedAt ? '✓ 구글 확인' : c.status === 'web' ? '✓ 웹 확인' : '? 운영 미확인'}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-stone-700">{c.blurb}</p>
      {c.june && <p className="mt-1 rounded-md bg-violet-50 px-2 py-1 text-[12px] leading-snug text-violet-950">📅 {c.june}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <ExtLink href={candidateMapUrl(c)}>구글맵 ↗</ExtLink>
        <span className="flex-1" />
        <AddToDayMenu name={c.name} getPlaceId={() => ensureCandidatePlace(c)} label={c.kind === 'hotel' ? '＋ 숙소로' : '＋ 날짜'} />
        {usedOn.length > 0 ? (
          usedOn.map((p) => (
            <span key={p.day.id} className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: dayColor(p.index) }}>
              D{p.index + 1}
            </span>
          ))
        ) : wished ? (
          <span className="font-medium text-violet-700">⭐ 장소함에 있음</span>
        ) : (
          <Btn className="px-2 py-0.5 text-xs" onClick={() => (addCandidate(c), notify(`${c.name} 담았어요`))}>
            ＋ 장소함
          </Btn>
        )}
      </div>
    </li>
  )
}
