import { useState } from 'react'
import { useStore } from '../store'
import { useGoogle, usePlans } from '../hooks'
import type { Place, PlaceKind } from '../types'
import { fromSimpleWeek, toSimpleWeek, weekLines, type SimpleWeek } from '../lib/hours'
import { placeUrl } from '../lib/export'
import { verifyPlace } from '../lib/verify'
import { fmtDate, fmtHM, parseHM, WEEKDAYS_KO } from '../lib/time'
import { deletePlace, updatePlace } from '../actions'
import { dayColor, KIND_ICON, KIND_LABEL } from '../ui'
import { Btn, cx, ExtLink } from './common'
import { PlaceSearch } from './PlaceSearch'
import { ParkingSection } from './ParkingInfo'

export function PlaceDrawer() {
  const id = useStore((s) => s.openPlaceId)
  const trip = useStore((s) => s.trip)
  const openPlace = useStore((s) => s.openPlace)
  const place = id ? trip?.places[id] : undefined
  if (!place) return null
  return (
    <div className="fixed inset-y-0 right-0 z-[900] flex w-full max-w-[440px] flex-col border-l border-stone-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-stone-200 px-5 py-3">
        <span className="text-xl">{KIND_ICON[place.kind]}</span>
        <input
          className="min-w-0 flex-1 rounded-md px-1 text-lg font-bold outline-none hover:bg-stone-50 focus:bg-stone-50"
          value={place.name}
          onChange={(e) => updatePlace(place.id, { name: e.target.value })}
        />
        <button className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100" onClick={() => openPlace(undefined)}>
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <PlaceBody key={place.id} place={place} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-500">{label}</span>
      {children}
    </label>
  )
}

const input = 'w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm'

function PlaceBody({ place }: { place: Place }) {
  const plans = usePlans()
  const google = useGoogle()
  const notify = useStore((s) => s.notify)
  const selectDay = useStore((s) => s.selectDay)
  const openPlace = useStore((s) => s.openPlace)
  const [busy, setBusy] = useState(false)
  const [editHours, setEditHours] = useState(false)
  const [relink, setRelink] = useState(false)
  const visits = plans.flatMap((p) =>
    [...p.stops.filter((s) => s.place?.id === place.id).map((s) => ({ p, arrive: s.arrive, lodging: false })), ...(p.lodging?.id === place.id ? [{ p, arrive: p.end, lodging: true }] : [])],
  )
  const visitDays = new Set(visits.map((v) => v.p.weekday))

  async function verify() {
    setBusy(true)
    try {
      const r = await verifyPlace(place)
      notify(r.ok ? '구글 정보로 최신화했어요' : r.message)
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 일정 안에서 */}
      {visits.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visits.map((v, i) => (
            <button
              key={i}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-white"
              style={{ background: dayColor(v.p.index) }}
              onClick={() => (selectDay(v.p.day.id), openPlace(undefined))}
            >
              D{v.p.index + 1} {fmtDate(v.p.date)} {v.lodging ? '숙박' : fmtHM(v.arrive) + ' 도착'}
            </button>
          ))}
        </div>
      )}

      {/* 구글 */}
      <section className="rounded-xl border border-stone-200 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">구글 정보</div>
          <div className="flex gap-1.5">
            <ExtLink href={placeUrl(place)} className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold">
              구글맵에서 열기 ↗
            </ExtLink>
            {google && (
              <Btn className="px-2 py-1 text-xs" onClick={verify} disabled={busy}>
                {busy ? '확인 중…' : place.googlePlaceId ? '↻ 다시 확인' : '✓ 구글로 확인'}
              </Btn>
            )}
          </div>
        </div>
        {place.matchWarning && <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">⚠️ {place.matchWarning}</div>}
        <dl className="mt-2 space-y-1 text-[13px]">
          <Row k="상태">
            {place.businessStatus === 'OPERATIONAL' ? (
              <span className="text-emerald-700">● 영업 중</span>
            ) : place.businessStatus === 'CLOSED_TEMPORARILY' ? (
              <span className="text-orange-700">● 임시 휴업</span>
            ) : place.businessStatus === 'CLOSED_PERMANENTLY' ? (
              <span className="text-red-700">● 폐업</span>
            ) : (
              <span className="text-stone-400">{google ? '아직 확인 안 함' : '구글 키 연결 후 확인 가능'}</span>
            )}
          </Row>
          {place.googleName && <Row k="구글 이름">{place.googleName}</Row>}
          {place.verifiedAt && <Row k="확인일">{new Date(place.verifiedAt).toLocaleString('ko-KR')}</Row>}
          {place.address && <Row k="주소">{place.address}</Row>}
          {place.rating && (
            <Row k="평점">
              ★ {place.rating.toFixed(1)} ({place.ratingCount?.toLocaleString()}개)
            </Row>
          )}
          {place.website && (
            <Row k="웹사이트">
              <ExtLink href={place.website} className="break-all">
                {place.website.replace(/^https?:\/\//, '').slice(0, 40)}
              </ExtLink>
            </Row>
          )}
        </dl>
        {google && (
          <div className="mt-2">
            {relink ? (
              <PlaceSearch
                autoFocus
                placeholder="정확한 구글 장소 검색해서 연결"
                onPick={(p) => {
                  updatePlace(place.id, {
                    googlePlaceId: p.googlePlaceId,
                    googleMapsUri: p.googleMapsUri,
                    location: p.location,
                    address: p.address,
                    businessStatus: p.businessStatus,
                    hours: p.hours ?? place.hours,
                    phone: p.phone ?? place.phone,
                    rating: p.rating,
                    ratingCount: p.ratingCount,
                    website: p.website,
                    verifiedAt: new Date().toISOString(),
                    matchWarning: undefined,
                  })
                  setRelink(false)
                  notify('구글 장소를 연결했어요')
                }}
              />
            ) : (
              <button className="text-xs text-stone-500 hover:underline" onClick={() => setRelink(true)}>
                다른 구글 장소로 연결하기
              </button>
            )}
          </div>
        )}
      </section>

      {/* 영업시간 */}
      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-sm font-semibold">
            영업시간{' '}
            <span className="text-xs font-normal text-stone-400">
              {place.alwaysOpen ? '' : place.hours?.source === 'google' ? '· 구글' : place.hours?.source === 'curated' ? '· 웹 정보(재확인 필요)' : place.hours ? '· 직접 입력' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" className="accent-violet-600" checked={!!place.alwaysOpen} onChange={(e) => updatePlace(place.id, { alwaysOpen: e.target.checked || undefined })} />
              상시 개방(야외)
            </label>
            {!place.alwaysOpen && (
              <button className="text-violet-700 hover:underline" onClick={() => setEditHours(!editHours)}>
                {editHours ? '닫기' : '직접 편집'}
              </button>
            )}
          </div>
        </div>
        {editHours && !place.alwaysOpen ? (
          <HoursEditor place={place} onDone={() => setEditHours(false)} />
        ) : (
          <table className="w-full overflow-hidden rounded-xl border border-stone-200 text-[13px]">
            <tbody>
              {weekLines(place).map((l) => (
                <tr key={l.weekday} className={cx('border-b border-stone-100 last:border-0', visitDays.has(l.weekday) && 'bg-violet-50 font-semibold')}>
                  <td className={cx('w-12 px-3 py-1.5', l.weekday === 0 && 'text-red-600', l.weekday === 6 && 'text-blue-600')}>{l.label}</td>
                  <td className="px-2 py-1.5">{l.text}</td>
                  <td className="w-14 px-2 text-right text-[11px] text-violet-700">{visitDays.has(l.weekday) ? '방문일' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {place.hours?.note && <p className="mt-1.5 text-xs text-stone-500">※ {place.hours.note}</p>}
        <p className="mt-1.5 text-xs text-stone-400">구글 영업시간은 '평상시' 기준이에요. 계절 운영·임시휴무는 출발 1~2주 전에 다시 확인하세요.</p>
      </section>

      <ParkingSection place={place} />

      {/* 내비 */}
      <section className="grid grid-cols-2 gap-3">
        <Field label="전화번호 (렌터카 내비 검색용)">
          <div className="flex gap-1">
            <input className={input} value={place.phone ?? ''} placeholder="0167-39-3939" onChange={(e) => updatePlace(place.id, { phone: e.target.value || undefined })} />
            {place.phone && (
              <button className="rounded-lg border border-stone-300 px-2 text-xs" onClick={() => (navigator.clipboard.writeText(place.phone!), notify('복사했어요'))}>
                복사
              </button>
            )}
          </div>
        </Field>
        <Field label="맵코드 (MAPCODE)">
          <input className={input} value={place.mapcode ?? ''} placeholder="예: 123 456 789*12" onChange={(e) => updatePlace(place.id, { mapcode: e.target.value || undefined })} />
        </Field>
      </section>
      <p className="-mt-3 text-xs text-stone-400">
        일본 렌터카 내비는 전화번호나 맵코드 입력이 가장 정확해요. 전화번호가 없는 야외 명소는 맵코드를 적어두세요 (렌터카 회사 안내 책자·관광 안내 사이트에 나와 있어요).
      </p>

      {/* 기본 */}
      <section className="grid grid-cols-2 gap-3">
        <Field label="현지 이름">
          <input className={input} value={place.nameLocal ?? ''} onChange={(e) => updatePlace(place.id, { nameLocal: e.target.value || undefined })} />
        </Field>
        <Field label="종류">
          <select className={input} value={place.kind} onChange={(e) => updatePlace(place.id, { kind: e.target.value as PlaceKind })}>
            {(Object.keys(KIND_LABEL) as PlaceKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_ICON[k]} {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="기본 체류시간(분)">
          <input
            type="number"
            className={input}
            value={place.defaultStay ?? ''}
            onChange={(e) => updatePlace(place.id, { defaultStay: e.target.value ? Number(e.target.value) : undefined })}
          />
        </Field>
        <Field label="좌표">
          <div className="truncate py-1.5 text-xs text-stone-500 tabular-nums">
            {place.location.lat.toFixed(5)}, {place.location.lng.toFixed(5)}
          </div>
        </Field>
      </section>

      {(place.season || place.tips) && (
        <section className="space-y-2">
          {place.season && <div className="rounded-xl bg-violet-50 px-3 py-2 text-[13px] leading-relaxed text-violet-950">🌸 {place.season}</div>}
          {place.tips && <div className="rounded-xl bg-stone-50 px-3 py-2 text-[13px] leading-relaxed text-stone-700">💡 {place.tips}</div>}
        </section>
      )}

      <Field label="메모">
        <textarea className={input} rows={3} value={place.note ?? ''} onChange={(e) => updatePlace(place.id, { note: e.target.value || undefined })} />
      </Field>

      <div className="border-t border-stone-200 pt-4">
        <button
          className="text-sm text-red-600 hover:underline"
          onClick={() => confirm(`"${place.name}"을(를) 완전히 삭제할까요? 일정에서도 빠져요.`) && deletePlace(place.id)}
        >
          장소 삭제
        </button>
      </div>
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-stone-500">{k}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

function HoursEditor({ place, onDone }: { place: Place; onDone: () => void }) {
  const [week, setWeek] = useState<SimpleWeek>(() => toSimpleWeek(place.hours))
  const [note, setNote] = useState(place.hours?.note ?? '')
  const order = [1, 2, 3, 4, 5, 6, 0]
  const hm = (m: number) => fmtHM(m % 1440).replace('익일 ', '')
  const set = (d: number, v: SimpleWeek[number]) => setWeek((w) => w.map((x, i) => (i === d ? v : x)))
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="space-y-1.5">
        {order.map((d) => {
          const v = week[d]
          return (
            <div key={d} className="flex items-center gap-2 text-sm">
              <span className="w-6 font-medium">{WEEKDAYS_KO[d]}</span>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" className="accent-violet-600" checked={!v} onChange={(e) => set(d, e.target.checked ? null : { open: 540, close: 1020 })} />
                휴무
              </label>
              {v && (
                <>
                  <input type="time" className="rounded border border-stone-300 px-1 text-xs" value={hm(v.open)} onChange={(e) => set(d, { ...v, open: parseHM(e.target.value) ?? v.open })} />
                  <span>–</span>
                  <input
                    type="time"
                    className="rounded border border-stone-300 px-1 text-xs"
                    value={hm(v.close)}
                    onChange={(e) => {
                      const c = parseHM(e.target.value) ?? v.close
                      set(d, { ...v, close: c <= v.open ? c + 1440 : c })
                    }}
                  />
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          className="text-xs text-violet-700 hover:underline"
          onClick={() => {
            const mon = week[1] ?? { open: 540, close: 1020 }
            setWeek(week.map(() => ({ ...mon })))
          }}
        >
          월요일 시간을 매일로 복사
        </button>
      </div>
      <input className="mt-2 w-full rounded-lg border border-stone-300 px-2 py-1 text-xs" placeholder="메모 (예: 최종 입장 16:00, 4~10월만 운영)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mt-2 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onDone}>
          취소
        </Btn>
        <Btn
          variant="primary"
          onClick={() => {
            updatePlace(place.id, { hours: fromSimpleWeek(week, note || undefined), alwaysOpen: undefined })
            onDone()
          }}
        >
          저장
        </Btn>
      </div>
    </div>
  )
}
