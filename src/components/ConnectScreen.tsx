import { useState } from 'react'
import { checkConnection, DATA_REPO, saveCloudConfig } from '../lib/backend'
import { Btn } from './common'

/** 웹 버전: 이 기기를 아직 연결하지 않았을 때 나오는 화면. 토큰 없이는 일정을 볼 수 없다 */
export function ConnectScreen({ error: initialError }: { error?: string }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)

  async function connect() {
    setBusy(true)
    setError(undefined)
    try {
      const cfg = { repo: DATA_REPO, token: token.trim() }
      await checkConnection(cfg)
      saveCloudConfig(cfg)
      location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold">🗺️ 여행 플래너</h1>
        <p className="mt-1 text-sm text-stone-600">연결 링크를 받으셨다면 그 링크로 다시 열어주세요.</p>
        <label className="mt-4 block text-xs font-medium text-stone-500">접속 토큰</label>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <Btn variant="primary" className="mt-4 w-full" onClick={connect} disabled={busy || !token.trim()}>
          {busy ? '연결 중…' : '연결하기'}
        </Btn>
      </div>
    </div>
  )
}
