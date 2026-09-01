import { describe, expect, it } from 'vitest'
import {
  ARENA_ASPECT,
  ARENA_MAX,
  ARENA_MIDLINE,
  FIGHTER_EDGE_MARGIN,
  FIGHTER_HIT_RADIUS,
  FIGHTER_SCALE_MAX,
  IDLE_SPEED_PER_TICK,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED_PER_TICK,
  TICK_MS,
  clampToSideHalf,
  clampToSideZone,
  initialFacingAngle,
  isOutsideArena,
  sideBounds,
  sideCenter,
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

  /*
   * Marginnya `FIGHTER_EDGE_MARGIN * scale`, jadi setiap kenaikan FIGHTER_SCALE_MAX
   * mempersempit separuh arena dari KEDUA sisi sekaligus. Pada skala 10x ia mengerut jadi
   * nol lebar dan setiap fighter terbesar akan dijepit ke satu garis; test ini gerbangnya,
   * dan ia yang seharusnya merah — bukan siaran sungguhan — kalau atapnya dinaikkan terlalu
   * jauh. Dikunci sebagai relasi terhadap konstantanya, bukan angka, supaya menaikkan atap
   * cukup mengubah satu tempat.
   */
  it('menyisakan separuh arena yang masih bisa ditinggali pada fighter TERBESAR', () => {
    for (const side of ['a', 'b'] as const) {
      const bounds = sideHalfBounds(side, FIGHTER_SCALE_MAX)
      expect(bounds.maxX).toBeGreaterThan(bounds.minX)
      expect(bounds.maxY).toBeGreaterThan(bounds.minY)
    }
  })

  it('tidak pernah membiarkan sebuah sisi menyeberangi garis tengah', () => {
    expect(sideHalfBounds('a', FIGHTER_SCALE_MAX).maxX).toBeLessThanOrEqual(ARENA_MIDLINE)
    expect(sideHalfBounds('b', FIGHTER_SCALE_MAX).minX).toBeGreaterThanOrEqual(ARENA_MIDLINE)
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

describe('4-quadrant geometry (sideCount = 4)', () => {
  it('divides the arena into 4 non-overlapping quadrants', () => {
    const a = sideBounds('a', 4)
    const b = sideBounds('b', 4)
    const c = sideBounds('c', 4)
    const d = sideBounds('d', 4)

    // Side A (Top-Left)
    expect(a.minX).toBe(FIGHTER_EDGE_MARGIN)
    expect(a.maxX).toBe(50 - FIGHTER_EDGE_MARGIN)
    expect(a.minY).toBe(FIGHTER_EDGE_MARGIN)
    expect(a.maxY).toBe(50 - FIGHTER_EDGE_MARGIN)

    // Side B (Top-Right)
    expect(b.minX).toBe(50 + FIGHTER_EDGE_MARGIN)
    expect(b.maxX).toBe(100 - FIGHTER_EDGE_MARGIN)
    expect(b.minY).toBe(FIGHTER_EDGE_MARGIN)
    expect(b.maxY).toBe(50 - FIGHTER_EDGE_MARGIN)

    // Side C (Bottom-Left)
    expect(c.minX).toBe(FIGHTER_EDGE_MARGIN)
    expect(c.maxX).toBe(50 - FIGHTER_EDGE_MARGIN)
    expect(c.minY).toBe(50 + FIGHTER_EDGE_MARGIN)
    expect(c.maxY).toBe(100 - FIGHTER_EDGE_MARGIN)

    // Side D (Bottom-Right)
    expect(d.minX).toBe(50 + FIGHTER_EDGE_MARGIN)
    expect(d.maxX).toBe(100 - FIGHTER_EDGE_MARGIN)
    expect(d.minY).toBe(50 + FIGHTER_EDGE_MARGIN)
    expect(d.maxY).toBe(100 - FIGHTER_EDGE_MARGIN)
  })

  it('clamps positions to the respective 4 quadrants', () => {
    const pC = { x: 80, y: 20 }
    clampToSideZone(pC, 'c', 4)
    expect(pC.x).toBe(50 - FIGHTER_EDGE_MARGIN)
    expect(pC.y).toBe(50 + FIGHTER_EDGE_MARGIN)

    const pD = { x: 20, y: 10 }
    clampToSideZone(pD, 'd', 4)
    expect(pD.x).toBe(50 + FIGHTER_EDGE_MARGIN)
    expect(pD.y).toBe(50 + FIGHTER_EDGE_MARGIN)
  })

  it('calculates the center for 2 sides and 4 quadrants', () => {
    expect(sideCenter('a', 2)).toEqual({ x: 25, y: 50 })
    expect(sideCenter('b', 2)).toEqual({ x: 75, y: 50 })
    expect(sideCenter('a', 4)).toEqual({ x: 25, y: 25 })
    expect(sideCenter('b', 4)).toEqual({ x: 75, y: 25 })
    expect(sideCenter('c', 4)).toEqual({ x: 25, y: 75 })
    expect(sideCenter('d', 4)).toEqual({ x: 75, y: 75 })
  })

  it('calculates initial facing angles facing the center', () => {
    expect(initialFacingAngle('a', 2)).toBe(0)
    expect(initialFacingAngle('b', 2)).toBe(Math.PI)
    expect(initialFacingAngle('a', 4)).toBeCloseTo(Math.PI / 4)
    expect(initialFacingAngle('b', 4)).toBeCloseTo((3 * Math.PI) / 4)
    expect(initialFacingAngle('c', 4)).toBeCloseTo(-Math.PI / 4)
    expect(initialFacingAngle('d', 4)).toBeCloseTo((-3 * Math.PI) / 4)
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
