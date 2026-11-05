import type { Plugin } from 'vite'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// 일정 데이터를 브라우저 저장소가 아니라 프로젝트 폴더의 data/trip.json 에 보관한다.
// 맥·윈도우·폰이 같은 파일을 보므로, 저장할 때 버전(ETag)을 맞춰 오래된 화면이 최신 내용을 덮어쓰지 못하게 한다.
const BACKUP_INTERVAL_MS = 15 * 60 * 1000
const MAX_BACKUPS = 40

const etagOf = (body: string | Buffer) => `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`

export function tripStorage(rootDir: string): Plugin {
  const dataDir = path.join(rootDir, 'data')
  const tripFile = path.join(dataDir, 'trip.json')
  const settingsFile = path.join(dataDir, 'settings.local.json')
  const backupDir = path.join(dataDir, 'backups')

  function backupIfDue() {
    if (!fs.existsSync(tripFile)) return
    fs.mkdirSync(backupDir, { recursive: true })
    const backups = fs.readdirSync(backupDir).filter((f) => f.startsWith('trip-2') && f.endsWith('.json')).sort()
    const last = backups.at(-1)
    if (last && Date.now() - fs.statSync(path.join(backupDir, last)).mtimeMs < BACKUP_INTERVAL_MS) return
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
    fs.copyFileSync(tripFile, path.join(backupDir, `trip-${stamp}.json`))
    for (const old of backups.slice(0, Math.max(0, backups.length + 1 - MAX_BACKUPS))) {
      fs.rmSync(path.join(backupDir, old))
    }
  }

  function readBody(req: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  return {
    name: 'trip-storage',
    configureServer(server) {
      server.middlewares.use('/api/trip', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'GET') {
          if (!fs.existsSync(tripFile)) {
            res.statusCode = 204 // 아직 저장된 일정 없음 → 앱이 추천 일정으로 시작
            res.end()
            return
          }
          const body = fs.readFileSync(tripFile)
          const etag = etagOf(body)
          res.setHeader('ETag', etag)
          if (req.headers['if-none-match'] === etag) {
            res.statusCode = 304
            res.end()
            return
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(body)
          return
        }
        if (req.method === 'PUT') {
          try {
            const body = await readBody(req)
            JSON.parse(body) // 깨진 데이터는 저장하지 않음
            const ifMatch = req.headers['if-match']
            if (ifMatch && fs.existsSync(tripFile) && etagOf(fs.readFileSync(tripFile)) !== ifMatch) {
              res.statusCode = 409 // 그사이 다른 기기에서 저장됨
              res.end(JSON.stringify({ ok: false, conflict: true }))
              return
            }
            fs.mkdirSync(dataDir, { recursive: true })
            backupIfDue()
            const tmp = tripFile + '.tmp'
            fs.writeFileSync(tmp, body)
            fs.renameSync(tmp, tripFile)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, etag: etagOf(body), savedAt: new Date().toISOString() }))
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          }
          return
        }
        res.statusCode = 405
        res.end()
      })

      // 구글 키처럼 기기마다 다시 넣기 번거로운 설정 (trip.json 과 분리)
      server.middlewares.use('/api/settings', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (req.method === 'GET') {
          res.end(fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile) : '{}')
          return
        }
        if (req.method === 'PUT') {
          try {
            const body = await readBody(req)
            JSON.parse(body)
            fs.mkdirSync(dataDir, { recursive: true })
            fs.writeFileSync(settingsFile, body)
            res.end('{"ok":true}')
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          }
          return
        }
        res.statusCode = 405
        res.end()
      })
    },
  }
}
