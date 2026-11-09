import { useCallback, useEffect, useMemo, useState } from 'react'
import { applyPreview, closePreview, getRevisions, liveTrip, openPreview, useStore } from '../store'
import { HISTORY_PAGE, type HistoryEntry, type VersionMeta } from '../lib/backend'
import { describeChanges, historyLabel, summarizePlans, tripFingerprint, type VersionSummary } from '../lib/revisions'
import type { DayPlan } from '../lib/schedule'
import { fmtDur, uid } from '../lib/time'
import { Btn, cx, Menu, MenuItem, Modal } from './common'

const fmtWhen = (iso: string) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

function SummaryLines({ s }: { s: VersionSummary }) {
  return (
    <div className="mt-1.5 space-y-0.5 text-[12.5px] text-stone-600">
      <div>🛏️ {s.hotels.map((h) => `${h.name} ${h.nights}박`).join(' · ')}</div>
      <div>
        🚗 총 {fmtDur(s.driveMin)} · 하루 최대 {fmtDur(s.maxDriveMin)} · 운전 없는 날 {s.carFreeDays}일{s.tollYen != null && ` · 톨비 약 ¥${s.tollYen.toLocaleString()}`}
      </div>
    </div>
  )
}

/** 오프라인이거나 예전 버전을 볼 때 화면 맨 위에 항상 보이는 안내 */
export function ReadOnlyBanner() {
  const preview = useStore((s) => s.preview)
  const offlineSince = useStore((s) => s.offlineSince)
  const offlineReason = useStore((s) => s.offlineReason)
  const reconnect = useStore((s) => s.reconnect)
  const trip = useStore((s) => s.trip)
  const changes = useMemo(() => {
    const live = liveTrip()
    return preview && trip && live ? describeChanges(live, trip) : []
  }, [preview, trip])

  if (offlineReason === 'access') {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-950">
        <span className="min-w-0 flex-1 basis-56">
          <b>접속 토큰이 막혔어요.</b> {fmtWhen(offlineSince ?? '')}에 받은 일정을 보기 전용으로 보여주고 있어요.
        </span>
        <Btn className="px-2.5 py-1 text-xs" onClick={reconnect}>
          다시 연결하기
        </Btn>
      </div>
    )
  }
  if (offlineSince) {
    return (
      <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-950">
        <b>인터넷이 끊겨 있어요.</b> {fmtWhen(offlineSince)}에 받은 일정을 보여주고 있고, 지금은 고칠 수 없어요. 연결되면 자동으로 최신 일정으로 바뀌어요.
      </div>
    )
  }
  if (!preview) return null
  return (
    <div className="shrink-0 border-b border-violet-300 bg-violet-50 px-4 py-2 text-[13px] text-violet-950">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1 basis-56">
          <b>{preview.label}</b> 보는 중 · 여기서는 고칠 수 없어요
        </div>
        <Btn
          variant="primary"
          className="px-2.5 py-1 text-xs"
          onClick={() => {
            if (confirm(`지금 일정을 "${preview.label}"(으)로 바꿀까요? 지금 일정은 변경 기록에 남아 있어요.`)) applyPreview()
          }}
        >
          이 버전으로 바꾸기
        </Btn>
        <Btn className="px-2.5 py-1 text-xs" onClick={closePreview}>
          지금 일정으로 돌아가기
        </Btn>
      </div>
      {changes.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-medium">바꾸면 달라지는 점 {changes.length}건</summary>
          <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-4 text-xs leading-relaxed">
            {changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </details>
      ) : (
        <div className="mt-1 text-xs">지금 일정과 같아요.</div>
      )}
    </div>
  )
}

export function VersionsModal({ plans }: { plans: DayPlan[] }) {
  const show = useStore((s) => s.showVersions)
  const setShow = useStore((s) => s.setShowVersions)
  if (!show) return null
  return <VersionsBody plans={plans} onClose={() => setShow(false)} />
}

function VersionsBody({ plans, onClose }: { plans: DayPlan[]; onClose: () => void }) {
  const notify = useStore((s) => s.notify)
  const preview = useStore((s) => s.preview)
  const offline = useStore((s) => !!s.offlineSince)
  const saveStatus = useStore((s) => s.saveStatus)
  const revisions = getRevisions()
  const [versions, setVersions] = useState<VersionMeta[]>()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [name, setName] = useState('')

  const live = liveTrip()
  const liveFingerprint = useMemo(() => (live ? tripFingerprint(live) : ''), [live])

  const reloadVersions = useCallback(async () => {
    if (!revisions) return
    setVersions(await revisions.versions())
  }, [revisions])

  const loadHistory = useCallback(
    async (p: number) => {
      if (!revisions) return
      const list = await revisions.history(p)
      setHistory((old) => (p === 1 ? list : [...old, ...list]))
      setMore(list.length === HISTORY_PAGE)
      setPage(p)
    },
    [revisions],
  )

  useEffect(() => {
    if (offline || !revisions) return
    Promise.all([reloadVersions(), loadHistory(1)]).catch((e) => setError((e as Error).message))
  }, [offline, revisions, reloadVersions, loadHistory])

  async function run(key: string, job: () => Promise<void>) {
    setBusy(key)
    setError(undefined)
    try {
      await job()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  const openVersion = (v: VersionMeta) =>
    run(v.id, async () => {
      const trip = await revisions!.readVersion(v.id)
      if (!trip) throw new Error('이 버전 파일을 찾지 못했어요')
      await openPreview(trip, { label: v.name, kind: 'version', id: v.id })
    })

  const openHistory = (h: HistoryEntry) =>
    run(h.sha, async () => {
      const trip = await revisions!.tripAt(h.sha)
      if (!trip) throw new Error('이 시점의 일정을 찾지 못했어요')
      await openPreview(trip, { label: `${fmtWhen(h.date)} 기록`, kind: 'history', id: h.sha })
    })

  const saveCurrent = () =>
    run('save', async () => {
      const trimmed = name.trim()
      if (!trimmed || !live) return
      const meta: VersionMeta = {
        id: `v-${uid()}`,
        name: trimmed,
        createdAt: new Date().toISOString(),
        fingerprint: liveFingerprint,
        summary: summarizePlans(plans),
      }
      await revisions!.saveVersion(meta, live)
      setName('')
      await reloadVersions()
      notify(`"${trimmed}" 버전으로 저장했어요`)
    })

  const rename = (v: VersionMeta) => {
    const next = prompt('버전 이름', v.name)?.trim()
    if (!next || next === v.name) return
    void run(v.id, async () => {
      await revisions!.updateVersion(v.id, { name: next })
      await reloadVersions()
    })
  }

  const remove = (v: VersionMeta) => {
    if (!confirm(`"${v.name}" 버전을 삭제할까요?`)) return
    void run(v.id, async () => {
      await revisions!.deleteVersion(v.id)
      await reloadVersions()
    })
  }

  if (!revisions || offline) {
    return (
      <Modal title="🕘 버전" onClose={onClose}>
        <p className="text-sm text-stone-600">{offline ? '인터넷이 끊겨 있어 버전 기록을 불러올 수 없어요. 연결되면 다시 열어주세요.' : '버전 기록은 웹 버전에서 쓸 수 있어요. 지금은 맥 전용 사본이에요.'}</p>
      </Modal>
    )
  }

  return (
    <Modal title="🕘 버전" onClose={onClose} wide>
      <div className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        <section>
          <h3 className="text-sm font-bold text-stone-800">저장된 버전</h3>
          <p className="mt-0.5 text-xs text-stone-500">눌러서 전체 일정과 지도를 그대로 볼 수 있어요. 마음에 들면 지금 일정으로 바꾸면 돼요.</p>
          {!versions && <p className="mt-2 text-sm text-stone-400">불러오는 중…</p>}
          {versions?.length === 0 && <p className="mt-2 rounded-xl border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-500">아직 저장된 버전이 없어요.</p>}
          <ul className="mt-2 space-y-2">
            {versions?.map((v) => {
              const current = !preview && v.fingerprint === liveFingerprint
              const viewing = preview?.kind === 'version' && preview.id === v.id
              return (
                <li key={v.id} className={cx('rounded-xl border px-3 py-2.5', current ? 'border-emerald-300 bg-emerald-50/50' : viewing ? 'border-violet-300 bg-violet-50/60' : 'border-stone-200 bg-white')}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {v.name}
                        {current && <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[10.5px] font-medium text-emerald-800">지금 일정</span>}
                        {viewing && <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[10.5px] font-medium text-violet-800">보는 중</span>}
                      </div>
                      {v.note && <div className="mt-0.5 text-xs text-stone-600">{v.note}</div>}
                      {v.summary && <SummaryLines s={v.summary} />}
                      <div className="mt-1 text-[11.5px] text-stone-400">{fmtWhen(v.createdAt)} 저장</div>
                    </div>
                    <Btn className="shrink-0 px-2.5 py-1 text-xs" disabled={!!busy} onClick={() => void openVersion(v)}>
                      {busy === v.id ? '여는 중…' : '보기'}
                    </Btn>
                    <Menu label="⋯">
                      {(close) => (
                        <>
                          <MenuItem onClick={() => (close(), rename(v))}>이름 바꾸기</MenuItem>
                          <MenuItem danger onClick={() => (close(), remove(v))}>
                            삭제
                          </MenuItem>
                        </>
                      )}
                    </Menu>
                  </div>
                </li>
              )
            })}
          </ul>
          {!preview && (
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                void saveCurrent()
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm placeholder:text-stone-400"
                placeholder="지금 일정에 이름 붙여 보관 (예: 예약 전 최종안)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Btn className="shrink-0 px-2.5 py-1 text-xs" disabled={!name.trim() || !!busy}>
                {busy === 'save' ? '저장 중…' : '버전으로 저장'}
              </Btn>
            </form>
          )}
        </section>

        <section>
          <h3 className="text-sm font-bold text-stone-800">변경 기록</h3>
          <p className="mt-0.5 text-xs text-stone-500">일정이나 장소를 바꿀 때마다 자동으로 남아요{saveStatus === 'dirty' || saveStatus === 'saving' ? '. 방금 수정은 저장되면 나타나요' : ''}.</p>
          <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {history.map((h, i) => {
              const viewing = preview?.kind === 'history' && preview.id === h.sha
              return (
                <li key={h.sha}>
                  <button className={cx('flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-stone-50 disabled:opacity-60', viewing && 'bg-violet-50/60')} disabled={!!busy} onClick={() => void openHistory(h)}>
                    <span className="w-24 shrink-0 text-xs text-stone-500 tabular-nums">{fmtWhen(h.date)}</span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug">
                      {historyLabel(h.message)}
                      {i === 0 && !preview && <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[10.5px] font-medium text-emerald-800">최신</span>}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-violet-700">{busy === h.sha ? '여는 중…' : '보기'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {more && (
            <button className="mt-2 w-full rounded-lg border border-stone-200 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50" disabled={!!busy} onClick={() => void run('more', () => loadHistory(page + 1))}>
              {busy === 'more' ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </section>
      </div>
    </Modal>
  )
}
