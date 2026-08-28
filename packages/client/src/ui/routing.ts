import { APP_KEY_QUERY } from '@lga/shared'

/** Satu-satunya path halaman selain root. Server WAJIB melayaninya dengan index.html. */
const OVERLAY_PATH = '/overlay'

/**
 * Halaman overlay OBS: path `/overlay` (Req 19 AC1).
 *
 * `?stage=1` yang lama TETAP diterima, dan itu bukan kemalasan: alamat ini hidup di dalam
 * scene OBS creator, tempat yang tidak ikut ter-deploy dan tidak ada yang mengingatkan
 * untuk memperbaruinya. Satu baris di sini menggantikan siaran yang layarnya kosong.
 * Yang dicetak dan didokumentasikan hanya `/overlay`.
 *
 * Sengaja menerima string, bukan membaca `window.location`, supaya bisa diuji tanpa DOM
 * dan supaya Plan 4 bisa memakainya untuk membangun URL overlay yang disalin creator.
 */
export function isStageMode(pathname: string, search: string): boolean {
  if (pathname.replace(/\/+$/, '') === OVERLAY_PATH) return true
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
  const base = `${origin.replace(/\/$/, '')}${OVERLAY_PATH}`
  if (appKey === undefined || appKey === null || appKey === '') return base
  return `${base}?${APP_KEY_QUERY}=${encodeURIComponent(appKey)}`
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

/** Prefiks katalog. Root (`/`) adalah katalog game; di bawah ini adalah ruang kendalinya. */
const GAME_PREFIX = '/game/'

export function gamePath(id: string): string {
  return `${GAME_PREFIX}${id}`
}

/**
 * Id game yang diminta path ini, atau null untuk katalog.
 *
 * Mengembalikan segmen MENTAH, bukan `GameId`: yang memutuskan apakah id-nya nyata adalah
 * registry, dan berkas ini sengaja tidak mengenal satu pun nama game — sama seperti
 * `platform/` tidak mengenalnya. Salah ketik jatuh ke katalog, bukan ke layar kosong.
 */
export function gameFromPath(pathname: string): string | null {
  if (!pathname.startsWith(GAME_PREFIX)) return null
  const id = pathname.slice(GAME_PREFIX.length).replace(/\/+$/, '')
  return id === '' || id.includes('/') ? null : id
}
