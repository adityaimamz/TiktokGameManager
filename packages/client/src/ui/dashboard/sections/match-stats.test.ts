import { describe, expect, it } from 'vitest'
import type { MatchSummary } from '@lga/shared'
import { matchStats } from './match-stats.js'

const sides = { a: 'Messi', b: 'Ronaldo' }

const match = (overrides: Partial<MatchSummary> = {}): MatchSummary => ({
  id: 1,
  startedAtMs: 1_700_000_000_000,
  winnerSide: 'a',
  roundsWonA: 2,
  roundsWonB: 1,
  durationMs: 252_000,
  totalFighters: 18,
  ...overrides,
})

describe('matchStats', () => {
  it('reads an empty history as empty rather than as a zero-percent win rate', () => {
    const view = matchStats([], sides)

    expect(view.empty).toBe(true)
    expect(view.rows).toEqual([])
    expect(view.winRate).toBeNull()
  })

  it('names the sides from the config in force, not from the match', () => {
    const view = matchStats([match()], sides)

    expect(view.rows[0]?.nameA).toBe('Messi')
    expect(view.rows[0]?.nameB).toBe('Ronaldo')
  })

  it('builds one row per match, with its score and clock', () => {
    const view = matchStats([match()], sides)

    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]?.score).toBe('2 – 1')
    expect(view.rows[0]?.duration).toBe('4:12')
    expect(view.rows[0]?.winner).toBe('a')
    expect(view.rows[0]?.fighters).toBe(18)
  })

  it('shows a dash for a match whose duration was never written', () => {
    const view = matchStats([match({ durationMs: null })], sides)

    expect(view.rows[0]?.duration).toBe('—')
  })

  it('counts draws separately so the three numbers still add up', () => {
    const view = matchStats(
      [match({ winnerSide: 'a' }), match({ winnerSide: 'b' }), match({ winnerSide: null })],
      sides,
    )

    expect(view.winRate?.winsA).toBe(1)
    expect(view.winRate?.winsB).toBe(1)
    expect(view.winRate?.drawCount).toBe(1)
    expect(view.winRate?.total).toBe(3)
  })

  it('rounds each share on its own and does not force them to reach 100', () => {
    const view = matchStats(
      [match({ winnerSide: 'a' }), match({ winnerSide: 'b' }), match({ winnerSide: null })],
      sides,
    )

    // 33 + 33 + 33 = 99, dan itu memang benar: menambal satu angka membuat satu sisi
    // terlihat menang lebih sering daripada kenyataannya.
    expect(view.winRate?.a).toBe(33)
    expect(view.winRate?.b).toBe(33)
    expect(view.winRate?.draws).toBe(33)
  })

  it('says how wide the window actually is, not how wide it was asked to be', () => {
    expect(matchStats([match(), match(), match()], sides).winRate?.label).toBe('3 match terakhir')
    expect(matchStats([match()], sides).winRate?.label).toBe('1 match terakhir')
  })
})
