/** Jeda percobaan pertama setelah koneksi putus. */
export const BACKOFF_BASE_MS = 5_000

/** Plafon jeda. Req 1 AC11 dan Req 2 AC5 menyebut 5 detik sampai 60 detik. */
export const BACKOFF_MAX_MS = 60_000

/**
 * Jeda sebelum percobaan sambung ulang ke-`attempt`, mulai dari 1.
 *
 * Sengaja fungsi murni tanpa timer di dalamnya: penjadwalannya milik pemanggil, yang
 * memakai timer terinjeksi. Itu yang membuat seluruh urutan backoff bisa diuji tanpa
 * satu detik pun benar-benar berlalu.
 *
 * Dipakai dua kali dengan makna berbeda — server menyambung ulang ke TikTok, browser
 * menyambung ulang WebSocket ke server.
 */
export function nextDelayMs(attempt: number): number {
  if (attempt < 1) return BACKOFF_BASE_MS
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS)
}
