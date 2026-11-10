import type { CostSource, Place, Trip } from '../types'
import { shortName, type DayPlan, type LegPlan } from './schedule'

// 예상 예산: 일정에서 바로 계산해, 장소를 넣고 빼면 금액도 따라간다

export type BudgetCat = 'lodging' | 'food' | 'rental' | 'golf' | 'entry' | 'toll' | 'fuel' | 'parking' | 'taxi' | 'extra'

export const BUDGET_CATS: { id: BudgetCat; label: string; icon: string }[] = [
  { id: 'lodging', label: '숙박', icon: '🛏️' },
  { id: 'food', label: '식비', icon: '🍽️' },
  { id: 'rental', label: '렌터카', icon: '🚗' },
  { id: 'golf', label: '골프', icon: '⛳' },
  { id: 'entry', label: '입장료·체험', icon: '🎟️' },
  { id: 'toll', label: '톨비', icon: '🛣️' },
  { id: 'fuel', label: '주유', icon: '⛽' },
  { id: 'parking', label: '주차', icon: '🅿️' },
  { id: 'taxi', label: '택시', icon: '🚕' },
  { id: 'extra', label: '기타', icon: '📎' },
]

/** 금액을 고칠 때 어디에 저장할지 */
export type CostField = 'cost' | 'breakfast' | 'parking' | 'rental' | 'extra'

export type BudgetLine = {
  key: string
  cat: BudgetCat
  label: string
  days: number[]
  qty: number
  unit?: number // 비어 있으면 아직 금액을 모른다
  yen: number
  unitLabel: string
  placeId?: string
  extraId?: string
  field?: CostField
  source?: CostSource
  note?: string
}

export type BudgetSummary = {
  total: number
  krw: number
  krwPerYen: number
  people: number
  byCat: Record<BudgetCat, number>
  lines: BudgetLine[]
  missing: number
}

export const BUDGET_DEFAULTS = { kmPerLiter: 15, yenPerLiter: 171, krwPerYen: 8.5 }

const GOLF = /골프|ゴルフ|golf/i
/** 시간으로 어림한 택시비 */
const TAXI_BASE = 500
const TAXI_PER_MIN = 100
const round100 = (n: number) => Math.round(n / 100) * 100

/** 돈이 드는 장소를 어느 항목으로 볼지. 쇼핑은 금액을 적어 둔 곳만 넣는다 */
function placeCat(p: Place): BudgetCat | undefined {
  if (p.kind === 'hotel' || p.kind === 'airport' || /주차|駐車/.test(p.name)) return undefined
  if (p.kind === 'food' || p.kind === 'cafe') return 'food'
  if (GOLF.test(p.name)) return 'golf'
  if (p.kind === 'sight' || p.kind === 'onsen') return 'entry'
  return p.cost?.yen ? 'entry' : undefined
}

export function tripBudget(trip: Trip, plans: DayPlan[]): BudgetSummary {
  const people = trip.settings.travelers?.length || 2
  const b = { ...BUDGET_DEFAULTS, ...trip.budget }
  const map = new Map<string, BudgetLine>()
  const add = (line: Omit<BudgetLine, 'yen' | 'days'>, day?: number) => {
    const cur = map.get(line.key)
    if (cur) {
      cur.qty += line.qty
      if (day != null && !cur.days.includes(day)) cur.days.push(day)
    } else {
      map.set(line.key, { ...line, yen: 0, days: day != null ? [day] : [] })
    }
  }
  const addTaxi = (leg: LegPlan | undefined, day: number) => {
    if (leg?.mode !== 'MANUAL' || leg.minutes <= 0) return
    add({ key: `taxi:${day}:${leg.to.id}`, cat: 'taxi', label: `${shortName(leg.from.name)} → ${shortName(leg.to.name)}`, qty: 1, unit: round100(TAXI_BASE + TAXI_PER_MIN * leg.minutes), unitLabel: '1회', source: 'estimate', note: `약 ${Math.round(leg.minutes)}분 기준 어림` }, day)
  }

  for (const p of plans) {
    const day = p.index + 1
    const hotel = p.lodging
    if (hotel) {
      add({ key: `lodging:${hotel.id}`, cat: 'lodging', label: hotel.name, qty: 1, unit: hotel.cost?.yen, unitLabel: '1박', placeId: hotel.id, field: 'cost', source: hotel.cost?.source, note: hotel.cost?.note }, day)
      const pk = hotel.parking
      if (pk?.status === 'paid' || pk?.status === 'nearby') add({ key: `parking:${hotel.id}`, cat: 'parking', label: `${shortName(hotel.name)} 숙박객 주차`, qty: 1, unit: pk.yen, unitLabel: '1박', placeId: hotel.id, field: 'parking', source: pk.source, note: pk.fee }, day)
    }
    if (p.breakfast) {
      const place = p.breakfast.place
      add({ key: `food:${place.id}:breakfast`, cat: 'food', label: `${shortName(place.name)} 조식`, qty: people, unit: place.breakfastYen, unitLabel: '1인', placeId: place.id, field: 'breakfast', source: 'web', note: place.breakfastNote }, day)
    }
    // 같은 날 다시 들른 곳은 한 번만 낸다
    const seen = new Set<string>()
    for (const s of p.stops) {
      addTaxi(s.leg, day)
      const place = s.place
      if (!place || seen.has(place.id)) continue
      seen.add(place.id)
      const cat = placeCat(place)
      if (cat) add({ key: `${cat}:${place.id}`, cat, label: place.name, qty: people, unit: place.cost?.yen, unitLabel: '1인', placeId: place.id, field: 'cost', source: place.cost?.source, note: place.cost?.note }, day)
      if (s.leg?.mode !== 'DRIVE' || place.kind === 'hotel' || place.kind === 'airport') continue
      const pk = place.parking
      if (pk?.status === 'free' || pk?.status === 'none') continue
      add({ key: `parking:${place.id}`, cat: 'parking', label: place.name, qty: 1, unit: pk?.yen, unitLabel: '1회', placeId: place.id, field: 'parking', source: pk?.source, note: pk?.fee }, day)
    }
    addTaxi(p.endLeg, day)
  }

  const km = plans.reduce((a, p) => a + p.driveMeters, 0) / 1000
  const toll = plans.reduce((a, p) => a + p.tollYen, 0)
  const tollUnknown = plans.reduce((a, p) => a + p.tollUnknown, 0)
  add({ key: 'rental', cat: 'rental', label: '렌터카', qty: 1, unit: b.rentalYen, unitLabel: '전체', field: 'rental', source: b.rentalYen != null ? 'web' : undefined, note: b.rentalNote })
  add({ key: 'toll', cat: 'toll', label: '고속도로 톨비', qty: 1, unit: toll, unitLabel: '전체', source: 'google', note: tollUnknown ? `구글 추정, 미확인 ${tollUnknown}구간 빼고` : '구글 추정, ETC 기준' })
  add({ key: 'fuel', cat: 'fuel', label: '주유비', qty: 1, unit: round100((km / b.kmPerLiter) * b.yenPerLiter), unitLabel: '전체', source: 'estimate', note: `${Math.round(km).toLocaleString()}km ÷ ${b.kmPerLiter}km/L × ¥${b.yenPerLiter}` })
  for (const x of b.extras ?? []) add({ key: `extra:${x.id}`, cat: 'extra', label: x.label, qty: 1, unit: x.yen, unitLabel: '전체', field: 'extra', extraId: x.id, source: 'manual', note: x.note })

  const lines = [...map.values()]
  for (const l of lines) l.yen = (l.unit ?? 0) * l.qty
  const byCat = Object.fromEntries(BUDGET_CATS.map((c) => [c.id, 0])) as Record<BudgetCat, number>
  for (const l of lines) byCat[l.cat] += l.yen
  const total = lines.reduce((a, l) => a + l.yen, 0)
  return { total, krw: Math.round(total * b.krwPerYen), krwPerYen: b.krwPerYen, people, byCat, lines, missing: lines.filter((l) => l.unit == null).length }
}

export const fmtYen = (n: number) => `¥${Math.round(n).toLocaleString()}`
export const fmtManWon = (krw: number) => `₩${Math.round(krw / 10000).toLocaleString()}만`
