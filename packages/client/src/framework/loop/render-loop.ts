export type FrameScheduler = (cb: (timestampMs: number) => void) => number
export type FrameCanceller = (handle: number) => void

export interface RenderLoopOptions {
  onFrame: (timestampMs: number) => void
  /** Default requestAnimationFrame. Diinjeksi di test agar tidak butuh browser. */
  scheduleFrame?: FrameScheduler
  cancelFrame?: FrameCanceller
}

const defaultSchedule: FrameScheduler = (cb) =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(cb)
    : (setTimeout(() => cb(performance.now()), 16) as unknown as number)

const defaultCancel: FrameCanceller = (handle) => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
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
  private readonly scheduleFrame: FrameScheduler
  private readonly cancelFrame: FrameCanceller

  private handle: number | null = null
  private running = false

  constructor(opts: RenderLoopOptions) {
    this.onFrame = opts.onFrame
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
      this.onFrame(timestamp)
      if (this.running) this.schedule()
    })
  }
}
