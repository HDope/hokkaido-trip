// 일출·일몰 (Wikipedia sunrise equation, 오차 1~2분) — 결과는 일본 현지 시각(분)
const RAD = Math.PI / 180

export function sunTimes(date: Date, lat: number, lng: number): { sunrise: number; sunset: number } | null {
  const jdNoon = (date.getTime() + 3 * 3600_000) / 86400000 + 2440587.5 // 현지 정오 ≈ UTC 03시
  const n = Math.round(jdNoon - 2451545.0 + 0.0008)
  const jStar = n - lng / 360
  const M = (357.5291 + 0.98560028 * jStar) % 360
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD)
  const lambda = (M + C + 180 + 102.9372) % 360
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD)
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD)
  const cosDec = Math.cos(Math.asin(sinDec))
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec)
  if (cosW < -1 || cosW > 1) return null
  const w = Math.acos(cosW) / RAD
  const toLocalMin = (j: number) => {
    const ms = (j - 2440587.5) * 86400000
    const local = new Date(ms + 9 * 3600_000)
    return local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60
  }
  return { sunrise: toLocalMin(jTransit - w / 360), sunset: toLocalMin(jTransit + w / 360) }
}
