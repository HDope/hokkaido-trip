import { useStore } from '../store'
import type { DayPlan } from '../lib/schedule'
import { directionsUrl } from '../lib/export'
import { nextUp } from '../lib/today'
import { MODE_ICON } from '../lib/routing'
import { fmtHM } from '../lib/time'

/** 여행 당일 맨 위에 나오는 칸: 지금 있는 곳, 다음 목적지, 바로 길찾기 */
export function TodayBar({ plan, minutes }: { plan: DayPlan; minutes: number }) {
  const notify = useStore((s) => s.notify)
  const openPlace = useStore((s) => s.openPlace)
  const { current, next, toLodging } = nextUp(plan, minutes)
  const target = next?.place ?? (toLodging ? plan.lodging : undefined)
  const mode = next ? (next.stop.legMode ?? 'DRIVE') : (plan.day.endLegMode ?? 'DRIVE')
  const arrive = next?.arrive ?? plan.end
  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text)
    notify(`${label}를 복사했어요`)
  }
  return (
    <div className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-2.5 text-sm">
      <div className="text-xs font-bold text-violet-800">📍 오늘 · 지금 {fmtHM(minutes)}</div>
      {current && (
        <div className="mt-1 text-[13px] text-stone-700">
          지금: <b>{current.place.name}</b> ({fmtHM(current.depart)}까지)
        </div>
      )}
      {target ? (
        <>
          <button className="mt-1 block w-full text-left" onClick={() => openPlace(target.id)}>
            <span className="font-semibold">
              다음 {fmtHM(arrive)} · {MODE_ICON[mode]} {target.name}
            </span>
            {target.nameLocal && <span className="block text-xs text-stone-500">{target.nameLocal}</span>}
          </button>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a href={directionsUrl(target, undefined, mode)} target="_blank" rel="noreferrer" className="rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-semibold text-white">
              🧭 길찾기
            </a>
            {target.phone && (
              <button className="rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-violet-800" onClick={() => copy(target.phone!, '내비용 전화번호')}>
                ☎ {target.phone}
              </button>
            )}
            {target.mapcode && (
              <button className="rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-violet-800" onClick={() => copy(target.mapcode!, '맵코드')}>
                맵코드 {target.mapcode}
              </button>
            )}
          </div>
        </>
      ) : (
        !current && <div className="mt-1 text-[13px] text-stone-700">오늘 일정이 끝났어요</div>
      )}
    </div>
  )
}
