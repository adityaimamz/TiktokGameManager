import { beforeEach, describe, expect, it } from 'vitest'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import { ActionQueue } from '../../../src/framework/actions/queue.js'
import { createBattleAction, sideTarget } from '../../../src/games/battle-arena/actions.js'
import type { BattleAction } from '../../../src/games/battle-arena/actions.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import { drainActions } from '../../../src/games/battle-arena/combat.js'
import { createBattleArenaState } from '../../../src/games/battle-arena/state.js'
import type { EngineEvent } from '../../../src/games/battle-arena/events.js'
import type { SideId } from '../../../src/games/battle-arena/types.js'

const setup = () => {
  const state = createBattleArenaState({ rng: createRng(3), clock: createManualClock() })
  const config = defaultConfig()
  const queue = new ActionQueue<BattleAction>()
  const events: EngineEvent[] = []
  const rng = createRng(7)
  const deps = { state, config, queue, rng, nowMs: 1000, emit: (e: EngineEvent) => events.push(e) }

  const add = (username: string, side: SideId) => {
    const f = state.fighters.join({ platform: 'tiktok', username, avatarUrl: null }, side, config.gameplay).fighter
    if (f === null) throw new Error('expected a fighter')
    return f
  }

  return { state, config, queue, events, deps, add }
}

const actor = (username: string) => ({ platform: 'tiktok' as const, username, avatarUrl: null })

describe('ActionQueue nuke safety — game integration', () => {
  beforeEach(() => resetEntityIds())

  it('enqueue >500 nuke actions in one batch, all survive drain into pendingUltimates', () => {
    const { state, deps, queue, add } = setup()
    add('alice', 'a')
    add('bob', 'b')

    const count = 600
    for (let i = 0; i < count; i++) {
      queue.enqueue(
        createBattleAction({
          type: 'nuke',
          target: sideTarget('b'),
          actor: actor(`gifter${i}`),
          giftName: 'Rose',
          giftCoins: 1,
        }),
      )
    }

    // Queue harus menampung seluruhnya — ring buffer kapasitas 500 tidak berlaku
    // untuk nuke karena neverEvict.
    expect(queue.size).toBe(count)
    expect(queue.droppedCount).toBe(0)

    // drain -> applyAction -> case 'nuke' -> enqueueUltimate -> pendingUltimates
    drainActions(deps)

    expect(queue.size).toBe(0)
    expect(state.pendingUltimates).toHaveLength(count)

    // Setiap gifter punya satu pending ultimate.
    const gifterKeys = new Set(state.pendingUltimates.map((p) => p.gifterKey))
    expect(gifterKeys.size).toBe(count)
  })

  it('mixed nuke + non-nuke over capacity: only non-nuke are evicted, all nuke survive', () => {
    const { state, deps, queue, add, events } = setup()
    add('alice', 'a')
    add('bob', 'b')

    const nukeCount = 300
    const healCount = 400
    // Total 700, jauh di atas kapasitas ring 500.

    // Campur: nuke, heal, nuke, heal, ... lalu sisanya.
    for (let i = 0; i < nukeCount; i++) {
      queue.enqueue(
        createBattleAction({
          type: 'nuke',
          target: sideTarget('b'),
          actor: actor(`gifter${i}`),
          giftName: 'Rose',
          giftCoins: 1,
        }),
      )
    }
    for (let i = 0; i < healCount; i++) {
      queue.enqueue(
        createBattleAction({
          type: 'heal',
          target: sideTarget('a'),
          value: 1,
        }),
      )
    }

    // 300 nuke di neverEvictQueue (tidak menyentuh ring buffer).
    // 400 heal di ring buffer kapasitas 500, jadi tidak ada yang dibuang.
    // Tapi mari juga tes kasus di mana ring penuh:
    // Tambah 200 heal lagi -> ring sekarang 600, kapasitas 500, 100 heal tertua terbuang.
    for (let i = 0; i < 200; i++) {
      queue.enqueue(
        createBattleAction({
          type: 'heal',
          target: sideTarget('a'),
          value: 2,
        }),
      )
    }

    // Ring: 600 heal enqueued, kapasitas 500, 100 heal terbuang.
    // neverEvictQueue: 300 nuke, semua selamat.
    expect(queue.droppedCount).toBe(100)
    expect(queue.neverEvictSize).toBe(nukeCount)

    drainActions(deps)

    expect(queue.size).toBe(0)
    // Semua 300 nuke HARUS masuk pendingUltimates, TIDAK ADA yang hilang.
    expect(state.pendingUltimates).toHaveLength(nukeCount)

    // Pastikan yang dibuang (actionDiscarded) bukan nuke.
    const discarded = events.filter((e) => e.type === 'actionDiscarded')
    for (const e of discarded) {
      if (e.type === 'actionDiscarded') {
        expect(e.action.type).not.toBe('nuke')
      }
    }
  })
})
