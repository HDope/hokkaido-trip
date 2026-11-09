import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { DayPlan } from '../lib/schedule'
import { GROUP, THEME_BY_ID, THEMES, type ThemeId } from '../candidates'
import { candidateThemes, isDrink, tripSummary, type SummaryItem } from '../lib/summary'
import { fmtDate, fmtDur, fmtHM, WEEKDAYS_KO } from '../lib/time'
import { CELL_SHADE, CELL_SHADE_DRINK, dayColor, KIND_ICON } from '../ui'
import { cx } from './common'
import { RemoveStopMenu } from './RemoveStopMenu'

type Filter = 'all' | 'drink' | ThemeId

const chip = (on: boolean) => cx('rounded-full border px-2.5 py-1 text-xs font-medium', on ? 'border-violet-500 bg-violet-600 text-white' : 'border-stone-300 bg-white hover:bg-stone-50')

/** 일정에 실제로 들어간 곳을 테마별로 날짜순으로 보여준다 */
export function TripSummary({ plans }: { plans: DayPlan[] }) {
  const trip = useStore((s) => s.trip)!
  const selectDay = useStore((s) => s.selectDay)
  const [filter, setFilter] = useState<Filter>('drink')
  const known = useMemo(() => candidateThemes(trip), [trip])
  const rows = tripSummary(plans, known)
  const all = rows.flatMap((r) => r.items)
  const drinks = all.filter((x) => isDrink(x.theme))
  const count = (id: ThemeId) => all.filter((x) => x.theme === id).length
  const active: Filter = filter === 'drink' && !drinks.length ? 'all' : filter
  const list = active === 'all' ? all : active === 'drink' ? drinks : all.filter((x) => x.theme === active)
  const both = drinks.filter((x) => x.bothCanDrink).length

  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-4">
      <h3 className="text-sm font-bold text-stone-700">여행 요약</h3>
      <p className="mt-0.5 text-xs text-stone-500">날짜순이에요. 숫자는 그날 들르는 곳 수, 대안 후보는 빼고 셌어요. 줄을 누르면 그날로 가요</p>
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
              <th className="pb-1 text-right font-medium text-stone-500">곳</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plan.day.id} className="cursor-pointer" onClick={() => selectDay(r.plan.day.id)}>
                <td className="rounded-md px-1 py-1 whitespace-nowrap hover:bg-stone-100" title={`${fmtDate(r.plan.date)} ${r.plan.title}`}>
                  <span className="font-bold" style={{ color: dayColor(r.plan.index) }}>
                    D{r.plan.index + 1}
                  </span>{' '}
                  <span className="text-stone-500">
                    <span className="hidden sm:inline">
                      {r.plan.date.getUTCMonth() + 1}/{r.plan.date.getUTCDate()}{' '}
                    </span>
                    {WEEKDAYS_KO[r.plan.weekday]}
                  </span>
                </td>
                {THEMES.map((t) => {
                  const items = r.byTheme[t.id]
                  const shade = t.group === 'drink' ? CELL_SHADE_DRINK : CELL_SHADE
                  return (
                    <td
                      key={t.id}
                      title={items.length ? `${t.label}: ${items.map((x) => x.sp.place.name).join(', ')}` : undefined}
                      className={cx('h-6 w-[19px] rounded text-center font-semibold tabular-nums', items.length ? shade[Math.min(items.length, 5)] : 'bg-stone-50')}
                    >
                      {items.length || ''}
                    </td>
                  )
                })}
                <td className="pl-1 text-right font-bold tabular-nums">{r.items.length}</td>
              </tr>
            ))}
            <tr>
              <td className="px-1 pt-1.5 font-bold">합계</td>
              {THEMES.map((t) => (
                <td key={t.id} className="pt-1.5 text-center font-bold tabular-nums" style={t.group === 'drink' ? { color: GROUP.drink.color } : undefined}>
                  {count(t.id) || ''}
                </td>
              ))}
              <td className="pt-1.5 pl-1 text-right font-bold tabular-nums">{all.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button className={chip(active === 'all')} onClick={() => setFilter('all')}>
          전체 {all.length}
        </button>
        {drinks.length > 0 && (
          <button className={chip(active === 'drink')} onClick={() => setFilter('drink')}>
            🍷 술 {drinks.length}
          </button>
        )}
        {THEMES.filter((t) => count(t.id)).map((t) => (
          <button key={t.id} className={chip(active === t.id)} onClick={() => setFilter(t.id)}>
            {t.icon} {t.label} {count(t.id)}
          </button>
        ))}
      </div>

      {active === 'drink' && (
        <p className="mt-3 rounded-lg border-l-[3px] border-[#fab219] bg-[#fff6e0] px-2.5 py-1.5 text-[12.5px] leading-snug">
          술 관련 {drinks.length}곳 중 운전자도 마실 수 있는 곳은 {both}곳이에요
        </p>
      )}

      <ul className="mt-2 space-y-1.5">
        {list.map((x) => (
          <Row key={x.sp.stop.id} item={x} />
        ))}
      </ul>
    </section>
  )
}

function Row({ item }: { item: SummaryItem }) {
  const selectDay = useStore((s) => s.selectDay)
  const { plan, sp, theme, bothCanDrink } = item
  return (
    <li className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2">
      <span className="h-fit rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: dayColor(plan.index) }}>
        D{plan.index + 1}
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={() => selectDay(plan.day.id)}>
        <span className="block text-[13.5px] leading-snug font-semibold hover:text-violet-700">
          {theme ? THEME_BY_ID[theme].icon : KIND_ICON[sp.place.kind]} {sp.place.name}
        </span>
        <span className="block text-xs text-stone-500 tabular-nums">
          {fmtDate(plan.date)} · {fmtHM(sp.arrive)}–{fmtHM(sp.depart)} · {fmtDur(sp.stop.stay)}
        </span>
      </button>
      {isDrink(theme) && (
        <span className={cx('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold', bothCanDrink ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600')}>{bothCanDrink ? '둘 다 마심' : '운전자 ✕'}</span>
      )}
      <span className="shrink-0">
        <RemoveStopMenu dayId={plan.day.id} stopId={sp.stop.id} name={sp.place.name} />
      </span>
    </li>
  )
}
