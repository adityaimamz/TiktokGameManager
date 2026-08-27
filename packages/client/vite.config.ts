import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  plugins: [react()],
  // @lga/shared adalah workspace TypeScript mentah: jangan di-prebundle, dan izinkan
  // dev server membaca file di luar root client.
  optimizeDeps: { exclude: ['@lga/shared'] },
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
    // Browser bicara ke origin yang sama; Vite yang meneruskan ke Express. Tanpa ini
    // setiap request lintas-origin dan WebSocket-nya butuh CORS.
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
})
