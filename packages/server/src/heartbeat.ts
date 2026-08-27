/**
 * Tiga puluh detik.
 *
 * Bukan lebih rapat: ping kosong memang sepele, tapi ini berjalan sepanjang siaran dua jam
 * dan tidak ada yang perlu diketahui lebih cepat dari itu. Dua siklus terlewat berarti soket
 * mati dibuang paling lambat 60 detik sesudahnya — jauh di bawah durasi yang membuat
 * bandwidth terbuang terasa.
 */
export const HEARTBEAT_MS = 30_000

/** Bagian dari `WebSocket` yang heartbeat benar-benar pakai. */
export interface PingableSocket {
  ping(): void
  terminate(): void
  on(event: 'pong', listener: () => void): void
}

export interface HeartbeatDeps {
  /**
   * Kumpulan soket yang sedang hidup, dibaca ULANG tiap siklus.
   *
   * Sengaja fungsi, bukan koleksi yang disimpan: `wss.clients` sudah menjadi sumber
   * kebenarannya, dan menyalinnya ke sini berarti dua daftar yang pasti menyimpang.
   */
  sockets: () => Iterable<PingableSocket>
  intervalMs?: number
  /** Default `setInterval` yang di-`unref`. Diinjeksi supaya test tidak menunggu. */
  schedule?: (fn: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
}

/**
 * Ping tiap siklus, buang yang tidak menjawab pada siklus berikutnya.
 *
 * Ini yang menutup satu kegagalan yang hanya muncul di cloud: di LAN, kabel yang dicabut
 * menghasilkan TCP RST dan `close` datang dalam hitungan detik; lewat proxy, laptop yang
 * ditutup meninggalkan soket yang tampak hidup selamanya. Satu overlay hantu cukup untuk
 * membuat `getOverlays()` tidak pernah kembali nol — dan bersamanya, penjaga yang membuat
 * relay diam saat tidak ada yang mendengarkan berhenti bekerja tanpa satu pun pesan.
 *
 * `WeakMap` memegang status alih-alih menempelkan `isAlive` ke soket: soket itu objek milik
 * pustaka `ws`, dan menulis properti sendiri ke sana adalah cara halus bertabrakan dengan
 * versi berikutnya. Nilai `undefined` berarti "baru, belum pernah di-ping" — itulah satu
 * siklus tenggang yang membuat soket yang menyambung tepat sebelum tick tidak langsung
 * dibunuh.
 */
export function startHeartbeat(deps: HeartbeatDeps): () => void {
  const answered = new WeakMap<PingableSocket, boolean>()

  const schedule =
    deps.schedule ??
    ((fn: () => void, ms: number) => {
      const handle = setInterval(fn, ms)
      // Tanpa unref(), interval ini menahan event loop dan proses tidak pernah keluar saat
      // SIGTERM memintanya.
      handle.unref()
      return handle
    })
  const cancel = deps.cancel ?? ((handle: unknown) => clearInterval(handle as NodeJS.Timeout))

  const tick = (): void => {
    for (const socket of deps.sockets()) {
      const state = answered.get(socket)
      if (state === undefined) {
        socket.on('pong', () => answered.set(socket, true))
      } else if (state === false) {
        socket.terminate()
        continue
      }
      answered.set(socket, false)
      socket.ping()
    }
  }

  const handle = schedule(tick, deps.intervalMs ?? HEARTBEAT_MS)
  return () => cancel(handle)
}
