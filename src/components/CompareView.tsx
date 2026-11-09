import { useEffect, useMemo, useState } from 'react'
import { getRevisions, liveTrip, openPreview, useStore } from '../store'
import type { VersionMeta } from '../lib/backend'
import { dayRange, digestTrip, summarizePlans, tripFingerprint, type DigestPlace, type VersionDigest, type VersionSummary } from '../lib/revisions'
import { MEAL_WORD, type DayPlan } from '../lib/schedule'
import { fmtDur } from '../lib/time'
import { KIND_ICON } from '../ui'
import { cx } from './common'

// 저장된 버전과 지금 일정을 나란히 놓고, 어디를 언제 가는지 한눈에 비교한다.
// 버전 파일은 크기 때문에 꼭 필요한 값만 뽑아 브라우저에 남겨 둔다 (인터넷이 끊겨도 비교할 수 있게).

type Column = { id: string; name: string; note?: string; fingerprint?: string; summary?: VersionSummary; digest: VersionDigest; live?: boolean; meta?: VersionMeta }

const LS = 'hk-compare-cache'
const LS_HIDDEN = 'hk-compare-hidden'
const LIVE = 'live'

function readCache(): Column[] {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? '[]') as Column[]
  } catch {
    return []
  }
}

function writeCache(cols: Column[]) {
  try {
    localStorage.setItem(LS, JSON.stringify(cols))
  } catch {
    // 저장 공간이 없어도 화면에는 영향이 없다
  }
}

function readHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_HIDDEN) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

const SECTIONS: { title: string; match: (p: DigestPlace) => boolean }[] = [
  { title: '🛏️ 숙소', match: (p) => p.nights > 0 || p.kind === 'hotel' },
  { title: '⛳ 골프', match: (p) => p.golf },
  { title: '🏞️ 명소·체험', match: (p) => p.kind === 'sight' },
  { title: '♨️ 온천', match: (p) => p.kind === 'onsen' },
  { title: '🛍️ 쇼핑', match: (p) => p.kind === 'shop' },
  { title: '🍜 식당·카페', match: (p) => p.kind === 'food' || p.kind === 'cafe' },
  { title: '📌 기타', match: () => true },
]

const shortVersion = (name: string) => name.split(' · ')[0]

export function CompareView({ plans }: { plans: DayPlan[] }) {
  const trip = useStore((s) => s.trip)
  const preview = useStore((s) => s.preview)
  const openPlace = useStore((s) => s.openPlace)
  const notify = useStore((s) => s.notify)
  const [saved, setSaved] = useState<Column[]>(() => readCache().filter((c) => !c.live))
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(readHidden)
  const [diffOnly, setDiffOnly] = useState(false)
  const [busy, setBusy] = useState<string>()
  const revisions = getRevisions()

  useEffect(() => {
    let stop = false
    async function load() {
      if (!revisions) return setLoading(false)
      try {
        const metas = await revisions.versions()
        const cached = new Map(readCache().map((c) => [c.id, c]))
        const cols = await Promise.all(
          metas.map(async (m): Promise<Column> => {
            const hit = cached.get(m.id)
            if (hit && hit.fingerprint === m.fingerprint && hit.digest.places.length) return { ...hit, name: m.name, note: m.note, summary: m.summary, meta: m }
            const t = await revisions.readVersion(m.id)
            return { id: m.id, name: m.name, note: m.note, fingerprint: m.fingerprint, summary: m.summary, digest: t ? digestTrip(t) : { places: [] }, meta: m }
          }),
        )
        if (stop) return
        setSaved(cols)
        setFailed(false)
        writeCache(cols.map(({ meta, ...c }) => c))
      } catch {
        if (!stop) setFailed(true)
      } finally {
        if (!stop) setLoading(false)
      }
    }
    void load()
    return () => {
      stop = true
    }
  }, [revisions])

  const columns = useMemo(() => {
    const live = preview ? liveTrip() : trip
    if (!live) return saved
    const fp = tripFingerprint(live)
    const same = saved.find((c) => c.fingerprint === fp)
    if (same) return saved.map((c) => (c === same ? { ...c, live: true } : c))
    // 저장된 버전과 다르면 지금 일정을 따로 맨 앞에 둔다. 예전 버전을 보는 중엔 요약을 계산할 수 없어 저장값만 쓴다
    const col: Column = { id: LIVE, name: '지금 일정', fingerprint: fp, summary: preview ? undefined : summarizePlans(plans), digest: digestTrip(live), live: true }
    return [col, ...saved]
  }, [saved, trip, preview, plans])

  const shown = columns.filter((c) => !hidden.has(c.id))

  const rows = useMemo(() => {
    const merged = new Map<string, DigestPlace>()
    for (const c of shown) for (const p of c.digest.places) if (!merged.has(p.key)) merged.set(p.key, p)
    const used = new Set<string>()
    return SECTIONS.map((sec) => {
      const list = [...merged.values()].filter((p) => !used.has(p.key) && sec.match(p))
      for (const p of list) used.add(p.key)
      const cell = (c: Column, key: string) => c.digest.places.find((x) => x.key === key)
      const items = list
        .map((p) => ({ p, cells: shown.map((c) => cell(c, p.key)), inAll: shown.every((c) => cell(c, p.key)) }))
        .filter((r) => !diffOnly || !r.inAll)
        // 어디에나 있는 곳을 먼저, 그다음 앞 버전 순서로
        .sort((a, b) => Number(b.inAll) - Number(a.inAll) || Math.min(...(a.cells.flatMap((x) => x?.days ?? [99]))) - Math.min(...(b.cells.flatMap((x) => x?.days ?? [99]))))
      return { title: sec.title, items }
    }).filter((s) => s.items.length)
  }, [shown, diffOnly])

  const total = new Set(shown.flatMap((c) => c.digest.places.map((p) => p.key))).size
  const common = shown.length ? new Set(shown[0].digest.places.filter((p) => shown.every((c) => c.digest.places.some((x) => x.key === p.key))).map((p) => p.key)).size : 0

  async function open(c: Column) {
    if (!revisions || c.id === LIVE) return
    setBusy(c.id)
    try {
      const t = await revisions.readVersion(c.id)
      if (!t) return notify('이 버전을 찾지 못했어요')
      await openPreview(t, { label: c.name, kind: 'version', id: c.id })
      useStore.getState().setView('day')
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  const toggle = (id: string) =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(LS_HIDDEN, JSON.stringify([...next]))
      } catch {
        // 기억하지 못해도 비교는 된다
      }
      return next
    })

  const firstCol = 'sticky left-0 z-10 w-[132px] max-w-[132px] min-w-[132px] border-r border-stone-200 sm:w-[240px] sm:max-w-[240px] sm:min-w-[240px]'
  const colWidth = 'min-w-[96px] sm:min-w-[132px]'

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">버전 비교</h2>
      {!revisions ? (
        <p className="mt-2 text-sm text-stone-600">저장된 버전은 웹 버전에서만 볼 수 있어요.</p>
      ) : (
        <>
          <p className="mt-0.5 text-[13px] text-stone-500">
            {loading ? '버전을 불러오는 중이에요…' : `전체 ${total}곳 중 ${common}곳이 ${shown.length === 1 ? '이 버전에' : '모든 버전에'} 들어 있어요.`}
            {failed && ' 인터넷이 끊겨 마지막으로 받아 둔 내용을 보여주고 있어요.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {columns.map((c) => (
              <button
                key={c.id}
                className={cx('rounded-lg border px-2.5 py-1 text-xs font-semibold', hidden.has(c.id) ? 'border-stone-200 text-stone-400' : 'border-violet-300 bg-violet-50 text-violet-800')}
                onClick={() => toggle(c.id)}
                title="누르면 비교에서 빼거나 다시 넣어요"
              >
                {hidden.has(c.id) ? '＋ ' : '✓ '}
                {shortVersion(c.name)}
              </button>
            ))}
            <label className="ml-1 flex items-center gap-1.5 text-[13px] text-stone-700">
              <input type="checkbox" className="accent-violet-600" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} />
              다른 곳만 보기
            </label>
          </div>

          {shown.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-stone-200 bg-white">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-stone-200 align-top">
                    <th className={cx(firstCol, 'bg-stone-50 px-3 py-2 text-left text-xs font-semibold text-stone-500')}>장소</th>
                    {shown.map((c) => (
                      <th key={c.id} className={cx(colWidth, 'bg-stone-50 px-2 py-2 text-left align-top font-semibold')}>
                        <div className="text-[13px]">{shortVersion(c.name)}</div>
                        {c.name.includes(' · ') && <div className="text-[11px] font-normal leading-snug text-stone-500">{c.name.split(' · ').slice(1).join(' · ')}</div>}
                        {c.live && <div className="mt-0.5 w-fit rounded bg-emerald-100 px-1 py-0.5 text-[10.5px] font-medium text-emerald-800">지금 일정</div>}
                        {c.id !== LIVE && (
                          <button className="mt-1 block text-[11.5px] font-semibold text-violet-700 hover:underline disabled:opacity-50" disabled={!!busy} onClick={() => void open(c)}>
                            {busy === c.id ? '여는 중…' : '일정 보기'}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <SummaryRow label="총 운전" first={firstCol} cols={shown} value={(s) => fmtDur(s.driveMin)} />
                  <SummaryRow label="하루 최대 운전" first={firstCol} cols={shown} value={(s) => fmtDur(s.maxDriveMin)} />
                  <SummaryRow label="예상 톨비" first={firstCol} cols={shown} value={(s) => (s.tollYen == null ? '–' : `¥${s.tollYen.toLocaleString()}${s.tollUnknown ? ` + 미확인 ${s.tollUnknown}구간` : ''}`)} />
                  <SummaryRow label="운전 없는 날" first={firstCol} cols={shown} value={(s) => `${s.carFreeDays}일`} />
                  {rows.map((sec) => (
                    <SectionRows key={sec.title} title={sec.title} items={sec.items} first={firstCol} span={shown.length} onOpen={(key) => {
                      const id = Object.values(trip?.places ?? {}).find((p) => (p.googlePlaceId ?? p.id) === key)?.id
                      if (id) openPlace(id)
                    }} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !rows.length && <p className="mt-3 text-sm text-stone-500">{diffOnly ? '고른 버전끼리 다른 곳이 없어요.' : '비교할 버전을 골라 주세요.'}</p>}
        </>
      )}
    </div>
  )
}

function SummaryRow({ label, first, cols, value }: { label: string; first: string; cols: Column[]; value: (s: VersionSummary) => string }) {
  return (
    <tr className="border-b border-stone-100">
      <td className={cx(first, 'bg-white px-3 py-1.5 text-xs text-stone-500')}>{label}</td>
      {cols.map((c) => (
        <td key={c.id} className="px-2 py-1.5 font-semibold tabular-nums">
          {c.summary ? value(c.summary) : <span className="font-normal text-stone-400">–</span>}
        </td>
      ))}
    </tr>
  )
}

function SectionRows({ title, items, first, span, onOpen }: { title: string; items: { p: DigestPlace; cells: (DigestPlace | undefined)[]; inAll: boolean }[]; first: string; span: number; onOpen: (key: string) => void }) {
  return (
    <>
      <tr className="border-b border-stone-200 bg-stone-100">
        <td className={cx(first, 'bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700')}>{title}</td>
        <td colSpan={span} className="bg-stone-100" />
      </tr>
      {items.map(({ p, cells, inAll }) => (
        <tr key={p.key} className={cx('border-b border-stone-100 last:border-0', !inAll && 'bg-amber-50/50')}>
          <td className={cx(first, 'px-3 py-1.5', inAll ? 'bg-white' : 'bg-amber-50')}>
            <button className="line-clamp-2 w-full text-left leading-snug hover:text-violet-700" title={p.name} onClick={() => onOpen(p.key)}>
              {KIND_ICON[p.kind]} {p.name}
            </button>
          </td>
          {cells.map((c, i) => (
            <td key={i} className="px-2 py-1.5 tabular-nums">
              {c ? (
                <span>
                  <span className="font-semibold text-stone-800">{dayRange(c.days)}</span>
                  {c.nights > 0 && <span className="text-stone-500"> · {c.nights}박</span>}
                  {c.meals.length > 0 && <span className="text-stone-500"> · {c.meals.map((m) => MEAL_WORD[m]).join('·')}</span>}
                </span>
              ) : (
                <span className="text-stone-300">–</span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
