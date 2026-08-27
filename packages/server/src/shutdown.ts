/**
 * 1012 = service restart.
 *
 * Ditutup DENGAN kode, bukan digantung: klien punya backoff (`BACKOFF_BASE_MS` di
 * `@lga/shared`) dan akan menyambung lagi sendiri begitu proses baru berdiri. Soket yang
 * digantung menunggu timeout TCP, dan overlay OBS diam sepanjang itu.
 */
export const SERVICE_RESTART = 1012

/** Batas menunggu koneksi yang masih terbuka. Sesudah ini proses keluar apa adanya. */
export const GRACE_MS = 5_000

export interface ShutdownDeps {
  stopHeartbeat: () => void
  /** Menutup tiap soket dengan `SERVICE_RESTART`. */
  closeSockets: () => void
  /** `server.close(done)` — `done` dipanggil saat koneksi terakhir benar-benar lepas. */
  closeServer: (done: () => void) => void
  exit: (code: number) => void
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  /** Kode keluar saat penutupan berhasil. Default 0. */
  code?: number
  graceMs?: number
}

/**
 * Tutup tertib, dan keluar juga kalau penutupannya tidak pernah selesai.
 *
 * Batas waktunya bukan kehati-hatian berlebihan: `server.close()` menunggu setiap koneksi
 * keep-alive lepas, dan satu klien yang menggantung cukup untuk membuat host menunggu sampai
 * batas SIGKILL-nya sendiri sebelum container berikutnya boleh naik.
 */
export function shutdown(deps: ShutdownDeps): void {
  deps.stopHeartbeat()
  deps.closeSockets()

  let done = false
  const finish = (code: number): void => {
    if (done) return
    done = true
    deps.clearTimer(timer)
    deps.exit(code)
  }

  const timer = deps.setTimer(() => finish(1), deps.graceMs ?? GRACE_MS)
  deps.closeServer(() => finish(deps.code ?? 0))
}
