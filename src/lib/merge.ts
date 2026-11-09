import type { Trip } from '../types'

// 두 기기가 거의 동시에 고쳤을 때 양쪽 수정을 합친다.
// 마지막으로 같이 본 일정(base)과 비교해 서로 다른 항목이면 둘 다 살리고,
// 같은 값을 서로 다르게 고쳤을 때만 다른 기기 쪽을 따른다.

type Obj = Record<string, unknown>
type Item = Obj & { id: string }
type Ctx = { conflicts: number }

/** 항목 id 로 맞춰 합치는 목록 */
const ID_LISTS = new Set(['days', 'stops', 'alts', 'checklist', 'extras'])
/** id 를 모아 둔 목록. 양쪽의 추가와 삭제를 모두 반영한다 */
const SET_LISTS = new Set(['picks', 'wishlist'])

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]))
  if (isObj(a) && isObj(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => equal(a[k], b[k]))
  return false
}

function mergeSet(base: string[] = [], local: string[] = [], remote: string[] = []): string[] {
  const removed = new Set(base.filter((x) => !local.includes(x) || !remote.includes(x)))
  const out = remote.filter((x) => !removed.has(x))
  for (const x of local) if (!removed.has(x) && !out.includes(x)) out.push(x)
  return out
}

function mergeById(base: Item[], local: Item[], remote: Item[], ctx: Ctx): Item[] {
  const B = new Map(base.map((x) => [x.id, x]))
  const L = new Map(local.map((x) => [x.id, x]))
  const R = new Map(remote.map((x) => [x.id, x]))
  const kept = new Map<string, Item>()
  for (const id of new Set([...R.keys(), ...L.keys()])) {
    const b = B.get(id)
    const l = L.get(id)
    const r = R.get(id)
    if (b && (!l || !r)) {
      // 한쪽이 지운 항목을 다른 쪽이 고쳤으면 겹친 것으로 센다
      if (!equal(b, l ?? r)) ctx.conflicts++
      continue
    }
    kept.set(id, (l && r ? mergeObject(b ?? {}, l, r, ctx) : (l ?? r)) as Item)
  }
  const ids = (xs: Item[]) => xs.map((x) => x.id)
  const within = (xs: Item[], other: Map<string, Item>) => ids(xs).filter((id) => other.has(id))
  // 내가 순서를 바꿨으면 내 순서, 아니면 다른 기기 순서를 쓴다
  const localMoved = !equal(within(local, B), within(base, L))
  const [main, other] = localMoved ? [local, remote] : [remote, local]
  const seq = ids(main).filter((id) => kept.has(id))
  ids(other).forEach((id, i, all) => {
    if (!kept.has(id) || seq.includes(id)) return
    // 반대쪽에만 있는 항목은 그쪽에서 바로 앞에 있던 항목 뒤에 넣는다
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const p = seq.indexOf(all[j])
      if (p >= 0) {
        at = p + 1
        break
      }
    }
    seq.splice(at, 0, id)
  })
  return seq.map((id) => kept.get(id)!)
}

function mergeValue(key: string, base: unknown, local: unknown, remote: unknown, ctx: Ctx): unknown {
  if (equal(local, remote)) return local
  if (equal(base, local)) return remote
  if (equal(base, remote)) return local
  if (SET_LISTS.has(key)) {
    const merged = mergeSet(base as string[] | undefined, local as string[] | undefined, remote as string[] | undefined)
    return merged.length || key === 'wishlist' ? merged : undefined
  }
  if (ID_LISTS.has(key)) {
    const merged = mergeById((base ?? []) as Item[], (local ?? []) as Item[], (remote ?? []) as Item[], ctx)
    return merged.length || key !== 'alts' ? merged : undefined
  }
  if (isObj(local) && isObj(remote)) return mergeObject(isObj(base) ? base : {}, local, remote, ctx)
  ctx.conflicts++
  return remote
}

function mergeObject(base: Obj, local: Obj, remote: Obj, ctx: Ctx): Obj {
  const out: Obj = {}
  for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    const v = mergeValue(k, base[k], local[k], remote[k], ctx)
    if (v !== undefined) out[k] = v
  }
  return out
}

const content = (t: Trip): Obj => {
  const { updatedAt: _updatedAt, routeCache: _routeCache, ...rest } = t
  return rest
}

/** 양쪽 수정을 합친 일정과, 같은 값을 서로 다르게 고쳐 다른 기기 쪽을 따른 개수 */
export function mergeTrips(base: Trip, local: Trip, remote: Trip): { trip: Trip; conflicts: number } {
  const ctx: Ctx = { conflicts: 0 }
  const trip = mergeObject(content(base), content(local), content(remote), ctx) as unknown as Trip
  // 같은 카드를 양쪽이 서로 다른 날로 옮겼으면 다른 기기 쪽 날에만 남긴다
  const count = new Map<string, number>()
  for (const d of trip.days) for (const s of d.stops) count.set(s.id, (count.get(s.id) ?? 0) + 1)
  const remoteDay = new Map(remote.days.flatMap((d) => d.stops.map((s) => [s.id, d.id] as const)))
  for (const d of trip.days) d.stops = d.stops.filter((s) => (count.get(s.id) ?? 0) < 2 || remoteDay.get(s.id) === d.id)
  trip.updatedAt = new Date().toISOString()
  return { trip, conflicts: ctx.conflicts }
}
