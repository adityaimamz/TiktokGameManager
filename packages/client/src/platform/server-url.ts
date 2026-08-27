/**
 * Asal server API dan WebSocket.
 *
 * Kosong berarti origin yang sama: itu yang berlaku di dev (Vite mem-proxy `/api` dan
 * `/ws` ke Express) dan saat halaman ikut disajikan oleh Express itu sendiri.
 *
 * Deploy statis — Vercel — memisahkan keduanya: halaman di CDN, server di host yang bisa
 * memegang proses hidup. `VITE_SERVER_URL` adalah SATU-SATUNYA tempat alamat server itu
 * disebut; ia dibaca saat build, jadi mengubahnya menuntut deploy ulang.
 */
export function serverBaseUrl(): string {
  const raw: unknown = import.meta.env?.VITE_SERVER_URL
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
}

/** `serverBaseUrl()` sebagai origin WebSocket — `https:` jadi `wss:`, `http:` jadi `ws:`. */
export function serverWsUrl(path: string): string {
  const base = serverBaseUrl()
  if (base !== '') return `${base.replace(/^http/, 'ws')}${path}`
  if (typeof location === 'undefined') return `ws://localhost:3001${path}`
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`
}
