import { describe, expect, it } from 'vitest'
import { createRng } from '../../framework/rng.js'
import type { Vec2 } from '../../framework/entity/entity.js'
import { FIGHTER_EDGE_MARGIN, FIGHTER_HIT_RADIUS, sideHalfBounds } from './arena.js'
import { SPAWN_ATTEMPTS, findSpawnPosition } from './spawn.js'
import type { Occupant } from './spawn.js'

/**
 * Sela antar-TEPI, bukan antar-pusat: begitu fighter punya ukuran berbeda-beda, jarak
 * pusat tidak lagi menjawab pertanyaan "apakah keduanya bertumpuk".
 */
const nearestClearance = (p: Vec2, radius: number, others: readonly Occupant[]): number =>
  others.reduce(
    (min, o) => Math.min(min, Math.hypot(p.x - o.x, p.y - o.y) - radius - o.radius),
    Number.POSITIVE_INFINITY,
  )

const at = (x: number, y: number, radius = FIGHTER_HIT_RADIUS): Occupant => ({ x, y, radius })

/** Grid rapat yang membuat SETIAP kandidat melanggar jarak minimum. */
const packedHalf = (side: 'a' | 'b'): Occupant[] => {
  const b = sideHalfBounds(side)
  const points: Occupant[] = []
  for (let x = b.minX; x <= b.maxX; x += 2) {
    for (let y = b.minY; y <= b.maxY; y += 2) points.push(at(x, y))
  }
  return points
}

describe('findSpawnPosition', () => {
  it('places side a inside the left half', () => {
    const bounds = sideHalfBounds('a')
    const rng = createRng(1)
    for (let i = 0; i < 200; i++) {
      const p = findSpawnPosition({ rng, side: 'a', occupied: [] })
      expect(p.x).toBeGreaterThanOrEqual(bounds.minX)
      expect(p.x).toBeLessThanOrEqual(bounds.maxX)
      expect(p.y).toBeGreaterThanOrEqual(bounds.minY)
      expect(p.y).toBeLessThanOrEqual(bounds.maxY)
    }
  })

  it('places side b inside the right half', () => {
    const bounds = sideHalfBounds('b')
    const rng = createRng(2)
    for (let i = 0; i < 200; i++) {
      const p = findSpawnPosition({ rng, side: 'b', occupied: [] })
      expect(p.x).toBeGreaterThanOrEqual(bounds.minX)
      expect(p.x).toBeLessThanOrEqual(bounds.maxX)
    }
  })

  it('is deterministic for the same seed', () => {
    expect(findSpawnPosition({ rng: createRng(9), side: 'a', occupied: [] })).toEqual(
      findSpawnPosition({ rng: createRng(9), side: 'a', occupied: [] }),
    )
  })

  it('keeps a clear margin between the edges of every fighter', () => {
    const rng = createRng(3)
    const placed: Occupant[] = []
    for (let i = 0; i < 20; i++) {
      const p = findSpawnPosition({ rng, side: 'a', occupied: placed })
      expect(nearestClearance(p, FIGHTER_HIT_RADIUS, placed)).toBeGreaterThanOrEqual(
        FIGHTER_EDGE_MARGIN,
      )
      placed.push(at(p.x, p.y))
    }
  })

  /**
   * Fighter besar minta ruang lebih besar.
   *
   * Ini yang tidak bisa dilakukan aturan lama: satu `minDistance` tunggal antar-pusat
   * memberi jatah ruang yang sama kepada blob 0,8x dan blob 1,6x, jadi yang besar pasti
   * bertumpuk begitu ukurannya berbeda-beda.
   *
   * Empat, bukan dua puluh: blob 1,6x menuntut sela 13% arena, dan separuh arena memang
   * tidak muat menampung dua puluh di antaranya. Kepadatan seperti itu jatuh ke kandidat
   * paling lapang, yang memang tidak menjanjikan apa-apa.
   */
  it('gives a grown fighter more room than a base-sized one', () => {
    const rng = createRng(3)
    const big = FIGHTER_HIT_RADIUS * 1.6
    const placed: Occupant[] = []
    for (let i = 0; i < 4; i++) {
      const p = findSpawnPosition({ rng, side: 'a', occupied: placed, radius: big })
      expect(nearestClearance(p, big, placed)).toBeGreaterThanOrEqual(FIGHTER_EDGE_MARGIN)
      placed.push(at(p.x, p.y, big))
    }
  })

  it('falls back to the least crowded candidate when the half is packed', () => {
    const occupied = packedHalf('a')
    const chosen = findSpawnPosition({ rng: createRng(77), side: 'a', occupied })

    // Ulangi urutan RNG yang sama untuk membangun kesepuluh kandidat sendiri.
    const replay = createRng(77)
    const bounds = sideHalfBounds('a')
    const candidates: Vec2[] = []
    for (let i = 0; i < SPAWN_ATTEMPTS; i++) {
      candidates.push({
        x: replay.range(bounds.minX, bounds.maxX),
        y: replay.range(bounds.minY, bounds.maxY),
      })
    }
    const best = candidates.reduce((a, b) =>
      nearestClearance(b, FIGHTER_HIT_RADIUS, occupied) >
      nearestClearance(a, FIGHTER_HIT_RADIUS, occupied)
        ? b
        : a,
    )
    expect(chosen).toEqual(best)
  })

  it('stops drawing candidates as soon as one fits', () => {
    const counted = createRng(5)
    let draws = 0
    const rng = {
      next: () => {
        draws++
        return counted.next()
      },
      int: (min: number, maxExclusive: number) => counted.int(min, maxExclusive),
      range: (min: number, max: number) => {
        draws++
        return counted.range(min, max)
      },
      pick: <T>(items: readonly T[]) => counted.pick(items),
    }
    findSpawnPosition({ rng, side: 'a', occupied: [] })
    expect(draws).toBe(2)
  })

  it('honours a caller-provided clearance', () => {
    const rng = createRng(11)
    const placed: Occupant[] = []
    for (let i = 0; i < 5; i++) {
      const p = findSpawnPosition({ rng, side: 'b', occupied: placed, clearance: 12 })
      expect(nearestClearance(p, FIGHTER_HIT_RADIUS, placed)).toBeGreaterThanOrEqual(12)
      placed.push(at(p.x, p.y))
    }
  })
})
