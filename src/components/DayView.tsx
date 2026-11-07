import { useEffect, useMemo, useRef, useState } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../store'
import { useGoogle } from '../hooks'
import type { LegMode, MealMark } from '../types'
import { MEAL_LABEL, shortName, tollText, type DayPlan, type LegPlan, type StopPlan } from '../lib/schedule'
import { josa } from '../lib/people'
import { hoursForDay } from '../lib/hours'
import { MODE_ICON, MODE_LABEL } from '../lib/routing'
import { dayPoints, dayRouteUrls, directionsUrl } from '../lib/export'
import { verifyAll } from '../lib/verify'
import { optimizeDay, type OptimizeResult } from '../lib/placement'
import { fmtDate, fmtDur, fmtHM, fmtKm } from '../lib/time'
import { dayColor, KIND_ICON } from '../ui'
import {
  addDay,
  addStop,
  deleteDay,
  moveDay,
  moveStopToDay,
  removeStop,
  reorderStops,
  togglePick,
  updateDay,
  updateStop,
  upsertPlace,
} from '../actions'
import { Btn, cx, ExtLink, InlineText, Menu, MenuItem, TimeInput, WarningList, isWideScreen } from './common'
import { ParkingChip } from './ParkingInfo'
import { LodgingFinder } from './LodgingFinder'
import { PlaceSearch } from './PlaceSearch'
import { AltActions, AltAddBox, AltNav, AltSlide, PickButtons } from './StopAlts'
import { altPreview } from '../lib/placement'
import { MiniDayBar } from './Timeline'

export function DayView({ plan, plans }: { plan: DayPlan; plans: DayPlan[] }) {
  const day = plan.day
  const color = dayColor(plan.index)
  const trip = useStore((s) => s.trip)!
  const notify = useStore((s) => s.notify)
  const openPlace = useStore((s) => s.openPlace)
  const routes = useStore((s) => s.routes)
  const google = useGoogle()
  const [verifying, setVerifying] = useState<string>()
  const [proposal, setProposal] = useState<OptimizeResult>()
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [findLodging, setFindLodging] = useState(false)
  const routeUrls = plan.driveMin > 0 ? dayRouteUrls(dayPoints(plan)) : []
  const prevLodging = plan.index > 0 ? trip.days[plan.index - 1].lodgingPlaceId : undefined
  const isLastDay = plan.index === plans.length - 1
  // 일정이 바뀌면 전에 계산한 제안은 맞지 않으니 치운다
  useEffect(() => setProposal(undefined), [day.stops])
  const insertBox = (index: number) => (
    <div className="my-2 rounded-xl border border-violet-300 bg-violet-50/60 p-2.5">
      <PlaceSearch
        autoFocus
        placeholder="여기에 넣을 장소 검색"
        onPick={(p, existing) => {
          addStop(day.id, existing ? p.id : upsertPlace(p), index)
          setInsertAt(null)
        }}
      />
      <WishlistQuickAdd
        dayId={day.id}
        index={index}
        onAdded={() => setInsertAt(null)}
      />
      <button className="mt-1.5 text-xs text-stone-500 hover:underline" onClick={() => setInsertAt(null)}>
        취소
      </button>
    </div>
  )

  function optimize() {
    const r = optimizeDay(trip, routes, plan.index, google)
    setProposal(r ?? undefined)
    if (!r) notify('지금 순서보다 나은 순서를 찾지 못했어요')
  }

  async function verifyDay() {
    const ids = [...new Set(dayPoints(plan).map((p) => p.id))]
    setVerifying(`0/${ids.length}`)
    const res = await verifyAll(ids, (d, t) => setVerifying(`${d}/${t}`))
    setVerifying(undefined)
    const bad = res.filter((r) => !r.ok)
    notify(bad.length ? `확인 완료 · 실패 ${bad.length}건: ${bad.map((b) => b.message).join(', ')}` : `${res.length}곳 구글 정보로 최신화했어요`)
  }

  return (
    <div className="pb-24">
      {/* 헤더 */}
      <div className="z-20 border-b border-stone-200 bg-white/95 px-5 pt-4 pb-3 backdrop-blur md:sticky md:top-0">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl px-2.5 py-1.5 text-sm font-bold text-white" style={{ background: color }}>
            D{plan.index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-stone-500">{fmtDate(plan.date, true)}</div>
            <InlineText wrap className="text-xl font-bold leading-snug" value={plan.title} onChange={(v) => updateDay(day.id, { title: v.trim() && v.trim() !== plan.autoTitle ? v.trim() : undefined })} />
            {day.title?.trim() && (
              <button className="ml-2 align-middle text-xs font-medium text-violet-700 hover:underline" title={`일정에 맞춘 제목: ${plan.autoTitle}`} onClick={() => updateDay(day.id, { title: undefined })}>
                ↺ 일정에 맞추기
              </button>
            )}
          </div>
          <Menu label="⋯">
            {(close) => (
              <>
                <MenuItem onClick={() => (moveDay(day.id, -1), close())}>↑ 하루 앞으로</MenuItem>
                <MenuItem onClick={() => (moveDay(day.id, 1), close())}>↓ 하루 뒤로</MenuItem>
                <MenuItem onClick={() => (addDay(plan.index), close())}>＋ 다음에 빈 날 추가</MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    close()
                    if (confirm(`D${plan.index + 1}을 삭제할까요? 장소들은 장소함으로 옮겨져요.`)) deleteDay(day.id)
                  }}
                >
                  이 날 삭제
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-stone-600">
          {plan.driveMin > 0 ? (
            <span>
              🚗 운전 <b className="text-stone-900">{fmtDur(plan.driveMin)}</b> · {fmtKm(plan.driveMeters)} · <b className="text-stone-900">{tollText(plan.tollYen, plan.tollUnknown)}</b>
            </span>
          ) : (
            plan.stops.length > 0 && <b className="text-stone-900">🚶 운전 없는 날</b>
          )}
          <span>
            ⏱ {fmtHM(plan.start)} → <b className="text-stone-900">{fmtHM(plan.end)}</b>
          </span>
          {plan.sun && (
            <span>
              🌅 {fmtHM(plan.sun.sunrise)} · 🌇 {fmtHM(plan.sun.sunset)}
            </span>
          )}
          {plan.pendingLegs > 0 && <span className="text-violet-600">경로 계산 중 {plan.pendingLegs}구간…</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-stone-600">
          {(['lunch', 'dinner'] as const).map((m) => {
            const sp = plan[m]
            if (!sp && m === 'lunch' && plan.start > 13 * 60) return null
            if (!sp && m === 'dinner' && isLastDay) return null
            return (
              <span key={m}>
                {MEAL_LABEL[m]}{' '}
                {sp ? (
                  <button className="font-semibold text-stone-900 hover:text-violet-700" onClick={() => openPlace(sp.place.id)}>
                    {sp.place.name}
                  </button>
                ) : (
                  <span className="font-semibold text-amber-700">미정</span>
                )}
              </span>
            )
          })}
        </div>
        <div className="mt-2.5">
          <MiniDayBar p={plan} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {routeUrls.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-violet-700">
              🗺️ 구글맵에서 하루 경로 {r.label !== '전체' && r.label}
            </a>
          ))}
          {google && (
            <Btn onClick={verifyDay} disabled={!!verifying} title="이 날 장소들의 영업시간·영업상태·전화번호를 구글에서 다시 가져와요">
              {verifying ? `확인 중 ${verifying}` : '✓ 구글로 영업정보 확인'}
            </Btn>
          )}
        </div>
        {day.stops.length >= 2 && (
          <div className="mt-2">
            <Btn onClick={optimize} title="시각 고정과 호텔은 그 자리에 두고, 주차장에서 걷는 묶음, 식사 시간, 영업시간을 지키면서 동선을 다시 찾아요">
              🧭 이 날 순서 최적화
            </Btn>
          </div>
        )}
        {proposal && (
          <div className="mt-2 rounded-xl border border-violet-300 bg-violet-50 p-3 text-sm">
            <div className="font-semibold">
              {[
                proposal.issuesFixed > 0 && `경고 ${proposal.issuesFixed}개가 사라져요`,
                proposal.driveSaved >= 1 && `운전이 약 ${fmtDur(proposal.driveSaved)} 줄어요`,
                proposal.taxiSaved > 0 && `택시를 ${proposal.taxiSaved}번 덜 타요`,
                Math.abs(proposal.walkMore) >= 3 && `걷기가 ${fmtDur(Math.abs(proposal.walkMore))} ${proposal.walkMore > 0 ? '늘어요' : '줄어요'}`,
              ]
                .filter(Boolean)
                .join(' · ') || '동선이 더 자연스러워져요'}
            </div>
            <div className="mt-0.5 text-[13px] text-stone-700">{proposal.names.join(' → ')}</div>
            {proposal.shortened.length > 0 && <div className="mt-1 text-[12.5px] text-stone-600">시간이 모자라 체류를 줄여요: {proposal.shortened.map((s) => `${s.name} ${fmtDur(s.stay)}`).join(', ')}</div>}
            <div className="mt-2 flex gap-2">
              <Btn
                variant="primary"
                className="px-2.5 py-1 text-xs"
                onClick={() => {
                  updateDay(day.id, { stops: proposal.stops })
                  setProposal(undefined)
                  notify('순서를 바꿨어요 (↶ 되돌리기)')
                }}
              >
                이 순서로 바꾸기
              </Btn>
              <Btn className="px-2.5 py-1 text-xs" onClick={() => setProposal(undefined)}>
                그대로 두기
              </Btn>
            </div>
          </div>
        )}
        <WarningList warnings={plan.warnings} />
      </div>

      <div className="px-5 pt-4">
        {/* 출발 */}
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5">
          <span className="text-lg">🚩</span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="text-xs text-stone-500">출발 {prevLodging && !day.startPlaceId ? '(전날 숙소)' : ''}</div>
            <PlacePicker
              value={plan.startPlace?.name}
              placeholder="출발 장소 선택"
              onPick={(id) => updateDay(day.id, { startPlaceId: id === prevLodging ? undefined : id })}
            />
          </div>
          <TimeInput value={day.startTime} onChange={(v) => updateDay(day.id, { startTime: v })} />
        </div>

        <SortableContext items={day.stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {plan.stops.map((sp, i) => (
            <div key={sp.stop.id}>
              {insertAt === i && insertBox(i)}
              <StopCard sp={sp} plan={plan} plans={plans} index={i} color={color} onInsert={() => setInsertAt(i)} />
            </div>
          ))}
        </SortableContext>
        {insertAt === plan.stops.length && insertBox(plan.stops.length)}


        {/* 숙소 */}
        {plan.endLeg && (
          <LegRow
            leg={plan.endLeg}
            onMode={(m) => updateDay(day.id, { endLegMode: m })}
            onManual={(v) => updateDay(day.id, { endManualMinutes: v })}
            manual={day.endManualMinutes}
            onInsert={() => setInsertAt(plan.stops.length)}
          />
        )}
        {!plan.endLeg && (
          <button className="mt-3 w-full rounded-xl border border-dashed border-violet-300 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50" onClick={() => setInsertAt(plan.stops.length)}>
            ＋ 장소 추가
          </button>
        )}
        {(!isLastDay || plan.lodging) && (
          <div className={cx('mt-3 flex items-center gap-3 rounded-xl border px-3 py-2.5', plan.lodging ? 'border-violet-200 bg-violet-50/60' : 'border-dashed border-stone-300')}>
            <span className="text-lg">🛏️</span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="text-xs text-stone-500">오늘 밤 숙소</div>
              {plan.lodging ? (
                <button className="max-w-full truncate text-left font-semibold hover:text-violet-700" onClick={() => openPlace(plan.lodging!.id)}>
                  {plan.lodging.name}
                </button>
              ) : (
                <div className="text-stone-400">아직 없어요</div>
              )}
              {plan.lodging?.phone && <div className="text-xs text-stone-500">☎ {plan.lodging.phone}</div>}
              {plan.lodging && (
                <div className="mt-1 text-[12px]">
                  <ParkingChip place={plan.lodging} byCar onClick={() => openPlace(plan.lodging!.id)} />
                </div>
              )}
            </div>
            {plan.lodging && (
              <div className="text-right">
                <div className="text-xs text-stone-500">도착</div>
                <div className="font-bold tabular-nums">{fmtHM(plan.end)}</div>
              </div>
            )}
            <Btn variant={plan.lodging ? 'default' : 'primary'} className="shrink-0 px-2.5 py-1 text-xs" onClick={() => setFindLodging(true)}>
              🔍 {plan.lodging ? '숙소 바꾸기' : '숙소 찾기'}
            </Btn>
            {plan.lodging && (
              <button className="text-stone-400 hover:text-stone-700" title="숙소 비우기" onClick={() => updateDay(day.id, { lodgingPlaceId: undefined })}>
                ✕
              </button>
            )}
          </div>
        )}
        {findLodging && <LodgingFinder plan={plan} plans={plans} onClose={() => setFindLodging(false)} />}

        <div className="mt-5 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-3">
          <div className="mb-2 text-xs font-semibold text-violet-800">＋ 장소 추가 — 그날 동선에서 가장 맞는 자리에 들어가요. 주차장에 세우고 걷는 구간 근처면 그 안에 걸어서 들어가요. 마음에 안 들면 ▲▼를 누르거나 카드를 끌어서 옮기고, 왼쪽(위쪽) 날짜로 끌어다 놓으면 그날로 옮겨져요</div>
          <PlaceSearch
            onPick={(p, existing) => {
              const id = existing ? p.id : upsertPlace(p)
              const where = addStop(day.id, id)
              if (where) notify(`${p.name}: ${where}`)
            }}
          />
          <WishlistQuickAdd dayId={day.id} />
        </div>

        <textarea
          className="mt-4 field-sizing-content w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm placeholder:text-stone-400"
          rows={2}
          placeholder="이 날 메모 (예약번호, 준비물 등)"
          value={day.note ?? ''}
          onChange={(e) => updateDay(day.id, { note: e.target.value || undefined })}
        />
      </div>
    </div>
  )
}

function WishlistQuickAdd({ dayId, index, onAdded }: { dayId: string; index?: number; onAdded?: () => void }) {
  const trip = useStore((s) => s.trip)!
  const notify = useStore((s) => s.notify)
  const items = trip.wishlist.map((id) => trip.places[id]).filter((p) => p && p.kind !== 'hotel')
  if (!items.length) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-stone-500">장소함에서:</span>
      {items.slice(0, 12).map((p) => (
        <button
          key={p.id}
          className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs hover:border-violet-300 hover:bg-violet-50"
          onClick={() => {
            const where = addStop(dayId, p.id, index)
            if (where) notify(`${p.name}: ${where}`)
            onAdded?.()
          }}
        >
          {KIND_ICON[p.kind]} {p.name}
        </button>
      ))}
    </div>
  )
}

/** 저장된 장소 중에서 고르거나 새로 검색 */
function PlacePicker({ value, placeholder, onPick }: { value?: string; placeholder: string; onPick: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (!editing)
    return (
      <button className={cx('max-w-full truncate text-left font-semibold hover:text-violet-700', !value && 'text-stone-400')} onClick={() => setEditing(true)}>
        {value ?? placeholder} <span className="text-xs font-normal text-stone-400">변경</span>
      </button>
    )
  return (
    <div className="mt-1">
      <PlaceSearch
        autoFocus
        placeholder="장소 검색"
        onPick={(p, existing) => {
          onPick(existing ? p.id : upsertPlace(p))
          setEditing(false)
        }}
      />
      <button className="mt-1 text-xs text-stone-500 hover:underline" onClick={() => setEditing(false)}>
        취소
      </button>
    </div>
  )
}

function LegRow({ leg, onMode, onManual, manual, onInsert }: { leg: LegPlan; onMode: (m: LegMode) => void; onManual: (v: number | undefined) => void; manual?: number; onInsert?: () => void }) {
  const r = leg.resolved
  const tag =
    r.status === 'ok'
      ? r.provider === 'google'
        ? { t: '구글', c: 'bg-emerald-50 text-emerald-700' }
        : r.provider === 'osrm' || r.provider === 'valhalla'
          ? { t: '무료 추정', c: 'bg-stone-100 text-stone-600' }
          : { t: leg.mode === 'MANUAL' || leg.mode === 'TRANSIT' ? '직접' : '추정', c: 'bg-stone-100 text-stone-600' }
      : r.status === 'pending'
        ? { t: '계산 중', c: 'bg-violet-50 text-violet-600' }
        : { t: '추정', c: 'bg-amber-50 text-amber-700' }
  return (
    <div className="relative ml-[22px] border-l-2 border-dotted border-stone-300 py-2 pl-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-stone-600">
        <Menu label={<span className="text-[13px]">{MODE_ICON[leg.mode]} ▾</span>} align="left">
          {(close) =>
            (['DRIVE', 'WALK', 'TRANSIT', 'MANUAL'] as LegMode[]).map((m) => (
              <MenuItem key={m} onClick={() => (onMode(m), close())}>
                {MODE_ICON[m]} {MODE_LABEL[m]}
                {m === 'MANUAL' && <span className="text-xs text-stone-400"> (택시·페리 등)</span>}
              </MenuItem>
            ))
          }
        </Menu>
        {leg.mode === 'MANUAL' || leg.mode === 'TRANSIT' ? (
          <label className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              className="w-16 rounded border border-stone-300 px-1 py-0.5 text-right tabular-nums"
              value={manual ?? ''}
              onChange={(e) => onManual(e.target.value === '' ? undefined : Number(e.target.value))}
            />
            분
          </label>
        ) : (
          <span className="font-semibold text-stone-800 tabular-nums">{fmtDur(leg.minutes)}</span>
        )}
        {leg.meters > 0 && <span className="tabular-nums">· {fmtKm(leg.meters)}</span>}
        {leg.tollYen ? <span className="rounded bg-sky-50 px-1 font-semibold text-sky-800 tabular-nums">톨 ¥{leg.tollYen.toLocaleString()}</span> : leg.tollYen === null ? <span className="text-stone-400">톨 요금 미확인</span> : null}
        {leg.buffer > 0 && <span className="text-stone-400">+여유 {leg.buffer}분</span>}
        <span className={cx('rounded px-1.5 py-px text-[10.5px] font-semibold', tag.c)}>{tag.t}</span>
        <ExtLink href={directionsUrl(leg.to, leg.from, leg.mode)} className="text-xs">
          길찾기 ↗
        </ExtLink>
        {onInsert && (
          <button className="ml-auto rounded-md border border-dashed border-violet-300 px-1.5 py-0.5 text-[11.5px] font-semibold text-violet-700 hover:bg-violet-50" onClick={onInsert} title="여기에 장소 넣기">
            ＋ 여기에 추가
          </button>
        )}
      </div>
      <WarningList warnings={leg.warnings} />
    </div>
  )
}

function StopCard({ sp, plan, plans, index, color, onInsert }: { sp: StopPlan; plan: DayPlan; plans: DayPlan[]; index: number; color: string; onInsert: () => void }) {
  const { stop, place } = sp
  const day = plan.day
  const openPlace = useStore((s) => s.openPlace)
  const focusPlace = useStore((s) => s.focusPlace)
  const focused = useStore((s) => s.focusPlaceId === place?.id)
  const notify = useStore((s) => s.notify)
  const [showNote, setShowNote] = useState(!!stop.note)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id })
  // 후보: 카드를 옆으로 넘기면 차례로 나온다 (0번은 지금 일정)
  const trip = useStore((s) => s.trip)!
  const routes = useStore((s) => s.routes)
  const google = useGoogle()
  const alts = useMemo(() => stop.alts ?? [], [stop.alts])
  const [active, setActive] = useState(0)
  const [adding, setAdding] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const previews = useMemo(() => alts.map((a) => altPreview(trip, routes, plan.index, stop.id, a.id, google)), [trip, routes, plan.index, stop.id, google, alts])
  const go = (i: number) => {
    const el = scroller.current
    if (!el) return
    const n = Math.max(0, Math.min(el.children.length - 1, i))
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
    setActive(n)
  }
  const activeAlt = active > 0 ? alts[active - 1] : undefined
  // 후보가 줄어 보던 칸이 없어지면 앞으로 당긴다
  useEffect(() => {
    if (active > alts.length) setActive(alts.length)
  }, [active, alts.length])
  // 넓은 화면에서는 보고 있는 후보로 지도를 옮긴다
  useEffect(() => {
    if (activeAlt && isWideScreen()) focusPlace(activeAlt.placeId)
  }, [activeAlt?.placeId, focusPlace])
  if (!place) return null
  const style = { transform: CSS.Transform.toString(transform), transition }
  const verified = place.verifiedAt ? new Date(place.verifiedAt) : undefined

  return (
    <div ref={setNodeRef} style={style} className={cx(isDragging && 'opacity-40')}>
      {sp.leg ? (
        <LegRow
          leg={sp.leg}
          manual={stop.manualMinutes}
          onMode={(m) => updateStop(day.id, stop.id, { legMode: m })}
          onManual={(v) => updateStop(day.id, stop.id, { manualMinutes: v })}
          onInsert={onInsert}
        />
      ) : (
        <div className="flex justify-end py-2">
          <button className="rounded-md border border-dashed border-violet-300 px-1.5 py-0.5 text-[11.5px] font-semibold text-violet-700 hover:bg-violet-50" onClick={onInsert}>
            ＋ 여기에 추가
          </button>
        </div>
      )}
      <div
        {...listeners}
        className={cx(
          'group cursor-pointer rounded-xl border bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition hover:border-violet-300',
          sp.warnings.some((w) => w.level === 'critical') ? 'border-red-300' : focused ? 'border-violet-400 ring-1 ring-violet-300' : 'border-stone-200',
        )}
        onClick={(e) => {
          // 버튼·입력칸을 누를 때는 지도를 옮기지 않는다
          if (!(e.target as HTMLElement).closest('button,input,textarea,select,a')) focusPlace(activeAlt?.placeId ?? place.id)
        }}
      >
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-1">
            <button
              {...attributes}
              data-drag-handle
              className="flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-full text-xs font-bold text-white active:cursor-grabbing"
              style={{ background: color }}
              title="끌어서 순서 바꾸기, 날짜 위에 놓으면 그날로 이동"
            >
              {index + 1}
            </button>
            <span data-drag-handle className="cursor-grab touch-none px-1 text-sm leading-none text-stone-300 group-hover:text-stone-500" title="끌어서 순서 바꾸기">
              ⠿
            </span>
          </div>
          <div className="min-w-0 flex-1">
          {alts.length > 0 && <AltNav count={alts.length + 1} active={active} onGo={go} picksOf={(i) => (i === 0 ? stop.picks : alts[i - 1]?.picks)?.length ?? 0} />}
          <div
            ref={scroller}
            className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
            onScroll={(e) => {
              const el = e.currentTarget
              const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
              if (i !== active) setActive(i)
            }}
          >
          <div className="flex w-full shrink-0 snap-start gap-3">
          <div className="w-12 shrink-0 pt-0.5 text-right tabular-nums">
            <div className="text-[15px] font-bold leading-tight">{fmtHM(sp.arrive)}</div>
            {stop.stay > 0 && <div className="text-xs text-stone-400">{fmtHM(sp.depart)}</div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  // 넓은 화면은 지도가 옆에 있으니 지도만 옮기고, 지도가 없는 폰에서는 상세를 연다
                  focusPlace(place.id)
                  if (!isWideScreen()) openPlace(place.id)
                }}
              >
                {sp.meal && <div className="text-xs font-bold text-violet-700">{MEAL_LABEL[sp.meal]}</div>}
                <div className="truncate text-[15px] font-semibold hover:text-violet-700">
                  {KIND_ICON[place.kind]} {place.name}
                </div>
                {place.nameLocal && <div className="truncate text-xs text-stone-400">{place.nameLocal}</div>}
              </button>
              <button className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 md:block" onClick={() => openPlace(place.id)}>
                상세
              </button>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-stone-600">
              <span className="flex items-center gap-1">
                체류
                <button className="rounded border border-stone-200 px-1 leading-5 hover:bg-stone-100" onClick={() => updateStop(day.id, stop.id, { stay: Math.max(0, stop.stay - 15) })}>
                  −
                </button>
                <span className="min-w-12 text-center font-semibold text-stone-800 tabular-nums">{fmtDur(stop.stay)}</span>
                <button className="rounded border border-stone-200 px-1 leading-5 hover:bg-stone-100" onClick={() => updateStop(day.id, stop.id, { stay: stop.stay + 15 })}>
                  ＋
                </button>
              </span>
              {stop.fixedTime ? (
                <span className="flex items-center gap-1">
                  📌
                  <TimeInput className="py-0 text-xs" value={stop.fixedTime} onChange={(v) => updateStop(day.id, stop.id, { fixedTime: v })} />
                  <button className="text-stone-400 hover:text-stone-700" title="고정 해제" onClick={() => updateStop(day.id, stop.id, { fixedTime: undefined })}>
                    ✕
                  </button>
                </span>
              ) : (
                <button
                  className="text-stone-400 hover:text-violet-700"
                  title="이 시각에 도착하도록 고정 (예약·공연·불꽃놀이)"
                  onClick={() => {
                    const time = fmtHM(sp.arrive).replace('익일 ', '')
                    updateStop(day.id, stop.id, { fixedTime: time })
                    // 한 번 누르면 바로 고정되니, 잘못 눌렀을 때 알아챌 수 있게 알려준다
                    notify(`${josa(shortName(place.name), '을', '를')} ${time} 도착으로 고정했어요. 잘못 눌렀으면 ↶ 되돌리기`)
                  }}
                >
                  📌 시각 고정
                </button>
              )}
              {sp.wait > 0 && <span className="text-stone-500">대기 {fmtDur(sp.wait)}</span>}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
              {(place.hours || place.alwaysOpen || (place.kind !== 'hotel' && place.kind !== 'airport')) && (
                <span className={cx('rounded-md px-1.5 py-0.5', sp.hours.status === 'ok' || sp.hours.status === 'always' ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600')}>
                  🕘 {hoursForDay(place, plan.weekday)}
                  {place.hours?.source === 'curated' && <span className="text-stone-400"> · 웹정보</span>}
                </span>
              )}
              {verified && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700">✓ 구글 {verified.getMonth() + 1}/{verified.getDate()}</span>}
              {place.rating && (
                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-stone-600">
                  ★ {place.rating.toFixed(1)}
                  {place.ratingCount ? ` (${place.ratingCount.toLocaleString()})` : ''}
                </span>
              )}
              {place.phone && <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-stone-600">☎ {place.phone}</span>}
              <ParkingChip place={place} byCar={!sp.leg || sp.leg.mode === 'DRIVE'} onClick={() => openPlace(place.id)} />
            </div>

            {place.season && <div className="mt-1.5 rounded-md bg-violet-50 px-2 py-1 text-[12px] leading-snug text-violet-900">🌸 {place.season}</div>}
            <WarningList warnings={sp.warnings} />
            {(showNote || stop.note) && (
              <textarea
                className="mt-1.5 field-sizing-content w-full resize-none rounded-md border border-stone-200 px-2 py-1 text-[12.5px] leading-snug placeholder:text-stone-400"
                placeholder="메모 (예약 시간, 주문할 메뉴 등)"
                rows={Math.max(1, Math.ceil((stop.note?.length ?? 0) / 24))}
                value={stop.note ?? ''}
                autoFocus={showNote && !stop.note}
                onChange={(e) => updateStop(day.id, stop.id, { note: e.target.value || undefined })}
              />
            )}
          </div>
          </div>
          {alts.map((a, k) => (
            <div key={a.id} className="w-full shrink-0 snap-start">
              <AltSlide dayId={day.id} stopId={stop.id} alt={a} preview={previews[k]} weekday={plan.weekday} />
            </div>
          ))}
          </div>
          {activeAlt ? (
            <AltActions dayId={day.id} stopId={stop.id} alt={activeAlt} onPromoted={() => go(0)} />
          ) : (
            <>
            {alts.length > 0 && (
              <div className="mt-1.5">
                <PickButtons picks={stop.picks} onToggle={(id) => togglePick(day.id, stop.id, undefined, id)} />
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center justify-end gap-x-1 text-xs">
              <span className="mr-auto flex items-center gap-0.5 text-stone-500">
                <button
                  className="rounded-md px-1.5 py-0.5 hover:bg-stone-100 disabled:opacity-30"
                  disabled={index === 0}
                  title="한 칸 앞으로"
                  aria-label="한 칸 앞으로"
                  onClick={() => reorderStops(day.id, index, index - 1)}
                >
                  ▲
                </button>
                <button
                  className="rounded-md px-1.5 py-0.5 hover:bg-stone-100 disabled:opacity-30"
                  disabled={index === day.stops.length - 1}
                  title="한 칸 뒤로"
                  aria-label="한 칸 뒤로"
                  onClick={() => reorderStops(day.id, index, index + 1)}
                >
                  ▼
                </button>
              </span>
              <button className="rounded-md px-1.5 py-0.5 font-semibold text-amber-700 hover:bg-amber-50" title="이 자리에 갈 다른 후보를 넣어 두고 둘이 픽해요" onClick={() => setAdding(!adding)}>
                ＋ 후보
              </button>
              {!showNote && !stop.note && (
                <button className="rounded-md px-1.5 py-0.5 text-stone-500 hover:bg-stone-100" onClick={() => setShowNote(true)}>
                  메모
                </button>
              )}
              <Menu label={<span className="text-xs text-stone-500">{sp.meal ? MEAL_LABEL[sp.meal] : '🍴 식사 표시'}</span>}>
                {(close) =>
                  ([
                    ['lunch', MEAL_LABEL.lunch],
                    ['dinner', MEAL_LABEL.dinner],
                    ['none', '식사 아님'],
                  ] as [MealMark, string][]).map(([m, label]) => (
                    <MenuItem key={m} onClick={() => (updateStop(day.id, stop.id, { meal: m }), close())}>
                      {label}
                    </MenuItem>
                  ))
                }
              </Menu>
              <Menu label={<span className="text-xs font-semibold text-violet-700">📅 다른 날로</span>}>
                {(close) =>
                  plans
                    .filter((p) => p.day.id !== day.id)
                    .map((p) => (
                      <MenuItem
                        key={p.day.id}
                        onClick={() => {
                          const where = moveStopToDay(day.id, stop.id, p.day.id)
                          notify(`${place.name} → D${p.index + 1}${where ? `: ${where}` : '로 옮겼어요'} (↶ 되돌리기)`)
                          close()
                        }}
                      >
                        <span className="font-semibold" style={{ color: dayColor(p.index) }}>
                          D{p.index + 1}
                        </span>{' '}
                        {fmtDate(p.date)} <span className="text-stone-500">{p.title}</span>
                      </MenuItem>
                    ))
                }
              </Menu>
              <Menu label={<span className="text-xs text-stone-500">빼기</span>}>
                {(close) => (
                  <>
                    <MenuItem onClick={() => (removeStop(day.id, stop.id, true), notify(`${place.name}을(를) 장소함으로 옮겼어요`), close())}>장소함으로 보내기</MenuItem>
                    <MenuItem danger onClick={() => (removeStop(day.id, stop.id), notify('일정에서 뺐어요 (↶ 되돌리기)'), close())}>
                      일정에서 삭제
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
            </>
          )}
          </div>
        </div>
      </div>
      {adding && (
        <AltAddBox
          dayId={day.id}
          stop={stop}
          place={place}
          arrive={sp.arrive}
          weekday={plan.weekday}
          onClose={() => setAdding(false)}
          onAdded={() => setTimeout(() => go(alts.length + 1), 60)}
        />
      )}
    </div>
  )
}
