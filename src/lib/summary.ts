import type { Place, Stop, Trip } from '../types'
import { CANDIDATES, findCandidatePlace, THEME_BY_ID, THEMES, type ThemeId } from '../candidates'
import { BEER, drivesAfter, SAKE, shortName, WINE, type DayPlan, type StopPlan } from './schedule'

// 여행 요약: 실제 일정에 들어간 장소를 테마 후보 지도와 같은 테마로 나눠 날짜순으로 센다

export type SummaryItem = {
  plan: DayPlan
  sp: StopPlan
  theme?: ThemeId
  /** 술이 있는 곳에서 이 뒤로 운전이 없어 둘 다 마실 수 있는지 */
  bothCanDrink: boolean
}

export type SummaryRow = { plan: DayPlan; items: SummaryItem[]; byTheme: Record<ThemeId, SummaryItem[]> }

/** 후보 목록에 있는 장소의 테마. 숙소는 묵는 곳일 뿐이라 제외한다 */
export function candidateThemes(trip: Trip): Map<string, ThemeId> {
  const map = new Map<string, ThemeId>()
  // 괄호 설명이나 현지 표기가 달라도 같은 이름이면 같은 곳으로 본다
  const byName = new Map(CANDIDATES.map((c) => [shortName(c.name), c.theme]))
  for (const place of Object.values(trip.places)) {
    const theme = byName.get(shortName(place.name))
    if (theme && place.kind !== 'hotel') map.set(place.id, theme)
  }
  for (const c of CANDIDATES) {
    const place = findCandidatePlace(trip, c)
    if (place && place.kind !== 'hotel') map.set(place.id, c.theme)
  }
  return map
}

// 후보 목록에 없는 장소는 이름으로 나눈다. 앞에서부터 처음 맞는 테마를 쓴다
const BY_NAME: [ThemeId, RegExp][] = [
  ['wine', WINE],
  ['beer', BEER],
  ['sake', SAKE],
  ['golf', /골프|ゴルフ|golf/i],
  ['lake', /호수|유람선|遊覧船|青い池/],
  ['lavender', /라벤더|ラベンダー/],
  ['crab', /털게|毛ガニ|毛蟹/],
  ['cheese', /치즈케이크|チーズケーキ/],
]

export function themeOf(place: Place, stop: Stop, known: Map<string, ThemeId>): ThemeId | undefined {
  if (place.kind === 'hotel') return /온천/.test(stop.note ?? '') ? 'onsen' : undefined
  if (place.kind === 'onsen') return 'onsen'
  const fromCandidate = known.get(place.id)
  if (fromCandidate) return fromCandidate
  const text = `${place.name} ${place.nameLocal ?? ''}`
  return BY_NAME.find(([, re]) => re.test(text))?.[0]
}

/** 들른 곳으로 세지 않는 카드: 숙소 복귀, 공항, 주차장 (숙소 온천은 센다) */
function isVisit(place: Place, theme: ThemeId | undefined): boolean {
  if (place.kind === 'hotel') return theme === 'onsen'
  if (place.kind === 'airport') return false
  return !/주차|駐車/.test(place.name)
}

export const isDrink = (theme?: ThemeId) => !!theme && THEME_BY_ID[theme].group === 'drink'

export function tripSummary(plans: DayPlan[], known: Map<string, ThemeId>): SummaryRow[] {
  return plans.map((plan) => {
    const items = plan.stops.flatMap((sp, i): SummaryItem[] => {
      if (!sp.place) return []
      const theme = themeOf(sp.place, sp.stop, known)
      return isVisit(sp.place, theme) ? [{ plan, sp, theme, bothCanDrink: !drivesAfter(plan, i) }] : []
    })
    const byTheme = Object.fromEntries(THEMES.map((t) => [t.id, items.filter((x) => x.theme === t.id)])) as Record<ThemeId, SummaryItem[]>
    return { plan, items, byTheme }
  })
}
