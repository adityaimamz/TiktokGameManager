import { APP_KEY_QUERY } from '@lga/shared'

/**
 * Halaman overlay OBS dikenali dari query `?stage=1` (Req 19 AC1).
 *
 * Sengaja menerima string, bukan membaca `window.location`, supaya bisa diuji tanpa DOM
 * dan supaya Plan 4 bisa memakainya untuk membangun URL overlay yang disalin creator.
 */
export function isStageMode(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('stage') === '1'
}

/**
 * Host yang berarti "PC ini saja".
 *
 * Dipakai dua kali dengan makna berbeda: memilih transport overlay, dan memutuskan apakah
 * link yang dicetak top bar perlu diganti alamat LAN.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', ''])

export function stageUrl(origin: string, appKey?: string | null): string {
  const base = `${origin.replace(/\/$/, '')}/?stage=1`
  if (appKey === undefined || appKey === null || appKey === '') return base
  return `${base}&${APP_KEY_QUERY}=${encodeURIComponent(appKey)}`
}

/**
 * Apakah halaman overlay ini perlu transport jaringan.
 *
 * Ada `k` berarti pasti jauh. Tanpa `k`, hostname yang memutuskan — dan itu SENGAJA, bukan
 * hanya `k` seperti spec §3: link LAN yang dicetak top bar tidak membawa `k` sama sekali
 * saat `APP_KEY` kosong, jadi aturan berbasis `k` akan membuat link itu memuat halaman yang
 * selamanya kosong. OBS di PC yang sama tetap `localhost`, tetap `BroadcastChannel`, tetap
 * nol byte naik.
 */
export function isRemoteOverlay(hostname: string, search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  const key = new URLSearchParams(query).get(APP_KEY_QUERY)
  if (key !== null && key !== '') return true
  return !LOCAL_HOSTS.has(hostname)
}

/**
 * Origin yang benar dari sudut pandang device LAIN.
 *
 * `location.origin` di mesin creator berbunyi `http://localhost:3001`, dan laptop sebelah
 * tidak bisa membukanya. Alamat LAN datang dari server (`GET /api/health`) karena browser
 * tidak punya cara jujur mengetahui IP-nya sendiri.
 */
export function overlayOrigin(
  hostname: string,
  origin: string,
  lanUrls: readonly string[],
): string {
  if (!LOCAL_HOSTS.has(hostname)) return origin
  return lanUrls[0] ?? origin
}
