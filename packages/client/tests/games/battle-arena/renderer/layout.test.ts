import { describe, expect, it } from 'vitest'
import {
  BOTTOM_ZONE_RATIO,
  FIGHTER_DIAMETER_PX,
  REFERENCE_STAGE_HEIGHT,
  TOP_ZONE_RATIO,
  arenaLengthX,
  arenaMidlineX,
  arenaX,
  arenaY,
  computeStageLayout,
  fighterDiameter,
  fitStage,
} from '../../../../src/games/battle-arena/renderer/layout.js'

describe('fitStage', () => {
  it('fills the height and centres horizontally when the container is too wide', () => {
    const stage = fitStage(2000, 900, 'landscape')
    expect(stage.height).toBe(900)
    expect(stage.width).toBeCloseTo(1600, 5)
    expect(stage.x).toBeCloseTo(200, 5)
    expect(stage.y).toBe(0)
  })

  it('fills the width and centres vertically when the container is too tall', () => {
    const stage = fitStage(1600, 1200, 'landscape')
    expect(stage.width).toBe(1600)
    expect(stage.height).toBeCloseTo(900, 5)
    expect(stage.y).toBeCloseTo(150, 5)
  })

  it('keeps portrait at 9:16 and never clips (Req 19 AC2)', () => {
    const stage = fitStage(1000, 800, 'portrait')
    expect(stage.width / stage.height).toBeCloseTo(9 / 16, 5)
    expect(stage.width).toBeLessThanOrEqual(1000)
    expect(stage.height).toBeLessThanOrEqual(800)
  })

  it('produces a zero-sized stage instead of NaN for a zero-sized container', () => {
    const stage = fitStage(0, 0, 'landscape')
    expect(stage.width).toBe(0)
    expect(stage.height).toBe(0)
  })
})

describe('computeStageLayout', () => {
  it('stacks the three zones with no gap and no overlap', () => {
    const { stage, top, arena, bottom } = computeStageLayout(1600, 900, 'landscape')

    expect(top.y).toBe(stage.y)
    expect(arena.y).toBeCloseTo(top.y + top.height, 5)
    expect(bottom.y).toBeCloseTo(arena.y + arena.height, 5)
    expect(bottom.y + bottom.height).toBeCloseTo(stage.y + stage.height, 5)
    expect(top.height + arena.height + bottom.height).toBeCloseTo(stage.height, 5)
  })

  it('gives the bands their configured share of the stage height', () => {
    const { stage, top, bottom } = computeStageLayout(1600, 900, 'landscape')

    expect(top.height).toBeCloseTo(stage.height * TOP_ZONE_RATIO, 5)
    expect(bottom.height).toBeCloseTo(stage.height * BOTTOM_ZONE_RATIO, 5)
  })

  it('spans every zone across the full stage width', () => {
    const { stage, top, arena, bottom } = computeStageLayout(2000, 900, 'landscape')

    for (const zone of [top, arena, bottom]) {
      expect(zone.x).toBe(stage.x)
      expect(zone.width).toBe(stage.width)
    }
  })
})

describe('arena coordinates', () => {
  it('maps 0-100% onto the middle zone only, not the whole stage', () => {
    const layout = computeStageLayout(1600, 900, 'landscape')

    expect(arenaX(layout, 0)).toBeCloseTo(layout.arena.x, 5)
    expect(arenaX(layout, 100)).toBeCloseTo(layout.arena.x + layout.arena.width, 5)
    expect(arenaY(layout, 0)).toBeCloseTo(layout.arena.y, 5)
    expect(arenaY(layout, 100)).toBeCloseTo(layout.arena.y + layout.arena.height, 5)
    expect(arenaY(layout, 0)).toBeGreaterThan(layout.stage.y)
  })

  it('measures a length as a share of the arena, not of the stage', () => {
    const layout = computeStageLayout(1600, 900, 'landscape')
    expect(arenaLengthX(layout, 50)).toBeCloseTo(layout.arena.width / 2, 5)
  })

  it('puts the midline down the horizontal centre in portrait too (§6.4)', () => {
    const portrait = computeStageLayout(900, 1600, 'portrait')
    expect(arenaMidlineX(portrait)).toBeCloseTo(portrait.arena.x + portrait.arena.width / 2, 5)
  })
})

describe('fighterDiameter', () => {
  it('is 48 px on a stage the height of the reference design', () => {
    const layout = computeStageLayout(
      REFERENCE_STAGE_HEIGHT * (16 / 9),
      REFERENCE_STAGE_HEIGHT,
      'landscape',
    )
    expect(fighterDiameter(layout)).toBeCloseTo(FIGHTER_DIAMETER_PX, 5)
  })

  it('shrinks proportionally on a smaller stage', () => {
    const half = computeStageLayout(960, 540, 'landscape')
    expect(fighterDiameter(half)).toBeCloseTo(FIGHTER_DIAMETER_PX / 2, 5)
  })
})
