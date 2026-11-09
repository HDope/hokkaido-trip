import type { LatLng } from '../types'

// 구글맵에서 복사한 링크나 공유 글을 읽는다.
// 짧은 링크(maps.app.goo.gl 등)는 브라우저에서 열어볼 수 없어, 같이 붙어 온 가게 이름·주소를 검색어로 쓴다

export type PastedPlace = {
  name?: string
  placeId?: string
  location?: LatLng
  query?: string
  /** 링크만으로는 어떤 곳인지 알 수 없다 */
  unreadable: boolean
}

const URL_RE = /https?:\/\/\S+/i
const COORD = /^(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)$/
const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$/

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' ')).trim()
  } catch {
    return s.trim()
  }
}

const toLatLng = (m: RegExpExecArray | null): LatLng | undefined => (m ? { lat: Number(m[1]), lng: Number(m[2]) } : undefined)

/** 링크가 들어 있는 글이면 읽어서 돌려주고, 그냥 검색어면 undefined */
export function readPastedPlace(text: string): PastedPlace | undefined {
  const found = URL_RE.exec(text)
  if (!found) return undefined
  const rest = text.replace(found[0], ' ').replace(/\s+/g, ' ').trim() || undefined
  let url: URL
  try {
    url = new URL(found[0])
  } catch {
    return { query: rest, unreadable: !rest }
  }
  if (!GOOGLE_HOST.test(url.hostname)) return { query: rest, unreadable: !rest }

  const p = url.searchParams
  const asked = p.get('q') ?? p.get('query') ?? p.get('destination') ?? undefined
  const askedId = /^place_id:(.+)$/.exec(asked ?? '')?.[1]
  const askedSpot = COORD.exec(asked ?? '') ?? undefined
  const typed = asked && !askedId && !askedSpot ? asked.trim() : undefined
  const placeId = p.get('query_place_id') ?? p.get('destination_place_id') ?? askedId
  const named = /\/maps\/(?:place|search)\/([^/]+)/.exec(url.pathname)
  const pathName = named ? decode(named[1]) : undefined
  const name = pathName && !COORD.test(pathName) ? pathName : undefined
  const location =
    toLatLng(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(found[0])) ??
    toLatLng(askedSpot ?? null) ??
    toLatLng(/@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(found[0])) ??
    toLatLng(COORD.exec(pathName ?? ''))
  const query = name ?? typed ?? rest
  return { name, placeId: placeId ?? undefined, location, query, unreadable: !placeId && !query }
}
