import type { PlaceKind } from './types'
import type { Level } from './lib/schedule'

// 일자별 색 — dataviz 기본 범주 팔레트 순서 그대로 (색약 구분 검증된 순서)
export const DAY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

export const dayColor = (i: number) => DAY_COLORS[i % DAY_COLORS.length]

export const KIND_ICON: Record<PlaceKind, string> = {
  sight: '🏞️',
  food: '🍜',
  cafe: '☕',
  shop: '🛍️',
  onsen: '♨️',
  hotel: '🛏️',
  airport: '✈️',
  other: '📌',
}

export const KIND_LABEL: Record<PlaceKind, string> = {
  sight: '명소',
  food: '식당',
  cafe: '카페·디저트',
  shop: '쇼핑',
  onsen: '온천',
  hotel: '숙소',
  airport: '공항',
  other: '기타',
}

export const LEVEL_META: Record<Level, { icon: string; label: string; cls: string; dot: string }> = {
  critical: { icon: '⛔', label: '불가', cls: 'bg-[#fdecec] border-[#d03b3b]', dot: 'bg-[#d03b3b]' },
  serious: { icon: '⚠️', label: '주의', cls: 'bg-[#fdf0ea] border-[#ec835a]', dot: 'bg-[#ec835a]' },
  warning: { icon: '⚠️', label: '확인', cls: 'bg-[#fff6e0] border-[#fab219]', dot: 'bg-[#fab219]' },
  info: { icon: 'ℹ️', label: '참고', cls: 'bg-stone-50 border-stone-300', dot: 'bg-stone-400' },
}
