import type { LatLng } from '../../types'

export type MapMarker = {
  id: string
  position: LatLng
  label: string // 핀 안의 글자 (번호 등)
  color: string
  title: string
  dim?: boolean
  lodging?: boolean
  ring?: boolean // 흰 바탕에 색 테두리 — 아이콘(이모지)을 넣을 때
  html?: string // 핀 대신 직접 그린 내용 (지역 요약 카드)
}

export type MapPath = {
  id: string
  points: [number, number][]
  color: string
  dim?: boolean
  dashed?: boolean
}

export type MapViewProps = {
  markers: MapMarker[]
  paths: MapPath[]
  fitKey: string // 바뀌면 전체가 보이도록 맞춤
  fitPadding?: number
  focus?: { position: LatLng; key: string }
  onMarkerClick?: (id: string) => void
}

export function pinSize(m: MapMarker): number {
  if (m.html) return 0
  return m.lodging ? 30 : m.ring ? 28 : 26
}

export function pinHtml(m: MapMarker): string {
  if (m.html) return m.html
  const size = pinSize(m)
  const inner = m.lodging ? '🛏' : m.label
  const bg = m.ring ? '#fff' : m.color
  const shadow = m.ring ? `0 0 0 2.5px ${m.color},0 2px 5px rgba(0,0,0,.3)` : '0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.35)'
  const fontSize = m.lodging ? 14 : m.ring ? 15 : 12
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font:700 ${fontSize}px/1 Pretendard,system-ui,sans-serif;box-shadow:${shadow};opacity:${m.dim ? 0.45 : 1};cursor:pointer" title="${m.title.replace(/"/g, '&quot;')}">${inner}</div>`
}
