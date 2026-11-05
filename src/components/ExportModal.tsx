import { serializeTrip, useStore } from '../store'
import { usePlans } from '../hooks'
import { buildKml, buildMobileHtml, dayPoints, dayRouteUrls, download } from '../lib/export'
import { fmtDate } from '../lib/time'
import { dayColor } from '../ui'
import { Btn, ExtLink, Modal } from './common'

export function ExportModal() {
  const show = useStore((s) => s.showExport)
  const setShow = useStore((s) => s.setShowExport)
  if (!show) return null
  return (
    <Modal title="폰으로 가져가기 · 내보내기" onClose={() => setShow(false)} wide>
      <ExportBody />
    </Modal>
  )
}

function ExportBody() {
  const trip = useStore((s) => s.trip)!
  const notify = useStore((s) => s.notify)
  const plans = usePlans()
  const pending = plans.reduce((a, p) => a + p.pendingLegs, 0)
  const stamp = trip.startDate.replace(/-/g, '')

  return (
    <div className="space-y-6">
      {pending > 0 && <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">경로 {pending}구간을 아직 계산 중이에요. 끝난 뒤 내보내면 경로선·시간이 더 정확해요.</p>}

      <section className="rounded-2xl border border-stone-200 p-4">
        <h3 className="font-bold">📱 폰용 오프라인 일정표 (추천)</h3>
        <p className="mt-1 text-sm text-stone-600">
          인터넷 없이도 열리는 HTML 한 장. 일자별 시간표, 영업시간, 내비용 전화번호, 장소마다 <b>구글맵 길찾기 버튼</b>이 들어 있어요.
        </p>
        <ol className="mt-2 list-decimal pl-5 text-[13px] text-stone-500">
          <li>아래 버튼으로 받은 파일을 아이폰에 AirDrop(또는 카톡 나에게 보내기)</li>
          <li>"파일" 앱에 저장 → 탭해서 열기 (Safari로 열면 홈 화면에 추가도 가능)</li>
        </ol>
        <Btn variant="primary" className="mt-3" onClick={() => download(`홋카이도-일정-${stamp}.html`, buildMobileHtml(trip, plans), 'text/html')}>
          모바일 일정표 받기
        </Btn>
      </section>

      <section className="rounded-2xl border border-stone-200 p-4">
        <h3 className="font-bold">🗺️ 구글 My Maps 로 가져오기 (KML)</h3>
        <p className="mt-1 text-sm text-stone-600">
          구글맵 앱의 <b>저장됨 → 지도</b>에서 일정 핀과 경로선을 볼 수 있어요. 하루씩 레이어로 넣으면 날짜별로 켜고 끌 수 있어요.
        </p>
        <ol className="mt-2 list-decimal pl-5 text-[13px] text-stone-500">
          <li>
            <ExtLink href="https://www.google.com/maps/d/">mymaps.google.com</ExtLink> → 새 지도 만들기
          </li>
          <li>레이어의 "가져오기" → KML 파일 선택 (날짜별 파일이면 레이어 추가 후 반복, 최대 10개)</li>
          <li>폰 구글맵 앱 → 저장됨 → 지도 에서 열기</li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={() => download(`hokkaido-${stamp}-전체.kml`, buildKml(trip, plans), 'application/vnd.google-earth.kml+xml')}>전체 한 파일</Btn>
          {plans.map((p) => (
            <Btn key={p.day.id} onClick={() => download(`hokkaido-${stamp}-D${p.index + 1}.kml`, buildKml(trip, plans, p.index), 'application/vnd.google-earth.kml+xml')}>
              <span className="h-2 w-2 rounded-full" style={{ background: dayColor(p.index) }} />D{p.index + 1}
            </Btn>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 p-4">
        <h3 className="font-bold">🔗 일자별 구글맵 경로 링크</h3>
        <p className="mt-1 text-sm text-stone-600">폰에서 누르면 구글맵 앱이 그날 경유지를 모두 넣은 경로로 열려요. 카톡으로 서로 공유하기 좋아요.</p>
        <ul className="mt-3 space-y-1.5">
          {plans.map((p) => {
            const urls = dayRouteUrls(dayPoints(p))
            return (
              <li key={p.day.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-32 shrink-0 font-semibold">
                  <span style={{ color: dayColor(p.index) }}>D{p.index + 1}</span> {fmtDate(p.date)}
                </span>
                {urls.length === 0 && <span className="text-stone-400">장소 2곳 이상 필요</span>}
                {urls.map((u) => (
                  <span key={u.url} className="flex gap-1">
                    <ExtLink href={u.url} className="rounded-lg border border-stone-300 px-2 py-0.5 text-xs font-semibold">
                      열기 {u.label !== '전체' && u.label}
                    </ExtLink>
                    <button className="rounded-lg border border-stone-300 px-2 py-0.5 text-xs" onClick={() => (navigator.clipboard.writeText(u.url), notify('링크 복사했어요'))}>
                      복사
                    </button>
                  </span>
                ))}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="flex items-center justify-between rounded-2xl border border-stone-200 p-4">
        <div>
          <h3 className="font-bold">💾 전체 데이터 백업 (JSON)</h3>
          <p className="text-sm text-stone-600">다른 컴퓨터로 옮기거나 버전별로 보관할 때.</p>
        </div>
        <Btn onClick={() => download(`hokkaido-trip-${new Date().toISOString().slice(0, 10)}.json`, serializeTrip(), 'application/json')}>받기</Btn>
      </section>
    </div>
  )
}
