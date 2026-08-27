import type { Clock } from '../clock.js'

export interface Effect {
  id: string
  type: string
  x: number
  y: number
  spawnedAt: number
  duration: number
  /** Pengali kekuatan visual, 0.1–2.0. */
  intensity: number
  /** Muatan numerik opsional, mis. angka yang ditampilkan melayang. */
  value: number
  soundCue: string | null
  active: boolean
}

export interface EffectSpawn {
  type: string
  x: number
  y: number
  duration: number
  intensity?: number
  value?: number
  soundCue?: string | null
}

const INDEX = Symbol('effectIndex')

interface Indexed {
  [INDEX]?: number
}

/** Kemajuan animasi 0–1, terklem di kedua ujung. */
export function effectProgress(e: Effect, now: number): number {
  if (e.duration <= 0) return 1
  const p = (now - e.spawnedAt) / e.duration
  return p < 0 ? 0 : p > 1 ? 1 : p
}

/**
 * Kumpulan efek visual yang dipakai ulang.
 *
 * Efek yang habis umurnya dikembalikan ke pool selama fase Effects di tick loop,
 * bukan dibiarkan dikumpulkan garbage collector.
 */
export class EffectPool {
  private readonly free: Effect[] = []
  private readonly activeList: Effect[] = []
  private _capacity = 0
  private nextId = 0

  constructor(
    private readonly clock: Clock,
    initialSize = 200,
    /** Dipanggil tepat setelah sebuah efek aktif. Pemakainya: pemutar bunyi (§4 spec 4c). */
    private readonly onSpawn?: (e: Effect) => void,
  ) {
    for (let i = 0; i < initialSize; i++) {
      this.free.push(this.make())
      this._capacity++
    }
  }

  get capacity(): number {
    return this._capacity
  }

  get activeCount(): number {
    return this.activeList.length
  }

  spawn(s: EffectSpawn): Effect {
    let e = this.free.pop()
    if (e === undefined) {
      e = this.make()
      this._capacity++
    }
    e.type = s.type
    e.x = s.x
    e.y = s.y
    e.spawnedAt = this.clock.now()
    e.duration = s.duration
    e.intensity = s.intensity ?? 1
    e.value = s.value ?? 0
    e.soundCue = s.soundCue ?? null
    e.active = true
    ;(e as Effect & Indexed)[INDEX] = this.activeList.length
    this.activeList.push(e)
    this.onSpawn?.(e)
    return e
  }

  /** Menonaktifkan efek yang sudah habis umurnya. Mengembalikan jumlah yang dipensiunkan. */
  update(): number {
    const now = this.clock.now()
    let retired = 0
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const e = this.activeList[i] as Effect
      if (now - e.spawnedAt >= e.duration) {
        this.release(e)
        retired++
      }
    }
    return retired
  }

  forEachActive(fn: (e: Effect) => void): void {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      fn(this.activeList[i] as Effect)
    }
  }

  releaseAll(): void {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const e = this.activeList[i] as Effect
      e.active = false
      ;(e as Effect & Indexed)[INDEX] = -1
      this.free.push(e)
    }
    this.activeList.length = 0
  }

  private release(e: Effect): void {
    if (!e.active) return
    e.active = false
    const indexed = e as Effect & Indexed
    const idx = indexed[INDEX] ?? -1
    const last = this.activeList.pop()
    if (last !== undefined && last !== e && idx >= 0) {
      this.activeList[idx] = last
      ;(last as Effect & Indexed)[INDEX] = idx
    }
    indexed[INDEX] = -1
    this.free.push(e)
  }

  private make(): Effect {
    return {
      id: `effect#${this.nextId++}`,
      type: '',
      x: 0,
      y: 0,
      spawnedAt: 0,
      duration: 0,
      intensity: 1,
      value: 0,
      soundCue: null,
      active: false,
    }
  }
}
