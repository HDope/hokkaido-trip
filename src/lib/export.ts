import type { LegMode, Place, Trip } from '../types'
import { decodePolyline } from './geo'
import { hoursForDay } from './hours'
import { MEAL_LABEL, type DayPlan, type Warning } from './schedule'
import { fmtDate, fmtDur, fmtHM, fmtKm } from './time'
import { DAY_COLORS, KIND_ICON } from '../ui'

const TRAVEL: Record<LegMode, string> = { DRIVE: 'driving', WALK: 'walking', TRANSIT: 'transit', MANUAL: 'driving' }

const ll = (p: Place) => `${p.location.lat},${p.location.lng}`

/** 구글맵 '장소' 링크 — 앱에서 열면 영업시간·리뷰·저장까지 바로 가능 */
const PARKING_TEXT = { free: '무료 주차', paid: '유료 주차', nearby: '근처 유료 주차', none: '주차 불가' } as const

export function placeUrl(p: Place): string {
  if (p.googleMapsUri) return p.googleMapsUri
  const qs = new URLSearchParams({ api: '1', query: p.nameLocal ?? p.name })
  if (p.googlePlaceId) qs.set('query_place_id', p.googlePlaceId)
  else qs.set('query', ll(p))
  return `https://www.google.com/maps/search/?${qs}`
}

/** 현재 위치(또는 from)에서 이 장소까지 구글맵 길찾기 */
export function directionsUrl(to: Place, from?: Place, mode: LegMode = 'DRIVE'): string {
  const qs = new URLSearchParams({ api: '1', travelmode: TRAVEL[mode] })
  if (from) {
    qs.set('origin', from.googlePlaceId ? (from.nameLocal ?? from.name) : ll(from))
    if (from.googlePlaceId) qs.set('origin_place_id', from.googlePlaceId)
  }
  qs.set('destination', to.googlePlaceId ? (to.nameLocal ?? to.name) : ll(to))
  if (to.googlePlaceId) qs.set('destination_place_id', to.googlePlaceId)
  return `https://www.google.com/maps/dir/?${qs}`
}

/** 하루 전체 경로 (구글맵 URL 은 경유지 최대 9개 → 넘치면 나눠서) */
export function dayRouteUrls(points: Place[]): { label: string; url: string }[] {
  const pts = points.filter((p, i) => i === 0 || p.id !== points[i - 1].id)
  if (pts.length < 2) return []
  const chunks: Place[][] = []
  let i = 0
  while (i < pts.length - 1) {
    const chunk = pts.slice(i, i + 11)
    chunks.push(chunk)
    i += chunk.length - 1
  }
  return chunks.map((c, n) => {
    const origin = c[0]
    const dest = c[c.length - 1]
    const mid = c.slice(1, -1)
    const qs = new URLSearchParams({ api: '1', travelmode: 'driving' })
    qs.set('origin', origin.googlePlaceId ? (origin.nameLocal ?? origin.name) : ll(origin))
    if (origin.googlePlaceId) qs.set('origin_place_id', origin.googlePlaceId)
    qs.set('destination', dest.googlePlaceId ? (dest.nameLocal ?? dest.name) : ll(dest))
    if (dest.googlePlaceId) qs.set('destination_place_id', dest.googlePlaceId)
    if (mid.length) {
      qs.set('waypoints', mid.map((p) => (p.googlePlaceId ? (p.nameLocal ?? p.name) : ll(p))).join('|'))
      if (mid.every((p) => p.googlePlaceId)) qs.set('waypoint_place_ids', mid.map((p) => p.googlePlaceId).join('|'))
    }
    return { label: chunks.length > 1 ? `${n + 1}/${chunks.length}` : '전체', url: `https://www.google.com/maps/dir/?${qs}` }
  })
}

export function dayPoints(plan: DayPlan): Place[] {
  const pts: Place[] = []
  if (plan.startPlace) pts.push(plan.startPlace)
  for (const s of plan.stops) if (s.place) pts.push(s.place)
  if (plan.lodging) pts.push(plan.lodging)
  return pts
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// ---------- KML (구글 My Maps 가져오기용) ----------

function kmlColor(hex: string, alpha = 'ff') {
  const h = hex.replace('#', '')
  return alpha + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2) // KML 은 aabbggrr
}

export function buildKml(trip: Trip, plans: DayPlan[], only?: number): string {
  const sel = only == null ? plans : [plans[only]]
  const styles = sel
    .map((p) => {
      const c = DAY_COLORS[p.index % DAY_COLORS.length]
      return `<Style id="d${p.index}"><IconStyle><color>${kmlColor(c)}</color><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle><LineStyle><color>${kmlColor(c, 'cc')}</color><width>4</width></LineStyle></Style>`
    })
    .join('')
  const folders = sel
    .map((p) => {
      const style = `#d${p.index}`
      const marks = p.stops
        .filter((s) => s.place)
        .map((s, i) => {
          const pl = s.place
          const desc = [
            `${fmtHM(s.arrive)}–${fmtHM(s.depart)} (${fmtDur(s.stop.stay)})`,
            pl.nameLocal,
            `영업: ${hoursForDay(pl, p.weekday)}`,
            pl.phone ? `☎ ${pl.phone} (내비 검색용)` : '',
            pl.mapcode ? `맵코드 ${pl.mapcode}` : '',
            s.stop.note ?? '',
            pl.note ?? '',
          ]
            .filter((x): x is string => !!x)
            .map(esc)
            .join('<br>')
          return `<Placemark><name>${esc(`D${p.index + 1}-${i + 1} ${pl.name}`)}</name><description><![CDATA[${desc}]]></description><styleUrl>${style}</styleUrl><Point><coordinates>${pl.location.lng},${pl.location.lat},0</coordinates></Point></Placemark>`
        })
        .join('')
      const lodging = p.lodging
        ? `<Placemark><name>${esc(`D${p.index + 1} 숙소 · ${p.lodging.name}`)}</name><styleUrl>${style}</styleUrl><Point><coordinates>${p.lodging.location.lng},${p.lodging.location.lat},0</coordinates></Point></Placemark>`
        : ''
      const legs = [...p.stops.map((s) => s.leg), p.endLeg].filter((l) => l?.resolved.status === 'ok' && l.resolved.polyline)
      const line = legs.flatMap((l) => decodePolyline((l!.resolved as { polyline: string }).polyline))
      const path = line.length
        ? `<Placemark><name>${esc(`D${p.index + 1} 경로`)}</name><styleUrl>${style}</styleUrl><LineString><tessellate>1</tessellate><coordinates>${line.map(([la, ln]) => `${ln},${la},0`).join(' ')}</coordinates></LineString></Placemark>`
        : ''
      return `<Folder><name>${esc(`D${p.index + 1} ${fmtDate(p.date)} ${p.title}`)}</name>${marks}${lodging}${path}</Folder>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(trip.title)}</name>${styles}${folders}</Document></kml>`
}

// ---------- 모바일 일정표 (오프라인 단일 HTML, 자바스크립트 없이 동작) ----------

const LEVEL_ICON: Record<Warning['level'], string> = { critical: '⛔', serious: '⚠️', warning: '⚠️', info: 'ℹ️' }

export function buildMobileHtml(trip: Trip, plans: DayPlan[]): string {
  const last = plans[plans.length - 1]
  const days = plans
    .map((p) => {
      const color = DAY_COLORS[p.index % DAY_COLORS.length]
      const routes = (p.driveMin > 0 ? dayRouteUrls(dayPoints(p)) : [])
        .map((r) => `<a class="btn primary" href="${esc(r.url)}">🗺️ 구글맵 하루 경로 ${r.label === '전체' ? '' : r.label}</a>`)
        .join('')
      const leg = (l: DayPlan['endLeg']) =>
        l
          ? `<div class="leg">${{ DRIVE: '🚗', WALK: '🚶', TRANSIT: '🚆', MANUAL: '⏱️' }[l.mode]} ${fmtDur(l.minutes)}${l.meters ? ` · ${fmtKm(l.meters)}` : ''} <a href="${esc(directionsUrl(l.to, undefined, l.mode))}">길찾기 ›</a></div>`
          : ''
      const stops = p.stops
        .filter((s) => s.place)
        .map((s, i) => {
          const pl = s.place
          const ws = s.warnings.filter((w) => w.level !== 'info')
          return `${leg(s.leg)}<div class="stop">
<div class="time">${fmtHM(s.arrive)}<small>${s.stop.stay ? fmtHM(s.depart) : ''}</small></div>
<div class="body"><div class="name"><span class="num" style="background:${color}">${i + 1}</span>${s.meal ? `<span class="meal">${MEAL_LABEL[s.meal]}</span> ` : ''}${KIND_ICON[pl.kind]} ${esc(pl.name)}</div>
${pl.nameLocal ? `<div class="local">${esc(pl.nameLocal)}</div>` : ''}
${pl.hours || pl.alwaysOpen || (pl.kind !== 'hotel' && pl.kind !== 'airport') ? `<div class="meta">🕘 ${esc(hoursForDay(pl, p.weekday))}${s.wait ? ` · 대기 ${fmtDur(s.wait)}` : ''}</div>` : ''}
${pl.phone ? `<div class="meta">☎ <a href="tel:${esc(pl.phone)}">${esc(pl.phone)}</a> <span class="hint">렌터카 내비에 전화번호 입력</span></div>` : ''}
${pl.mapcode ? `<div class="meta">맵코드 <b>${esc(pl.mapcode)}</b></div>` : ''}
${s.stop.note ? `<div class="note">📝 ${esc(s.stop.note)}</div>` : ''}
${pl.season ? `<div class="note">🌸 ${esc(pl.season)}</div>` : ''}
${pl.parking ? `<div class="note">🅿️ ${esc(PARKING_TEXT[pl.parking.status])}${pl.parking.fee ? ` · ${esc(pl.parking.fee)}` : ''}${pl.parking.note ? ` · ${esc(pl.parking.note)}` : ''}</div>` : ''}
${pl.tips ? `<div class="note">💡 ${esc(pl.tips)}</div>` : ''}
${ws.map((w) => `<div class="warn">${LEVEL_ICON[w.level]} ${esc(w.text)}</div>`).join('')}
<div class="links"><a href="${esc(directionsUrl(pl, undefined, s.stop.legMode ?? 'DRIVE'))}">길찾기</a><a href="${esc(placeUrl(pl))}">구글맵에서 보기</a></div>
</div></div>`
        })
        .join('')
      const lodging = p.lodging
        ? `${leg(p.endLeg)}<div class="stop lodge"><div class="time">${fmtHM(p.end)}</div><div class="body"><div class="name">🛏️ ${esc(p.lodging.name)}</div>${p.lodging.nameLocal ? `<div class="local">${esc(p.lodging.nameLocal)}</div>` : ''}${p.lodging.phone ? `<div class="meta">☎ <a href="tel:${esc(p.lodging.phone)}">${esc(p.lodging.phone)}</a></div>` : ''}<div class="links"><a href="${esc(directionsUrl(p.lodging))}">길찾기</a><a href="${esc(placeUrl(p.lodging))}">구글맵</a></div></div></div>`
        : ''
      const dayWarn = p.warnings.filter((w) => w.level !== 'info').map((w) => `<div class="warn">${LEVEL_ICON[w.level]} ${esc(w.text)}</div>`).join('')
      return `<section id="d${p.index + 1}"><header style="border-color:${color}"><div class="dnum" style="background:${color}">D${p.index + 1}</div><div><h2>${fmtDate(p.date)} ${esc(p.title)}</h2>
<div class="sum">출발 ${fmtHM(p.start)} · ${p.driveMin > 0 ? `운전 ${fmtDur(p.driveMin)} (${fmtKm(p.driveMeters)})` : '차 없는 날'} · 도착 ${fmtHM(p.end)}${p.sun ? ` · 🌅 ${fmtHM(p.sun.sunrise)} 🌇 ${fmtHM(p.sun.sunset)}` : ''}</div>${p.lunch || p.dinner ? `<div class="sum">${[p.lunch && `🍱 ${esc(p.lunch.place.name)}`, p.dinner && `🍽️ ${esc(p.dinner.place.name)}`].filter(Boolean).join(' · ')}</div>` : ''}</div></header>
${p.startPlace ? `<div class="start">출발: ${esc(p.startPlace.name)}</div>` : ''}${dayWarn}<div class="routes">${routes}</div>${stops}${lodging}
${p.day.note ? `<div class="note">📝 ${esc(p.day.note)}</div>` : ''}</section>`
    })
    .join('')
  const nav = plans.map((p) => `<a href="#d${p.index + 1}">D${p.index + 1}<small>${p.date.getUTCMonth() + 1}/${p.date.getUTCDate()}</small></a>`).join('')
  const checklist = trip.checklist.map((c) => `<li>${c.done ? '✅' : '⬜'} ${esc(c.text)}</li>`).join('')
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(trip.title)}</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1c1a;--muted:#6b6a65;--line:#e6e4de;--accent:#6250d6;--warnbg:#fff4e0}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1f1f1d;--ink:#f0efec;--muted:#a9a8a1;--line:#33322f;--accent:#9085e9;--warnbg:#3a2e15}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",sans-serif}
.top{padding:20px 16px 8px}.top h1{margin:0;font-size:22px}.top p{margin:4px 0 0;color:var(--muted);font-size:13px}
nav{position:sticky;top:0;z-index:2;display:flex;gap:6px;overflow-x:auto;padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--line)}
nav a{flex:none;text-decoration:none;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:4px 10px;font-weight:600;font-size:13px;text-align:center}nav small{display:block;font-weight:400;color:var(--muted);font-size:11px}
section{margin:14px 12px;background:var(--card);border-radius:16px;border:1px solid var(--line);overflow:hidden}
header{display:flex;gap:10px;align-items:center;padding:14px;border-left:5px solid}header h2{margin:0;font-size:17px}.sum{color:var(--muted);font-size:12.5px}
.dnum{color:#fff;font-weight:700;border-radius:10px;padding:6px 8px;font-size:13px}
.routes{padding:0 14px 6px}.btn{display:block;text-align:center;padding:10px;border-radius:12px;text-decoration:none;font-weight:600;margin:6px 0}.btn.primary{background:var(--accent);color:#fff}
.start{padding:2px 14px;color:var(--muted);font-size:13px}
.stop{display:flex;gap:10px;padding:10px 14px;border-top:1px solid var(--line)}.stop .time{width:52px;flex:none;font-weight:700;font-variant-numeric:tabular-nums}.stop .time small{display:block;color:var(--muted);font-weight:400}
.body{flex:1;min-width:0}.name{font-weight:650}.num{display:inline-block;min-width:20px;height:20px;border-radius:10px;color:#fff;font-size:12px;text-align:center;line-height:20px;margin-right:6px}
.meal{font-size:12px;font-weight:700;color:var(--accent)}.local{color:var(--muted);font-size:13px}.meta{font-size:13px;margin-top:2px}.hint{color:var(--muted);font-size:11.5px}
.note{font-size:13px;color:var(--muted);margin-top:4px;padding:0 14px}.body .note{padding:0}
.warn{font-size:13px;background:var(--warnbg);border-radius:8px;padding:4px 8px;margin:4px 14px}.body .warn{margin:4px 0}
.links{display:flex;gap:8px;margin-top:6px}.links a{font-size:13px;color:var(--accent);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:3px 8px}
.leg{padding:4px 14px 4px 76px;font-size:12.5px;color:var(--muted)}.leg a{color:var(--accent);text-decoration:none}
.lodge{background:color-mix(in srgb,var(--accent) 7%,transparent)}
.box{margin:14px 12px;padding:14px;background:var(--card);border-radius:16px;border:1px solid var(--line)}.box h3{margin:0 0 6px}.box ul{margin:0;padding-left:4px;list-style:none}.box li{margin:4px 0;font-size:14px}
footer{color:var(--muted);font-size:12px;text-align:center;padding:20px}
</style></head><body>
<div class="top"><h1>${esc(trip.title)}</h1><p>${fmtDate(plans[0].date, true)} – ${fmtDate(last.date)} · ${plans.length - 1}박 ${plans.length}일 · 저장 시각 ${new Date().toLocaleString('ko-KR')}</p></div>
<nav>${nav}</nav>${days}
<div class="box"><h3>체크리스트</h3><ul>${checklist}</ul></div>
<div class="box"><h3>운전 메모</h3><ul><li>🚗 좌측통행 · 일반도로 대부분 50~60km/h, 고속도로 80~100km/h</li><li>🦌 해 진 뒤 시골길은 사슴·여우 주의</li><li>⛽ 시골 주유소는 저녁 일찍 닫음 — 반 이상 남았을 때 채우기</li><li>🧭 렌터카 내비는 전화번호/맵코드 검색이 가장 정확</li><li>🍺 운전자는 한 잔도 금지</li></ul></div>
<footer>홋카이도 신혼여행 플래너에서 내보냄 · 영업시간은 저장 시점 정보예요</footer>
</body></html>`
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
