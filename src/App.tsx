import { useEffect, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type PointerSensorOptions } from '@dnd-kit/core'
import { useStore } from './store'
import { usePlans, useWideScreen } from './hooks'
import { useRouteManager } from './lib/useRouteManager'
import { moveStopToDay, reorderStops } from './actions'
import { TopBar, Sidebar, DayChips } from './components/Shell'
import { DayView } from './components/DayView'
import { Overview } from './components/Overview'
import { CandidatesView } from './components/CandidatesView'
import { PlacesView } from './components/PlacesView'
import { ChecklistView } from './components/ChecklistView'
import { CompareView } from './components/CompareView'
import { MapPanel } from './components/MapPanel'
import { PlaceDrawer } from './components/PlaceDrawer'
import { SettingsModal } from './components/SettingsModal'
import { ExportModal } from './components/ExportModal'
import { BudgetModal } from './components/BudgetModal'
import { ReadOnlyBanner, VersionsModal } from './components/VersionsModal'
import { Toast, cx } from './components/common'
import { ConnectScreen } from './components/ConnectScreen'

export function App() {
  const trip = useStore((s) => s.trip)
  const load = useStore((s) => s.load)
  const needConnect = useStore((s) => s.needConnect)
  useEffect(() => {
    load()
  }, [load])
  if (needConnect) return <ConnectScreen error={needConnect.error} />
  if (!trip) return <div className="flex h-full items-center justify-center text-stone-400">불러오는 중…</div>
  return <Planner />
}

const DAY_TARGET = /^(?:day|chip):(.+)$/

/**
 * 마우스는 카드 어디를 잡아도 끌 수 있고(버튼·입력칸 제외),
 * 터치는 스크롤과 겹치지 않게 번호 손잡이에서만 끈다
 */
class CardPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: e }: React.PointerEvent, { onActivation }: PointerSensorOptions) => {
        if (!e.isPrimary || e.button !== 0) return false
        const el = e.target as HTMLElement
        const onHandle = !!el.closest('[data-drag-handle]')
        if (e.pointerType === 'touch' && !onHandle) return false
        if (!onHandle && el.closest('button,input,textarea,select,a,label')) return false
        onActivation?.({ event: e })
        return true
      },
    },
  ]
}

// 날짜 목록 위에 있으면 그날로 옮기기, 아니면 같은 날 안에서 순서 바꾸기
const collision: CollisionDetection = (args) => {
  const overDay = pointerWithin(args).filter((c) => DAY_TARGET.test(String(c.id)))
  if (overDay.length) return overDay
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !DAY_TARGET.test(String(c.id))) })
}

/** 아이폰에서 연결 링크로 처음 열면, 저장값이 지워지지 않도록 홈 화면 추가를 안내 */
function HomeScreenHint() {
  const show = useStore((s) => s.offerHomeScreen)
  const dismiss = useStore((s) => s.dismissHomeScreen)
  if (!show) return null
  return (
    <div className="fixed inset-x-3 bottom-3 z-[1500] rounded-2xl bg-stone-900 p-4 text-sm text-white shadow-2xl">
      <div className="font-semibold">홈 화면에 추가해 두세요</div>
      <p className="mt-1 text-stone-200">지금 Safari의 공유 버튼 → "홈 화면에 추가"를 누르면 다음부터 그 아이콘으로 바로 열려요. 추가한 뒤 확인을 눌러주세요.</p>
      <button className="mt-2 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-stone-900" onClick={dismiss}>
        확인
      </button>
    </div>
  )
}

function Planner() {
  const plans = usePlans()
  useRouteManager(plans)
  const sensors = useSensors(useSensor(CardPointerSensor, { activationConstraint: { distance: 5 } }))
  const [dragId, setDragId] = useState<string>()
  const trip = useStore((s) => s.trip)!
  const notify = useStore((s) => s.notify)
  const draggedStop = dragId ? trip.days.flatMap((d) => d.stops).find((s) => s.id === dragId) : undefined

  function onDragEnd(e: DragEndEvent) {
    setDragId(undefined)
    if (!e.over || e.active.id === e.over.id) return
    const stopId = String(e.active.id)
    const from = trip.days.find((d) => d.stops.some((s) => s.id === stopId))
    if (!from) return
    const target = DAY_TARGET.exec(String(e.over.id))
    if (target) {
      if (target[1] === from.id) return
      const where = moveStopToDay(from.id, stopId, target[1])
      const index = trip.days.findIndex((d) => d.id === target[1])
      notify(`D${index + 1}로 옮겼어요${where ? `: ${where}` : ''} (↶ 되돌리기)`)
      return
    }
    const a = from.stops.findIndex((s) => s.id === stopId)
    const b = from.stops.findIndex((s) => s.id === e.over!.id)
    if (a >= 0 && b >= 0) reorderStops(from.id, a, b)
  }

  const view = useStore((s) => s.view)
  const selectedDayId = useStore((s) => s.selectedDayId)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const [mobileMap, setMobileMap] = useState(false)
  // 폰에서는 지도를 처음 열 때 불러온다. 한 번 열면 그대로 둔다
  const wide = useWideScreen()
  const [mapOpened, setMapOpened] = useState(false)
  const plan = plans.find((p) => p.day.id === selectedDayId) ?? plans[0]

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [undo, redo])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e) => setDragId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragId(undefined)}
    >
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar />
      <ReadOnlyBanner />
      <DayChips plans={plans} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-stone-200 xl:block">
          <Sidebar plans={plans} />
        </aside>
        <main
          className={cx(
            'min-w-0 overflow-y-auto bg-[#faf9f7]',
            view === 'compare' ? 'w-full flex-1' : cx('shrink-0 md:w-[460px] md:border-r md:border-stone-200 2xl:w-[540px]', mobileMap ? 'hidden md:block' : 'w-full'),
          )}
        >
          {view === 'overview' && <Overview plans={plans} />}
          {view === 'candidates' && <CandidatesView plans={plans} />}
          {view === 'day' && plan && <DayView key={plan.day.id} plan={plan} plans={plans} />}
          {view === 'places' && <PlacesView plans={plans} />}
          {view === 'checklist' && <ChecklistView />}
          {view === 'compare' && <CompareView plans={plans} />}
        </main>
        {view !== 'compare' && (
          <section className={cx('min-w-0 flex-1', mobileMap ? 'block' : 'hidden md:block')}>
            {(wide || mapOpened) && <MapPanel plans={plans} />}
          </section>
        )}
      </div>
      {view !== 'compare' && (
        <button
          className="fixed right-4 bottom-4 z-[800] rounded-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg md:hidden"
          onClick={() => {
            setMobileMap(!mobileMap)
            setMapOpened(true)
          }}
        >
          {mobileMap ? '📋 일정' : '🗺️ 지도'}
        </button>
      )}
      <PlaceDrawer />
      <SettingsModal />
      <ExportModal />
      <BudgetModal />
      <VersionsModal plans={plans} />
      <Toast />
      <HomeScreenHint />
    </div>
    <DragOverlay dropAnimation={null}>
      {draggedStop && (
        <div className="w-fit max-w-64 truncate rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white shadow-xl">{trip.places[draggedStop.placeId]?.name}</div>
      )}
    </DragOverlay>
    </DndContext>
  )
}
