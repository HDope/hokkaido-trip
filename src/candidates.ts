import type { Hours, LatLng, Place, PlaceKind, Trip } from './types'
import { dailyHours } from './lib/hours'

// 테마별 후보 — 동선을 정하기 전 지역 분포를 보기 위한 목록 (일정 데이터와 별개)
// 좌표는 OpenStreetMap·국토지리원 주소 검색 기준이라 일부는 동네 수준 대략치. 장소함에 담은 뒤 구글로 검증하면 보정된다.
// status: 'web' = 2025~2026 웹 자료에서 영업·운영 정보를 찾음 / 'todo' = 잘 알려진 곳이지만 현재 운영 정보를 확인 못함

export type ThemeId = 'wine' | 'beer' | 'sake' | 'lake' | 'lavender' | 'film' | 'onsen' | 'crab' | 'cheese' | 'golf' | 'shop' | 'arch'
export type RegionId = 'otaru' | 'sapporo' | 'airport' | 'south' | 'niseko' | 'furano' | 'asahikawa' | 'east' | 'hakodate'
type Group = 'drink' | 'scene' | 'food'

export const GROUP: Record<Group, { label: string; color: string }> = {
  scene: { label: '풍경·휴식', color: '#2a78d6' },
  drink: { label: '술 투어', color: '#eb6834' },
  food: { label: '먹거리·쇼핑', color: '#1baf7a' },
}

export const THEMES: { id: ThemeId; label: string; icon: string; group: Group }[] = [
  { id: 'wine', label: '와이너리', icon: '🍇', group: 'drink' },
  { id: 'beer', label: '맥주 공장', icon: '🍺', group: 'drink' },
  { id: 'sake', label: '사케 양조장', icon: '🍶', group: 'drink' },
  { id: 'lake', label: '호수', icon: '💧', group: 'scene' },
  { id: 'lavender', label: '라벤더', icon: '💜', group: 'scene' },
  { id: 'film', label: '러브레터', icon: '🎬', group: 'scene' },
  { id: 'onsen', label: '온천', icon: '♨️', group: 'scene' },
  { id: 'crab', label: '털게', icon: '🦀', group: 'food' },
  { id: 'cheese', label: '치즈케이크', icon: '🍰', group: 'food' },
  { id: 'golf', label: '골프', icon: '⛳', group: 'scene' },
  { id: 'arch', label: '안도 타다오', icon: '🏛️', group: 'scene' },
  { id: 'shop', label: '데님·시계', icon: '⌚', group: 'food' },
]

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, (typeof THEMES)[number]>

export const REGIONS: { id: RegionId; label: string }[] = [
  { id: 'otaru', label: '오타루·요이치' },
  { id: 'sapporo', label: '삿포로' },
  { id: 'airport', label: '치토세 공항권' },
  { id: 'furano', label: '후라노·비에이' },
  { id: 'south', label: '노보리베츠·도야' },
  { id: 'niseko', label: '니세코·루스츠' },
  { id: 'east', label: '도동·오호츠크' },
  { id: 'asahikawa', label: '아사히카와' },
  { id: 'hakodate', label: '하코다테권' },
]

export type Candidate = {
  id: string
  theme: ThemeId
  region: RegionId
  name: string
  nameLocal: string
  location: LatLng
  kind: PlaceKind
  status: 'web' | 'todo'
  blurb: string
  june?: string // 6/13~21 기준으로 알아둘 점
  stay?: number
  hours?: Hours
  alwaysOpen?: boolean
  phone?: string
  placeRef?: string // 이미 있는 장소와 같은 곳이면 그 id
}

const web = (note: string, open: string, close: string, closed: number[] = []) => dailyHours(open, close, closed, `${note} — 웹 정보, 출발 전 재확인`)

export const CANDIDATES: Candidate[] = [
  // 와이너리
  { id: 'c-hokkaidowine', theme: 'wine', region: 'otaru', name: '홋카이도 와인 오타루 양조장', nameLocal: 'おたるワインギャラリー', location: { lat: 43.15395, lng: 141.0242 }, kind: 'sight', status: 'web', stay: 90, hours: web('연말연시 휴무', '09:00', '17:00'), blurb: '오타루 산쪽의 대형 와이너리. 유료 가이드 투어 여러 코스(예약제). JR 미나미오타루역에서 택시 약 15분.' },
  { id: 'c-niki', theme: 'wine', region: 'otaru', name: 'NIKI Hills 와이너리', nameLocal: 'NIKI Hills Winery', location: { lat: 43.15916, lng: 140.74493 }, kind: 'sight', status: 'web', stay: 120, hours: web('부정기 휴무', '10:00', '16:00'), blurb: '포도밭 언덕의 리조트형 와이너리. 양조 설명+시음 투어, 런치 ¥3,850, 숙박 문의 가능. 투어 요금·예약 방법은 공식 확인 필요.' },
  { id: 'c-occigabi', theme: 'wine', region: 'otaru', name: '오치가비 와이너리', nameLocal: 'OcciGabi Winery', location: { lat: 43.17606, lng: 140.77736 }, kind: 'sight', status: 'web', stay: 90, hours: web('12~1월 휴무 있음', '11:00', '17:00'), blurb: '요이치 포도밭 속 와이너리. 양조장·밭 투어+런치 ¥6,600(사전예약), 카운터 시음 3종 ¥550(예약 불필요).' },
  { id: 'c-furanowine', theme: 'wine', region: 'furano', name: '후라노 와이너리', nameLocal: 'ふらのワイン工場', location: { lat: 43.35856, lng: 142.3737 }, kind: 'sight', status: 'web', stay: 45, hours: web('', '09:00', '17:00'), blurb: '후라노 언덕의 와인 공장. 견학 무료, 10명 이상만 예약. 후라노 일정에 끼워 넣기 쉬움.' },
  { id: 'c-chitosewine', theme: 'wine', region: 'airport', name: '치토세 와이너리', nameLocal: '千歳ワイナリー', location: { lat: 42.83245, lng: 141.64875 }, kind: 'sight', status: 'todo', stay: 40, blurb: '석조 창고의 작은 양조장, 하스카프 와인으로 유명. 공항 근처. 예약 방법은 확인 못함.' },

  // 맥주
  { id: 'c-sapporobeer', theme: 'beer', region: 'sapporo', name: '삿포로 맥주 박물관', nameLocal: 'サッポロビール博物館', location: { lat: 43.07141, lng: 141.369 }, kind: 'sight', status: 'web', stay: 90, blurb: '2026/7/1 리뉴얼. 프리미엄 투어 ¥1,000(사전예약). 전시 중심으로 여기서 맥주를 만들지는 않아요. 옆 비어가든과 묶기 좋음.', june: '프리미엄 투어는 월요일 쉼 → 6/14, 6/21 불가' },
  { id: 'c-eniwa', theme: 'beer', region: 'airport', name: '삿포로 맥주 홋카이도 공장', nameLocal: 'サッポロビール北海道工場', location: { lat: 42.86202, lng: 141.59901 }, kind: 'sight', status: 'web', stay: 75, blurb: '실제 공장 견학(약 60분, 시음 20분 포함), ¥1,000. 희망일 4주 전부터 예약(웹은 90일 전이라는 자료도 있음). 공항에서 가까움.' },
  { id: 'c-kirin', theme: 'beer', region: 'airport', name: '기린 맥주 홋카이도 치토세 공장', nameLocal: 'キリンビール北海道千歳工場', location: { lat: 42.84887, lng: 141.6205 }, kind: 'sight', status: 'web', stay: 75, blurb: '이치방시보리 투어 ¥500, 완전 예약제. 2025년 자료 기준.', june: '월·화 휴무 → 6/14, 6/15, 6/21 불가' },
  { id: 'c-otarusoko', theme: 'beer', region: 'otaru', name: '오타루 비어 오타루 창고 No.1', nameLocal: '小樽倉庫No.1', location: { lat: 43.19903, lng: 141.00269 }, kind: 'food', status: 'web', stay: 75, hours: web('부정기 휴무, 출처별 차이', '11:00', '21:00'), blurb: '운하 옆 석조 창고 브루펍. 양조 설비 무료 견학·예약 불필요. JR 오타루역 도보 약 10분이라 차 없이 마시기 좋음.' },
  { id: 'c-zenibako', theme: 'beer', region: 'otaru', name: '오타루 비어 제니바코 양조장', nameLocal: '小樽ビール銭函醸造所', location: { lat: 43.14086, lng: 141.17383 }, kind: 'sight', status: 'web', stay: 75, blurb: '오타루 비어의 본격 양조장 투어, 예약제 ¥2,200. 오타루와 삿포로 사이.' },

  // 사케
  { id: 'c-tanaka', theme: 'sake', region: 'otaru', name: '타나카 주조 키코구라', nameLocal: '田中酒造 亀甲蔵', location: { lat: 43.18617, lng: 141.01344 }, kind: 'sight', status: 'web', stay: 45, hours: web('무휴, 마감은 출처별 차이', '09:05', '17:30'), blurb: '1905년 석조 창고. 일 년 내내 빚는 사계 양조라 여름에도 작업을 볼 수 있음. 견학·시음 무료. JR 미나미오타루역 도보 약 5분.' },
  { id: 'c-chitosetsuru', theme: 'sake', region: 'sapporo', name: '치토세츠루 사케 뮤지엄', nameLocal: '千歳鶴 酒ミュージアム', location: { lat: 43.05923, lng: 141.36443 }, kind: 'shop', status: 'web', stay: 40, hours: web('연말연시 휴무', '10:00', '18:00'), blurb: '삿포로 시내 무료 전시+시음 카운터. 가이드 투어는 없고 양조 현장도 아니에요.' },
  { id: 'c-otokoyama', theme: 'sake', region: 'asahikawa', name: '오토코야마 사케 파크', nameLocal: '男山酒造り資料館', location: { lat: 43.79604, lng: 142.40937 }, kind: 'sight', status: 'web', stay: 45, hours: web('', '09:00', '17:00'), blurb: '2024년 리뉴얼. 무료 자료관과 시음 코너, 양조장 한정 판매.', june: '창 너머 양조 견학은 겨울 한정 → 6월엔 전시 위주' },
  { id: 'c-takasago', theme: 'sake', region: 'asahikawa', name: '타카사고 주조', nameLocal: '高砂酒造', location: { lat: 43.7603, lng: 142.37245 }, kind: 'sight', status: 'todo', stay: 45, blurb: '"국사무쌍" 양조장. 10시·15시 예약 견학이 있는 듯하나 자료가 부분적이라 전화 확인 필요.' },

  // 호수
  { id: 'c-shikotsu', theme: 'lake', region: 'airport', name: '시코츠호', nameLocal: '支笏湖ビジターセンター', location: { lat: 42.77274, lng: 141.40407 }, kind: 'sight', status: 'web', alwaysOpen: true, placeRef: 'p-shikotsu', blurb: '투명도 높은 칼데라 호수. 공항에서 차로 40분대.' },
  { id: 'c-okotanpe', theme: 'lake', region: 'airport', name: '오코탄페호', nameLocal: 'オコタンペ湖', location: { lat: 42.80059, lng: 141.25655 }, kind: 'sight', status: 'todo', alwaysOpen: true, stay: 20, blurb: '시코츠호 서쪽 산길 전망대에서 내려다보는 코발트빛 호수. 호반까지 내려가지는 못하는 것으로 알고 있어요.' },
  { id: 'c-toya', theme: 'lake', region: 'south', name: '도야호 (사일로 전망대)', nameLocal: 'サイロ展望台', location: { lat: 42.62579, lng: 140.79968 }, kind: 'sight', status: 'web', placeRef: 'p-silo', blurb: '칼데라 호수 전경. 호반 온천가에선 매일 밤 20:45 불꽃놀이(2026년 4/28~10/31 기준).' },
  { id: 'c-aoiike', theme: 'lake', region: 'furano', name: '시로가네 청의 호수', nameLocal: '白金青い池', location: { lat: 43.49349, lng: 142.6141 }, kind: 'sight', status: 'todo', alwaysOpen: true, placeRef: 'p-aoiike', blurb: '비에이의 푸른 연못. 바람 없는 맑은 오전이 가장 파래요.' },
  { id: 'c-shikaribetsu', theme: 'lake', region: 'east', name: '시카리베츠호', nameLocal: '然別湖', location: { lat: 43.28154, lng: 143.11675 }, kind: 'sight', status: 'todo', alwaysOpen: true, stay: 60, blurb: '도카치 쪽 산중 호수. 조용하고 개발이 적음.' },
  { id: 'c-mashu', theme: 'lake', region: 'east', name: '마슈호', nameLocal: '摩周湖第一展望台', location: { lat: 43.5485, lng: 144.5258 }, kind: 'sight', status: 'todo', alwaysOpen: true, stay: 40, blurb: '안개로 유명한 쪽빛 호수. 전망대에서만 봐요.' },
  { id: 'c-kussharo', theme: 'lake', region: 'east', name: '굿샤로호', nameLocal: '屈斜路湖', location: { lat: 43.61657, lng: 144.31053 }, kind: 'sight', status: 'todo', alwaysOpen: true, stay: 40, blurb: '일본 최대 칼데라 호수. 모래를 파면 온천이 나오는 스나유로 알려져 있어요.' },
  { id: 'c-akan', theme: 'lake', region: 'east', name: '아칸호', nameLocal: '阿寒湖', location: { lat: 43.45595, lng: 144.09924 }, kind: 'sight', status: 'todo', alwaysOpen: true, stay: 60, blurb: '마리모와 아이누 마을로 유명. 호반 온천가가 있어 1박 거점이 돼요.' },
  { id: 'c-shiretoko', theme: 'lake', region: 'east', name: '시레토코 5호', nameLocal: '知床五湖', location: { lat: 44.12218, lng: 145.08056 }, kind: 'sight', status: 'web', placeRef: 'p-shiretoko', blurb: '세계자연유산. 삿포로에서 가장 먼 후보.', june: '5/10~7/31 불곰 활동기 → 지상 산책로는 등록 가이드 필수, 고가 목도는 자유' },
  { id: 'c-onuma', theme: 'lake', region: 'hakodate', name: '오누마 공원', nameLocal: '大沼公園', location: { lat: 41.98085, lng: 140.67008 }, kind: 'sight', status: 'todo', alwaysOpen: true, stay: 60, blurb: '하코다테 북쪽 호수 공원. 하코다테까지 갈 때만 고려.' },

  // 라벤더
  { id: 'c-tomita', theme: 'lavender', region: 'furano', name: '팜 도미타', nameLocal: 'ファーム富田', location: { lat: 43.41796, lng: 142.42779 }, kind: 'sight', status: 'web', placeRef: 'p-tomita', blurb: '라벤더 농원의 대표. 입장·주차 무료.', june: '조생종도 6월 하순부터라 6/21까지는 거의 없음. 루피너스 등 다른 꽃과 매장 위주' },
  { id: 'c-hinode', theme: 'lavender', region: 'furano', name: '히노데 공원', nameLocal: '日の出公園 上富良野', location: { lat: 43.46506, lng: 142.48016 }, kind: 'sight', status: 'web', alwaysOpen: true, stay: 30, blurb: '가미후라노 언덕 위 공원, 전망 좋음. 좌표는 주변 대략치.', june: '2026년 라벤더 축제가 7/4~12 → 6월 중순엔 꽃 없음' },
  { id: 'c-saika', theme: 'lavender', region: 'furano', name: '사이카노사토 (사사키 팜)', nameLocal: '彩香の里 佐々木ファーム', location: { lat: 43.40604, lng: 142.41115 }, kind: 'sight', status: 'todo', stay: 30, blurb: '나카후라노 언덕의 꽃밭 농원.', june: '라벤더 시즌 전' },
  { id: 'c-shikisai', theme: 'lavender', region: 'furano', name: '시키사이노오카', nameLocal: '四季彩の丘', location: { lat: 43.52809, lng: 142.46605 }, kind: 'sight', status: 'todo', placeRef: 'p-shikisai', blurb: '비에이의 꽃 줄무늬 언덕.', june: '라벤더보다 루피너스 등 초여름 꽃 기대' },
  { id: 'c-horomi', theme: 'lavender', region: 'sapporo', name: '호로미 고개 라벤더 정원', nameLocal: '幌見峠ラベンダー園', location: { lat: 43.03163, lng: 141.29855 }, kind: 'sight', status: 'todo', stay: 30, blurb: '삿포로 근교 고개, 시내 전망과 라벤더. 개화·운영 정보는 확인 못함.' },

  // 러브레터
  { id: 'c-funami', theme: 'film', region: 'otaru', name: '후나미자카 (러브레터의 언덕)', nameLocal: '船見坂', location: { lat: 43.1991, lng: 140.9931 }, kind: 'sight', status: 'web', alwaysOpen: true, stay: 20, blurb: '바다가 내려다보이는 오타루역 근처 비탈길, 말씀하신 "그 언덕"으로 통하는 곳. 공식 로케 지도엔 개별 지점으로 없다는 자료도 있어요.', june: '주택가 도로 — 차도에 서서 촬영 금지. 2025년엔 경비원 배치·벌금 안내까지 있었음' },
  { id: 'c-nyk', theme: 'film', region: 'otaru', name: '구 일본우선 오타루 지점 (도서관 장면)', nameLocal: '旧日本郵船株式会社小樽支店', location: { lat: 43.2073, lng: 140.9983 }, kind: 'sight', status: 'todo', stay: 30, blurb: '이츠키가 일하는 도서관 장면. 공식 로케 지도에 포함. 내부 공개 여부는 확인 필요.' },
  { id: 'c-marchen', theme: 'film', region: 'otaru', name: '메르헨 교차점', nameLocal: 'メルヘン交差点', location: { lat: 43.19069, lng: 141.00751 }, kind: 'sight', status: 'web', alwaysOpen: true, stay: 10, blurb: '공식 로케 지도에 포함. 오르골당·르타오 본점 바로 앞이라 저절로 지나가요.' },
  { id: 'c-tengu', theme: 'film', region: 'otaru', name: '텐구야마 전망대', nameLocal: '天狗山ロープウェイ', location: { lat: 43.16841, lng: 140.96981 }, kind: 'sight', status: 'todo', stay: 60, blurb: '오타루 시내와 바다 전망. 한국어 자료에 영화 도입부 촬영지로 나오지만 공식 지도로는 확인 못함.' },

  // 온천
  { id: 'c-takimotokan', theme: 'onsen', region: 'south', name: '다이이치 다키모토칸', nameLocal: '第一滝本館', location: { lat: 42.49518, lng: 141.14484 }, kind: 'hotel', status: 'todo', placeRef: 'p-takimotokan', blurb: '지옥계곡 앞 대형 온천 호텔, 대욕장이 유명.' },
  { id: 'c-noguchi', theme: 'onsen', region: 'south', name: '보로 노구치 노보리베츠', nameLocal: '望楼NOGUCHI登別', location: { lat: 42.50015, lng: 141.14075 }, kind: 'hotel', status: 'todo', blurb: '노보리베츠의 소규모 고급 료칸. 객실 노천탕 여부는 공식 확인 필요.' },
  { id: 'c-nonokaze', theme: 'onsen', region: 'south', name: '더 레이크뷰 TOYA 노노카제', nameLocal: 'ザ レイクビューTOYA 乃の風リゾート', location: { lat: 42.56582, lng: 140.82186 }, kind: 'hotel', status: 'todo', placeRef: 'p-nonokaze', blurb: '도야호 온천가 호반. 불꽃놀이까지 걸어서 가요.' },
  { id: 'c-konoka', theme: 'onsen', region: 'south', name: '도야호 쓰루가 리조트 코노우타', nameLocal: '洞爺湖 鶴雅リゾート 洸の謌', location: { lat: 42.55356, lng: 140.86041 }, kind: 'hotel', status: 'web', blurb: '호수 동쪽 소베츠 온천. 온천 노천탕 딸린 객실 타입이 있어요.' },
  { id: 'c-mizunouta', theme: 'onsen', region: 'airport', name: '시코츠호 쓰루가 리조트 미즈노우타', nameLocal: 'しこつ湖鶴雅リゾートスパ 水の謌', location: { lat: 42.77429, lng: 141.40349 }, kind: 'hotel', status: 'web', blurb: '시코츠호 바로 앞. 노천탕 딸린 객실 타입이 있고 공항과 가까워 첫날이나 마지막 밤에 좋아요.' },
  { id: 'c-zaborin', theme: 'onsen', region: 'niseko', name: '자보린', nameLocal: '坐忘林', location: { lat: 42.90462, lng: 140.67753 }, kind: 'hotel', status: 'todo', blurb: '니세코의 고급 료칸으로 알려진 곳. 현재 요금·운영은 공식 확인 필요.' },
  { id: 'c-moriryotei', theme: 'onsen', region: 'furano', name: '모리노료테이 비에이', nameLocal: '森の旅亭びえい', location: { lat: 43.47367, lng: 142.6433 }, kind: 'hotel', status: 'todo', placeRef: 'p-moriryotei', blurb: '시로가네 온천 료칸. 청의 호수·시라히게 폭포 바로 근처.' },
  { id: 'c-asarigawa', theme: 'onsen', region: 'otaru', name: '아사리가와 온천', nameLocal: '朝里川温泉', location: { lat: 43.14776, lng: 141.04182 }, kind: 'onsen', status: 'todo', stay: 90, blurb: '오타루 시내와 삿포로 사이 산속 온천가. 오타루 술 투어 날 숙소 거점 후보.' },
  { id: 'c-jozankei', theme: 'onsen', region: 'sapporo', name: '조잔케이 온천', nameLocal: '定山渓温泉', location: { lat: 42.96519, lng: 141.16515 }, kind: 'onsen', status: 'todo', stay: 90, blurb: '삿포로 시내에서 남서쪽 산속으로 들어가는 온천가.' },

  // 털게
  { id: 'c-hyosetsu', theme: 'crab', region: 'sapporo', name: '효세츠노몬', nameLocal: '氷雪の門', location: { lat: 43.05494, lng: 141.35595 }, kind: 'food', status: 'todo', stay: 90, blurb: '스스키노의 노포 게 요리 전문점. 타라바·즈와이·털게를 상시 취급. 현재 영업 여부는 확인 못함.' },
  { id: 'c-kanihonke', theme: 'crab', region: 'sapporo', name: '가니혼케 삿포로역 앞 본점', nameLocal: 'かに本家 札幌駅前本店', location: { lat: 43.06567, lng: 141.35257 }, kind: 'food', status: 'todo', stay: 90, blurb: '입구에 활어조가 있는 대형 게 요리점. 호텔 근처라 저녁으로 쉬움.' },
  { id: 'c-ito', theme: 'crab', region: 'sapporo', name: '장외시장 이토 물산', nameLocal: '札幌場外市場 いとう物産', location: { lat: 43.07002, lng: 141.32148 }, kind: 'shop', status: 'todo', stay: 45, hours: web('무휴로 게재', '07:00', '15:30'), blurb: '중앙도매시장 장외시장의 게 전문점, 활털게 수조. 아침·점심 시간대에 맞는 곳.' },
  { id: 'c-sankaku', theme: 'crab', region: 'otaru', name: '오타루 산카쿠 시장', nameLocal: '小樽三角市場', location: { lat: 43.19854, lng: 140.99387 }, kind: 'food', status: 'todo', stay: 60, blurb: 'JR 오타루역 옆 해산물 시장, 후나미자카 바로 아래. 털게 취급은 현장 확인.' },
  { id: 'c-mombetsu', theme: 'crab', region: 'east', name: '몬베츠항 (오호츠크 산지)', nameLocal: '紋別港', location: { lat: 44.34437, lng: 143.37748 }, kind: 'sight', status: 'web', stay: 60, blurb: '오호츠크 털게 산지. 항구 직판장 자료가 2016년 것이라 가게는 다시 찾아야 해요.', june: '봄~여름이 조업기. 2026년엔 5월 말까지 몬베츠 어획이 호조였다는 보도' },

  // 치즈케이크
  { id: 'c-letao', theme: 'cheese', region: 'otaru', name: '르타오 본점', nameLocal: 'ルタオ 本店', location: { lat: 43.191, lng: 141.0083 }, kind: 'cafe', status: 'web', placeRef: 'p-letao', blurb: '더블 프로마주의 본점. 2층 카페에서 홋카이도 한정 생 프로마주. 공항 매장에서도 살 수 있어요.' },
  { id: 'c-pathos', theme: 'cheese', region: 'otaru', name: '르타오 파토스', nameLocal: 'ルタオ パトス', location: { lat: 43.19312, lng: 141.00726 }, kind: 'cafe', status: 'todo', stay: 40, blurb: '본점과 같은 사카이마치 거리의 르타오 매장. 본점이 붐빌 때 대안.' },
  { id: 'c-bake', theme: 'cheese', region: 'sapporo', name: 'KINOTOYA BAKE 폴타운점', nameLocal: 'KINOTOYA BAKE ポールタウン店', location: { lat: 43.0578, lng: 141.35265 }, kind: 'cafe', status: 'todo', stay: 20, blurb: '오도리역 지하상가의 갓 구운 치즈 타르트. 이트인 가능으로 게재.' },
  { id: 'c-buono', theme: 'cheese', region: 'sapporo', name: '부오노 부오노', nameLocal: 'チーズケーキ専門店 Buono Buono', location: { lat: 43.05015, lng: 141.32266 }, kind: 'cafe', status: 'todo', stay: 30, blurb: '마루야마 쪽 치즈케이크 전문점. 현재 영업·이트인 여부는 확인 필요.' },

  // 골프
  { id: 'c-northcountry', theme: 'golf', region: 'airport', name: '더 노스컨트리 GC', nameLocal: 'ザ・ノースカントリーゴルフクラブ', location: { lat: 42.8206, lng: 141.59675 }, kind: 'sight', status: 'web', stay: 300, blurb: '연못 전략성과 클럽하우스 전망으로 평이 좋은 곳. 캐디·카트 포함 평일 약 ¥28,500~31,000, 주말 약 ¥39,000(골프 잘란 게재가). 공항에서 가까움.' },
  { id: 'c-brooks', theme: 'golf', region: 'airport', name: '홋카이도 브룩스 CC', nameLocal: '北海道ブルックスカントリークラブ', location: { lat: 42.71843, lng: 141.67733 }, kind: 'sight', status: 'web', stay: 300, blurb: '신치토세 공항에서 15분. 노스컨트리와 많이 묶어 치는 코스.' },
  { id: 'c-classic', theme: 'golf', region: 'airport', name: '홋카이도 클래식 GC', nameLocal: '北海道クラシックゴルフクラブ', location: { lat: 42.74433, lng: 141.77697 }, kind: 'sight', status: 'web', stay: 300, blurb: '코스 상태·서비스 평이 최상급, 요금은 높은 편.' },
  { id: 'c-hanazono', theme: 'golf', region: 'niseko', name: '하나조노 골프', nameLocal: 'HANAZONO GOLF', location: { lat: 42.8999, lng: 140.6906 }, kind: 'sight', status: 'web', stay: 300, blurb: '영어 온라인 예약이 되는 가장 쉬운 선택. 평일 약 ¥8,800부터(여행사 자료). 도야↔오타루 이동 경로 중간.', june: '2026년 11월 구글에 임시 휴업으로 표시. 비수기 때문으로 보이지만 확인 필요(전화 0136-21-7700)' },
  { id: 'c-nisekovillage', theme: 'golf', region: 'niseko', name: '니세코 빌리지 GC', nameLocal: 'ニセコビレッジゴルフコース', location: { lat: 42.84678, lng: 140.68453 }, kind: 'sight', status: 'web', stay: 300, blurb: '니세코의 산악 코스. 하나조노 대안으로 볼 만해요(구글에 영업 중 표시). 예약 정보는 확인 못함.' },
  { id: 'c-rusutsu', theme: 'golf', region: 'niseko', name: '루스츠 리조트 골프', nameLocal: 'ルスツリゾートゴルフ', location: { lat: 42.74718, lng: 140.90341 }, kind: 'sight', status: 'web', stay: 300, blurb: '요테이산을 보는 리조트 코스(타워 코스 기준, 구글에 영업 중 표시). 2026년 운영 기간은 확인 못함.' },
  { id: 'c-furanogolf', theme: 'golf', region: 'furano', name: '후라노 골프 코스', nameLocal: '富良野ゴルフコース', location: { lat: 43.33496, lng: 142.48446 }, kind: 'sight', status: 'web', stay: 300, blurb: '프린스 호텔 운영, 2026년 4/11 개장. 호텔 연계 플랜은 회원 전용이라 비지터 요금은 확인 필요.' },

  // 안도 타다오
  { id: 'c-ando', theme: 'arch', region: 'sapporo', name: '두상대불 (안도 타다오)', nameLocal: '頭大仏殿 真駒内滝野霊園', location: { lat: 42.92054, lng: 141.36274 }, kind: 'sight', status: 'web', stay: 75, hours: web('4~10월 기준, 배관료 ¥500', '09:00', '16:00'), blurb: '삿포로 남쪽 다키노 묘원의 안도 타다오 건축. 라벤더 언덕 안쪽 터널을 지나면 대불 머리만 보이는 구조. 묘원이라 조용히 관람. 무료 주차장 있음.', june: '라벤더 언덕으로 유명하지만 6월 중순은 개화 전일 가능성이 높아요' },
  { id: 'c-chapel', theme: 'arch', region: 'furano', name: '물의 교회 (안도 타다오)', nameLocal: '水の教会 星野リゾート トマム', location: { lat: 43.06373, lng: 142.62624 }, kind: 'sight', status: 'web', stay: 30, hours: { periods: [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [{ open: { day, hour: 6, minute: 30 }, close: { day, hour: 7, minute: 30 } }, { open: { day, hour: 20, minute: 30 }, close: { day, hour: 21, minute: 30 } }]), source: 'curated', note: '2026 시즌 일반 공개 시간(4/24~11/1). 2027년은 미발표, 공식 재확인' }, blurb: '교회 3부작의 하나로 꼽히는 토마무의 물의 교회. 일반 공개 시간이 이른 아침·밤뿐이라 토마무에 묵어야 볼 수 있어요.', june: '결혼식 커플 외 웨딩 복장 촬영은 불가' },

  // 데님·시계
  { id: 'c-tanuki', theme: 'shop', region: 'sapporo', name: '다누키코지 구제 거리', nameLocal: '狸小路商店街', location: { lat: 43.0568, lng: 141.35 }, kind: 'shop', status: 'web', stay: 90, blurb: '상점가와 주변에 수입 구제 가게가 20곳 이상 모여 있다는 자료가 있어요(1·2·7초메 중심). 풀카운트를 찾는다면 여기부터. 재고는 현장 확인.' },
  { id: 'c-yodobashi', theme: 'shop', region: 'sapporo', name: '요도바시 카메라 멀티미디어 삿포로', nameLocal: 'ヨドバシカメラ マルチメディア札幌', location: { lat: 43.06829, lng: 141.34767 }, kind: 'shop', status: 'web', stay: 60, hours: web('연중무휴로 게재, 입점 매장 기준 시간', '10:00', '22:00'), blurb: '삿포로역 북쪽 대형 가전점. 양판점이라 비교하며 보기 좋은 후보지만 시계 코너 규모·포인트율은 확인 못함.' },
  { id: 'c-bic', theme: 'shop', region: 'sapporo', name: '빅카메라 Select 삿포로 다누키코지점', nameLocal: 'ビックカメラ Select 札幌狸小路店', location: { lat: 43.05722, lng: 141.35043 }, kind: 'shop', status: 'web', stay: 30, blurb: '2026년 1월 개장한 소형 셀렉트 매장, 23시까지 영업. 관광객용 상품 위주라 시계 구색은 기대를 낮추는 게 좋아요.' },
  { id: 'c-daimaru', theme: 'shop', region: 'sapporo', name: '다이마루 삿포로점', nameLocal: '大丸札幌店', location: { lat: 43.0677, lng: 141.3497 }, kind: 'shop', status: 'web', stay: 45, blurb: '삿포로역 옆 백화점, 5층 시계 매장(해밀턴 공식 취급 확인). 고급 시계를 볼 때 후보, 할인은 기대하기 어려워요.' },

  // 풀카운트 취급점 (브랜드 공식 판매점 목록 기준, 영업시간은 미확인)
  { id: 'c-flamingo', theme: 'shop', region: 'sapporo', name: 'FLAMINGO (풀카운트)', nameLocal: 'FLAMINGO 札幌 南3条西8丁目', location: { lat: 43.05603, lng: 141.34596 }, kind: 'shop', status: 'web', stay: 60, phone: '011-251-1250', blurb: '풀카운트 공식 판매점 목록의 삿포로 매장. 南3条西8丁目 7, 다누키코지 서쪽. 영업시간·재고는 전화로 확인.' },
  { id: 'c-unique', theme: 'shop', region: 'sapporo', name: "UNIQUE & SON'S (풀카운트)", nameLocal: "UNIQUE & SON'S 札幌 中の島", location: { lat: 43.03778, lng: 141.36055 }, kind: 'shop', status: 'web', stay: 45, phone: '011-600-1515', blurb: '풀카운트 공식 판매점 목록의 삿포로 매장. 도요히라구 나카노시마, 시내 남쪽이라 두상대불 오가는 길에 들르기 좋아요. 영업시간·재고는 전화로 확인.' },
  { id: 'c-crossover', theme: 'shop', region: 'airport', name: 'CROSSOVER (풀카운트)', nameLocal: 'CROSSOVER 由仁町', location: { lat: 43.00997, lng: 141.78351 }, kind: 'shop', status: 'web', stay: 45, phone: '0123-83-2403', blurb: '풀카운트 공식 판매점 목록의 유니초 매장. 공항 북동쪽. 좌표는 동네 수준 대략치.' },
  { id: 'c-til', theme: 'shop', region: 'asahikawa', name: 'TiL (풀카운트)', nameLocal: 'TiL 旭川 末広東', location: { lat: 43.80093, lng: 142.38384 }, kind: 'shop', status: 'web', stay: 45, blurb: '풀카운트 공식 판매점 목록의 아사히카와 매장.' },
  { id: 'c-california', theme: 'shop', region: 'east', name: 'California Harvest (풀카운트)', nameLocal: 'California Harvest 帯広', location: { lat: 42.92208, lng: 143.20369 }, kind: 'shop', status: 'web', stay: 45, phone: '0155-22-3638', blurb: '풀카운트 공식 판매점 목록의 오비히로 매장. 지금 동선에서는 멀어요.' },
  { id: 'c-designplus', theme: 'shop', region: 'hakodate', name: 'DESIGN+ (풀카운트)', nameLocal: 'DESIGN+ 金森赤レンガ倉庫 BAYはこだて', location: { lat: 41.76719, lng: 140.71779 }, kind: 'shop', status: 'web', stay: 45, phone: '0138-83-6377', blurb: '풀카운트 공식 판매점 목록의 하코다테 매장. 지금 동선에서는 멀어요.' },

  // 시계
  { id: 'c-tictac', theme: 'shop', region: 'sapporo', name: 'TiCTAC 삿포로 스텔라플레이스점', nameLocal: 'TiCTAC 札幌ステラプレイス店', location: { lat: 43.06805, lng: 141.35099 }, kind: 'shop', status: 'web', stay: 45, blurb: 'JR타워 스텔라플레이스 5층 시계 전문점. 세이코·시티즌·지샥을 다루고 영어 응대 가능. 면세 여부는 확인 못함.' },
  { id: 'c-outlet', theme: 'shop', region: 'airport', name: '지샥 아웃렛 (미쓰이 아웃렛 삿포로 기타히로시마)', nameLocal: '三井アウトレットパーク 札幌北広島 G-SHOCK OUTLET', location: { lat: 42.97142, lng: 141.47131 }, kind: 'shop', status: 'web', stay: 90, blurb: '이번에 찾은 곳 중 "할인"이 확실한 유일한 시계 매장. 지샥 위주라 종류는 한정적이고 할인율은 확인 못함.' },
  { id: 'c-marui', theme: 'shop', region: 'sapporo', name: '마루이이마이 삿포로 본점', nameLocal: '丸井今井 札幌本店', location: { lat: 43.05995, lng: 141.35454 }, kind: 'shop', status: 'web', stay: 45, hours: web('시계 매장 기준', '10:30', '19:30'), blurb: '오도리역 근처 백화점. 시계 매장이 있고 해밀턴 공식 취급. 백화점이라 할인은 기대하기 어려워요.' },
]

export function filterCandidates(themes: ThemeId[], region?: RegionId): Candidate[] {
  return CANDIDATES.filter((c) => (!themes.length || themes.includes(c.theme)) && (!region || c.region === region))
}

/** 이미 일정·장소함에 있는 같은 장소 찾기 */
export function findCandidatePlace(trip: Trip, c: Candidate): Place | undefined {
  if (c.placeRef && trip.places[c.placeRef]) return trip.places[c.placeRef]
  return trip.places[`p-${c.id}`] ?? Object.values(trip.places).find((p) => p.nameLocal === c.nameLocal)
}

export function candidateToPlace(c: Candidate): Place {
  return {
    id: `p-${c.id}`,
    name: c.name,
    nameLocal: c.nameLocal,
    kind: c.kind,
    location: c.location,
    hours: c.hours,
    alwaysOpen: c.alwaysOpen,
    phone: c.phone,
    defaultStay: c.stay,
    season: c.june,
    tips: c.blurb,
  }
}

export function candidateMapUrl(c: Candidate): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${c.nameLocal} 北海道` })}`
}
