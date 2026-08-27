import type { Clock } from '../clock.js'

export interface TickSchedulerOptions {
  clock: Clock
  onTick: (tickIndex: number) => void
  /** Panjang satu tick simulasi. Default 50 ms (20 tick per detik). */
  tickMs?: number
  /** Batas tick menyusul dalam satu update. Kelebihannya dibuang. Default 3. */
  maxPendingTicks?: number
}

export interface TickResult {
  ticksRun: number
  /** Pecahan tick yang belum terpakai, 0–1. Dipakai renderer untuk interpolasi. */
  alpha: number
  /** Jumlah tick yang dibuang karena catch-up melampaui batas. */
  dropped: number
}

/**
 * Simulasi fixed-timestep yang terlepas dari frame rate.
 *
 * update() dipanggil sekali per frame render. Ia menjalankan sebanyak mungkin tick
 * yang sudah jatuh tempo, tapi tidak pernah lebih dari maxPendingTicks — supaya tab
 * yang baru kembali dari background tidak mensimulasikan menit-menit yang terlewat
 * sekaligus.
 */
export class TickScheduler {
  private readonly tickMs: number
  private readonly maxPendingTicks: number
  private readonly clock: Clock
  private readonly onTick: (tickIndex: number) => void

  private accumulator = 0
  private lastTime = 0
  private tickIndex = 0
  private running = false

  constructor(opts: TickSchedulerOptions) {
    this.clock = opts.clock
    this.onTick = opts.onTick
    this.tickMs = opts.tickMs ?? 50
    this.maxPendingTicks = opts.maxPendingTicks ?? 3
  }

  get currentTick(): number {
    return this.tickIndex
  }

  get isRunning(): boolean {
    return this.running
  }

  start(): void {
    this.running = true
    this.lastTime = this.clock.now()
    this.accumulator = 0
  }

  stop(): void {
    this.running = false
  }

  update(): TickResult {
    if (!this.running) return { ticksRun: 0, alpha: 0, dropped: 0 }

    const now = this.clock.now()
    this.accumulator += now - this.lastTime
    this.lastTime = now

    let dropped = 0
    const pending = Math.floor(this.accumulator / this.tickMs)
    if (pending > this.maxPendingTicks) {
      dropped = pending - this.maxPendingTicks
      this.accumulator -= dropped * this.tickMs
    }

    let ticksRun = 0
    while (this.accumulator >= this.tickMs) {
      this.onTick(this.tickIndex++)
      this.accumulator -= this.tickMs
      ticksRun++
    }

    return { ticksRun, alpha: this.accumulator / this.tickMs, dropped }
  }
}
