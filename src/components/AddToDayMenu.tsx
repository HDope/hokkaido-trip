import type { ReactNode } from 'react'
import { useStore } from '../store'
import { usePlans } from '../hooks'
import { addPlaceToDay } from '../actions'
import { fmtDate } from '../lib/time'
import { dayColor } from '../ui'
import { Menu, MenuItem } from './common'

/** 원하는 날을 골라 장소를 넣는 메뉴. 숙소면 그날 밤 숙소로 지정한다 */
export function AddToDayMenu({ getPlaceId, name, label = '＋ 날짜에 추가' }: { getPlaceId: () => string; name: string; label?: ReactNode }) {
  const plans = usePlans()
  const notify = useStore((s) => s.notify)
  return (
    <Menu label={<span className="text-xs font-semibold text-violet-700">{label}</span>}>
      {(close) =>
        plans.map((p) => (
          <MenuItem
            key={p.day.id}
            onClick={() => {
              const where = addPlaceToDay(p.index, getPlaceId())
              notify(`${name} → D${p.index + 1}${where ? `: ${where}` : '에 넣었어요'}`)
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
  )
}
