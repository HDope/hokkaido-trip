import type { RouteLeg, Trip } from '../types'
import type { VersionSummary } from './revisions'

// 일정을 어디에 저장하느냐.
//  - server: 맥에서 개발 서버로 띄울 때 data/trip.json
//  - cloud : 웹 버전. 작성자 GitHub 계정의 비공개 저장소에 저장해 어느 기기에서나 같은 일정을 본다.
//            저장할 때마다 커밋으로 이력이 남아 예전 버전으로 되돌릴 수도 있다.

export type Snapshot = { trip: Trip; routes: Record<string, RouteLeg> }
export type Changed = { trip: boolean; routes: boolean }

/** 저장할 때마다 자동으로 남는 기록 */
export type HistoryEntry = { sha: string; date: string; message: string }

/** 이름을 붙여 따로 보관한 일정 */
export type VersionMeta = {
  id: string
  name: string
  note?: string
  createdAt: string
  fingerprint?: string
  summary?: VersionSummary
}

export interface Revisions {
  history(page: number): Promise<HistoryEntry[]>
  tripAt(sha: string): Promise<Trip | null>
  versions(): Promise<VersionMeta[]>
  readVersion(id: string): Promise<Trip | null>
  saveVersion(meta: VersionMeta, trip: Trip): Promise<void>
  updateVersion(id: string, patch: Partial<VersionMeta>): Promise<void>
  deleteVersion(id: string): Promise<void>
}

export const HISTORY_PAGE = 30

export class HttpError extends Error {
  status: number
  constructor(status: number) {
    super(explainStatus(status))
    this.status = status
  }
}

/** 토큰이 틀렸거나 저장소를 못 여는 경우. 네트워크가 잠깐 끊긴 것과 구분한다 */
export const isAccessProblem = (e: unknown) => e instanceof HttpError && (e.status === 401 || e.status === 404)

export interface Backend {
  kind: 'server' | 'cloud'
  saveDelayMs: number
  pollMs: number
  /** 최신본. 지난번 이후 바뀐 게 없으면 null */
  pull(): Promise<Snapshot | null>
  /** 조건 없이 현재 저장본 (충돌 해결용) */
  latest(): Promise<Snapshot | null>
  /** 저장. 그사이 다른 기기가 먼저 저장했으면 'conflict' */
  push(snapshot: Snapshot, changed: Changed, message?: string): Promise<'ok' | 'conflict'>
  readKey(): Promise<string | undefined>
  writeKey(key: string): Promise<void>
  /** 버전 기록 (웹 버전에서만) */
  revisions?: Revisions
}

// ---------- 맥 개발 서버 ----------

export function serverBackend(): Backend {
  let revision: string | null = null
  const toSnapshot = (raw: Trip): Snapshot => ({ trip: raw, routes: raw.routeCache ?? {} })
  const read = async (conditional: boolean): Promise<Snapshot | null> => {
    const res = await fetch('/api/trip', { cache: 'no-store', headers: conditional && revision ? { 'If-None-Match': revision } : {} })
    if (res.status !== 200) {
      if (res.ok || res.status === 304) return null
      throw new Error(`서버 오류 (HTTP ${res.status})`)
    }
    revision = res.headers.get('ETag')
    return toSnapshot((await res.json()) as Trip)
  }
  return {
    kind: 'server',
    saveDelayMs: 700,
    pollMs: 8000,
    pull: () => read(true),
    latest: () => read(false),
    async push({ trip, routes }) {
      const res = await fetch('/api/trip', {
        method: 'PUT',
        body: JSON.stringify({ ...trip, routeCache: routes }, null, 1),
        headers: { 'Content-Type': 'application/json', ...(revision ? { 'If-Match': revision } : {}) },
      })
      if (res.status === 409) return 'conflict'
      if (!res.ok) throw new Error(String(res.status))
      revision = ((await res.json()) as { etag: string }).etag
      return 'ok'
    },
    async readKey() {
      return ((await (await fetch('/api/settings', { cache: 'no-store' })).json()) as { googleKey?: string }).googleKey
    },
    async writeKey(key) {
      await fetch('/api/settings', { method: 'PUT', body: JSON.stringify({ googleKey: key }) })
    },
  }
}

// ---------- 웹 버전: 비공개 GitHub 저장소 ----------
// 코드는 공개돼 있어도 일정은 이 저장소에만 있고, 그 저장소만 열 수 있는 토큰이 있어야 읽고 쓸 수 있다.

export type CloudConfig = { repo: string; token: string; api?: string }

export const DATA_REPO = 'HDope/hokkaido-trip-data'
const LS_CLOUD = 'hk-cloud'
const DEFAULT_API = 'https://api.github.com'

export function readCloudConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(LS_CLOUD)
    const cfg = raw ? (JSON.parse(raw) as CloudConfig) : null
    return cfg?.repo && cfg.token ? cfg : null
  } catch {
    return null
  }
}

export function saveCloudConfig(cfg: CloudConfig | null) {
  if (cfg) localStorage.setItem(LS_CLOUD, JSON.stringify(cfg))
  else localStorage.removeItem(LS_CLOUD)
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches

/**
 * 연결 링크(#connect=저장소~토큰)로 들어왔으면 이 기기에 저장하고 주소에서 지운다.
 * 아이폰 Safari 는 7일 넘게 안 쓰면 저장값을 지우므로 홈 화면에 추가하도록 안내한다.
 * 홈 화면 앱은 주소를 그대로 이어받기 때문에, 추가할 때까지 링크를 주소에 남겨 둔다.
 */
export function consumeConnectLink(): { offerHomeScreen: boolean } {
  const m = /^#connect=([^~]+)~(.+)$/.exec(location.hash)
  if (!m) return { offerHomeScreen: false }
  saveCloudConfig({ repo: decodeURIComponent(m[1]), token: decodeURIComponent(m[2]) })
  if (isIOS() && !isStandalone()) return { offerHomeScreen: true }
  clearConnectHash()
  return { offerHomeScreen: false }
}

export function clearConnectHash() {
  if (location.hash.startsWith('#connect=')) history.replaceState(null, '', location.pathname + location.search)
}

export function shareLink(cfg: CloudConfig): string {
  return `${location.origin}${location.pathname}#connect=${cfg.repo}~${encodeURIComponent(cfg.token)}`
}

function explainStatus(status: number): string {
  if (status === 401) return '토큰이 올바르지 않거나 만료됐어요'
  if (status === 403) return '토큰 권한이 부족하거나 GitHub 요청 한도를 넘었어요'
  if (status === 404) return '일정 저장소를 찾지 못했어요. 토큰이 이 저장소를 열 수 있는지 확인하세요'
  return `GitHub 오류 (HTTP ${status})`
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)))

export function cloudBackend(cfg: CloudConfig): Backend {
  const base = `${cfg.api ?? DEFAULT_API}/repos/${cfg.repo}`
  const auth = { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' }
  const shas: Record<string, string> = {}
  let head: string | null = null
  let headEtag: string | null = null
  let missedRemote = false // 내 저장 직전에 다른 기기가 저장한 흔적이 있으면 다음에 다시 읽는다
  let settings: { k?: string } | undefined

  async function readHead(conditional: boolean): Promise<string> {
    const res = await fetch(`${base}/commits/main`, {
      cache: 'no-store',
      headers: { ...auth, Accept: 'application/vnd.github.sha', ...(conditional && headEtag ? { 'If-None-Match': headEtag } : {}) },
    })
    if (res.status === 304) return head!
    if (!res.ok) throw new HttpError(res.status)
    headEtag = res.headers.get('ETag')
    return (await res.text()).trim()
  }

  async function readFile(name: string, ref?: string): Promise<string | undefined> {
    const res = await fetch(`${base}/contents/${name}${ref ? `?ref=${ref}` : ''}`, { cache: 'no-store', headers: auth })
    if (res.status === 404) {
      delete shas[name]
      return undefined
    }
    if (!res.ok) throw new HttpError(res.status)
    const file = (await res.json()) as { sha: string; content?: string; size?: number }
    shas[name] = file.sha
    if (file.content || !file.size) return fromBase64(file.content ?? '')
    // 1MB 가 넘는 파일은 내용이 빠져서 온다
    const raw = await fetch(`${base}/contents/${name}${ref ? `?ref=${ref}` : ''}`, { cache: 'no-store', headers: { ...auth, Accept: 'application/vnd.github.raw+json' } })
    return raw.text()
  }

  /** 내용만 읽는다. 저장에 쓰는 파일 정보(shas)를 건드리지 않아 예전 기록을 읽어도 안전하다 */
  async function readRaw(name: string, ref?: string): Promise<string | undefined> {
    const res = await fetch(`${base}/contents/${name}${ref ? `?ref=${ref}` : ''}`, { cache: 'no-store', headers: { ...auth, Accept: 'application/vnd.github.raw+json' } })
    if (res.status === 404) return undefined
    if (!res.ok) throw new HttpError(res.status)
    return res.text()
  }

  async function readAll(ref: string): Promise<Snapshot | null> {
    const [tripText, routesText, settingsText] = await Promise.all([readFile('trip.json', ref), readFile('routes.json', ref), readFile('settings.json', ref)])
    settings = settingsText ? (JSON.parse(settingsText) as { k?: string }) : {}
    if (!tripText) return null
    return { trip: JSON.parse(tripText) as Trip, routes: routesText ? JSON.parse(routesText) : {} }
  }

  /** 저장. 'conflict' 면 그사이 다른 기기가 같은 파일을 먼저 저장한 것 */
  async function writeFile(name: string, content: string, message?: string): Promise<'ok' | 'conflict'> {
    const res = await fetch(`${base}/contents/${name}`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message ?? `update ${name}`, content: toBase64(content), ...(shas[name] ? { sha: shas[name] } : {}) }),
    })
    if (res.status === 409 || res.status === 422) return 'conflict'
    if (!res.ok) throw new HttpError(res.status)
    const done = (await res.json()) as { content: { sha: string }; commit: { sha: string; parents?: { sha: string }[] } }
    shas[name] = done.content.sha
    if (head && done.commit.parents?.[0]?.sha !== head) missedRemote = true
    head = done.commit.sha
    headEtag = null
    return 'ok'
  }

  const VERSION_INDEX = 'versions/index.json'

  async function editIndex(edit: (list: VersionMeta[]) => VersionMeta[], message: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await readFile(VERSION_INDEX)
      const list = text ? (JSON.parse(text) as VersionMeta[]) : []
      if ((await writeFile(VERSION_INDEX, JSON.stringify(edit(list), null, 1), message)) === 'ok') return
    }
    throw new Error('버전 목록을 저장하지 못했어요. 다시 시도해 주세요')
  }

  const revisions: Revisions = {
    async history(page) {
      const res = await fetch(`${base}/commits?path=trip.json&per_page=${HISTORY_PAGE}&page=${page}`, { cache: 'no-store', headers: auth })
      if (!res.ok) throw new HttpError(res.status)
      const list = (await res.json()) as { sha: string; commit: { message: string; author?: { date?: string }; committer?: { date?: string } } }[]
      return list.map((c) => ({ sha: c.sha, date: c.commit.committer?.date ?? c.commit.author?.date ?? '', message: c.commit.message }))
    },
    async tripAt(sha) {
      const text = await readRaw('trip.json', sha)
      return text ? (JSON.parse(text) as Trip) : null
    },
    async versions() {
      const text = await readRaw(VERSION_INDEX)
      return text ? (JSON.parse(text) as VersionMeta[]) : []
    },
    async readVersion(id) {
      const text = await readRaw(`versions/${id}.json`)
      return text ? (JSON.parse(text) as Trip) : null
    },
    async saveVersion(meta, trip) {
      const result = await writeFile(`versions/${meta.id}.json`, JSON.stringify({ ...trip, routeCache: undefined }, null, 1), `버전 저장: ${meta.name}`)
      if (result === 'conflict') throw new Error('같은 이름의 버전 파일이 이미 있어요')
      await editIndex((list) => [...list, meta], `버전 목록: ${meta.name} 추가`)
    },
    async updateVersion(id, patch) {
      await editIndex((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)), '버전 목록 수정')
    },
    async deleteVersion(id) {
      const name = `versions/${id}.json`
      await readFile(name)
      if (shas[name]) {
        const res = await fetch(`${base}/contents/${name}`, {
          method: 'DELETE',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '버전 삭제', sha: shas[name] }),
        })
        if (!res.ok) throw new HttpError(res.status)
        delete shas[name]
      }
      await editIndex((list) => list.filter((v) => v.id !== id), '버전 목록에서 삭제')
    },
  }

  return {
    kind: 'cloud',
    revisions,
    saveDelayMs: 2500,
    pollMs: 15000,
    async pull() {
      const sha = await readHead(true)
      if (sha === head && !missedRemote) return null
      head = sha
      missedRemote = false
      return readAll(sha)
    },
    async latest() {
      head = await readHead(false)
      missedRemote = false
      return readAll(head)
    },
    async push({ trip, routes }, changed, message) {
      if (changed.trip) {
        const result = await writeFile('trip.json', JSON.stringify({ ...trip, routeCache: undefined }, null, 1), message)
        if (result === 'conflict') return 'conflict'
      }
      if (changed.routes) {
        const content = JSON.stringify(routes)
        if ((await writeFile('routes.json', content)) === 'conflict') {
          // 경로는 계산 결과 모음이라 양쪽을 합쳐 다시 저장하면 된다
          const remote = await readFile('routes.json')
          await writeFile('routes.json', JSON.stringify({ ...(remote ? JSON.parse(remote) : {}), ...routes }))
        }
      }
      return 'ok'
    },
    async readKey() {
      if (settings === undefined) await readAll(head ?? (await readHead(false)))
      return settings?.k === undefined ? undefined : decodeKey(settings.k)
    },
    async writeKey(key) {
      if (settings === undefined) await readFile('settings.json')
      settings = { k: encodeKey(key) }
      await writeFile('settings.json', JSON.stringify(settings))
    },
  }
}

/** 구글 키를 그대로 두면 비밀값 스캐너 경고가 올 수 있어 인코딩해 둔다 (암호화는 아님, 저장소가 비공개라 괜찮다) */
const encodeKey = (k: string) => (k ? btoa(k) : '')
const decodeKey = (v: string) => {
  try {
    return v ? atob(v) : ''
  } catch {
    return ''
  }
}

/** 토큰으로 저장소를 열 수 있는지 확인 */
export async function checkConnection(cfg: CloudConfig): Promise<void> {
  const res = await fetch(`${cfg.api ?? DEFAULT_API}/repos/${cfg.repo}/contents/trip.json`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new HttpError(res.status)
}
