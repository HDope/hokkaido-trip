import { useStore } from '../store'
import { useJapanNow } from '../hooks'
import type { Booking, Stop } from '../types'
import { updateStop } from '../actions'
import { bookingRows, fmtIso, windowText, type BookingRow, type BookingState } from '../lib/bookings'
import { Btn, cx } from './common'

/** 일정 카드의 예약 표시 */
export function BookingChip({ booking, onClick }: { booking?: Booking; onClick: () => void }) {
  if (!booking) return null
  return (
    <button className={cx('rounded-md px-1.5 py-0.5', booking.done ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700')} onClick={onClick}>
      {booking.done ? '✅ 예약함' : '📅 예약 필요'}
      {booking.meet ? ` · ${booking.meet} 집합` : ''}
    </button>
  )
}

const box = 'rounded-lg border border-stone-300 px-2 py-1 text-[13px]'
const numberOf = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)))

/** 예약 정보 입력. 며칠 전 기준으로 적어 두면 일정을 옮겨도 날짜가 따라간다 */
export function BookingEditor({ dayId, stop, onClose }: { dayId: string; stop: Stop; onClose: () => void }) {
  const b = stop.booking ?? {}
  const set = (patch: Partial<Booking>) => updateStop(dayId, stop.id, { booking: { ...b, ...patch } })
  const text = (key: 'how' | 'note' | 'ref', placeholder: string) => <input className={cx(box, 'w-full')} placeholder={placeholder} value={b[key] ?? ''} onChange={(e) => set({ [key]: e.target.value || undefined })} />
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-2.5 text-[13px]">
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={!!b.done} onChange={(e) => set({ done: e.target.checked || undefined })} />
        예약 끝냈어요
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className="flex items-center gap-1">
          집합·시작
          <input type="time" step={300} className={box} value={b.meet ?? ''} onChange={(e) => set({ meet: e.target.value || undefined })} />
        </label>
        <label className="flex items-center gap-1">
          <input type="number" min={0} className={cx(box, 'w-14 text-right')} value={b.opensDaysBefore ?? ''} onChange={(e) => set({ opensDaysBefore: numberOf(e.target.value) })} />
          일 전
          <input type="time" step={300} className={box} value={b.opensTime ?? ''} onChange={(e) => set({ opensTime: e.target.value || undefined })} />
          부터
        </label>
        <label className="flex items-center gap-1">
          <input type="number" min={0} className={cx(box, 'w-14 text-right')} value={b.closesDaysBefore ?? ''} onChange={(e) => set({ closesDaysBefore: numberOf(e.target.value) })} />
          일 전
          <input type="time" step={300} className={box} value={b.closesTime ?? ''} onChange={(e) => set({ closesTime: e.target.value || undefined })} />
          까지
        </label>
      </div>
      {text('how', '예약 방법 (전화번호, 사이트)')}
      {text('note', '메모 (요금, 취소 규정)')}
      {text('ref', '예약번호')}
      <div className="flex justify-between">
        <button
          className="text-xs text-stone-500 hover:underline"
          onClick={() => {
            updateStop(dayId, stop.id, { booking: undefined })
            onClose()
          }}
        >
          예약 정보 지우기
        </button>
        <Btn className="px-2.5 py-1 text-xs" onClick={onClose}>
          닫기
        </Btn>
      </div>
    </div>
  )
}

const GROUP: { state: BookingState; title: string }[] = [
  { state: 'late', title: '⚠️ 예약 마감이 지났어요' },
  { state: 'open', title: '지금 연락해 볼 곳' },
  { state: 'wait', title: '아직 예약이 안 열렸어요' },
  { state: 'done', title: '예약 끝' },
]

function Row({ row }: { row: BookingRow }) {
  const selectDay = useStore((s) => s.selectDay)
  const { booking: b, stop, dayId } = row
  const set = (patch: Partial<Booking>) => updateStop(dayId, stop.id, { booking: { ...b, ...patch } })
  const when = windowText(row)
  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={!!b.done} aria-label={`${row.place.name} 예약 끝`} onChange={(e) => set({ done: e.target.checked || undefined })} />
      <div className="min-w-0 flex-1 text-sm">
        <button className="text-left font-semibold hover:text-violet-700" onClick={() => selectDay(dayId)}>
          D{row.dayIndex + 1} {fmtIso(row.visit)} · {row.place.name}
          {b.meet ? ` · ${b.meet} 집합` : ''}
        </button>
        {when && <div className={cx('text-[13px]', row.state === 'wait' ? 'font-semibold text-violet-800' : 'text-stone-600')}>{when}</div>}
        {b.how && <div className="text-[13px] break-words text-stone-600">{b.how}</div>}
        {b.note && <div className="text-xs text-stone-500">{b.note}</div>}
        <input className="mt-1 w-full max-w-56 rounded-md border border-stone-200 px-2 py-0.5 text-xs" placeholder="예약번호" value={b.ref ?? ''} onChange={(e) => set({ ref: e.target.value || undefined })} />
      </div>
    </li>
  )
}

/** 준비 화면의 예약 달력 */
export function BookingCalendar() {
  const trip = useStore((s) => s.trip)!
  const now = useJapanNow()
  const rows = bookingRows(trip, now.date)
  const left = rows.filter((r) => r.state !== 'done').length
  return (
    <section>
      <h2 className="text-xl font-bold">예약 달력</h2>
      <p className="mt-0.5 text-sm text-stone-500">{rows.length ? `${rows.length}곳 중 ${left}곳 남았어요. 일정을 옮기면 예약 날짜도 따라가요` : '일정 카드의 "📅 예약"으로 예약할 곳을 넣어 두세요'}</p>
      {GROUP.map((g) => {
        const list = rows.filter((r) => r.state === g.state)
        if (!list.length) return null
        return (
          <div key={g.state} className="mt-3">
            <h3 className="text-[13px] font-bold text-stone-600">{g.title}</h3>
            <ul className="mt-1.5 space-y-1.5">
              {list.map((r) => (
                <Row key={r.stop.id} row={r} />
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
