import { useState } from 'react'
import { useStore } from '../store'
import { uid } from '../lib/time'
import { cx } from './common'

const TIPS: [string, string][] = [
  ['🚗 좌측통행', '운전석이 오른쪽, 깜빡이·와이퍼 레버가 반대예요. 첫날은 공항 주변에서 천천히 적응하세요.'],
  ['🛣️ 속도', '일반도로는 대부분 50~60km/h, 고속도로 80~100km/h. 시골 직선로에서 속도위반 단속이 잦아요.'],
  ['🦌 야간 운전', '해 진 뒤 산길·해안도로엔 사슴·여우가 자주 나와요. 6월 일몰은 19시 전후 — 장거리 이동은 낮에.'],
  ['⛽ 주유', '시골 주유소는 저녁 7~8시면 닫고 일요일 휴무인 곳도 있어요. 반 이상 남았을 때 채우세요. "레귤러 만땅(満タン)".'],
  ['🧭 내비', '렌터카 내비는 전화번호나 맵코드로 목적지를 찍는 게 가장 정확해요. 장소 상세에 전화번호가 저장돼 있어요.'],
  ['🎫 HEP·ETC', '외국인 렌터카 이용자는 홋카이도 익스프레스웨이 패스(정액)로 고속도로를 무제한 탈 수 있어요. ETC 카드와 함께 렌터카 예약 때 신청.'],
  ['🍺 음주', '운전자는 한 모금도 금지. 동승자도 처벌될 수 있어요. 증류소·맥주공장은 동승자만 시음.'],
  ['🅿️ 주차', '관광지 주차장은 무료~1,000엔. 삿포로·오타루 시내는 코인파킹(선불/후불 정산기).'],
]

export function ChecklistView() {
  const trip = useStore((s) => s.trip)!
  const mutate = useStore((s) => s.mutate)
  const [text, setText] = useState('')
  const done = trip.checklist.filter((c) => c.done).length
  return (
    <div className="px-5 py-5">
      <h2 className="text-xl font-bold">준비 체크리스트</h2>
      <p className="mt-0.5 text-sm text-stone-500">
        {done}/{trip.checklist.length} 완료
      </p>
      <ul className="mt-4 space-y-1.5">
        {trip.checklist.map((c) => (
          <li key={c.id} className="group flex items-start gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-violet-600"
              checked={c.done}
              onChange={() =>
                mutate((t) => {
                  const x = t.checklist.find((y) => y.id === c.id)
                  if (x) x.done = !x.done
                })
              }
            />
            <span className={cx('flex-1 text-sm', c.done && 'text-stone-400 line-through')}>{c.text}</span>
            <button
              className="text-stone-300 opacity-0 hover:text-stone-600 group-hover:opacity-100"
              onClick={() => mutate((t) => void (t.checklist = t.checklist.filter((y) => y.id !== c.id)))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          mutate((t) => void t.checklist.push({ id: uid(), text: text.trim(), done: false }))
          setText('')
        }}
      >
        <input className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm" placeholder="할 일 추가" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white">추가</button>
      </form>

      <h3 className="mt-8 text-base font-bold">홋카이도 운전 메모</h3>
      <div className="mt-2 grid gap-2">
        {TIPS.map(([t, d]) => (
          <div key={t} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <div className="text-sm font-semibold">{t}</div>
            <div className="mt-0.5 text-[13px] leading-relaxed text-stone-600">{d}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
