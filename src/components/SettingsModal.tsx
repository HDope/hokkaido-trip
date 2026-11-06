import { useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { serializeTrip, useStore } from '../store'
import type { Settings, Trip } from '../types'
import { readCloudConfig, shareLink } from '../lib/backend'
import { testKey } from '../lib/google'
import { download } from '../lib/export'
import { createSeedTrip } from '../seed'
import { travelersOf } from '../lib/people'
import { Btn, cx, ExtLink, Modal } from './common'

const WEB_URL = 'https://hdope.github.io/hokkaido-trip/'

/** 다른 기기·다른 사람이 같은 일정을 열 연결 링크 */
function OtherDevices() {
  const notify = useStore((s) => s.notify)
  const kind = useStore((s) => s.backendKind)
  const [reveal, setReveal] = useState(false)
  const cloud = readCloudConfig()
  const link = cloud ? shareLink(cloud) : ''
  const svg = useMemo(() => {
    if (!link) return ''
    const qr = qrcode(0, 'M')
    qr.addData(link)
    qr.make()
    return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true })
  }, [link])
  if (kind !== 'cloud' || !cloud) {
    return (
      <section>
        <h3 className="font-bold">다른 기기에서 열기</h3>
        <p className="mt-1 text-sm text-stone-600">
          지금 화면은 맥에서 띄운 개발용이에요. 어디서나 같은 일정을 보려면 웹 버전을 쓰세요: <ExtLink href={WEB_URL}>{WEB_URL}</ExtLink>
        </p>
      </section>
    )
  }
  return (
    <section>
      <h3 className="font-bold">다른 기기·예비신부와 함께 보기</h3>
      <p className="mt-1 text-sm text-stone-600">이 링크를 한 번 열면 그 기기에서는 다음부터 그냥 열려요. 일정을 보고 고칠 권한이 들어 있으니 두 분만 쓰세요.</p>
      {reveal ? (
        <div className="mt-2 flex flex-wrap items-start gap-4">
          <div className="h-32 w-32 shrink-0 rounded-lg border border-stone-200 bg-white" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="min-w-56 flex-1">
            <code className="block rounded bg-stone-100 px-1.5 py-1 text-[11px] break-all">{link}</code>
            <Btn className="mt-2 px-2.5 py-1 text-xs" onClick={() => (navigator.clipboard?.writeText(link), notify('링크를 복사했어요'))}>
              링크 복사
            </Btn>
          </div>
        </div>
      ) : (
        <Btn className="mt-2 px-2.5 py-1 text-xs" onClick={() => setReveal(true)}>
          연결 링크·QR 보기
        </Btn>
      )}
      <p className="mt-2 text-xs text-stone-500">링크가 새면 GitHub에서 토큰을 지우면 바로 막혀요. 일정은 저장할 때마다 이력이 남아요.</p>
    </section>
  )
}

export function SettingsModal() {
  const show = useStore((s) => s.showSettings)
  const setShow = useStore((s) => s.setShowSettings)
  if (!show) return null
  return (
    <Modal title="설정" onClose={() => setShow(false)} wide>
      <SettingsBody />
    </Modal>
  )
}

function SettingsBody() {
  const apiKey = useStore((s) => s.apiKey)
  const setApiKey = useStore((s) => s.setApiKey)
  const googleStatus = useStore((s) => s.googleStatus)
  const googleMessage = useStore((s) => s.googleMessage)
  const setGoogleStatus = useStore((s) => s.setGoogleStatus)
  const trip = useStore((s) => s.trip)!
  const mutate = useStore((s) => s.mutate)
  const clearRoutes = useStore((s) => s.clearRoutes)
  const replaceTrip = useStore((s) => s.replaceTrip)
  const notify = useStore((s) => s.notify)
  const [draft, setDraft] = useState(apiKey)
  const [reveal, setReveal] = useState(false)
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<{ api: string; ok: boolean; message: string }[]>()
  const [guide, setGuide] = useState(!apiKey)
  const file = useRef<HTMLInputElement>(null)

  async function saveAndTest() {
    const k = draft.trim()
    const changed = k !== apiKey
    setApiKey(k)
    if (!k) {
      setResults(undefined)
      return
    }
    setTesting(true)
    const r = await testKey(k)
    setResults(r)
    setTesting(false)
    const ok = r.every((x) => x.ok)
    const fail = r.find((x) => !x.ok)
    setGoogleStatus(ok ? 'ok' : 'error', fail?.message, fail?.reason)
    if (ok) {
      clearRoutes((l) => l.provider !== 'google') // 무료 경로를 구글 경로로 다시 계산
      notify(changed ? '구글 연동 완료! 지도는 새로고침하면 구글 지도로 바뀌어요' : '정상 동작해요')
    }
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => mutate((t) => void (t.settings[k] = v))

  return (
    <div className="space-y-7">
      <OtherDevices />
      <section>
        <div className="flex items-center gap-2">
          <h3 className="font-bold">구글 지도 연동</h3>
          <span
            className={cx(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              googleStatus === 'ok' && 'bg-emerald-100 text-emerald-800',
              googleStatus === 'unknown' && 'bg-violet-100 text-violet-800',
              googleStatus === 'error' && 'bg-red-100 text-red-700',
              googleStatus === 'none' && 'bg-stone-100 text-stone-600',
            )}
          >
            {{ ok: '연결됨', unknown: '키 입력됨', error: '오류', none: '무료 모드' }[googleStatus]}
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-600">
          키가 있으면 <b>실제 도로 기준 운전시간</b>, <b>요일별 영업시간·휴무</b>, <b>폐업/임시휴업 여부</b>, <b>전화번호</b>를 구글에서 가져와요. 없으면 OpenStreetMap 기반 무료
          대체 서비스를 써요 (Valhalla 경로 ×{trip.settings.freeModeFactor} 보정 — 구글과 대략 ±15% 차이, 영업시간은 직접 입력).
        </p>
        {googleMessage && googleStatus === 'error' && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">⚠️ {googleMessage}</p>}
        <div className="mt-3 flex gap-2">
          <input
            type={reveal ? 'text' : 'password'}
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
            placeholder="AIza..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Btn variant="ghost" onClick={() => setReveal(!reveal)}>
            {reveal ? '숨기기' : '보기'}
          </Btn>
          <Btn variant="primary" onClick={saveAndTest} disabled={testing}>
            {testing ? '확인 중…' : '저장하고 테스트'}
          </Btn>
        </div>
        <p className="mt-1 text-xs text-stone-400">키는 일정 저장소에 함께 저장돼 연결된 다른 기기에도 자동으로 적용돼요.</p>
        {results && (
          <ul className="mt-2 space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.api} className={cx('rounded-lg px-3 py-1.5', r.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800')}>
                {r.ok ? '✅' : '❌'} <b>{r.api}</b> — {r.message}
              </li>
            ))}
            <li className="px-3 text-xs text-stone-500">Maps JavaScript API(지도 표시)는 새로고침 후 지도가 구글로 바뀌면 정상이에요.</li>
          </ul>
        )}

        <button className="mt-3 text-sm font-semibold text-violet-700" onClick={() => setGuide(!guide)}>
          {guide ? '▾' : '▸'} API 키 발급 방법 (10분)
        </button>
        {guide && (
          <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-relaxed">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <ExtLink href="https://console.cloud.google.com/projectcreate">Google Cloud 콘솔</ExtLink>에서 새 프로젝트 만들기 (이름 예: hokkaido-trip)
              </li>
              <li>
                <ExtLink href="https://console.cloud.google.com/billing">결제 계정</ExtLink> 연결 — 카드 등록이 필요하지만 아래 무료 한도 안에서는 청구되지 않아요.
              </li>
              <li>
                API 3개 <b>사용 설정</b>:{' '}
                <ExtLink href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com">Maps JavaScript API</ExtLink>,{' '}
                <ExtLink href="https://console.cloud.google.com/apis/library/places.googleapis.com">Places API (New)</ExtLink>,{' '}
                <ExtLink href="https://console.cloud.google.com/apis/library/routes.googleapis.com">Routes API</ExtLink>
              </li>
              <li>
                <ExtLink href="https://console.cloud.google.com/apis/credentials">사용자 인증 정보</ExtLink> → <b>사용자 인증 정보 만들기 → API 키</b>
              </li>
              <li>
                키 편집 → <b>애플리케이션 제한: 웹사이트</b> → <code className="rounded bg-white px-1">http://localhost:5173/*</code> 와 <code className="rounded bg-white px-1 break-all">https://hdope.github.io/*</code> 추가, <b>API 제한: 위 3개만</b> 선택 (키가 새어도 남이 못 써요)
              </li>
              <li>키를 복사해 위 칸에 붙여넣고 "저장하고 테스트"</li>
            </ol>
            <div className="mt-4 rounded-lg bg-white p-3">
              <div className="mb-1.5 font-semibold">월 무료 한도 (2026년 기준, 이 앱이 쓰는 것)</div>
              <table className="w-full text-[13px]">
                <tbody className="[&_td]:py-0.5">
                  <tr>
                    <td>지도 표시 (Dynamic Maps)</td>
                    <td className="text-right tabular-nums">10,000회</td>
                  </tr>
                  <tr>
                    <td>경로 계산 (Compute Routes Essentials)</td>
                    <td className="text-right tabular-nums">10,000회</td>
                  </tr>
                  <tr>
                    <td>장소 검색 자동완성</td>
                    <td className="text-right tabular-nums">10,000회</td>
                  </tr>
                  <tr>
                    <td>장소 상세 — 영업시간·전화 포함 (Enterprise)</td>
                    <td className="text-right tabular-nums">1,000회</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-stone-500">
                여행 하나 계획하는 데 보통 수백 회 이내예요. 더 안심하려면 콘솔의 <b>할당량</b>에서 Places API 하루 요청 수를 100 정도로 제한하거나, 결제 메뉴에서 <b>예산 알림</b>(예: 1달러)을
                걸어두세요.
              </p>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="font-bold">같이 고르는 사람</h3>
        <p className="mt-1 text-xs text-stone-500">장소 후보의 픽 버튼에 이 이름이 나와요. 이름은 일정 데이터에만 저장돼요.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {travelersOf(trip).map((p, i) => (
            <label key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
              <span>{i + 1}번</span>
              <input
                className="w-32 rounded border border-stone-300 px-2 py-1 text-right"
                value={p.name}
                onChange={(e) =>
                  mutate((t) => {
                    t.settings.travelers = travelersOf(t).map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x))
                  })
                }
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-bold">시간 계산 기준</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <NumField label="운전 구간마다 주차·도보 여유" unit="분" value={trip.settings.parkingBuffer} onChange={(v) => set('parkingBuffer', v)} />
          <NumField label="무료 모드 운전시간 보정" unit="배" step={0.05} value={trip.settings.freeModeFactor} onChange={(v) => set('freeModeFactor', v)} />
          <NumField label="하루 운전 '빡빡함' 경고" unit="분" step={30} value={trip.settings.dailyDriveWarn} onChange={(v) => set('dailyDriveWarn', v)} />
          <NumField label="하루 운전 '너무 김' 경고" unit="분" step={30} value={trip.settings.dailyDriveLimit} onChange={(v) => set('dailyDriveLimit', v)} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-violet-600"
            checked={trip.settings.avoidTolls}
            onChange={(e) => {
              set('avoidTolls', e.target.checked)
              clearRoutes((l) => l.provider === 'google')
            }}
          />
          유료도로(고속도로) 피하기 <span className="text-xs text-stone-400">— HEP 정액권을 쓸 거면 끄세요</span>
        </label>
      </section>

      <section>
        <h3 className="font-bold">데이터</h3>
        <p className="mt-1 text-sm text-stone-600">
          일정은 자동 저장돼요. 웹 버전은 GitHub 비공개 저장소에 저장되어 수정 이력이 남고, 맥의 개발용 화면은 <code className="rounded bg-stone-100 px-1">data/trip.json</code>에 저장돼요.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={() => download(`hokkaido-trip-${new Date().toISOString().slice(0, 10)}.json`, serializeTrip(), 'application/json')}>💾 JSON 백업 받기</Btn>
          <Btn onClick={() => file.current?.click()}>📂 JSON 불러오기</Btn>
          <input
            ref={file}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const t = JSON.parse(await f.text()) as Trip
                if (!t.days || !t.places) throw new Error('형식이 달라요')
                replaceTrip(t)
                notify('불러왔어요 (되돌리기 가능)')
              } catch (err) {
                notify(`불러오기 실패: ${(err as Error).message}`)
              }
              e.target.value = ''
            }}
          />
          <Btn onClick={() => (clearRoutes(), notify('경로를 다시 계산해요'))}>↻ 경로 전체 재계산</Btn>
          <Btn
            onClick={() => {
              if (confirm('지금 일정을 지우고 추천 일정으로 되돌릴까요? (되돌리기 Ctrl/⌘+Z 가능)')) {
                replaceTrip(createSeedTrip())
                notify('추천 일정으로 초기화했어요')
              }
            }}
          >
            추천 일정으로 초기화
          </Btn>
        </div>
      </section>
    </div>
  )
}

function NumField({ label, unit, value, onChange, step = 1 }: { label: string; unit: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" step={step} className="w-20 rounded border border-stone-300 px-1.5 py-0.5 text-right tabular-nums" value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="text-stone-500">{unit}</span>
      </span>
    </label>
  )
}
