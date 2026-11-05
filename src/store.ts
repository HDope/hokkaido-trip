import { create } from 'zustand'
import type { RouteLeg, Trip } from './types'
import type { RegionId, ThemeId } from './candidates'
import { createSeedTrip } from './seed'
import { clearConnectHash, cloudBackend, consumeConnectLink, isAccessProblem, readCloudConfig, serverBackend, type Backend, type Revisions, type Snapshot } from './lib/backend'
import { changeSummary, describeChanges } from './lib/revisions'

const LS_TRIP = 'hk-trip-backup'
const LS_TRIP_AT = 'hk-trip-backup-at'
const LS_KEY = 'hk-gmaps-key'
const HISTORY_LIMIT = 60

export type View = 'day' | 'overview' | 'candidates' | 'places' | 'checklist' | 'compare'

type SaveStatus = 'loading' | 'saved' | 'saving' | 'dirty' | 'error' | 'local' | 'offline'

/** 예전 버전을 보는 중이면 그 정보. 이때 화면의 trip 은 그 버전이고 고칠 수 없다 */
export type Preview = { label: string; kind: 'version' | 'history'; id: string }

type State = {
  trip: Trip | null
  routes: Record<string, RouteLeg>
  needConnect?: { error?: string } // 웹 버전인데 아직 일정 저장소와 연결되지 않음
  offlineSince?: string // 인터넷이 끊겨 저장해 둔 일정을 보여주는 중이면, 그 일정을 받은 시각
  preview?: Preview
  showVersions: boolean
  offerHomeScreen: boolean // 아이폰에서 연결 링크로 처음 열었을 때 홈 화면 추가 안내
  backendKind?: Backend['kind']
  view: View
  selectedDayId?: string
  openPlaceId?: string
  focusPlaceId?: string
  focusNonce: number // 같은 장소를 다시 눌러도 지도가 돌아오도록
  apiKey: string
  googleStatus: 'none' | 'unknown' | 'ok' | 'error'
  googleMessage?: string
  googleReason?: string
  saveStatus: SaveStatus
  savedAt?: string
  past: Trip[]
  future: Trip[]
  showSettings: boolean
  showExport: boolean
  toast?: { text: string; id: number }
  candThemes: ThemeId[] // 비어 있으면 전체
  candRegion?: RegionId
  candActiveId?: string // 목록에서 강조할 후보
  candPanId?: string // 지도를 옮겨 보여줄 후보

  load: () => Promise<void>
  mutate: (fn: (t: Trip) => void) => void
  undo: () => void
  redo: () => void
  setRoute: (key: string, leg: RouteLeg) => void
  clearRoutes: (filter?: (leg: RouteLeg) => boolean) => void
  setView: (v: View) => void
  selectDay: (id: string) => void
  openPlace: (id?: string) => void
  focusPlace: (id?: string) => void
  setApiKey: (k: string) => void
  setGoogleStatus: (s: State['googleStatus'], msg?: string, reason?: string) => void
  setShowSettings: (v: boolean) => void
  setShowExport: (v: boolean) => void
  setShowVersions: (v: boolean) => void
  notify: (text: string) => void
  replaceTrip: (t: Trip) => void
  setCand: (patch: Partial<Pick<State, 'candThemes' | 'candRegion' | 'candActiveId' | 'candPanId'>>) => void
  dismissHomeScreen: () => void
}

function envKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? ''
}

function readKey(): string {
  try {
    return localStorage.getItem(LS_KEY) ?? envKey()
  } catch {
    return envKey()
  }
}

export const useStore = create<State>((set, get) => ({
  trip: null,
  routes: {},
  view: 'day',
  focusNonce: 0,
  apiKey: readKey(),
  googleStatus: readKey() ? 'unknown' : 'none',
  saveStatus: 'loading',
  past: [],
  future: [],
  showSettings: false,
  showExport: false,
  showVersions: false,
  candThemes: [],
  offerHomeScreen: false,

  setCand: (patch) => set(patch),
  dismissHomeScreen() {
    clearConnectHash()
    set({ offerHomeScreen: false })
  },

  async load() {
    const { offerHomeScreen } = consumeConnectLink()
    set({ offerHomeScreen })
    const cloud = readCloudConfig()
    if (cloud) backend = cloudBackend(cloud)
    else if (import.meta.env.DEV) backend = serverBackend()
    else {
      set({ needConnect: {} })
      return
    }
    let snapshot: Snapshot | null = null
    let reached = false
    try {
      snapshot = await backend.pull()
      reached = true
    } catch (e) {
      if (cloud) {
        const cached = isAccessProblem(e) ? null : readCachedTrip()
        if (cached) {
          enterOffline(cached.trip, cached.at)
          return
        }
        set({ needConnect: { error: e instanceof TypeError ? '인터넷에 연결되어 있지 않아요. 연결되면 다시 열어주세요' : (e as Error).message } })
        return
      }
      backend = null // 서버 없이 열린 경우 → 이 브라우저에만 저장
    }
    let trip = snapshot?.trip ?? null
    if (!trip) {
      try {
        const raw = localStorage.getItem(LS_TRIP)
        if (raw && !cloud) trip = JSON.parse(raw) as Trip
      } catch {
        /* ignore */
      }
    }
    const isNew = !trip
    if (!trip) trip = createSeedTrip()
    const routes = snapshot?.routes ?? trip.routeCache ?? {}
    set({
      trip,
      routes,
      ...viewFromHash(trip),
      backendKind: backend?.kind,
      saveStatus: reached ? 'saved' : 'local',
    })
    if (reached) {
      lastSaved = trip
      cacheForOffline()
    }
    if (isNew) {
      routesDirty = true
      scheduleSave(true)
    }
    if (reached) {
      startSync()
      void loadSharedKey()
    }
  },

  mutate(fn) {
    const cur = get().trip
    if (!cur || isReadOnly(true)) return
    const next = structuredClone(cur)
    fn(next)
    next.updatedAt = new Date().toISOString()
    set({ trip: next, past: [...get().past.slice(-HISTORY_LIMIT), cur], future: [] })
    scheduleSave(true)
  },

  undo() {
    const { past, trip, future } = get()
    if (!past.length || !trip || isReadOnly()) return
    const prev = past[past.length - 1]
    set({ trip: prev, past: past.slice(0, -1), future: [trip, ...future] })
    scheduleSave(true)
  },

  redo() {
    const { past, trip, future } = get()
    if (!future.length || !trip || isReadOnly()) return
    const [next, ...rest] = future
    set({ trip: next, past: [...past, trip], future: rest })
    scheduleSave(true)
  },

  setRoute(key, leg) {
    set({ routes: { ...get().routes, [key]: leg } })
    scheduleSave()
  },

  clearRoutes(filter) {
    const routes = filter ? Object.fromEntries(Object.entries(get().routes).filter(([, l]) => !filter(l))) : {}
    set({ routes })
    scheduleSave()
  },

  setView: (view) => set({ view }),
  selectDay: (id) => set({ selectedDayId: id, view: 'day' }),
  openPlace: (id) => set({ openPlaceId: id }),
  focusPlace: (id) => set((st) => ({ focusPlaceId: id, focusNonce: st.focusNonce + 1 })),

  setApiKey(k) {
    const key = k.trim()
    try {
      if (key) localStorage.setItem(LS_KEY, key)
      else localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
    set({ apiKey: key, googleStatus: key ? 'unknown' : 'none', googleMessage: undefined, googleReason: undefined })
    void backend?.writeKey(key).catch(() => undefined)
  },

  setGoogleStatus: (googleStatus, googleMessage, googleReason) => set({ googleStatus, googleMessage, googleReason }),
  setShowSettings: (showSettings) => set({ showSettings }),
  setShowExport: (showExport) => set({ showExport }),
  setShowVersions: (showVersions) => set({ showVersions }),
  // 보기 전용일 때는 수정이 막히므로 "바꿨어요" 같은 안내도 내보내지 않는다
  notify: (text) => {
    if (!get().preview && !get().offlineSince) set({ toast: { text, id: Date.now() } })
  },

  replaceTrip(t) {
    if (isReadOnly(true)) return
    const cur = get().trip
    set({
      trip: t,
      routes: { ...get().routes, ...(t.routeCache ?? {}) },
      past: cur ? [...get().past, cur] : [],
      future: [],
      selectedDayId: t.days[0]?.id,
    })
    scheduleSave(true)
  },
}))

/** 주소의 #d3, #overview 등으로 보던 화면을 기억 (새로고침해도 유지) */
function viewFromHash(trip: Trip): Pick<State, 'view' | 'selectedDayId'> {
  const h = location.hash.slice(1)
  const m = /^d(\d+)$/.exec(h)
  const first = trip.days[0]?.id
  if (m) return { view: 'day', selectedDayId: trip.days[Number(m[1]) - 1]?.id ?? first }
  if (h === 'overview' || h === 'candidates' || h === 'places' || h === 'checklist' || h === 'compare') return { view: h, selectedDayId: first }
  return { view: 'day', selectedDayId: first }
}

useStore.subscribe((s, prev) => {
  if (!s.trip || s.offerHomeScreen || (s.view === prev.view && s.selectedDayId === prev.selectedDayId)) return
  const idx = s.trip.days.findIndex((d) => d.id === s.selectedDayId)
  const hash = s.view === 'day' ? `#d${idx + 1}` : `#${s.view}`
  if (location.hash !== hash) history.replaceState(null, '', hash)
})

let backend: Backend | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined
let tripDirty = false // 일정 자체가 바뀌었는지 (경로 캐시만 바뀐 경우와 구분)
let routesDirty = false
let saving = false
let saveAgain = false

// 예전 버전을 보는 동안 화면 뒤에 맡겨 둔 지금 일정
let stash: { trip: Trip; past: Trip[]; future: Trip[] } | null = null
let lastSaved: Trip | null = null // 저장소에 있는 마지막 일정 (변경 기록의 제목을 만드는 기준)
let nextMessage: string | undefined

function isReadOnly(tell = false): boolean {
  const st = useStore.getState()
  const reason = st.preview ? '예전 버전을 보는 중이라 고칠 수 없어요. 고치려면 먼저 이 버전으로 바꾸세요' : st.offlineSince ? '인터넷이 끊겨 있어 고칠 수 없어요. 다시 연결되면 고칠 수 있어요' : undefined
  if (reason && tell) useStore.setState({ toast: { text: reason, id: Date.now() } })
  return !!reason
}

// ---------- 인터넷이 끊겼을 때 ----------

function cacheForOffline() {
  const st = useStore.getState()
  const trip = stash?.trip ?? st.trip
  if (!trip) return
  try {
    localStorage.setItem(LS_TRIP, JSON.stringify({ ...trip, routeCache: st.routes }))
    localStorage.setItem(LS_TRIP_AT, new Date().toISOString())
  } catch {
    /* 용량 초과 등은 무시 — 저장소 쪽이 기본 */
  }
}

function readCachedTrip(): { trip: Trip; at: string } | null {
  try {
    const raw = localStorage.getItem(LS_TRIP)
    if (!raw) return null
    return { trip: JSON.parse(raw) as Trip, at: localStorage.getItem(LS_TRIP_AT) ?? '' }
  } catch {
    return null
  }
}

/** 저장해 둔 일정을 보기 전용으로 보여주고, 연결되면 최신본으로 돌아간다 */
function enterOffline(trip: Trip, at: string) {
  useStore.setState({
    trip,
    routes: trip.routeCache ?? {},
    ...viewFromHash(trip),
    backendKind: backend?.kind,
    saveStatus: 'offline',
    offlineSince: at || new Date().toISOString(),
    // 구글 지도와 경로도 인터넷이 필요하다. 저장된 키는 그대로 두고 화면에서만 끈다
    apiKey: '',
    googleStatus: 'none',
  })
  const retry = async () => {
    try {
      const remote = await backend?.latest()
      if (!remote) return
      clearInterval(timer)
      window.removeEventListener('online', retry)
      const st = useStore.getState()
      const key = readKey()
      lastSaved = remote.trip
      useStore.setState({
        trip: remote.trip,
        routes: { ...st.routes, ...remote.routes },
        selectedDayId: remote.trip.days.some((d) => d.id === st.selectedDayId) ? st.selectedDayId : remote.trip.days[0]?.id,
        saveStatus: 'saved',
        offlineSince: undefined,
        apiKey: key,
        googleStatus: key ? 'unknown' : 'none',
        toast: { text: '다시 연결돼서 최신 일정을 불러왔어요', id: Date.now() },
      })
      cacheForOffline()
      startSync()
      void loadSharedKey()
    } catch {
      /* 아직 끊겨 있으면 다음 차례에 다시 */
    }
  }
  const timer = setInterval(retry, 15000)
  window.addEventListener('online', retry)
}

// ---------- 예전 버전 보기 ----------

export const getRevisions = (): Revisions | undefined => backend?.revisions

/** 지금 일정 (예전 버전을 보는 중이어도) */
export const liveTrip = (): Trip | null => stash?.trip ?? useStore.getState().trip

async function flushSave() {
  clearTimeout(saveTimer)
  saveTimer = undefined
  if (tripDirty || routesDirty) await save()
  while (saving) await new Promise((r) => setTimeout(r, 100))
}

export async function openPreview(trip: Trip, preview: Preview) {
  await flushSave()
  const st = useStore.getState()
  if (!stash && st.trip) stash = { trip: st.trip, past: st.past, future: st.future }
  useStore.setState({
    trip,
    routes: { ...st.routes, ...(trip.routeCache ?? {}) },
    past: [],
    future: [],
    preview,
    showVersions: false,
    selectedDayId: trip.days.some((d) => d.id === st.selectedDayId) ? st.selectedDayId : trip.days[0]?.id,
  })
}

export function closePreview() {
  if (!stash) return
  const { trip, past, future } = stash
  stash = null
  const st = useStore.getState()
  useStore.setState({
    trip,
    past,
    future,
    preview: undefined,
    selectedDayId: trip.days.some((d) => d.id === st.selectedDayId) ? st.selectedDayId : trip.days[0]?.id,
  })
}

/** 보고 있는 버전을 지금 일정으로. 이전 일정은 변경 기록에 남고 되돌리기로도 돌아갈 수 있다 */
export function applyPreview() {
  const st = useStore.getState()
  if (!stash || !st.trip || !st.preview) return
  const next: Trip = { ...structuredClone(st.trip), updatedAt: new Date().toISOString() }
  delete (next as Partial<Trip>).routeCache
  const past = [...stash.past, stash.trip]
  nextMessage = `이 버전으로 바꿈: ${st.preview.label}`
  stash = null
  useStore.setState({ trip: next, past, future: [], preview: undefined, toast: { text: `${st.preview.label}(으)로 바꿨어요`, id: Date.now() } })
  scheduleSave(true)
}

function scheduleSave(tripChanged = false) {
  if (useStore.getState().saveStatus === 'offline') return
  if (tripChanged) tripDirty = true
  else routesDirty = true
  if (useStore.getState().saveStatus !== 'local') useStore.setState({ saveStatus: 'dirty' })
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, backend?.saveDelayMs ?? 700)
}

export function serializeTrip(): string {
  const { trip, routes } = useStore.getState()
  return JSON.stringify({ ...trip, routeCache: routes }, null, 1)
}

async function save() {
  saveTimer = undefined
  const { routes } = useStore.getState()
  const trip = liveTrip()
  if (!trip) return
  if (saving) {
    saveAgain = true
    return
  }
  cacheForOffline()
  const status = useStore.getState().saveStatus
  if (!backend || status === 'local' || status === 'offline') return
  saving = true
  const sent = { trip: tripDirty, routes: routesDirty }
  tripDirty = false
  routesDirty = false
  useStore.setState({ saveStatus: 'saving' })
  try {
    const message = sent.trip ? (nextMessage ?? changeSummary(lastSaved ? describeChanges(lastSaved, trip) : [])) : undefined
    const result = await backend.push({ trip, routes }, sent, message)
    if (result === 'conflict') {
      tripDirty = tripDirty || sent.trip
      routesDirty = routesDirty || sent.routes
      await resolveConflict()
      return
    }
    if (sent.trip) {
      lastSaved = trip
      nextMessage = undefined
    }
    useStore.setState({ saveStatus: saveTimer || saveAgain ? 'dirty' : 'saved', savedAt: new Date().toISOString() })
  } catch {
    tripDirty = tripDirty || sent.trip
    routesDirty = routesDirty || sent.routes
    useStore.setState({ saveStatus: 'error' })
  } finally {
    saving = false
    if (saveAgain) {
      saveAgain = false
      void save()
    }
  }
}

/** 다른 기기의 최신 내용을 화면에 반영 */
function applyRemote(remote: Snapshot) {
  const st = useStore.getState()
  const routes = { ...st.routes, ...remote.routes }
  const current = stash?.trip ?? st.trip
  lastSaved = remote.trip
  if (current && remote.trip.updatedAt === current.updatedAt) {
    useStore.setState({ routes })
    cacheForOffline()
    return
  }
  if (stash) {
    // 예전 버전을 보는 중이면 화면은 그대로 두고, 돌아갈 일정만 최신으로 바꾼다
    stash = { trip: remote.trip, past: [], future: [] }
    useStore.setState({ routes, toast: { text: '다른 기기에서 일정이 바뀌었어요. 지금 일정으로 돌아가면 보여요', id: Date.now() } })
    cacheForOffline()
    return
  }
  useStore.setState({
    trip: remote.trip,
    routes,
    past: [],
    future: [],
    selectedDayId: remote.trip.days.some((d) => d.id === st.selectedDayId) ? st.selectedDayId : remote.trip.days[0]?.id,
    toast: { text: '다른 기기에서 바꾼 내용을 불러왔어요', id: Date.now() },
  })
  cacheForOffline()
}

/** 저장하려는데 그사이 다른 기기가 먼저 저장한 경우 */
async function resolveConflict() {
  const remote = await backend!.latest()
  if (!remote) throw new Error('최신본을 읽지 못했어요')
  const st = useStore.getState()
  if (tripDirty && st.trip) {
    // 양쪽이 동시에 일정을 고쳤다면 최신본을 쓰고, 내 수정은 되돌리기로 살릴 수 있게 남긴다
    tripDirty = false
    const local = st.trip
    applyRemote(remote)
    useStore.setState({
      past: [local],
      saveStatus: 'saved',
      toast: { text: '다른 기기 수정과 겹쳐 최신본을 불러왔어요. 방금 수정은 되돌리기(↶)로 복구할 수 있어요', id: Date.now() },
    })
    return
  }
  applyRemote(remote)
  useStore.setState({ saveStatus: routesDirty ? 'dirty' : 'saved' })
  if (routesDirty) saveTimer = setTimeout(save, 500)
}

let syncing = false

async function pull() {
  const status = useStore.getState().saveStatus
  if (document.hidden || !backend) return
  if (status === 'error') return void save() // 다시 연결되면 밀린 저장부터
  if (status !== 'saved') return
  try {
    const remote = await backend.pull()
    if (remote && useStore.getState().saveStatus === 'saved') applyRemote(remote)
  } catch {
    /* 연결이 끊겼으면 다음 차례에 다시 */
  }
}

function startSync() {
  if (syncing || !backend) return
  syncing = true
  setInterval(pull, backend.pollMs)
  window.addEventListener('focus', pull)
  document.addEventListener('visibilitychange', pull)
}

/** 구글 키를 저장소에 두어 기기마다 다시 넣지 않게 한다 */
async function loadSharedKey() {
  try {
    const shared = await backend?.readKey()
    const local = useStore.getState().apiKey
    if (shared === undefined) {
      if (local) void backend?.writeKey(local)
    } else if (shared !== local) {
      try {
        if (shared) localStorage.setItem(LS_KEY, shared)
        else localStorage.removeItem(LS_KEY)
      } catch {
        /* ignore */
      }
      useStore.setState({ apiKey: shared, googleStatus: shared ? 'unknown' : 'none', googleMessage: undefined, googleReason: undefined })
    }
  } catch {
    /* 저장소에 닿지 못하면 이 브라우저의 키를 그대로 쓴다 */
  }
}

export function hasGoogle(s: Pick<State, 'apiKey' | 'googleStatus'>): boolean {
  return !!s.apiKey && s.googleStatus !== 'error'
}
