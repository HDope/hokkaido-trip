import { useStore } from '../store'
import { removeStop } from '../actions'
import { Menu, MenuItem } from './common'

/** 일정 카드의 빼기: 장소함으로 보내거나 삭제한다 */
export function RemoveStopMenu({ dayId, stopId, name }: { dayId: string; stopId: string; name: string }) {
  const notify = useStore((s) => s.notify)
  return (
    <Menu label={<span className="text-xs text-stone-500">빼기</span>}>
      {(close) => (
        <>
          <MenuItem onClick={() => (removeStop(dayId, stopId, true), notify(`${name}을(를) 장소함으로 옮겼어요`), close())}>장소함으로 보내기</MenuItem>
          <MenuItem danger onClick={() => (removeStop(dayId, stopId), notify('일정에서 뺐어요 (↶ 되돌리기)'), close())}>
            일정에서 삭제
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
