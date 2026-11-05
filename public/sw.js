// 인터넷이 끊겨도 앱 화면을 열 수 있게 앱 파일만 저장해 둔다.
// 이 사이트 자체의 파일만 다룬다. GitHub·구글 요청과 토큰은 건드리지 않는다.
const CACHE = 'hk-app-v1'
const ROOT = new URL('./', self.location).href
// 저장할 때와 꺼낼 때 요청 헤더가 달라도 같은 파일로 찾는다
const MATCH = { ignoreVary: true }

const assetsIn = (html) => [...html.matchAll(/(?:src|href)="(?:\.\/)?(assets\/[^"]+)"/g)].map((m) => new URL(m[1], ROOT).href)

/** 새 화면이 쓰는 파일을 미리 받고, 더 안 쓰는 예전 파일은 지운다 */
async function refreshAssets(html) {
  const cache = await caches.open(CACHE)
  const wanted = assetsIn(html)
  if (!wanted.length) return
  await Promise.all(wanted.map(async (url) => (await cache.match(url, MATCH)) || cache.add(url).catch(() => undefined)))
  for (const req of await cache.keys()) {
    if (req.url.includes('/assets/') && !wanted.includes(req.url)) await cache.delete(req)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(ROOT, { cache: 'no-cache' })
      const cache = await caches.open(CACHE)
      await cache.put(ROOT, res.clone())
      await refreshAssets(await res.text())
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !request.url.startsWith(ROOT)) return

  // 페이지는 항상 최신을 먼저, 끊겼으면 저장해 둔 화면
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const res = await fetch(request, { cache: 'no-cache' })
          if (res.ok) {
            await cache.put(ROOT, res.clone())
            event.waitUntil(res.clone().text().then(refreshAssets))
          }
          return res
        } catch {
          return (await cache.match(ROOT, MATCH)) ?? Response.error()
        }
      })(),
    )
    return
  }

  // 파일 이름에 내용 해시가 들어 있어 저장본을 그대로 써도 된다
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(request, MATCH)
      if (hit) return hit
      const res = await fetch(request)
      if (res.ok) await cache.put(request, res.clone())
      return res
    })(),
  )
})
