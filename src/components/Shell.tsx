import { useDroppable } from '@dnd-kit/core'
import { useStore } from '../store'
import { useGoogle } from '../hooks'
import { shortName, type DayPlan } from '../lib/schedule'
import { dayDate, fmtDate, fmtDur } from '../lib/time'
import { dayColor, LEVEL_META } from '../ui'
import { addDay } from '../actions'
import { cx, InlineText } from './common'
import { MiniDayBar } from './Timeline'

export function TopBar() {
  const trip = useStore((s) => s.trip)!
  const mutate = useStore((s) => s.mutate)
  const saveStatus = useStore((s) => s.saveStatus)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setShowExport = useStore((s) => s.setShowExport)
  const setShowVersions = useStore((s) => s.setShowVersions)
  const googleStatus = useStore((s) => s.googleStatus)
  const kind = useStore((s) => s.backendKind)
  const google = useGoogle()
  const end = dayDate(trip.startDate, trip.days.length - 1)

  const save = {
    loading: ['불러오는 중', 'text-stone-400'],
    saved: ['저장됨', 'text-stone-400'],
    saving: ['저장 중…', 'text-stone-400'],
    dirty: ['저장 대기', 'text-stone-400'],
    error: ['저장 실패 — 서버 확인', 'text-red-600'],
    local: ['브라우저에만 저장', 'text-amber-600'],
    offline: ['오프라인', 'text-amber-600'],
  }[saveStatus]

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-3 sm:gap-3 sm:px-4">
      <span className="hidden text-xl sm:inline">🗺️</span>
      <div className="min-w-0 flex-1">
        <InlineText className="text-[15px] font-bold" value={trip.title} onChange={(v) => mutate((t) => void (t.title = v || '홋카이도 여행'))} />
        <div className="flex items-center gap-1.5 truncate text-xs text-stone-500">
          <input
            type="date"
            className="rounded border border-transparent bg-transparent px-0.5 text-xs hover:border-stone-300"
            value={trip.startDate}
            onChange={(e) => e.target.value && mutate((t) => void (t.startDate = e.target.value))}
            title="출발일 — 바꾸면 모든 날짜·요일·영업시간 검사가 다시 계산돼요"
          />
          <span className="hidden sm:inline">– {fmtDate(end)} ·</span>
          <span>
            {trip.days.length - 1}박 {trip.days.length}일
          </span>
        </div>
      </div>
      {kind === 'server' && <span className="hidden rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 sm:inline" title="이 화면의 수정은 웹 버전에 반영되지 않아요">맥 전용 사본</span>}
      <span className={cx('hidden text-xs sm:inline', save[1])}>{save[0]}</span>
      <div className="flex">
        <button className="rounded-lg px-2 py-1 text-stone-600 hover:bg-stone-100 disabled:opacity-30" disabled={!canUndo} onClick={undo} title="되돌리기 (⌘/Ctrl+Z)">
          ↶
        </button>
        <button className="rounded-lg px-2 py-1 text-stone-600 hover:bg-stone-100 disabled:opacity-30" disabled={!canRedo} onClick={redo} title="다시 실행 (⌘/Ctrl+Shift+Z)">
          ↷
        </button>
      </div>
      <button className="shrink-0 rounded-lg px-1.5 py-1 text-[13px] font-semibold text-stone-700 hover:bg-stone-100" onClick={() => setShowVersions(true)} title="저장된 버전과 변경 기록">
        🕘<span className="hidden sm:inline"> 버전</span>
      </button>
      <button
        className={cx(
          'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
          google && googleStatus === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : googleStatus === 'error' ? 'border-red-200 bg-red-50 text-red-700' : google ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-stone-300 bg-white text-stone-600',
        )}
        onClick={() => setShowSettings(true)}
      >
        <span className={cx('h-2 w-2 rounded-full', google && googleStatus === 'ok' ? 'bg-emerald-500' : googleStatus === 'error' ? 'bg-red-500' : google ? 'bg-violet-500' : 'bg-stone-400')} />
        <span className="hidden sm:inline">{googleStatus === 'error' ? '구글 연동 오류' : google ? '구글 연동' : '무료 모드 · 구글 연결하기'}</span>
        <span className="sm:hidden">{google ? '구글' : '무료'}</span>
      </button>
      <button className="hidden rounded-lg px-2 py-1 text-stone-600 hover:bg-stone-100 sm:block" onClick={() => setShowSettings(true)} title="설정">
        ⚙️
      </button>
      <button className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-700" onClick={() => setShowExport(true)}>
        📱<span className="hidden sm:inline"> 폰으로 보내기</span>
      </button>
    </header>
  )
}

export function Sidebar({ plans }: { plans: DayPlan[] }) {
  const trip = useStore((s) => s.trip)!
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const selectedDayId = useStore((s) => s.selectedDayId)
  const selectDay = useStore((s) => s.selectDay)
  const done = trip.checklist.filter((c) => c.done).length

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <NavBtn active={view === 'overview'} onClick={() => setView('overview')}>
        <span>📊</span> 전체 일정
      </NavBtn>
      <NavBtn active={view === 'candidates'} onClick={() => setView('candidates')}>
        <span>🎯</span> 테마 후보 지도
      </NavBtn>
      <NavBtn active={view === 'compare'} onClick={() => setView('compare')}>
        <span>🔀</span> 버전 비교
      </NavBtn>
      <div className="mt-2 mb-1 px-2 text-[11px] font-semibold tracking-wide text-stone-400">일자별</div>
      {plans.map((p, i) => (
        <DayNavItem key={p.day.id} p={p} prevLodgingId={plans[i - 1]?.lodging?.id} active={view === 'day' && selectedDayId === p.day.id} onClick={() => selectDay(p.day.id)} />
      ))}
      <button className="rounded-xl border border-dashed border-stone-300 px-2.5 py-2 text-sm text-stone-500 hover:bg-white" onClick={() => addDay()}>
        ＋ 날짜 추가
      </button>
      <div className="mt-3 border-t border-stone-200 pt-3" />
      <NavBtn active={view === 'places'} onClick={() => setView('places')}>
        <span>⭐</span> 장소함 <span className="ml-auto text-xs text-stone-400">{trip.wishlist.length}</span>
      </NavBtn>
      <NavBtn active={view === 'checklist'} onClick={() => setView('checklist')}>
        <span>✅</span> 준비물·운전 팁{' '}
        <span className="ml-auto text-xs text-stone-400">
          {done}/{trip.checklist.length}
        </span>
      </NavBtn>
    </nav>
  )
}

function DayNavItem({ p, prevLodgingId, active, onClick }: { p: DayPlan; prevLodgingId?: string; active: boolean; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${p.day.id}` })
  const checkIn = !!p.lodging && p.lodging.id !== prevLodgingId
  const issue = (['critical', 'serious', 'warning'] as const).find((l) => p.counts[l])
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={cx('rounded-xl border px-2.5 py-2 text-left transition', isOver ? 'border-violet-500 bg-violet-100 ring-2 ring-violet-300' : active ? 'border-violet-300 bg-white shadow-sm' : 'border-transparent hover:bg-white/70')}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: dayColor(p.index) }}>
          D{p.index + 1}
        </span>
        <span className="text-xs text-stone-500">{fmtDate(p.date)}</span>
        <span className="flex-1" />
        {issue && (
          <span className="flex items-center gap-1 text-[11px] text-stone-600" title={`${LEVEL_META[issue].label} ${p.counts[issue]}건`}>
            <span className={cx('h-2 w-2 rounded-full', LEVEL_META[issue].dot)} />
            {p.counts.critical + p.counts.serious + p.counts.warning}
          </span>
        )}
      </div>
      <div className="mt-1 truncate text-[13px] font-semibold">{p.title}</div>
      <div className="mt-1.5">
        <MiniDayBar p={p} />
      </div>
      <div className="mt-1 text-[11px] text-stone-500">{p.driveMin > 0 ? `🚗 ${fmtDur(p.driveMin)}` : '🚶 차 없는 날'}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-600">
        {p.lodging ? (
          <>
            <span className="min-w-0 truncate">🛏 {shortName(p.lodging.name)}</span>
            {checkIn && <span className="shrink-0 rounded bg-violet-100 px-1 font-semibold text-violet-800">체크인</span>}
          </>
        ) : (
          <span className="text-stone-400">🛏 숙박 없음</span>
        )}
      </div>
    </button>
  )
}

function DayChip({ p, active, onClick }: { p: DayPlan; active: boolean; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `chip:${p.day.id}` })
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={cx('shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold', isOver ? 'border-violet-500 bg-violet-100 ring-2 ring-violet-300' : active ? 'border-violet-400 bg-white' : 'border-stone-200 bg-white/60')}
    >
      <span style={{ color: dayColor(p.index) }}>D{p.index + 1}</span> {fmtDate(p.date)}
    </button>
  )
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx('flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold', active ? 'bg-white shadow-sm ring-1 ring-violet-300' : 'hover:bg-white/70')}>
      {children}
    </button>
  )
}

/** 좁은 화면: 일자 칩 가로 스크롤 */
export function DayChips({ plans }: { plans: DayPlan[] }) {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const selectedDayId = useStore((s) => s.selectedDayId)
  const selectDay = useStore((s) => s.selectDay)
  const chip = (active: boolean) => cx('shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold', active ? 'border-violet-400 bg-white' : 'border-stone-200 bg-white/60')
  return (
    <div className="flex gap-1.5 overflow-x-auto border-b border-stone-200 px-3 py-2 xl:hidden">
      <button className={chip(view === 'overview')} onClick={() => setView('overview')}>
        📊 전체
      </button>
      <button className={chip(view === 'candidates')} onClick={() => setView('candidates')}>
        🎯 후보
      </button>
      <button className={chip(view === 'compare')} onClick={() => setView('compare')}>
        🔀 비교
      </button>
      {plans.map((p) => (
        <DayChip key={p.day.id} p={p} active={view === 'day' && selectedDayId === p.day.id} onClick={() => selectDay(p.day.id)} />
      ))}
      <button className={chip(view === 'places')} onClick={() => setView('places')}>
        ⭐ 장소함
      </button>
      <button className={chip(view === 'checklist')} onClick={() => setView('checklist')}>
        ✅ 준비
      </button>
    </div>
  )
}
