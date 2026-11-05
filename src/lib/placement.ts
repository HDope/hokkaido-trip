import type { LegMode, Place, RouteLeg, Stop, Trip } from '../types'
import { haversineMeters } from './geo'
import { roughMinutes } from './routing'
import { computeDay, startPlaceIdFor, type DayPlan } from './schedule'

// 장소를 어느 자리에 넣을지, 어떻게 이동할지 정한다.
// 구글을 부르지 않고 저장된 경로와 직선거리 추정으로 계산하므로 무료 모드와 오프라인에서도 돈다.

/** 바로 옆이면 묶음이 아니어도 걸어간다 */
const SIDE_BY_SIDE_M = 300
/** 주차장에 세우고 걷는 묶음 안이면 이 거리까지 걸어간다 */
const WALK_GROUP_M = 1000
/** 이보다 먼 도보 구간은 운전으로 되돌린다 */
const WALK_TOO_FAR_M = 2500
/** 차에서 이보다 멀어지면 차를 가지러 걸어가야 한다 */
const CAR_LEFT_M = 400
/** 주차장과 이 거리 안이면 주차장에 먼저 세우는 게 맞다 */
const PARK_FIRST_M = 800
/** 저녁 뒤로는 이보다 먼 곳에 가지 않는다 */
const FAR_AFTER_DINNER_M = 3000
/** 시간이 모자라면 체류를 이만큼까지 줄여 본다 */
const SHORTER_STAYS = [60, 45, 30]
const SHORTEN_COST_PER_MIN = 0.5

const dist = (a: Place, b: Place) => haversineMeters(a.location, b.location)

export function isParkingPlace(p?: Place): boolean {
  return !!p && p.kind === 'other' && /주차|駐車|parking/i.test(`${p.name} ${p.nameLocal ?? ''}`)
}

type Ctx = { trip: Trip; routes: Record<string, RouteLeg>; dayIndex: number; hasGoogle: boolean }

const placeOf = (ctx: Ctx, s?: Stop) => (s ? ctx.trip.places[s.placeId] : undefined)
const startOf = (ctx: Ctx) => {
  const id = startPlaceIdFor(ctx.trip, ctx.dayIndex)
  return id ? ctx.trip.places[id] : undefined
}

/** stops 를 차례로 지난 뒤 차가 어디에 있는지 */
function carPlaceAfter(ctx: Ctx, stops: Stop[]): Place | undefined {
  let car = startOf(ctx)
  for (const s of stops) {
    const mode = s.legMode ?? 'DRIVE'
    if (mode === 'DRIVE' || !car) car = placeOf(ctx, s) ?? car
  }
  return car
}

/** before 다음에 place 로 어떻게 갈지 정한다 */
function chooseLeg(ctx: Ctx, before: Stop[], after: Stop[], place: Place): Pick<Stop, 'legMode' | 'manualMinutes'> {
  const prevStop = before.at(-1)
  const prev = placeOf(ctx, prevStop) ?? startOf(ctx)
  if (!prev) return {}
  const d = dist(prev, place)
  const inWalkGroup = isParkingPlace(prev) || prevStop?.legMode === 'WALK' || after[0]?.legMode === 'WALK'
  if (d <= SIDE_BY_SIDE_M || (inWalkGroup && d <= WALK_GROUP_M)) return { legMode: 'WALK' }
  const car = carPlaceAfter(ctx, before)
  if (car && dist(car, prev) > CAR_LEFT_M) {
    // 차를 세워 두고 다니는 중이면 택시로 움직인다
    return { legMode: 'MANUAL', manualMinutes: Math.max(5, Math.round(roughMinutes(prev.location, place.location, 'DRIVE'))) }
  }
  return {}
}

const setLeg = (s: Stop, leg: Pick<Stop, 'legMode' | 'manualMinutes'>): Stop => {
  const { legMode: _m, manualMinutes: _n, ...rest } = s
  return { ...rest, ...leg }
}

/** 순서가 바뀌어 말이 안 되게 된 도보 구간을 고친다 */
function repairLegs(ctx: Ctx, stops: Stop[]): Stop[] {
  let prev = startOf(ctx)
  return stops.map((s) => {
    const place = placeOf(ctx, s)
    const fixed = s.legMode === 'WALK' && prev && place && dist(prev, place) > WALK_TOO_FAR_M ? setLeg(s, {}) : s
    prev = place ?? prev
    return fixed
  })
}

/** stop 을 index 자리에 넣는다. 이동 수단은 새 자리에 맞춰 다시 정한다 */
function insertAt(ctx: Ctx, rest: Stop[], index: number, stop: Stop): Stop[] {
  const before = rest.slice(0, index)
  const after = rest.slice(index)
  const place = placeOf(ctx, stop)
  if (!place) return rest
  const placed = setLeg(stop, chooseLeg(ctx, before, after, place))
  // 바로 옆으로 들어왔으면 다음 곳까지는 걸어간다
  const next = after[0]
  const nextPlace = placeOf(ctx, next)
  const fixedNext =
    next && nextPlace && (next.legMode ?? 'DRIVE') === 'DRIVE' && dist(place, nextPlace) <= SIDE_BY_SIDE_M ? [setLeg(next, { legMode: 'WALK' }), ...after.slice(1)] : after
  return repairLegs(ctx, [...before, placed, ...fixedNext])
}

function planOf(ctx: Ctx, stops: Stop[]): DayPlan {
  const days = ctx.trip.days.slice()
  days[ctx.dayIndex] = { ...days[ctx.dayIndex], stops }
  return computeDay({ ...ctx.trip, days }, ctx.routes, ctx.dayIndex, ctx.hasGoogle)
}

/** 고정 시각에 늦으면 그 앞의 호텔 휴식을 줄여서 맞춘다 */
function tightenHotelRest(ctx: Ctx, stops: Stop[]): Stop[] {
  const plan = planOf(ctx, stops)
  let out = stops
  plan.stops.forEach((sp, i) => {
    const fixed = sp.stop.fixedTime ? sp.arrive - sp.wait : undefined
    if (fixed == null) return
    const target = Number(sp.stop.fixedTime!.slice(0, 2)) * 60 + Number(sp.stop.fixedTime!.slice(3))
    const late = fixed - target
    if (late <= 0) return
    const rest = plan.stops.slice(0, i).reverse().find((x) => x.place?.kind === 'hotel' && x.stop.stay > 5)
    if (!rest) return
    const stay = Math.max(5, Math.round(rest.stop.stay - late))
    out = out.map((s) => (s.id === rest.stop.id ? { ...s, stay } : s))
  })
  return out
}

/** 낮을수록 좋은 일정. 분 단위에 가깝고, 경고와 무리한 동선에 큰 값을 준다 */
export function dayCost(plan: DayPlan): number {
  let cost = plan.counts.critical * 400 + plan.counts.serious * 150 + plan.counts.warning * 40
  const legs = [...plan.stops.map((s) => s.leg), plan.endLeg].filter((l) => !!l)
  for (const l of legs) {
    cost += l.minutes * (l.mode === 'DRIVE' ? 1 : l.mode === 'WALK' ? 0.5 : 0.7) + l.buffer * 0.3
    // 한 번에 오래 걷는 건 힘들다
    if (l.mode === 'WALK' && l.minutes > 15) cost += l.minutes - 15
    // 택시는 부르고 기다려야 하고, 먼 곳까지 가는 건 현실적이지 않다
    if (l.mode === 'MANUAL' || l.mode === 'TRANSIT') cost += 25 + Math.max(0, l.minutes - 30) * 3
  }
  // 차를 대기 번거로운 곳
  for (const s of plan.stops) {
    if (s.leg?.mode !== 'DRIVE' || s.leg.meters < CAR_LEFT_M) continue
    if (s.place.parking?.status === 'nearby') cost += 15
    else if (s.place.parking?.status === 'paid') cost += 5
  }
  cost += plan.waitMin * 0.1
  cost += Math.max(0, plan.end - (21 * 60 + 30))

  // 식사는 식사 시간에
  for (const s of plan.stops) {
    if (s.meal === 'lunch') cost += Math.max(0, 11 * 60 - s.arrive, s.arrive - 14 * 60)
    if (s.meal === 'dinner') cost += Math.max(0, 17 * 60 - s.arrive, s.arrive - 20 * 60)
  }

  // 저녁을 먹고 다시 운전해서 나가거나 먼 곳에 가지 않는다 (술, 야간 운전)
  const dinnerAt = plan.stops.findIndex((s) => s.meal === 'dinner')
  if (dinnerAt >= 0) {
    for (const s of plan.stops.slice(dinnerAt + 1)) {
      if (s.leg && ((s.leg.mode === 'DRIVE' && s.leg.meters >= CAR_LEFT_M) || s.leg.meters >= FAR_AFTER_DINNER_M)) cost += 300
    }
  }

  // 차는 세워 둔 곳에 있다
  let car = plan.startPlace
  const useCar = (from?: Place, to?: Place) => {
    if (car && from && dist(car, from) > CAR_LEFT_M) cost += 60 + dist(car, from) / 70
    car = to ?? car
  }
  for (const s of plan.stops) {
    if (s.leg?.mode === 'DRIVE' || !car) useCar(s.leg?.from, s.place)
  }
  if (plan.endLeg?.mode === 'DRIVE') useCar(plan.endLeg.from, plan.lodging)
  if (plan.lodging && car && dist(car, plan.lodging) > 500) cost += 250

  // 주차장으로 돌아가는 건 걷는 묶음의 맨 끝이다
  plan.stops.forEach((s, i) => {
    if (isParkingPlace(s.place) && s.leg?.mode === 'WALK' && plan.stops[i + 1]?.leg?.mode === 'WALK') cost += 15
  })

  // 주차장이 있는 동네에 차로 왔으면 주차장부터 들른다
  plan.stops.forEach((s, i) => {
    if (s.leg?.mode !== 'DRIVE' || isParkingPlace(s.place)) return
    if (plan.stops.slice(i + 1).some((x) => isParkingPlace(x.place) && dist(x.place, s.place) < PARK_FIRST_M)) cost += 30
  })
  return cost
}

/** 이미 식사가 정해진 날이면 새 식당을 식사로 치지 않는다 */
function withMealMark(plan: DayPlan, stops: Stop[], stopId: string): Stop[] {
  const sp = plan.stops.find((s) => s.stop.id === stopId)
  if (!sp?.meal || sp.stop.meal) return stops
  if (!plan.stops.some((s) => s.stop.id !== stopId && s.meal === sp.meal)) return stops
  return stops.map((s) => (s.id === stopId ? { ...s, meal: 'none' as const } : s))
}

export type Placement = { index: number; stops: Stop[]; mode: LegMode; afterName?: string; stay: number }

const stayOptions = (stay: number) => [stay, ...SHORTER_STAYS.filter((m) => m < stay)]

/** stop 이 들어갈 가장 좋은 자리를 찾는다. 시간이 모자라면 체류도 줄여 본다 */
export function bestPlacement(trip: Trip, routes: Record<string, RouteLeg>, dayIndex: number, stop: Stop, hasGoogle: boolean): Placement {
  const ctx: Ctx = { trip, routes, dayIndex, hasGoogle }
  const rest = trip.days[dayIndex].stops
  let best: { index: number; stops: Stop[]; cost: number; plan: DayPlan; stay: number } | undefined
  for (let i = 0; i <= rest.length; i++) {
    for (const stay of stayOptions(stop.stay)) {
      const stops = tightenHotelRest(ctx, insertAt(ctx, rest, i, { ...stop, stay }))
      const plan = planOf(ctx, stops)
      const cost = dayCost(plan) + (stop.stay - stay) * SHORTEN_COST_PER_MIN
      if (!best || cost < best.cost) best = { index: i, stops, cost, plan, stay }
    }
  }
  const { index, stops, plan, stay } = best!
  const placed = stops[index]
  return { index, stops: withMealMark(plan, stops, stop.id), mode: placed.legMode ?? 'DRIVE', afterName: placeOf(ctx, rest[index - 1])?.name, stay }
}

/** 사용자가 직접 정한 자리에 넣는다 */
export function placeAt(trip: Trip, routes: Record<string, RouteLeg>, dayIndex: number, stop: Stop, index: number, hasGoogle: boolean): Stop[] {
  const ctx: Ctx = { trip, routes, dayIndex, hasGoogle }
  const stops = insertAt(ctx, trip.days[dayIndex].stops, index, stop)
  return withMealMark(planOf(ctx, stops), stops, stop.id)
}

/** 끌어서 옮긴 뒤 이동 수단을 새 자리에 맞춘다 */
export function reorderWithLegs(trip: Trip, routes: Record<string, RouteLeg>, dayIndex: number, from: number, to: number, hasGoogle: boolean): Stop[] {
  const ctx: Ctx = { trip, routes, dayIndex, hasGoogle }
  const rest = trip.days[dayIndex].stops.slice()
  const [moved] = rest.splice(from, 1)
  return insertAt(ctx, repairLegs(ctx, rest), to, moved)
}

/** 다른 날로 보낼 때 원래 날에 남은 일정을 고친다 */
export function removeWithRepair(trip: Trip, routes: Record<string, RouteLeg>, dayIndex: number, stopId: string, hasGoogle: boolean): Stop[] {
  const ctx: Ctx = { trip, routes, dayIndex, hasGoogle }
  return repairLegs(ctx, trip.days[dayIndex].stops.filter((s) => s.id !== stopId))
}

export type OptimizeResult = { stops: Stop[]; names: string[]; driveSaved: number; issuesFixed: number; shortened: { name: string; stay: number }[] }

/** 주차장에서 걷는 묶음: 차로 도착한 곳 + 이어서 걷거나 택시로 가는 곳들 */
function groupsOf(stops: Stop[]): Stop[][] {
  const groups: Stop[][] = []
  for (const s of stops) {
    if ((s.legMode ?? 'DRIVE') === 'DRIVE' || !groups.length) groups.push([s])
    else groups.at(-1)!.push(s)
  }
  return groups
}

/**
 * 하루 순서를 다시 찾는다.
 * 시각을 고정한 곳과 숙소는 그 자리에 두고, 나머지는 한 곳씩 또는 묶음째 옮겨 보며 더 나은 일정을 고른다.
 * 시각 고정이나 숙소를 넘어서도 옮길 수 있고, 주차장 근처로 옮기면 걷는 구간으로 바뀐다.
 */
export function optimizeDay(trip: Trip, routes: Record<string, RouteLeg>, dayIndex: number, hasGoogle: boolean): OptimizeResult | null {
  const ctx: Ctx = { trip, routes, dayIndex, hasGoogle }
  const original = trip.days[dayIndex].stops
  if (original.length < 2) return null
  const locked = (s: Stop) => {
    const p = placeOf(ctx, s)
    return !!s.fixedTime || !p || p.kind === 'hotel' || p.kind === 'airport' || isParkingPlace(p)
  }

  // 자리를 많이 바꿀수록 조금씩 손해로 쳐서, 아주 작은 이득으로 일정을 흔들지 않는다
  const movedCost = (stops: Stop[]) => stops.reduce((sum, st, i) => sum + (original[i]?.id === st.id ? 0 : 2), 0)
  const shortenCost = (stops: Stop[]) => stops.reduce((sum, st) => sum + Math.max(0, (original.find((o) => o.id === st.id)?.stay ?? st.stay) - st.stay) * (placeOf(ctx, st)?.kind === 'hotel' ? 0 : SHORTEN_COST_PER_MIN), 0)
  const costOf = (stops: Stop[]) => dayCost(planOf(ctx, stops)) + movedCost(stops) + shortenCost(stops)

  let cur = original
  let curCost = costOf(cur)
  const startCost = curCost
  for (let pass = 0; pass < 6; pass++) {
    let best: { stops: Stop[]; cost: number } | undefined
    const consider = (stops: Stop[]) => {
      const tight = tightenHotelRest(ctx, stops)
      const cost = costOf(tight)
      if (cost < (best?.cost ?? curCost) - 1) best = { stops: tight, cost }
    }
    for (const s of cur) {
      if (locked(s)) continue
      const at = cur.findIndex((x) => x.id === s.id)
      const rest = repairLegs(ctx, cur.filter((x) => x.id !== s.id))
      for (let i = 0; i <= rest.length; i++) {
        for (const stay of stayOptions(s.stay)) {
          // 같은 자리에 그대로 두면 이동 수단도 건드리지 않는다
          if (i === at) {
            if (stay !== s.stay) consider(cur.map((x) => (x.id === s.id ? { ...x, stay } : x)))
            continue
          }
          consider(insertAt(ctx, rest, i, { ...s, stay }))
        }
      }
    }
    const groups = groupsOf(cur)
    groups.forEach((group, g) => {
      const place = placeOf(ctx, group[0])
      if (group.some((s) => s.fixedTime || placeOf(ctx, s)?.kind === 'hotel' || placeOf(ctx, s)?.kind === 'airport') || !place) return
      const others = groups.filter((_, k) => k !== g)
      for (let k = 0; k <= others.length; k++) {
        if (k === g) continue
        const before = others.slice(0, k).flat()
        const after = others.slice(k).flat()
        const head = setLeg(group[0], chooseLeg(ctx, before, group, place))
        consider(repairLegs(ctx, [...before, head, ...group.slice(1), ...after]))
      }
    })
    if (!best) break
    cur = best.stops
    curCost = best.cost
  }

  // 옮기면서 식사 시간대에 들어간 식당이 식사로 잡히지 않게 한다
  for (const st of cur) cur = withMealMark(planOf(ctx, cur), cur, st.id)

  const before = planOf(ctx, original)
  const after = planOf(ctx, cur)
  const issues = (p: DayPlan) => p.counts.critical + p.counts.serious + p.counts.warning
  const severe = (p: DayPlan) => p.counts.critical + p.counts.serious
  const issuesFixed = issues(before) - issues(after)
  // 경고가 줄지 않으면 이득이 분명할 때만 제안한다
  if (severe(after) > severe(before) || (issuesFixed <= 0 && curCost > startCost - 15)) return null
  return {
    stops: cur,
    names: cur.map((s) => placeOf(ctx, s)?.name ?? ''),
    driveSaved: before.driveMin - after.driveMin,
    issuesFixed,
    shortened: cur
      .filter((s) => placeOf(ctx, s)?.kind !== 'hotel' && s.stay < (original.find((o) => o.id === s.id)?.stay ?? s.stay))
      .map((s) => ({ name: placeOf(ctx, s)?.name ?? '', stay: s.stay })),
  }
}
