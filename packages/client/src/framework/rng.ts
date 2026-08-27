/**
 * Sumber angka acak deterministik.
 *
 * Framework dan seluruh kode game DILARANG memanggil Math.random() langsung.
 * Semua keacakan lewat sini agar satu sesi bisa direproduksi persis dari seed-nya,
 * yang membuat logika game bisa diuji dengan assertion pasti.
 */
export interface Rng {
  /** Float dalam [0, 1). */
  next(): number
  /** Integer dalam [min, maxExclusive). */
  int(min: number, maxExclusive: number): number
  /** Float dalam [min, max). */
  range(min: number, max: number): number
  /** Satu elemen acak dari array tak kosong. */
  pick<T>(items: readonly T[]): T
}

/** mulberry32 — cepat, periode 2^32, cukup untuk keperluan simulasi ini. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min)),
    range: (min, max) => min + next() * (max - min),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() called on an empty array')
      return items[Math.floor(next() * items.length)] as T
    },
  }
}
