import type { AnalyticsEvent } from '@lga/shared'

/** Sejalan dengan kapasitas `ActionQueue`: cukup untuk satu sesi, terlalu kecil untuk bocor. */
export const ANALYTICS_CAPACITY = 500

export interface AnalyticsLoggerOptions {
  send: (events: readonly AnalyticsEvent[]) => Promise<boolean>
  now: () => number
  capacity?: number
  onError?: (error: unknown) => void
}

/**
 * Menumpuk event dan mengirimkannya sebagai batch.
 *
 * Satu request per event akan membanjiri server dengan ratusan panggilan per menit tanpa
 * memberi informasi tambahan apa pun — batch memberi data yang sama dengan satu request.
 *
 * Buffer penuh membuang yang tertua, mengikuti pola `ActionQueue`. Analytics adalah data
 * yang boleh hilang; ia tidak pernah boleh menjadi alasan heap tumbuh sepanjang sesi
 * 60 menit.
 */
export class AnalyticsLogger {
  private readonly opts: AnalyticsLoggerOptions
  private readonly capacity: number
  private buffer: AnalyticsEvent[] = []

  constructor(opts: AnalyticsLoggerOptions) {
    this.opts = opts
    this.capacity = opts.capacity ?? ANALYTICS_CAPACITY
  }

  get pending(): number {
    return this.buffer.length
  }

  log(type: string, payload: Record<string, unknown>): void {
    this.buffer.push({ type, payload, atMs: this.opts.now() })
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity)
    }
  }

  /**
   * Mengirim seluruh isi buffer sebagai satu batch.
   *
   * Buffer dikosongkan SEBELUM pengiriman, dan batch yang ditolak server tidak
   * dikembalikan. Menyimpannya untuk dicoba lagi akan membuat buffer tumbuh selama
   * server mati — persis kebocoran yang desain ini dibangun untuk menghindarinya.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const batch = this.buffer
    this.buffer = []
    try {
      await this.opts.send(batch)
    } catch (error) {
      this.opts.onError?.(error)
    }
  }
}
