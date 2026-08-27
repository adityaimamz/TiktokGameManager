import type { Clock } from '../clock.js'

export interface SoundQueueOptions {
  clock: Clock
  /** Pemutar sesungguhnya. Framework tidak tahu bagaimana bunyi dihasilkan. */
  play: (id: string, volume: number) => void
  /** Maksimum bunyi yang berbunyi bersamaan. Default 5. */
  maxConcurrent?: number
  /** Jarak minimum antar-permintaan untuk id yang sama. Default 50 ms. */
  throttleMs?: number
}

interface Playing {
  id: string
  endsAt: number
}

/**
 * Menjaga audio tetap terkendali saat puluhan event terjadi dalam satu tick.
 *
 * Dua pembatas: bunyi yang sama tidak boleh diminta lebih rapat dari throttleMs,
 * dan tidak boleh ada lebih dari maxConcurrent bunyi berjalan bersamaan — yang
 * tertua dilepas untuk memberi tempat.
 */
export class SoundQueue {
  private readonly clock: Clock
  private readonly playFn: (id: string, volume: number) => void
  private readonly maxConcurrent: number
  private readonly throttleMs: number

  private playing: Playing[] = []
  private readonly lastRequestedAt = new Map<string, number>()

  constructor(opts: SoundQueueOptions) {
    this.clock = opts.clock
    this.playFn = opts.play
    this.maxConcurrent = opts.maxConcurrent ?? 5
    this.throttleMs = opts.throttleMs ?? 50
  }

  get concurrentCount(): number {
    this.prune(this.clock.now())
    return this.playing.length
  }

  /** Mengembalikan false bila permintaan ditolak throttle. */
  request(id: string, volume: number, durationMs: number): boolean {
    const now = this.clock.now()
    this.prune(now)

    const last = this.lastRequestedAt.get(id)
    if (last !== undefined && now - last < this.throttleMs) return false

    if (this.playing.length >= this.maxConcurrent) this.playing.shift()

    this.playing.push({ id, endsAt: now + durationMs })
    this.lastRequestedAt.set(id, now)
    this.playFn(id, volume)
    return true
  }

  clear(): void {
    this.playing = []
    this.lastRequestedAt.clear()
  }

  private prune(now: number): void {
    this.playing = this.playing.filter((p) => p.endsAt > now)
  }
}
