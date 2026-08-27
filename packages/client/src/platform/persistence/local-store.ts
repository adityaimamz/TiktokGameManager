/** Bagian dari `Storage` yang benar-benar dipakai. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LocalStoreOptions {
  storage: StorageLike | null
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** Batas §5.4 spec induk: tulis localStorage di-debounce ≤500 ms. */
  debounceMs?: number
  onError?: (error: unknown, context: string) => void
}

const PREFIX = 'lga:'
const DEFAULT_DEBOUNCE_MS = 500

/**
 * Preferensi dan config di localStorage, dengan tulisan yang di-debounce.
 *
 * Debounce ada karena panel config menghasilkan puluhan perubahan per detik saat slider
 * digeser, dan `setItem` bersifat sinkron — menulis tiap perubahan akan terasa di frame
 * rate. Nilai terakhir yang menang, karena itu satu-satunya yang benar.
 *
 * Data rusak tidak pernah dilempar keluar dan tidak pernah menghapus kunci lain (Req 21
 * AC5): satu config yang tidak terbaca berarti kembali ke default, bukan kehilangan
 * seluruh preferensi.
 */
export class LocalStore {
  private readonly storage: StorageLike | null
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private readonly debounceMs: number
  private readonly onError: (error: unknown, context: string) => void
  private readonly pending = new Map<string, unknown>()
  private handle: unknown = null

  constructor(opts: LocalStoreOptions) {
    this.storage = opts.storage
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = opts.clearTimer ?? ((handle) => clearTimeout(handle as number))
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.onError =
      opts.onError ??
      ((error, context) => {
        console.warn(`[LocalStore] ${context}`, error)
      })
  }

  read<T>(key: string, fallback: T): T {
    if (this.pending.has(key)) return this.pending.get(key) as T
    if (this.storage === null) return fallback

    const raw = this.storage.getItem(PREFIX + key)
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch (error) {
      this.onError(error, `unreadable value for "${key}", falling back to the default`)
      return fallback
    }
  }

  write<T>(key: string, value: T): void {
    this.pending.set(key, value)
    if (this.storage === null) {
      this.pending.clear()
      return
    }
    if (this.handle !== null) this.clearTimer(this.handle)
    this.handle = this.setTimer(() => {
      this.handle = null
      this.commit()
    }, this.debounceMs)
  }

  /** Menulis apa pun yang tertunda sekarang juga — dipakai saat halaman akan ditutup. */
  flush(): void {
    if (this.handle !== null) {
      this.clearTimer(this.handle)
      this.handle = null
    }
    this.commit()
  }

  private commit(): void {
    if (this.storage === null) {
      this.pending.clear()
      return
    }
    for (const [key, value] of this.pending) {
      try {
        this.storage.setItem(PREFIX + key, JSON.stringify(value))
      } catch (error) {
        // Kuota penuh atau mode privat. Kehilangan preferensi jauh lebih ringan daripada
        // menjatuhkan match yang sedang tayang.
        this.onError(error, `could not persist "${key}"`)
      }
    }
    this.pending.clear()
  }
}
