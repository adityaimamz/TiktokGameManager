import { APP_KEY_HEADER, APP_KEY_QUERY } from '@lga/shared'

/** Tempat kunci disimpan setelah dibersihkan dari URL. */
const STORAGE_KEY = 'lga:app-key'

export interface AppKeyEnv {
  /** `location.search`. */
  search: string
  storage: {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
  } | null
  /** Dipanggil dengan `search` yang sudah bersih dari `k`. Produksi: `history.replaceState`. */
  scrub?: (search: string) => void
}

function query(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
}

export function appKeyFromSearch(search: string): string | null {
  const key = query(search).get(APP_KEY_QUERY)
  return key === null || key === '' ? null : key
}

/**
 * Kunci untuk dashboard: dibaca sekali dari URL, disimpan, lalu DIHAPUS dari URL.
 *
 * Dihapus supaya kuncinya tidak ikut terbaca saat creator share screen — satu-satunya
 * alasan, dan alasan yang cukup. Overlay TIDAK memakai fungsi ini: ia membiarkan `k` di
 * URL selamanya, karena OBS tidak punya tempat mengetik.
 */
export function takeAppKey(env: AppKeyEnv): string | null {
  const fromUrl = appKeyFromSearch(env.search)
  if (fromUrl === null) return env.storage?.getItem(STORAGE_KEY) ?? null

  env.storage?.setItem(STORAGE_KEY, fromUrl)
  const rest = query(env.search)
  rest.delete(APP_KEY_QUERY)
  const suffix = rest.toString()
  env.scrub?.(suffix === '' ? '' : `?${suffix}`)
  return fromUrl
}

/**
 * Kunci yang BERLAKU sekarang, tanpa menyentuh URL.
 *
 * `takeAppKey` menghapus `k` dari URL; itu benar untuk dashboard sekali saat memuat, tapi
 * salah untuk siapa pun yang hanya perlu memasang header — overlay justru harus membiarkan
 * `k` di URL selamanya.
 */
export function currentAppKey(): string | null {
  if (typeof location === 'undefined') return null
  const fromUrl = appKeyFromSearch(location.search)
  if (fromUrl !== null) return fromUrl
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
}

/** `takeAppKey` dengan peramban sungguhan. Tanpa DOM ia menjawab null, bukan melempar. */
export function browserAppKey(): string | null {
  if (typeof location === 'undefined') return null
  return takeAppKey({
    search: location.search,
    storage: typeof localStorage === 'undefined' ? null : localStorage,
    // `replaceState`, bukan `pushState`: membersihkan URL tidak boleh menambah entri
    // riwayat yang tombol Back bisa memundurkan kembali ke URL berkunci.
    scrub: (search) =>
      history.replaceState(null, '', `${location.pathname}${search}${location.hash}`),
  })
}

/**
 * `fetch` dengan kunci terpasang — satu-satunya cara memanggil `/api` dari peramban.
 *
 * `APP_KEY` yang terisi menjaga SELURUH `/api` kecuali `/health`, jadi pemanggil yang lupa
 * headernya dijawab 401 — dan 401 itu sampai ke layar sebagai status koneksi yang rusak,
 * bukan sebagai pesan yang bisa dimengerti. Dipasang di sini, bukan di tiap pemanggil.
 */
export const apiFetch: typeof fetch = (input, init) => {
  const key = currentAppKey()
  if (key === null) return fetch(input, init)
  const headers = new Headers(init?.headers)
  headers.set(APP_KEY_HEADER, key)
  return fetch(input, { ...init, headers })
}
