import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { usePlans } from '../hooks'
import type { CostSource, Trip } from '../types'
import { addBudgetExtra, removeBudgetExtra, updateBudget, updateBudgetExtra, updatePlace } from '../actions'
import { BUDGET_CATS, BUDGET_DEFAULTS, fmtManWon, fmtYen, tripBudget, type BudgetCat, type BudgetLine } from '../lib/budget'
import { cx, Modal } from './common'

const SOURCE: Record<CostSource, string> = { official: '공식', web: '자료', google: '구글', estimate: '어림', manual: '직접' }
const box = 'rounded-md border border-stone-300 px-1.5 py-0.5 text-right text-[13px] tabular-nums'
const numberOf = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)))

/** 상단바의 총예산. 누르면 항목별 내역이 열린다 */
export function BudgetChip({ compact, className }: { compact?: boolean; className?: string }) {
  const trip = useStore((s) => s.trip)!
  const setShow = useStore((s) => s.setShowBudget)
  const plans = usePlans()
  const sum = useMemo(() => tripBudget(trip, plans), [trip, plans])
  const more = sum.missing ? '+' : ''
  const short = `¥${Math.round(sum.total / 10000).toLocaleString()}만${more}`
  const text = compact ? short : `예상 ${fmtYen(sum.total)}${more}`
  return (
    <button className={className} onClick={() => setShow(true)} title={`예상 예산 ${fmtYen(sum.total)} · ${fmtManWon(sum.krw)}${sum.missing ? ` · 금액을 모르는 ${sum.missing}건 빼고` : ''}`}>
      💰 {text}
    </button>
  )
}

export function BudgetModal() {
  const show = useStore((s) => s.showBudget)
  const setShow = useStore((s) => s.setShowBudget)
  if (!show) return null
  return (
    <Modal title="예상 예산" onClose={() => setShow(false)} wide>
      <BudgetBody />
    </Modal>
  )
}

function saveUnit(line: BudgetLine, value: number | undefined, trip: Trip | null) {
  const id = line.placeId
  if (line.field === 'rental') return updateBudget({ rentalYen: value })
  if (line.field === 'extra' && line.extraId) return updateBudgetExtra(line.extraId, { yen: value ?? 0 })
  if (!id) return
  if (line.field === 'cost') return updatePlace(id, { cost: value == null ? undefined : { yen: value, source: 'manual' } })
  if (line.field === 'breakfast') return updatePlace(id, { breakfastYen: value })
  if (line.field === 'parking') updatePlace(id, { parking: { ...(trip?.places[id]?.parking ?? { status: 'paid', source: 'manual' }), yen: value } })
}

function Line({ line }: { line: BudgetLine }) {
  const trip = useStore((s) => s.trip)
  const editable = !!line.field
  const days = line.days.map((d) => `D${d}`).join(' ')
  const unknown = line.unit == null
  return (
    <li className={cx('flex items-start gap-2 py-1.5 text-[13px]', line.unit === 0 && 'text-stone-400')}>
      <div className="min-w-0 flex-1">
        <div className="font-medium break-words">{line.label}</div>
        <div className="text-xs text-stone-500">
          {days && `${days} · `}
          {line.qty > 1 || line.unitLabel === '1박' ? `${line.unitLabel} × ${line.qty}` : line.unitLabel}
          {line.source && <span className="ml-1 inline-block rounded bg-stone-100 px-1 text-[10.5px] whitespace-nowrap text-stone-600">{SOURCE[line.source]}</span>}
        </div>
        {line.note && <div className="text-xs break-words text-stone-400">{line.note}</div>}
      </div>
      {editable && <input type="number" inputMode="numeric" min={0} step={100} aria-label={`${line.label} 금액`} placeholder="금액" className={cx(box, 'w-[76px] shrink-0', unknown && 'border-amber-400 bg-amber-50')} value={line.unit ?? ''} onChange={(e) => saveUnit(line, numberOf(e.target.value), trip)} />}
      <div className="w-[68px] shrink-0 pt-0.5 text-right font-semibold tabular-nums">{unknown ? '?' : fmtYen(line.yen)}</div>
    </li>
  )
}

function Setting({ label, value, step, onChange }: { label: string; value: number | undefined; step?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[13px]">
      {label}
      <input type="number" inputMode="decimal" min={0} step={step ?? 1} className={cx(box, 'w-24')} value={value ?? ''} onChange={(e) => onChange(numberOf(e.target.value))} />
    </label>
  )
}

function BudgetBody() {
  const trip = useStore((s) => s.trip)!
  const plans = usePlans()
  const sum = useMemo(() => tripBudget(trip, plans), [trip, plans])
  const [open, setOpen] = useState<BudgetCat>()
  const [label, setLabel] = useState('')
  const [yen, setYen] = useState('')
  const unknown = sum.lines.filter((l) => l.unit == null)
  const cats = BUDGET_CATS.filter((c) => sum.lines.some((l) => l.cat === c.id)).sort((a, b) => sum.byCat[b.id] - sum.byCat[a.id])
  const b = trip.budget ?? {}

  function addExtra() {
    const v = Number(yen)
    if (!label.trim() || !(v >= 0) || yen === '') return
    addBudgetExtra(label.trim(), v)
    setLabel('')
    setYen('')
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <div className="text-[26px] font-bold tabular-nums">{fmtYen(sum.total)}</div>
          <div className="text-[15px] font-semibold text-stone-600 tabular-nums">약 {fmtManWon(sum.krw)}</div>
        </div>
        <p className="mt-0.5 text-[13px] text-stone-500">{sum.people}인 기준 예상이에요. 항공권, 쇼핑, 술값은 빠져 있어요. 일정을 바꾸면 금액도 따라가고, 아래 칸에 실제 금액을 넣으면 그 값으로 계산해요.</p>
      </div>

      {unknown.length > 0 && (
        <section className="rounded-xl border-l-[3px] border-[#fab219] bg-[#fff6e0] px-3 py-2">
          <h3 className="text-[13px] font-bold">금액을 몰라 합계에서 빠진 곳 {unknown.length}건</h3>
          <ul className="divide-y divide-amber-200/60">
            {unknown.map((l) => (
              <Line key={l.key} line={l} />
            ))}
          </ul>
        </section>
      )}

      <section className="divide-y divide-stone-100 rounded-xl border border-stone-200">
        {cats.map((c) => {
          const lines = sum.lines.filter((l) => l.cat === c.id && l.unit != null)
          const isOpen = open === c.id
          return (
            <div key={c.id}>
              <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-stone-50" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : c.id)}>
                <span>{c.icon}</span>
                <span className="flex-1 text-sm font-semibold">{c.label}</span>
                <span className="text-xs text-stone-400 tabular-nums">{sum.total ? Math.round((sum.byCat[c.id] / sum.total) * 100) : 0}%</span>
                <span className="w-24 text-right text-sm font-bold tabular-nums">{fmtYen(sum.byCat[c.id])}</span>
                <span className={cx('text-xs text-stone-400 transition', isOpen && 'rotate-90')}>▶</span>
              </button>
              {isOpen && (
                <ul className="divide-y divide-stone-100 border-t border-stone-100 px-3 pb-1">
                  {lines.map((l) => (
                    <li key={l.key} className="list-none">
                      <ul>
                        <Line line={l} />
                      </ul>
                      {l.field === 'extra' && l.extraId && (
                        <button className="pb-1 text-xs text-stone-500 hover:underline" onClick={() => removeBudgetExtra(l.extraId!)}>
                          항목 삭제
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </section>

      <section className="rounded-xl border border-stone-200 p-3">
        <h3 className="text-[13px] font-bold text-stone-700">항목 더 넣기</h3>
        <div className="mt-2 flex gap-2">
          <input className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-[13px]" placeholder="이름 (항공권, 쇼핑 등)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input type="number" inputMode="numeric" min={0} className={cx(box, 'w-24')} placeholder="금액(엔)" value={yen} onChange={(e) => setYen(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExtra()} />
          <button className="shrink-0 rounded-lg border border-stone-300 px-2.5 text-[13px] font-semibold hover:bg-stone-50" onClick={addExtra}>
            넣기
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 p-3">
        <h3 className="text-[13px] font-bold text-stone-700">계산 기준</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 sm:gap-x-6">
          <Setting label="환율 (1엔 = 원)" step={0.01} value={b.krwPerYen ?? BUDGET_DEFAULTS.krwPerYen} onChange={(v) => updateBudget({ krwPerYen: v })} />
          <Setting label="휘발유 (엔/L)" value={b.yenPerLiter ?? BUDGET_DEFAULTS.yenPerLiter} onChange={(v) => updateBudget({ yenPerLiter: v })} />
          <Setting label="연비 (km/L)" step={0.5} value={b.kmPerLiter ?? BUDGET_DEFAULTS.kmPerLiter} onChange={(v) => updateBudget({ kmPerLiter: v })} />
        </div>
      </section>
    </div>
  )
}
