import { describe, expect, it } from 'vitest'
import { SIDE_A, SIDE_B, createSnapshotView } from '@lga/shared'
import type { SnapshotView } from '@lga/shared'
import { defaultConfig } from '../../../../src/games/battle-arena/config/index.js'
import { gameInfoView } from '../../../../src/ui/dashboard/sections/game-info-view.js'

/** Snapshot buatan tangan: decoder tidak perlu dilibatkan untuk menguji pembacaan header. */
const snapshot = (patch: {
  scoreA?: number
  scoreB?: number
  wonA?: number
  wonB?: number
  fighters?: { side: number; alive: number }[]
}): SnapshotView => {
  const view = createSnapshotView()
  view.header.roundScoreA = patch.scoreA ?? 0
  view.header.roundScoreB = patch.scoreB ?? 0
  view.header.roundsWonA = patch.wonA ?? 0
  view.header.roundsWonB = patch.wonB ?? 0
  const fighters = patch.fighters ?? []
  view.header.fighterCount = fighters.length
  view.fighters = fighters.map((f) => ({
    slotIndex: 0,
    x: 0,
    y: 0,
    hp: 0,
    maxHp: 0,
    side: f.side,
    alive: f.alive,
    facingAngle: 0,
    targetSlot: -1,
    kills: 0,
    giftCoins: 0,
  }))
  return view
}

describe('gameInfoView', () => {
  it('shows zeroes rather than crashing before the first snapshot arrives', () => {
    const view = gameInfoView(null, defaultConfig())

    expect(view.a).toEqual({ name: 'Team A', color: '#3b82f6', score: '0' })
    expect(view.b).toEqual({ name: 'Team B', color: '#ef4444', score: '0' })
    expect(view.fields).toEqual([
      { label: 'Ronde', value: '1 dari best of 5' },
      { label: 'Unggul', value: 'Seri' },
      { label: 'Fighter', value: '0 vs 0' },
    ])
  })

  it('reads both scores and names the leader', () => {
    const view = gameInfoView(snapshot({ scoreA: 24, scoreB: 19 }), defaultConfig())

    expect(view.a.score).toBe('24')
    expect(view.b.score).toBe('19')
    expect(view.fields[1]).toEqual({ label: 'Unggul', value: 'Team A' })
  })

  it('counts the round from rounds already decided', () => {
    const view = gameInfoView(snapshot({ wonA: 1, wonB: 1 }), defaultConfig())

    expect(view.fields[0]).toEqual({ label: 'Ronde', value: '3 dari best of 5' })
  })

  it('counts only the fighters still standing, per side', () => {
    const view = gameInfoView(
      snapshot({
        fighters: [
          { side: SIDE_A, alive: 1 },
          { side: SIDE_A, alive: 0 },
          { side: SIDE_B, alive: 1 },
          { side: SIDE_B, alive: 1 },
        ],
      }),
      defaultConfig(),
    )

    expect(view.fields[2]).toEqual({ label: 'Fighter', value: '1 vs 2' })
  })
})
