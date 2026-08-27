import { createHash, timingSafeEqual } from 'node:crypto'
import { APP_KEY_HEADER, APP_KEY_QUERY, OVERLAY_ROLE, OVERLAY_ROLE_QUERY } from '@lga/shared'

/**
 * Satu kunci menjaga dua pintu: `/api` dan `/ws`.
 *
 * `socketRole` ikut tinggal di sini meski bukan soal kunci — ia membaca query dari URL
 * soket yang sama persis dengan `socketKey`, dan memecahnya jadi berkas sendiri berarti
 * dua tempat mengurai satu URL.
 */

const digest = (value: string): Buffer => createHash('sha256').update(value).digest()

/**
 * Perbandingan berwaktu tetap.
 *
 * Bukan karena penyerang akan mengukur waktunya, tapi karena menulis `===` di jalur auth
 * adalah kebiasaan yang akhirnya salah di tempat yang lebih penting. sha256 dulu supaya
 * panjangnya selalu sama: `timingSafeEqual` melempar saat panjangnya beda, dan memeriksa
 * panjang lebih dulu justru membocorkan hal yang ingin disembunyikan.
 */
export function keyMatches(expected: string, given: string | null): boolean {
  if (given === null || given === '') return false
  return timingSafeEqual(digest(expected), digest(given))
}

/** Bagian dari `express.Request` yang benar-benar dipakai. */
export interface KeyedRequest {
  header(name: string): string | undefined
  query: Record<string, unknown>
}

export function requestKey(req: KeyedRequest): string | null {
  const header = req.header(APP_KEY_HEADER)
  if (typeof header === 'string' && header !== '') return header
  const query = req.query[APP_KEY_QUERY]
  return typeof query === 'string' && query !== '' ? query : null
}

/** Soket tidak bisa memasang header, jadi kuncinya menumpang query. */
export function socketKey(url: string | undefined): string | null {
  const key = params(url).get(APP_KEY_QUERY)
  return key === null || key === '' ? null : key
}

/** Peran yang tidak dikenal diperlakukan sebagai dashboard, sama seperti tanpa peran. */
export function socketRole(url: string | undefined): 'dashboard' | 'overlay' {
  return params(url).get(OVERLAY_ROLE_QUERY) === OVERLAY_ROLE ? OVERLAY_ROLE : 'dashboard'
}

/** Host palsu: `req.url` sebuah upgrade selalu relatif, dan `URL` menuntut basis absolut. */
function params(url: string | undefined): URLSearchParams {
  return new URL(url ?? '/', 'http://localhost').searchParams
}
