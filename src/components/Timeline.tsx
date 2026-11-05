import { useState } from 'react'
import type { DayPlan, LegPlan } from '../lib/schedule'
import { fmtDate, fmtDur, fmtHM, fmtKm } from '../lib/time'
import { dayColor, KIND_ICON } from '../ui'
import { MODE_LABEL } from '../lib/routing'
import { useStore } from '../store'
import { cx } from './common'

export type Seg = { kind: 'drive' | 'move' | 'stay' | 'wait'; start: number; end: number; title: string; sub: string }

function legSeg(l: LegPlan): Seg {
  const dur = l.end - l.start
  return {
    kind: l.mode === 'DRIVE' ? 'drive' : 'move',
    start: l.start,
    end: l.end,
    title: `${MODE_LABEL[l.mode]} → ${l.to.name}`,
    sub: `${fmtHM(l.start)}–${fmtHM(l.end)} · ${fmtDur(dur)}${l.meters ? ` · ${fmtKm(l.meters)}` : ''}${l.confirmed ? '' : ' (추정)'}`,
  }
}

export function daySegments(p: DayPlan): Seg[] {
  const segs: Seg[] = []
  for (const s of p.stops) {
    if (s.leg && s.leg.end > s.leg.start) segs.push(legSeg(s.leg))
    if (s.wait > 0)
      segs.push({ kind: 'wait', start: s.arrive - s.wait, end: s.arrive, title: `대기 · ${s.place?.name ?? ''}`, sub: `${fmtDur(s.wait)} 여유` })
    if (s.stop.stay > 0)
      segs.push({
        kind: 'stay',
        start: s.arrive,
        end: s.depart,
        title: `${s.place ? KIND_ICON[s.place.kind] + ' ' + s.place.name : ''}`,
        sub: `${fmtHM(s.arrive)}–${fmtHM(s.depart)} · ${fmtDur(s.stop.stay)}`,
      })
  }
  if (p.endLeg && p.endLeg.end > p.endLeg.start) segs.push(legSeg(p.endLeg))
  return segs
}

const SEG_CLS: Record<Seg['kind'], string> = {
  drive: 'bg-stone-600',
  move: 'bg-stone-300',
  stay: '',
  wait: 'bg-[repeating-linear-gradient(135deg,#d6d3cc_0_3px,transparent_3px_6px)] border border-dashed border-stone-300',
}

type Tip = { x: number; y: number; seg: Seg } | null

function Track({ p, from, to, height, onTip }: { p: DayPlan; from: number; to: number; height: string; onTip: (t: Tip) => void }) {
  const span = to - from
  const color = dayColor(p.index)
  const pct = (v: number) => `${((Math.min(Math.max(v, from), to) - from) / span) * 100}%`
  return (
    <div className={cx('relative w-full rounded-md bg-stone-100', height)}>
      {daySegments(p).map((s, i) => (
        <div
          key={i}
          className={cx('absolute top-0 h-full rounded-[3px] border-x border-white', SEG_CLS[s.kind])}
          style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})`, background: s.kind === 'stay' ? color : undefined }}
          onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, seg: s })}
          onMouseLeave={() => onTip(null)}
        />
      ))}
      {p.sun && p.sun.sunset > from && p.sun.sunset < to && (
        <div className="pointer-events-none absolute -top-1 -bottom-1 w-0 border-l-2 border-amber-500" style={{ left: pct(p.sun.sunset) }} title={`일몰 ${fmtHM(p.sun.sunset)}`} />
      )}
    </div>
  )
}

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null
  return (
    <div className="pointer-events-none fixed z-[3000] max-w-64 rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: tip.x + 12, top: tip.y + 12 }}>
      <div className="font-semibold">{tip.seg.title}</div>
      <div className="text-stone-300">{tip.seg.sub}</div>
    </div>
  )
}

/** 사이드바·헤더용 하루 미니 막대 */
export function MiniDayBar({ p, from = 6 * 60, to = 23 * 60 }: { p: DayPlan; from?: number; to?: number }) {
  const [tip, setTip] = useState<Tip>(null)
  return (
    <>
      <Track p={p} from={from} to={to} height="h-2" onTip={setTip} />
      <Tooltip tip={tip} />
    </>
  )
}

/** 전체 일정 간트 차트 */
export function TripGantt({ plans }: { plans: DayPlan[] }) {
  const [tip, setTip] = useState<Tip>(null)
  const selectDay = useStore((s) => s.selectDay)
  const from = Math.min(6 * 60, ...plans.map((p) => Math.floor(p.start / 60) * 60))
  const to = Math.max(22 * 60, ...plans.map((p) => Math.ceil(p.end / 60) * 60))
  const hours: number[] = []
  for (let h = from; h <= to; h += 120) hours.push(h)
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: dayColor(0) }} />
          체류 (일자별 색)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-stone-600" />
          운전
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-stone-300" />
          도보·택시 등
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cx('h-2.5 w-4 rounded-sm', SEG_CLS.wait)} />
          대기
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0 border-l-2 border-amber-500" />
          일몰
        </span>
      </div>
      <div className="relative ml-[88px] h-5 text-[11px] text-stone-400">
        {hours.map((h) => (
          <span key={h} className={cx('absolute whitespace-nowrap tabular-nums', h === to ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: `${((h - from) / (to - from)) * 100}%` }}>
            {String(Math.floor(h / 60) % 24).padStart(2, '0')}시
          </span>
        ))}
      </div>
      <div className="space-y-2">
        {plans.map((p) => (
          <button key={p.day.id} className="flex w-full items-center gap-2 rounded-lg py-0.5 text-left hover:bg-stone-50" onClick={() => selectDay(p.day.id)}>
            <span className="w-20 shrink-0 text-xs">
              <span className="font-bold" style={{ color: dayColor(p.index) }}>
                D{p.index + 1}
              </span>{' '}
              <span className="text-stone-500">{fmtDate(p.date)}</span>
            </span>
            <Track p={p} from={from} to={to} height="h-6" onTip={setTip} />
          </button>
        ))}
      </div>
      <Tooltip tip={tip} />
    </div>
  )
}
