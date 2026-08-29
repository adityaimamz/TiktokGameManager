export type FrameScheduler = (cb: (timestampMs: number) => void) => number
export type FrameCanceller = (handle: number) => void

export interface RenderLoopOptions {
  onFrame: (timestampMs: number) => void
  /**
   * Jarak minimum antar-frame yang DIGAMBAR. 0 (bawaan) berarti tanpa plafon.
   *
   * Ada untuk preview ruang kendali, bukan untuk overlay: di monitor 144 Hz preview itu
   * menggambar 144 frame per detik ke dalam encoder 30 fps, dan tidak satu pun kelebihannya
   * terlihat siapa pun — sementara GPU-nya sama dengan yang dipakai encoder OBS. Overlay
   * membiarkannya kosong; OBS yang memutuskan kadensinya.
   *
   * Aman untuk tick: tab pemilik engine menitipkan `host.frame()` di `onFrame`, jadi frame
   * yang dijatuhkan juga menunda tick — tapi `TickScheduler` menumpuk waktu dan mengejar
   * sampai 3 tick tertunda (150 ms), jauh di atas plafon 33 ms yang dipakai ruang kendali.
   */
  minFrameMs?: number
  /** Default requestAnimationFrame. Diinjeksi di test agar tidak butuh browser. */
  scheduleFrame?: FrameScheduler
  cancelFrame?: FrameCanceller
}

/** Kadensi jam cadangan. 40 Hz memberi margin di atas tick 20 Hz tanpa memburu frame. */
const HIDDEN_FRAME_MS = 25

let hiddenWorker: Worker | null = null
let hiddenHandle = 0
const hiddenPending = new Map<number, (timestampMs: number) => void>()

/**
 * Jam cadangan untuk halaman yang tersembunyi.
 *
 * `requestAnimationFrame` BERHENTI TOTAL begitu halaman disembunyikan — bukan hanya saat
 * creator pindah tab, tapi juga saat window browser sekadar tertutup penuh oleh aplikasi
 * lain, karena Chrome di Windows menandai window yang ter-occlude sebagai hidden. Tab
 * dashboard adalah satu-satunya yang menjalankan tick (§6.1), jadi rAF yang mati berarti
 * `host.frame()` tidak pernah dipanggil, tidak ada snapshot yang disiarkan, dan overlay OBS
 * membeku persis pada detik creator berpindah ke OBS. Timer di dalam dedicated worker tidak
 * ikut di-throttle, jadi ia yang mengambil alih selama halaman tersembunyi.
 *
 * Perbaikannya di sini, di penjadwal bawaan, dan bukan di dashboard: setiap loop di aplikasi
 * ini melewati satu fungsi ini, jadi satu penjaga di sini menggantikan satu penjaga di tiap
 * pemanggil. Halaman overlay ikut kebagian dan tidak dirugikan — ia tidak menjalankan tick
 * apa pun, dan saat ia terlihat jalurnya tetap rAF seperti sebelumnya.
 *
 * ponytail: worker dibangun sekali lalu dibiarkan hidup sampai halaman ditutup — merobohkan
 * dan membangunnya ulang tiap kali visibility berubah lebih banyak kode daripada nilainya.
 * ponytail: worker lahir dari blob URL. CSP yang melarang `worker-src blob:` akan
 * menjatuhkannya kembali ke rAF; naikkan ke worker berkas terpisah kalau CSP itu datang.
 */
const scheduleHidden: FrameScheduler = (cb) => {
  if (hiddenWorker === null) {
    const source = `setInterval(() => postMessage(0), ${HIDDEN_FRAME_MS})`
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    hiddenWorker = new Worker(url)
    hiddenWorker.onmessage = () => {
      // Pesan yang datang saat tidak ada yang menunggu memang dibuang: worker berdetak bebas,
      // sementara RenderLoop hanya meminta satu frame pada satu waktu.
      const due = [...hiddenPending.values()]
      hiddenPending.clear()
      for (const fn of due) fn(performance.now())
    }
  }
  // Negatif, karena handle rAF selalu positif — itulah yang membuat defaultCancel bisa
  // membedakan keduanya tanpa pembukuan kedua.
  const handle = --hiddenHandle
  hiddenPending.set(handle, cb)
  return handle
}

const canScheduleHidden = (): boolean =>
  typeof document !== 'undefined' &&
  document.visibilityState === 'hidden' &&
  typeof Worker === 'function' &&
  typeof URL.createObjectURL === 'function'

export const defaultSchedule: FrameScheduler = (cb) => {
  if (canScheduleHidden()) return scheduleHidden(cb)
  return typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(cb)
    : (setTimeout(() => cb(performance.now()), 16) as unknown as number)
}

export const defaultCancel: FrameCanceller = (handle) => {
  if (handle < 0) hiddenPending.delete(handle)
  else if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
  else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)
}

/**
 * Loop render yang menjadwalkan ulang dirinya setiap frame.
 *
 * Loop ini TIDAK boleh menjalankan logika game apa pun — itu tugas TickScheduler.
 * Tugasnya hanya menggambar dan menginterpolasi.
 */
export class RenderLoop {
  private readonly onFrame: (timestampMs: number) => void
  private readonly minFrameMs: number
  private readonly scheduleFrame: FrameScheduler
  private readonly cancelFrame: FrameCanceller

  private handle: number | null = null
  private running = false
  /**
   * NEGATIVE_INFINITY, bukan 0: frame pertama harus selalu digambar, berapa pun timestamp
   * yang diberikan penjadwal.
   */
  private lastDrawnAtMs = Number.NEGATIVE_INFINITY

  constructor(opts: RenderLoopOptions) {
    this.onFrame = opts.onFrame
    this.minFrameMs = opts.minFrameMs ?? 0
    this.scheduleFrame = opts.scheduleFrame ?? defaultSchedule
    this.cancelFrame = opts.cancelFrame ?? defaultCancel
  }

  get isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.schedule()
  }

  stop(): void {
    this.running = false
    if (this.handle !== null) {
      this.cancelFrame(this.handle)
      this.handle = null
    }
  }

  private schedule(): void {
    this.handle = this.scheduleFrame((timestamp) => {
      this.handle = null
      if (!this.running) return
      if (timestamp - this.lastDrawnAtMs >= this.minFrameMs) {
        this.lastDrawnAtMs = timestamp
        this.onFrame(timestamp)
      }
      // Penjadwalan ulang DI LUAR gerbang di atas: loop yang berhenti menjadwalkan gara-gara
      // satu frame dijatuhkan akan membeku selamanya.
      if (this.running) this.schedule()
    })
  }
}
