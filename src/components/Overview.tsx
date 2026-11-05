import { useStore } from '../store'
import type { DayPlan } from '../lib/schedule'
import { fmtDate, fmtDur, fmtHM, fmtKm } from '../lib/time'
import { dayColor, LEVEL_META } from '../ui'
import { TripGantt } from './Timeline'

export function Overview({ plans }: { plans: DayPlan[] }) {
  const trip = useStore((s) => s.trip)!
  const selectDay = useStore((s) => s.selectDay)
  const totalDrive = plans.reduce((a, p) => a + p.driveMin, 0)
  const totalKm = plans.reduce((a, p) => a + p.driveMeters, 0)
  const counts = plans.reduce(
    (a, p) => ({ critical: a.critical + p.counts.critical, serious: a.serious + p.counts.serious, warning: a.warning + p.counts.warning }),
    { critical: 0, serious: 0, warning: 0 },
  )
  const scheduled = new Set(plans.flatMap((p) => p.stops.map((s) => s.place?.id)).filter(Boolean) as string[])
  const unknownHours = [...scheduled].filter((id) => {
    const p = trip.places[id]
    return p && !p.hours && !p.alwaysOpen && p.kind !== 'hotel' && p.kind !== 'airport'
  }).length
  const longest = plans.reduce((a, p) => (p.driveMin > a.driveMin ? p : a), plans[0])

  return (
    <div className="px-5 py-5">
      <h2 className="text-xl font-bold">전체 일정</h2>
      <p className="mt-0.5 text-sm text-stone-500">
        {fmtDate(plans[0].date, true)} – {fmtDate(plans[plans.length - 1].date)} · {plans.length - 1}박 {plans.length}일
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2.5 2xl:grid-cols-4">
        <Stat label="총 운전" value={fmtDur(totalDrive)} sub={fmtKm(totalKm)} />
        <Stat label="가장 긴 날" value={fmtDur(longest?.driveMin ?? 0)} sub={longest ? `D${longest.index + 1}` : ''} />
        <Stat
          label="문제"
          value={String(counts.critical + counts.serious)}
          sub={counts.warning ? `확인 필요 ${counts.warning}` : '확인 필요 없음'}
          tone={counts.critical ? 'bad' : counts.serious ? 'warn' : 'ok'}
        />
        <Stat label="영업시간 미확인" value={`${unknownHours}곳`} sub="구글 검증 시 해결" tone={unknownHours ? 'warn' : 'ok'} />
      </div>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-bold text-stone-700">하루 흐름 한눈에 보기</h3>
        <TripGantt plans={plans} />
      </section>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-bold text-stone-700">일자별 요약</h3>
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {plans.map((p) => {
            const route = [p.startPlace, ...p.stops.map((s) => s.place), p.lodging].filter(Boolean).map((x) => x!.name)
            const issues = (['critical', 'serious', 'warning'] as const).filter((l) => p.counts[l])
            return (
              <button key={p.day.id} className="flex w-full gap-3 border-b border-stone-100 px-4 py-3 text-left last:border-0 hover:bg-stone-50" onClick={() => selectDay(p.day.id)}>
                <span className="mt-0.5 h-fit rounded-lg px-2 py-0.5 text-xs font-bold text-white" style={{ background: dayColor(p.index) }}>
                  D{p.index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {fmtDate(p.date)} {p.day.title}
                  </span>
                  <span className="block truncate text-xs text-stone-500">{route.join(' → ') || '아직 비어 있어요'}</span>
                  <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-stone-600">
                    <span>🚗 {fmtDur(p.driveMin)}</span>
                    <span>
                      ⏱ {fmtHM(p.start)}–{fmtHM(p.end)}
                    </span>
                    {issues.map((l) => (
                      <span key={l}>
                        {LEVEL_META[l].icon} {LEVEL_META[l].label} {p.counts[l]}
                      </span>
                    ))}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const dot = tone === 'bad' ? 'bg-[#d03b3b]' : tone === 'warn' ? 'bg-[#fab219]' : tone === 'ok' ? 'bg-[#0ca30c]' : ''
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-stone-500">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        {label}
      </div>
      <div className="mt-0.5 text-[17px] font-bold whitespace-nowrap tabular-nums">{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  )
}
