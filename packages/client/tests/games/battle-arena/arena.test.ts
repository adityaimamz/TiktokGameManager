import { describe, expect, it } from 'vitest'
import {
  ARENA_ASPECT,
  ARENA_MAX,
  ARENA_MIDLINE,
  FIGHTER_EDGE_MARGIN,
  FIGHTER_HIT_RADIUS,
  IDLE_SPEED_PER_TICK,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED_PER_TICK,
  TICK_MS,
  clampToSideHalf,
  isOutsideArena,
  sideHalfBounds,
} from '../../../src/games/battle-arena/arena.js'
import {
  arenaLengthX,
  arenaLengthY,
  computeStageLayout,
  fighterDiameter,
} from '../../../src/games/battle-arena/renderer/layout.js'

const TICKS_PER_SECOND = 1000 / TICK_MS

describe('arena constants', () => {
  it('runs the simulation at 20 Hz', () => {
    expect(TICK_MS).toBe(50)
  })

  it('derives projectile speed from 100% of arena width per second', () => {
    expect(PROJECTILE_SPEED_PER_TICK * TICKS_PER_SECOND).toBeCloseTo(100)
  })

  it('derives fighter wander speed from 5% of arena width per second', () => {
    expect(IDLE_SPEED_PER_TICK * TICKS_PER_SECOND).toBeCloseTo(5)
  })

  /**
   * Inti keluhan yang memicu penyetelan ini: projectile terasa lebih lambat daripada
   * fighter yang dikejarnya. Dikunci sebagai relasi, bukan dua angka lepas, supaya
   * penyetelan berikutnya tidak diam-diam membalik lagi perbandingannya.
   */
  it('keeps a shot an order of magnitude faster than the fighter that fired it', () => {
    expect(PROJECTILE_SPEED_PER_TICK).toBeGreaterThan(IDLE_SPEED_PER_TICK * 10)
  })

  it('gives a shot enough life to cross the whole arena', () => {
    const reach = PROJECTILE_SPEED_PER_TICK * (PROJECTILE_LIFETIME_MS / TICK_MS)
    expect(reach).toBeGreaterThan(ARENA_MAX)
  })
})

/**
 * Hitbox HARUS bulat di piksel, bukan di persen.
 *
 * Sebelum perbaikan ini radius 2,5 yang sama berarti 48 px ke samping dan 18,4 px ke
 * atas-bawah — tembakan mendaftar kena jauh sebelum sprite bersentuhan secara horizontal,
 * dan menembus dalam-dalam secara vertikal. Dikunci sebagai relasi terhadap blob yang
 * digambar, bukan sebagai angka lepas, supaya penyetelan berikutnya tidak diam-diam
 * mengembalikan elipsnya.
 */
describe('hitbox di ruang piksel', () => {
  const arenaPx = (orientation: 'landscape' | 'portrait') => {
    const layout = computeStageLayout(1920, 1080, orientation)
    return { layout, blobRadiusPx: fighterDiameter(layout) / 2 }
  }

  for (const orientation of ['landscape', 'portrait'] as const) {
    it(`menyamakan radius fighter dengan blob yang digambar (${orientation})`, () => {
      const { layout, blobRadiusPx } = arenaPx(orientation)
      expect(arenaLengthY(layout, FIGHTER_HIT_RADIUS)).toBeCloseTo(blobRadiusPx)
    })

    it(`memberi jangkauan kena yang sama ke samping dan ke atas (${orientation})`, () => {
      const { layout } = arenaPx(orientation)
      const reach = FIGHTER_HIT_RADIUS + PROJECTILE_RADIUS
      const horizontalPx = arenaLengthX(layout, reach / ARENA_ASPECT[orientation])
      const verticalPx = arenaLengthY(layout, reach)
      expect(horizontalPx).toBeCloseTo(verticalPx)
    })
  }

  it('mendaftar kena tepat saat kedua sprite bersentuhan', () => {
    const { layout, blobRadiusPx } = arenaPx('landscape')
    const spriteContactPx = blobRadiusPx + arenaLengthY(layout, PROJECTILE_RADIUS)
    expect(arenaLengthY(layout, FIGHTER_HIT_RADIUS + PROJECTILE_RADIUS)).toBeCloseTo(
      spriteContactPx,
    )
  })
})

describe('sideHalfBounds', () => {
  it('gives side a the left half, inset by the fighter radius', () => {
    const bounds = sideHalfBounds('a')
    expect(bounds.minX).toBe(FIGHTER_EDGE_MARGIN)
    expect(bounds.maxX).toBe(ARENA_MIDLINE - FIGHTER_EDGE_MARGIN)
  })

  it('gives side b the right half, inset by the fighter radius', () => {
    const bounds = sideHalfBounds('b')
    expect(bounds.minX).toBe(ARENA_MIDLINE + FIGHTER_EDGE_MARGIN)
    expect(bounds.maxX).toBe(ARENA_MAX - FIGHTER_EDGE_MARGIN)
  })

  it('keeps spawn rows away from the very top and bottom', () => {
    expect(sideHalfBounds('a').minY).toBe(10)
    expect(sideHalfBounds('a').maxY).toBe(90)
  })
})

describe('clampToSideHalf', () => {
  it('keeps a side a position out of the right half', () => {
    const p = { x: 80, y: 50 }
    clampToSideHalf(p, 'a')
    expect(p.x).toBe(ARENA_MIDLINE - FIGHTER_EDGE_MARGIN)
  })

  it('keeps a side b position out of the left half', () => {
    const p = { x: 5, y: 50 }
    clampToSideHalf(p, 'b')
    expect(p.x).toBe(ARENA_MIDLINE + FIGHTER_EDGE_MARGIN)
  })

  it('pulls a position back inside the top and bottom edges too', () => {
    const p = { x: 20, y: 140 }
    clampToSideHalf(p, 'a')
    expect(p.y).toBe(ARENA_MAX - FIGHTER_EDGE_MARGIN)
  })

  it('leaves a position that is already in its own half alone', () => {
    const p = { x: 20, y: 40 }
    clampToSideHalf(p, 'a')
    expect(p).toEqual({ x: 20, y: 40 })
  })
})

describe('isOutsideArena', () => {
  it('reports positions past any edge', () => {
    expect(isOutsideArena({ x: -0.1, y: 50 })).toBe(true)
    expect(isOutsideArena({ x: 50, y: 100.1 })).toBe(true)
  })

  it('accepts positions on the boundary', () => {
    expect(isOutsideArena({ x: 0, y: 0 })).toBe(false)
    expect(isOutsideArena({ x: 100, y: 100 })).toBe(false)
  })
})
