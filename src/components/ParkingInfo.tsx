import type { Parking, ParkingStatus, Place } from '../types'
import { updatePlace } from '../actions'
import { cx, ExtLink } from './common'

export const PARKING_LABEL: Record<ParkingStatus, string> = {
  free: '무료 주차',
  paid: '유료 주차',
  nearby: '근처 유료',
  none: '주차 불가',
}

const CHIP: Record<ParkingStatus, string> = {
  free: 'bg-emerald-50 text-emerald-800',
  paid: 'bg-sky-50 text-sky-800',
  nearby: 'bg-amber-50 text-amber-900',
  none: 'bg-red-50 text-red-700',
}

const SOURCE_LABEL: Record<Parking['source'], string> = {
  official: '공식 안내',
  web: '여행 사이트·안내 글',
  google: '구글 표시 (요금 정보 없음)',
  estimate: '주변 시세로 추정',
  manual: '직접 입력',
}

/** 일정 카드의 작은 표시. 차로 가지 않는 곳은 흐리게 보여준다 */
export function ParkingChip({ place, byCar, onClick }: { place: Place; byCar: boolean; onClick: () => void }) {
  const p = place.parking
  const label = p ? PARKING_LABEL[p.status] : '주차 미확인'
  return (
    <button
      className={cx('max-w-full truncate rounded-md px-1.5 py-0.5 text-left hover:ring-1 hover:ring-stone-300', p ? CHIP[p.status] : 'bg-stone-100 text-stone-500', !byCar && 'opacity-60')}
      title={byCar ? '주차 정보 보기' : '걸어서 또는 다른 수단으로 가는 곳이라 차를 대지 않아요'}
      onClick={onClick}
    >
      🅿️ {label}
      {p?.fee ? ` · ${p.fee}` : p && p.status !== 'free' && p.status !== 'none' ? ' · 요금 미확인' : ''}
    </button>
  )
}

/** 장소 상세의 주차 칸. 어디서 나온 정보인지 함께 보여주고 직접 고칠 수 있다 */
export function ParkingSection({ place }: { place: Place }) {
  const p = place.parking
  const set = (patch: Partial<Parking>) => updatePlace(place.id, { parking: { status: 'paid', ...p, ...patch, source: 'manual', url: undefined } })
  return (
    <section>
      <div className="mb-1.5 text-sm font-semibold">
        주차 <span className="text-xs font-normal text-stone-400">{p ? `· ${SOURCE_LABEL[p.source]}` : '· 아직 모름'}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PARKING_LABEL) as ParkingStatus[]).map((st) => (
          <button
            key={st}
            className={cx('rounded-lg border px-2 py-1 text-xs font-semibold', p?.status === st ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50')}
            onClick={() => set({ status: st })}
          >
            {PARKING_LABEL[st]}
          </button>
        ))}
      </div>
      {p && (
        <div className="mt-2 space-y-1.5">
          <input
            className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm placeholder:text-stone-400"
            placeholder="대략 요금 (예: 60분 ¥300, 하루 최대 ¥1,000)"
            value={p.fee ?? ''}
            onChange={(e) => set({ fee: e.target.value || undefined })}
          />
          <textarea
            className="field-sizing-content w-full resize-none rounded-lg border border-stone-300 px-2.5 py-1.5 text-[13px] leading-snug placeholder:text-stone-400"
            placeholder="메모 (예: 숙박객 무료, 높이 2.2m 제한)"
            rows={1}
            value={p.note ?? ''}
            onChange={(e) => set({ note: e.target.value || undefined })}
          />
          {p.url && (
            <ExtLink href={p.url} className="block truncate text-xs text-violet-700">
              출처 보기 ↗
            </ExtLink>
          )}
        </div>
      )}
      <p className="mt-1.5 text-xs text-stone-400">요금은 조사 시점의 대략치예요. 현지 표지판과 다를 수 있어요.</p>
    </section>
  )
}
