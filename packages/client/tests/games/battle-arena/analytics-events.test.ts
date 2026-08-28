import { describe, expect, it } from 'vitest'
import { toAnalyticsEvent } from '../../../src/games/battle-arena/analytics-events.js'
import type { Fighter } from '../../../src/games/battle-arena/types.js'

function fighter(overrides: Partial<Fighter> = {}): Fighter {
  return {
    id: 'e1',
    type: 'fighter',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    lifetime: -1,
    active: true,
    key: 'tiktok:budi',
    slotIndex: 0,
    platform: 'tiktok',
    username: 'budi',
    avatarUrl: null,
    side: 'a',
    hp: 200,
    maxHp: 200,
    damage: 10,
    attackIntervalMs: 800,
    kills: 0,
    deaths: 0,
    giftCoins: 0,
    joinedAtMs: 1_000,
    lastAttackAtMs: null,
    alive: true,
    aiState: 'idle',
    targetKey: null,
    likeAccumulator: 0,
    facingAngle: 0,
    nextIdleTurnAtMs: 0,
    ...overrides,
  }
}

describe('toAnalyticsEvent', () => {
  it('maps stateChanged to its from/to/atMs', () => {
    const mapped = toAnalyticsEvent({ type: 'stateChanged', from: 'idle', to: 'waitingFighters', atMs: 500 })
    expect(mapped).toEqual({ type: 'stateChanged', payload: { from: 'idle', to: 'waitingFighters' } })
  })

  it('maps fighterJoined to platform, side, and outcome, never the whole Fighter', () => {
    const mapped = toAnalyticsEvent({
      type: 'fighterJoined',
      fighter: fighter({ platform: 'tiktok', side: 'b' }),
      outcome: 'joined',
    })
    expect(mapped).toEqual({
      type: 'fighterJoined',
      payload: { platform: 'tiktok', side: 'b', outcome: 'joined' },
    })
  })

  it('maps fighterDied with the killer platform when there is one', () => {
    const mapped = toAnalyticsEvent({
      type: 'fighterDied',
      fighter: fighter({ platform: 'tiktok', side: 'a' }),
      killer: fighter({ platform: 'demo', side: 'b' }),
    })
    expect(mapped).toEqual({
      type: 'fighterDied',
      payload: { platform: 'tiktok', side: 'a', killerPlatform: 'demo' },
    })
  })

  it('maps fighterDied with a null killerPlatform when there is no killer', () => {
    const mapped = toAnalyticsEvent({ type: 'fighterDied', fighter: fighter(), killer: null })
    expect(mapped?.payload['killerPlatform']).toBeNull()
  })

  it('maps roundEnded to winner and roundIndex', () => {
    const mapped = toAnalyticsEvent({ type: 'roundEnded', winner: 'a', roundIndex: 2 })
    expect(mapped).toEqual({ type: 'roundEnded', payload: { winner: 'a', roundIndex: 2 } })
  })

  it('maps matchEnded to winner', () => {
    const mapped = toAnalyticsEvent({ type: 'matchEnded', winner: 'b' })
    expect(mapped).toEqual({ type: 'matchEnded', payload: { winner: 'b' } })
  })

  it('maps realViewerArrived to removedDemoFighters', () => {
    const mapped = toAnalyticsEvent({ type: 'realViewerArrived', removedDemoFighters: 3 })
    expect(mapped).toEqual({ type: 'realViewerArrived', payload: { removedDemoFighters: 3 } })
  })

  it('returns null for the high-frequency events, keeping the buffer from thrashing', () => {
    expect(toAnalyticsEvent({ type: 'actionApplied', action: { type: 'damage' } as never })).toBeNull()
    expect(
      toAnalyticsEvent({
        type: 'actionDiscarded',
        action: { type: 'damage' } as never,
        reason: 'unknownTarget',
      }),
    ).toBeNull()
    expect(
      toAnalyticsEvent({
        type: 'joinRejected',
        actor: { platform: 'tiktok', username: 'x', avatarUrl: null },
        side: 'a',
        reason: 'alreadyOnSide',
      }),
    ).toBeNull()
  })
})
