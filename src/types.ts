export type LatLng = { lat: number; lng: number }

// 구글 Places API 와 같은 규칙: day 0 = 일요일, 시간은 현지(JST)
export type HoursPoint = { day: number; hour: number; minute: number }
export type HoursPeriod = { open: HoursPoint; close?: HoursPoint }

export type Hours = {
  periods: HoursPeriod[]
  weekdayText?: string[] // 구글 weekdayDescriptions (월요일부터)
  source: 'google' | 'manual' | 'curated'
  note?: string
}

export type PlaceKind = 'sight' | 'food' | 'cafe' | 'shop' | 'onsen' | 'hotel' | 'airport' | 'other'

export type BusinessStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'

// 주차: free 무료 전용 주차장 / paid 유료 전용 주차장 / nearby 전용은 없고 근처 유료 / none 차를 댈 곳이 없음
export type ParkingStatus = 'free' | 'paid' | 'nearby' | 'none'

export type Parking = {
  status: ParkingStatus
  fee?: string // 대략 요금. 없으면 요금을 확인하지 못한 것
  note?: string
  // 어디서 나온 정보인지: official 공식 / web 여행 사이트·안내 글 / google 구글 표시(요금 없음) / estimate 주변 시세로 추정 / manual 직접 입력
  source: 'official' | 'web' | 'google' | 'estimate' | 'manual'
  url?: string
}

export type Place = {
  id: string
  name: string
  nameLocal?: string
  kind: PlaceKind
  location: LatLng
  address?: string
  googlePlaceId?: string
  googleMapsUri?: string
  businessStatus?: BusinessStatus
  hours?: Hours
  alwaysOpen?: boolean // 야외 명소 등 영업시간 개념이 없는 곳
  phone?: string // 렌터카 내비 검색용
  parking?: Parking
  mapcode?: string
  rating?: number
  ratingCount?: number
  website?: string
  defaultStay?: number
  season?: string // 6월 기준 계절 정보 (큐레이션)
  tips?: string
  note?: string
  verifiedAt?: string // 구글로 마지막 확인한 시각
  matchWarning?: string
  googleName?: string // 구글에서 연결된 장소 이름 (엉뚱한 곳과 연결되지 않았는지 확인용)
  skipGoogle?: boolean // 행사처럼 구글 장소와 맞지 않는 곳은 검증에서 제외
}

export type LegMode = 'DRIVE' | 'WALK' | 'TRANSIT' | 'MANUAL'

/** 같은 자리에 갈 수 있는 다른 후보 (예: 저녁 식당 후보). 일정 계산에는 들어가지 않는다 */
export type StopAlt = {
  id: string
  placeId: string
  stay?: number // 비우면 지금 자리의 체류 시간
  note?: string
  picks?: string[] // 이 후보를 고른 사람 id
}

/** 함께 고르는 사람 (픽 버튼에 이름이 나온다) */
export type Traveler = { id: string; name: string }

export type Stop = {
  id: string
  placeId: string
  stay: number // 분
  fixedTime?: string // "HH:MM" 이 시각에 도착하도록 고정 (일찍 오면 대기)
  legMode?: LegMode // 이 장소로 오는 구간의 이동수단
  manualMinutes?: number
  note?: string
  meal?: MealMark // 비우면 식당을 도착 시각으로 판단
  picks?: string[] // 지금 장소를 고른 사람 id
  alts?: StopAlt[] // 다른 후보들
}

export type MealMark = 'lunch' | 'dinner' | 'none'

export type Day = {
  id: string
  title?: string
  startPlaceId?: string // 비우면 전날 숙소
  startTime: string
  stops: Stop[]
  lodgingPlaceId?: string
  endLegMode?: LegMode
  endManualMinutes?: number
  note?: string
}

export type Settings = {
  parkingBuffer: number // 운전 구간마다 더하는 주차·도보 여유(분)
  freeModeFactor: number // 무료 경로(Valhalla/OSRM)는 신호·정체를 몰라 약간 낙관적 → 곱하는 보정값
  avoidTolls: boolean
  dailyDriveWarn: number // 분
  dailyDriveLimit: number // 분
  travelers?: Traveler[] // 픽 버튼에 쓰는 이름
}

export type RouteLeg = {
  provider: 'google' | 'valhalla' | 'osrm' | 'estimate'
  seconds: number
  meters: number
  polyline?: string
  tollYen?: number | null // 예상 톨비(엔). 0 톨게이트 없음, null 톨게이트는 있는데 요금을 모름, 없으면 아직 확인 안 함
  fetchedAt: string
  error?: string
}

export type Trip = {
  version: 1
  title: string
  startDate: string // YYYY-MM-DD
  days: Day[]
  places: Record<string, Place>
  wishlist: string[]
  checklist: { id: string; text: string; done: boolean }[]
  settings: Settings
  routeCache: Record<string, RouteLeg>
  updatedAt: string
}
