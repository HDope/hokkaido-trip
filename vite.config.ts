import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tripStorage } from './server/tripStorage.ts'

export default defineConfig({
  // GitHub Pages 처럼 하위 경로에 올려도 동작하도록 상대 경로로 빌드
  base: './',
  plugins: [react(), tailwindcss(), tripStorage(import.meta.dirname)],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.ts.net'],
    // 일정 저장 파일이 바뀔 때마다 페이지가 새로고침되지 않도록
    watch: { ignored: ['**/data/**'] },
  },
})
