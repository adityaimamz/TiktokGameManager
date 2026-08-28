import { beforeEach, describe, expect, it } from 'vitest'
import { NO_SLOT } from '@lga/shared'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import { ActionQueue } from '../../../src/framework/actions/queue.js'
import { createBattleAction, fighterTarget, sideTarget } from '../../../src/games/battle-arena/actions.js'
import type { BattleAction } from '../../../src/games/battle-arena/actions.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import {
  applyAction,
  applyDamage,
  combatPhase,
  drainActions,
  growFighter,
  releaseQueuedUltimates,
  resolveAttacks,
  resolveUltimates,
} from '../../../src/games/battle-arena/combat.js'
import { createBattleArenaState } from '../../../src/games/battle-arena/state.js'
import type { EngineEvent } from '../../../src/games/battle-arena/events.js'
import type { Fighter, SideId } from '../../../src/games/battle-arena/types.js'

const setup = () => {
  const state = createBattleArenaState({ rng: createRng(3), clock: createManualClock() })
  const config = defaultConfig()
  const queue = new ActionQueue<BattleAction>()
  const events: EngineEvent[] = []
  const rng = createRng(7)
  const deps = { state, config, queue, rng, nowMs: 1000, emit: (e: EngineEvent) => events.push(e) }

  const add = (username: string, side: SideId, x = 25, y = 50): Fighter => {
    const f = state.fighters.join({ platform: 'tiktok', username, avatarUrl: null }, side, config.gameplay).fighter
    if (f === null) throw new Error('expected a fighter')
    f.position.x = x
    f.position.y = y
    return f
  }
  const actor = (username: string) => ({ platform: 'tiktok' as const, username, avatarUrl: null })

  return { state, config, queue, events, deps, add, actor, rng }
}

describe('target relatif', () => {
  beforeEach(() => resetEntityIds())

  const heal = (target: string, username: string): BattleAction =>
    createBattleAction({
      type: 'heal',
      target,
      value: 10,
      actor: { platform: 'tiktok', username, avatarUrl: null },
    })

  it('ownSide mengenai seluruh sisi pengirim', () => {
    const { deps, add } = setup()
    const sender = add('andi', 'a')
    const ally = add('budi', 'a')
    const enemy = add('cici', 'b')
    sender.hp = 10
    ally.hp = 10
    enemy.hp = 10

    applyAction(heal('ownSide:tiktok:andi', 'andi'), deps)

    expect(sender.hp).toBe(20)
    expect(ally.hp).toBe(20)
    expect(enemy.hp).toBe(10)
  })

  it('enemySide mengenai seluruh sisi lawan', () => {
    const { deps, add } = setup()
    add('andi', 'a')
    const enemy = add('cici', 'b')
    enemy.hp = 10

    applyAction(heal('enemySide:tiktok:andi', 'andi'), deps)

    expect(enemy.hp).toBe(20)
  })

  it('randomEnemy mengenai tepat satu fighter', () => {
    const { deps, add } = setup()
    add('andi', 'a')
    const first = add('cici', 'b')
    const second = add('dedi', 'b')
    first.hp = 10
    second.hp = 10

    applyAction(heal('randomEnemy:tiktok:andi', 'andi'), deps)

    expect([first.hp, second.hp].filter((hp) => hp === 20)).toHaveLength(1)
  })

  // Determinisme: seed sama harus memilih korban yang sama, tiap kali.
  it('memilih korban yang sama dari seed yang sama', () => {
    const pick = (): string => {
      const { deps, add } = setup()
      add('andi', 'a')
      const names = ['cici', 'dedi', 'euis', 'fani'].map((name) => add(name, 'b'))
      for (const fighter of names) fighter.hp = 10
      applyAction(heal('randomAlly:tiktok:cici', 'cici'), deps)
      const hit = names.find((fighter) => fighter.hp === 20)
      return hit?.username ?? 'none'
    }
    expect(pick()).toBe(pick())
  })

  it('membuang aksi dari pengirim yang belum punya fighter', () => {
    const { deps, add, events } = setup()
    add('cici', 'b')
    applyAction(heal('enemySide:tiktok:hantu', 'hantu'), deps)
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'actionDiscarded', reason: 'inactiveTarget' }),
    )
  })

  it('nuke menerima enemySide dan menghantam sisi lawan', () => {
    const { deps, state, add } = setup()
    add('andi', 'a')
    const enemy = add('cici', 'b', 75, 50)
    const before = enemy.hp

    applyAction(
      createBattleAction({
        type: 'nuke',
        target: 'enemySide:tiktok:andi',
        actor: { platform: 'tiktok', username: 'andi', avatarUrl: null },
      }),
      deps,
    )

    // Damage tidak lagi mendarat seketika (Plan 6a); yang lahir adalah satu antrean ke sisi b.
    expect(enemy.hp).toBe(before)
    expect(state.pendingUltimates[0]?.targetSide).toBe('b')
  })

  it('nuke dengan target acak tetap mendapat sebuah sisi, bukan dibuang', () => {
    const { deps, state, add, events } = setup()
    add('andi', 'a')
    add('cici', 'b')
    applyAction(
      createBattleAction({
        type: 'nuke',
        target: 'randomEnemy:tiktok:andi',
        actor: { platform: 'tiktok', username: 'andi', avatarUrl: null },
      }),
      deps,
    )
    expect(state.pendingUltimates[0]?.targetSide).toBe('b')
    expect(events.filter((e) => e.type === 'actionDiscarded')).toHaveLength(0)
  })
})

describe('spawn action', () => {
  beforeEach(() => resetEntityIds())

  it('puts the sender into the side named by the target', () => {
    const { deps, state, actor, events } = setup()
    applyAction(createBattleAction({ type: 'spawn', target: sideTarget('b'), actor: actor('andi') }), deps)
    expect(state.fighters.get('tiktok:andi')?.side).toBe('b')
    expect(events.some((e) => e.type === 'fighterJoined')).toBe(true)
  })

  it('spawns a join effect', () => {
    const { deps, state, actor } = setup()
    applyAction(createBattleAction({ type: 'spawn', target: sideTarget('a'), actor: actor('andi') }), deps)
    expect(state.effects.activeCount).toBe(1)
  })

  it('discards a spawn with no sender', () => {
    const { deps, state, events } = setup()
    applyAction(createBattleAction({ type: 'spawn', target: sideTarget('a') }), deps)
    expect(state.fighters.count).toBe(0)
    expect(events).toContainEqual(expect.objectContaining({ type: 'actionDiscarded', reason: 'noActor' }))
  })

  it('reports a rejected join when the side is full', () => {
    const { deps, config, actor, events, state } = setup()
    config.gameplay.maxFightersPerSide = 1
    applyAction(createBattleAction({ type: 'spawn', target: sideTarget('a'), actor: actor('first') }), deps)
    applyAction(createBattleAction({ type: 'spawn', target: sideTarget('a'), actor: actor('second') }), deps)
    expect(state.fighters.count).toBe(1)
    expect(events).toContainEqual(expect.objectContaining({ type: 'joinRejected', reason: 'sideFull' }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'actionDiscarded', reason: 'sideFull' }))
  })

  it('reports a repeat join on the same side without spawning again', () => {
    const { deps, actor, events, state } = setup()
    applyAction(createBattleAction({ type: 'spawn', target: sideTarget('a'), actor: actor('andi') }), deps)
    applyAction(createBattleAction({ type: 'spawn', target: sideTarget('a'), actor: actor('andi') }), deps)
    expect(state.fighters.count).toBe(1)
    expect(events).toContainEqual(expect.objectContaining({ type: 'actionDiscarded', reason: 'alreadyJoined' }))
  })

  it('discards a spawn whose target is not a side', () => {
    const { deps, actor, events, state } = setup()
    applyAction(createBattleAction({ type: 'spawn', target: 'all', actor: actor('andi') }), deps)
    expect(state.fighters.count).toBe(0)
    expect(events).toContainEqual(expect.objectContaining({ type: 'actionDiscarded', reason: 'unknownTarget' }))
  })
})

describe('growFighter', () => {
  beforeEach(() => resetEntityIds())

  it('raises maxHp as well as hp once the like threshold is crossed', () => {
    const { deps, add } = setup()
    const f = add('andi', 'a')
    expect(growFighter(f, 10, deps)).toBe(5)
    expect(f.maxHp).toBe(205)
    expect(f.hp).toBe(205)
  })

  it('keeps leftover likes for the next threshold', () => {
    const { deps, add } = setup()
    const f = add('andi', 'a')
    expect(growFighter(f, 7, deps)).toBe(0)
    expect(f.likeAccumulator).toBe(7)
    expect(growFighter(f, 4, deps)).toBe(5)
    expect(f.likeAccumulator).toBe(1)
  })

  it('grants several steps at once for a big burst', () => {
    const { deps, add } = setup()
    const f = add('andi', 'a')
    expect(growFighter(f, 35, deps)).toBe(15)
    expect(f.maxHp).toBe(215)
  })

  it('scales per like when growMode is perLike', () => {
    const { deps, config, add } = setup()
    config.gameplay.growMode = 'perLike'
    const f = add('andi', 'a')
    expect(growFighter(f, 3, deps)).toBe(15)
    expect(f.maxHp).toBe(215)
  })

  it('leaves a damaged fighter below its new maxHp intact', () => {
    const { deps, add } = setup()
    const f = add('andi', 'a')
    f.hp = 50
    growFighter(f, 10, deps)
    expect(f.maxHp).toBe(205)
    expect(f.hp).toBe(55)
  })
})

describe('grow action', () => {
  beforeEach(() => resetEntityIds())

  it('applies to the sender own fighter', () => {
    const { deps, add, actor } = setup()
    const f = add('andi', 'a')
    applyAction(
      createBattleAction({ type: 'grow', target: fighterTarget(actor('andi')), value: 10, actor: actor('andi') }),
      deps,
    )
    expect(f.maxHp).toBe(205)
  })

  it('is discarded when the sender has no fighter', () => {
    const { deps, events, actor } = setup()
    applyAction(
      createBattleAction({ type: 'grow', target: fighterTarget(actor('ghost')), value: 10, actor: actor('ghost') }),
      deps,
    )
    expect(events).toContainEqual(expect.objectContaining({ type: 'actionDiscarded', reason: 'inactiveTarget' }))
  })

  it('is discarded when the sender fighter is dead', () => {
    const { deps, add, events, actor } = setup()
    const f = add('andi', 'a')
    f.alive = false
    applyAction(
      createBattleAction({ type: 'grow', target: fighterTarget(actor('andi')), value: 10, actor: actor('andi') }),
      deps,
    )
    expect(f.maxHp).toBe(200)
    expect(events).toContainEqual(expect.objectContaining({ type: 'actionDiscarded', reason: 'inactiveTarget' }))
  })

  it('spawns a heal effect only when HP was actually gained', () => {
    const { deps, state, add, actor } = setup()
    add('andi', 'a')
    applyAction(
      createBattleAction({ type: 'grow', target: fighterTarget(actor('andi')), value: 3, actor: actor('andi') }),
      deps,
    )
    expect(state.effects.activeCount).toBe(0)
    applyAction(
      createBattleAction({ type: 'grow', target: fighterTarget(actor('andi')), value: 7, actor: actor('andi') }),
      deps,
    )
    expect(state.effects.activeCount).toBe(1)
  })
})

describe('heal, buff and debuff actions', () => {
  beforeEach(() => resetEntityIds())

  it('heals without ever exceeding maxHp', () => {
    const { deps, add, actor } = setup()
    const f = add('andi', 'a')
    f.hp = 190
    applyAction(createBattleAction({ type: 'heal', target: fighterTarget(actor('andi')), value: 50 }), deps)
    expect(f.hp).toBe(200)
  })

  it('adds to damage on buff and subtracts on debuff, never below one', () => {
    const { deps, add, actor } = setup()
    const f = add('andi', 'a')
    applyAction(createBattleAction({ type: 'buff', target: fighterTarget(actor('andi')), value: 15 }), deps)
    expect(f.damage).toBe(25)
    applyAction(createBattleAction({ type: 'debuff', target: fighterTarget(actor('andi')), value: 100 }), deps)
    expect(f.damage).toBe(1)
  })
})

describe('damage action as a barrage', () => {
  beforeEach(() => resetEntityIds())

  it('hits every living fighter on the targeted side', () => {
    const { deps, add } = setup()
    const b1 = add('b1', 'b', 75, 40)
    const b2 = add('b2', 'b', 80, 60)
    const a1 = add('a1', 'a', 20, 40)
    applyAction(createBattleAction({ type: 'damage', target: sideTarget('b'), value: 30 }), deps)
    expect(b1.hp).toBe(170)
    expect(b2.hp).toBe(170)
    expect(a1.hp).toBe(200)
  })

  it('hits both sides for the all target', () => {
    const { deps, add } = setup()
    const a1 = add('a1', 'a', 20, 40)
    const b1 = add('b1', 'b', 75, 40)
    applyAction(createBattleAction({ type: 'damage', target: 'all', value: 10 }), deps)
    expect(a1.hp).toBe(190)
    expect(b1.hp).toBe(190)
  })
})

describe('deferred action types', () => {
  it('discards the presentation actions until the soundboard lands', () => {
    const { deps, events } = setup()
    for (const type of ['spawnEffect', 'playSound', 'cameraShake'] as const) {
      applyAction(createBattleAction({ type, target: 'all' }), deps)
    }
    const discarded = events.filter((e) => e.type === 'actionDiscarded' && e.reason === 'deferredToPhase2')
    expect(discarded).toHaveLength(3)
  })
})

describe('applyDamage', () => {
  beforeEach(() => resetEntityIds())

  it('clamps HP at zero and marks the fighter dead', () => {
    const { deps, add } = setup()
    const target = add('b1', 'b', 75, 50)
    applyDamage(target, 500, null, deps)
    expect(target.hp).toBe(0)
    expect(target.alive).toBe(false)
    expect(target.deaths).toBe(1)
  })

  it('credits the killer and the killer side score', () => {
    const { deps, state, add } = setup()
    const killer = add('a1', 'a', 20, 50)
    const target = add('b1', 'b', 75, 50)
    applyDamage(target, 500, killer, deps)
    expect(killer.kills).toBe(1)
    expect(state.roundScore.a).toBe(1)
    expect(state.roundScore.b).toBe(0)
  })

  it('leaves the score alone when nobody gets the credit', () => {
    const { deps, state, add } = setup()
    applyDamage(add('b1', 'b', 75, 50), 500, null, deps)
    expect(state.roundScore).toEqual({ a: 0, b: 0 })
  })

  it('makes everyone who was chasing the dead fighter re-acquire', () => {
    const { deps, add } = setup()
    const target = add('b1', 'b', 75, 50)
    const chaser = add('a1', 'a', 20, 50)
    chaser.targetKey = target.key
    chaser.aiState = 'attack'
    applyDamage(target, 500, null, deps)
    expect(chaser.targetKey).toBeNull()
    expect(chaser.aiState).toBe('acquireTarget')
  })

  it('does nothing to a fighter that is already dead', () => {
    const { deps, add } = setup()
    const target = add('b1', 'b', 75, 50)
    target.alive = false
    target.hp = 0
    applyDamage(target, 10, null, deps)
    expect(target.deaths).toBe(0)
  })

  it('declares the round winner as soon as the kill target is reached', () => {
    const { deps, config, state, add } = setup()
    config.gameplay.killsToWinRound = 1
    const killer = add('a1', 'a', 20, 50)
    applyDamage(add('b1', 'b', 75, 50), 500, killer, deps)
    expect(state.roundWinner).toBe('a')
  })

  it('gives the round to the side that scored the deciding kill', () => {
    const { deps, config, state, add } = setup()
    config.gameplay.killsToWinRound = 2
    state.roundScore.a = 1
    state.roundScore.b = 1
    const killerB = add('b1', 'b', 75, 50)
    applyDamage(add('a1', 'a', 20, 50), 500, killerB, deps)
    expect(state.roundWinner).toBe('b')
  })

  it('spawns a hit effect carrying the damage, and a kill effect on death', () => {
    const { deps, state, add } = setup()
    const target = add('b1', 'b', 75, 50)
    applyDamage(target, 20, null, deps)
    expect(state.effects.activeCount).toBe(1)
    applyDamage(target, 500, null, deps)
    expect(state.effects.activeCount).toBe(3)
  })
})

describe('resolveAttacks', () => {
  beforeEach(() => resetEntityIds())

  /*
   * Satu terbitan per TICK, bukan per peluru: bunyi tembakan menempel di sini, dan dengan
   * 200 fighter satu event per peluru berarti 200 permintaan bunyi dalam satu tick.
   */
  it('emits attacksFired once per tick with shots, and stays quiet without any', () => {
    const { deps, events, add } = setup()
    const target = add('b1', 'b', 75, 50)
    for (const name of ['a1', 'a2', 'a3']) {
      const attacker = add(name, 'a', 25, 50)
      attacker.aiState = 'attack'
      attacker.targetKey = target.key
    }

    combatPhase(deps)
    expect(events.filter((e) => e.type === 'attacksFired')).toHaveLength(1)

    // Semuanya sudah cooldown sekarang; tick tanpa tembakan tidak boleh menerbitkan apa pun.
    combatPhase(deps)
    expect(events.filter((e) => e.type === 'attacksFired')).toHaveLength(1)
  })

  it('fires a projectile and puts the attacker on cooldown', () => {
    const { deps, state, add } = setup()
    const attacker = add('a1', 'a', 45, 50)
    const target = add('b1', 'b', 50, 50)
    attacker.aiState = 'attack'
    attacker.targetKey = target.key

    expect(resolveAttacks(deps)).toBe(1)
    expect(state.projectiles.activeCount).toBe(1)
    expect(attacker.aiState).toBe('cooldown')
    expect(attacker.lastAttackAtMs).toBe(1000)
  })

  it('cancels the attack when the target died in the meantime', () => {
    const { deps, state, add } = setup()
    const attacker = add('a1', 'a', 45, 50)
    const target = add('b1', 'b', 50, 50)
    target.alive = false
    attacker.aiState = 'attack'
    attacker.targetKey = target.key

    expect(resolveAttacks(deps)).toBe(0)
    expect(state.projectiles.activeCount).toBe(0)
    expect(attacker.aiState).toBe('acquireTarget')
  })

  /**
   * Jarak tidak lagi menggerbang serangan (Req 9 AC1) — referensi gameplay menembak dari
   * mana saja di wilayah sendiri, tidak pernah "keluar jangkauan".
   */
  it('fires regardless of how far apart attacker and target are', () => {
    const { deps, state, add } = setup()
    const attacker = add('a1', 'a', 1, 50)
    const target = add('b1', 'b', 99, 50)
    attacker.aiState = 'attack'
    attacker.targetKey = target.key

    expect(resolveAttacks(deps)).toBe(1)
    expect(state.projectiles.activeCount).toBe(1)
    expect(attacker.aiState).toBe('cooldown')
  })

  it('ignores fighters that are not in the attack state', () => {
    const { deps, add } = setup()
    const attacker = add('a1', 'a', 45, 50)
    const target = add('b1', 'b', 50, 50)
    attacker.aiState = 'idle'
    attacker.targetKey = target.key
    expect(resolveAttacks(deps)).toBe(0)
  })
})

describe('drainActions and combatPhase', () => {
  beforeEach(() => resetEntityIds())

  it('applies every queued action in order and empties the queue', () => {
    const { deps, queue, state, actor } = setup()
    queue.enqueue(createBattleAction({ type: 'spawn', target: sideTarget('a'), actor: actor('andi') }))
    queue.enqueue(
      createBattleAction({ type: 'grow', target: fighterTarget(actor('andi')), value: 10, actor: actor('andi') }),
    )

    expect(drainActions(deps)).toBe(2)
    expect(queue.size).toBe(0)
    expect(state.fighters.get('tiktok:andi')?.maxHp).toBe(205)
  })

  it('drains the queue and resolves attacks in one combat phase', () => {
    const { deps, queue, state, add, actor } = setup()
    const attacker = add('a1', 'a', 45, 50)
    const target = add('b1', 'b', 50, 50)
    attacker.aiState = 'attack'
    attacker.targetKey = target.key
    queue.enqueue(createBattleAction({ type: 'spawn', target: sideTarget('a'), actor: actor('late') }))

    combatPhase(deps)

    expect(queue.size).toBe(0)
    expect(state.fighters.count).toBe(3)
    expect(state.projectiles.activeCount).toBe(1)
  })
})

describe('hasten action', () => {
  beforeEach(() => resetEntityIds())

  it('memperpendek interval serang sebesar value', () => {
    const { deps, add, actor } = setup()
    const fighter = add('andi', 'a')
    expect(fighter.attackIntervalMs).toBe(1000)

    applyAction(
      createBattleAction({ type: 'hasten', target: fighterTarget(actor('andi')), value: 200 }),
      deps,
    )

    expect(fighter.attackIntervalMs).toBe(800)
  })

  it('tidak pernah turun di bawah setengah interval dasar', () => {
    const { deps, add, actor } = setup()
    const fighter = add('andi', 'a')

    for (let i = 0; i < 10; i++) {
      applyAction(
        createBattleAction({ type: 'hasten', target: fighterTarget(actor('andi')), value: 200 }),
        deps,
      )
    }

    expect(fighter.attackIntervalMs).toBe(500)
  })

  it('memunculkan efek gift pada fighter yang dipercepat', () => {
    const { deps, state, add, actor } = setup()
    add('andi', 'a')
    const before = state.effects.activeCount

    applyAction(
      createBattleAction({ type: 'hasten', target: fighterTarget(actor('andi')), value: 500 }),
      deps,
    )

    expect(state.effects.activeCount).toBe(before + 1)
  })

  it('membuang hasten yang tidak punya target hidup', () => {
    const { deps, events, actor } = setup()
    applyAction(
      createBattleAction({ type: 'hasten', target: fighterTarget(actor('hantu')), value: 500 }),
      deps,
    )
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'actionDiscarded', reason: 'inactiveTarget' }),
    )
  })
})

describe('growFighter di luar mode flat', () => {
  beforeEach(() => resetEntityIds())

  it('mengalikan langsung pada perCoin, tanpa menunggu ambang like', () => {
    const { deps, config, add } = setup()
    config.gameplay.growMode = 'perCoin'
    config.gameplay.hpGainedPerGrow = 5
    const fighter = add('andi', 'a')

    const gained = growFighter(fighter, 60, deps)

    expect(gained).toBe(300)
    expect(fighter.maxHp).toBe(config.gameplay.baseHp + 300)
  })

  it('mengalikan langsung pada perFollow', () => {
    const { deps, config, add } = setup()
    config.gameplay.growMode = 'perFollow'
    config.gameplay.hpGainedPerGrow = 5
    const fighter = add('andi', 'a')

    expect(growFighter(fighter, 1, deps)).toBe(5)
  })

  it('tetap menumpuk terhadap ambang pada mode flat', () => {
    const { deps, config, add } = setup()
    config.gameplay.growMode = 'flat'
    const fighter = add('andi', 'a')

    // Ambang bawaan 10: sembilan satuan belum cukup, satu lagi baru memicu.
    expect(growFighter(fighter, 9, deps)).toBe(0)
    expect(growFighter(fighter, 1, deps)).toBe(config.gameplay.hpGainedPerGrow)
  })
})

describe('nuke action', () => {
  beforeEach(() => resetEntityIds())

  /**
   * Menembak lalu memajukan tick sampai ultimate-nya mendarat.
   *
   * Sejak Plan 6a damage tidak lagi jatuh di tick tembak; assertion lama tetap berlaku,
   * hanya perlu menunggu pendaratannya.
   */
  const fireAndLand = (action: BattleAction, deps: ReturnType<typeof setup>['deps']): void => {
    applyAction(action, deps)
    releaseQueuedUltimates(deps)
    const u = deps.state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')
    deps.state.tick = u.landsAtTick
    resolveUltimates(deps)
  }

  /**
   * Seperti `fireAndLand`, tapi berjalan sampai giliran sasaran TERAKHIR lewat.
   *
   * Sejak Plan 6c satu salvo mendarat berjenjang, jadi satu panggilan `resolveUltimates`
   * hanya melukai rudal pertama.
   */
  const fireAndLandAll = (action: BattleAction, deps: ReturnType<typeof setup>['deps']): void => {
    applyAction(action, deps)
    releaseQueuedUltimates(deps)
    const u = deps.state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')

    const last = u.landsAtTick + Math.max(0, u.targetSlots.length - 1) * u.landStaggerTicks
    for (deps.state.tick = u.landsAtTick; deps.state.tick <= last; deps.state.tick++) {
      resolveUltimates(deps)
    }
  }

  /*
   * Aturan lama "sepuluh terdekat sekaligus" sudah diganti Plan 6c: missileRain mengunci satu
   * musuh PER RUDAL saat tembak, dan jumlah rudalnya berskala menurut tier. Yang dijaga di
   * sini adalah batas atasnya, bukan angka sepuluh.
   */
  it('missileRain melukai satu musuh per rudal, terdekat ke pusat separuh lawan lebih dulu', () => {
    const { deps, config, state } = setup()
    config.gameplay.nuke.damage = 30
    // Dua belas fighter di sisi B, makin jauh dari pusat (75, 50) makin besar indeksnya.
    const victims = Array.from(
      { length: 12 },
      (_, i) =>
        state.fighters.join(
          { platform: 'tiktok', username: `b${i}`, avatarUrl: null },
          'b',
          config.gameplay,
        ).fighter,
    )
    victims.forEach((fighter, i) => {
      if (fighter === null) throw new Error('expected a fighter')
      fighter.position.x = 75
      fighter.position.y = 50 + i
    })

    fireAndLandAll(createBattleAction({ type: 'nuke', target: sideTarget('b'), value: 30 }), deps)

    const hit = victims.filter((f) => f !== null && f.hp < f.maxHp)
    expect(hit).toHaveLength(config.gameplay.nuke.missile.baseCount)
    expect(victims[0]?.hp).toBe(config.gameplay.baseHp - 30)
    expect(victims[11]?.hp).toBe(config.gameplay.baseHp)
  })

  it('tidak pernah melukai lebih dari batas sasaran satu ultimate', () => {
    const { deps, config, state } = setup()
    config.gameplay.nuke.missile.baseCount = 10
    const victims = Array.from(
      { length: 20 },
      (_, i) =>
        state.fighters.join(
          { platform: 'tiktok', username: `b${i}`, avatarUrl: null },
          'b',
          config.gameplay,
        ).fighter,
    )
    victims.forEach((fighter, i) => {
      if (fighter === null) throw new Error('expected a fighter')
      fighter.position.x = 75
      fighter.position.y = 50 + i * 0.1
    })

    fireAndLandAll(createBattleAction({ type: 'nuke', target: sideTarget('b'), value: 30 }), deps)

    expect(victims.filter((f) => f !== null && f.hp < f.maxHp).length).toBeLessThanOrEqual(10)
  })

  it('menjatuhkan HP sasaran ke-i hanya saat gilirannya, bukan saat rudal pertama tiba', () => {
    const { deps, config, state } = setup()
    const victims = Array.from({ length: 4 }, (_, i) => {
      const f = state.fighters.join(
        { platform: 'tiktok', username: `b${i}`, avatarUrl: null },
        'b',
        config.gameplay,
      ).fighter
      if (f === null) throw new Error('expected a fighter')
      f.position.x = 75
      f.position.y = 50 + i
      return f
    })

    applyAction(createBattleAction({ type: 'nuke', target: sideTarget('b'), value: 30 }), deps)
    releaseQueuedUltimates(deps)
    const u = deps.state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')
    expect(u.landStaggerTicks).toBeGreaterThan(0)

    deps.state.tick = u.landsAtTick
    resolveUltimates(deps)
    expect(victims[0]?.hp).toBeLessThan(victims[0]?.maxHp ?? 0)
    // Rudal terakhir belum tiba: HP-nya tidak boleh turun mendahului ledakannya.
    expect(victims[3]?.hp).toBe(victims[3]?.maxHp)

    deps.state.tick = u.landsAtTick + 3 * u.landStaggerTicks
    resolveUltimates(deps)
    expect(victims[3]?.hp).toBeLessThan(victims[3]?.maxHp ?? 0)
  })

  /*
   * Aturan D1b: daftar sasaran hanya boleh BERTAMBAH. Renderer menyelesaikan lintasan rudal
   * terhadap slot di daftar ini setiap frame; menggantinya di tengah jalan membuat rudal
   * berpindah tempat dalam satu frame alih-alih berbelok.
   */
  it('mengalihkan damage sasaran yang mati TANPA mengubah daftar yang digambar', () => {
    const { deps, config, state } = setup()
    config.gameplay.nuke.missile.baseCount = 1
    const doomed = state.fighters.join(
      { platform: 'tiktok', username: 'doomed', avatarUrl: null },
      'b',
      config.gameplay,
    ).fighter
    if (doomed === null) throw new Error('expected a fighter')
    doomed.position.x = 75
    doomed.position.y = 50

    applyAction(createBattleAction({ type: 'nuke', target: sideTarget('b'), value: 30 }), deps)
    releaseQueuedUltimates(deps)
    const u = deps.state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')
    const before = [...u.targetSlots]

    doomed.alive = false
    const bystander = state.fighters.join(
      { platform: 'tiktok', username: 'bystander', avatarUrl: null },
      'b',
      config.gameplay,
    ).fighter
    if (bystander === null) throw new Error('expected a fighter')
    bystander.position.x = 76
    bystander.position.y = 50

    deps.state.tick = u.landsAtTick
    resolveUltimates(deps)

    expect(u.targetSlots).toEqual(before)
    expect(bystander.hp).toBeLessThan(bystander.maxHp)
  })

  it('tidak menjatuhkan damage anumerta saat tidak ada pengganti yang hidup', () => {
    const { deps, config, state } = setup()
    const doomed = state.fighters.join(
      { platform: 'tiktok', username: 'doomed', avatarUrl: null },
      'b',
      config.gameplay,
    ).fighter
    if (doomed === null) throw new Error('expected a fighter')
    doomed.position.x = 75
    doomed.position.y = 50

    applyAction(createBattleAction({ type: 'nuke', target: sideTarget('b'), value: 30 }), deps)
    releaseQueuedUltimates(deps)
    const u = deps.state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')

    doomed.alive = false
    doomed.hp = 40
    deps.state.tick = u.landsAtTick
    resolveUltimates(deps)

    expect(doomed.hp).toBe(40)
    expect(u.totalDamage).toBe(0)
  })

  it('memekarkan bomb ke semua yang ada dalam radius, dengan hanya MENAMBAH entri', () => {
    const { deps, config, state } = setup()
    config.gameplay.nuke.type = 'bomb'
    const victims = Array.from({ length: 4 }, (_, i) => {
      const f = state.fighters.join(
        { platform: 'tiktok', username: `b${i}`, avatarUrl: null },
        'b',
        config.gameplay,
      ).fighter
      if (f === null) throw new Error('expected a fighter')
      f.position.x = 75
      f.position.y = 50 + i * 0.5
      return f
    })

    applyAction(createBattleAction({ type: 'nuke', target: sideTarget('b'), value: 30 }), deps)
    releaseQueuedUltimates(deps)
    const u = deps.state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')
    const aimed = u.targetSlots[0]
    expect(u.targetSlots).toHaveLength(1)

    deps.state.tick = u.landsAtTick
    resolveUltimates(deps)

    // Entri ke-0 — satu-satunya yang punya lintasan — tidak boleh bergeser.
    expect(u.targetSlots[0]).toBe(aimed)
    expect(u.targetSlots.length).toBeGreaterThan(1)
    // Bom meledak SEKALI: seluruh korban dalam radius kehilangan HP di tick yang sama.
    expect(victims.every((f) => f.hp < f.maxHp)).toBe(true)
  })

  it('memakai damage dari config, bukan dari action', () => {
    const { deps, config, add } = setup()
    config.gameplay.nuke.damage = 80
    const victim = add('budi', 'b', 75, 50)

    fireAndLand(createBattleAction({ type: 'nuke', target: sideTarget('b'), value: 5 }), deps)

    expect(victim.hp).toBe(config.gameplay.baseHp - 80)
  })

  it('memunculkan satu efek ledakan di pusat separuh yang dihantam saat mendarat', () => {
    const { deps, state, add } = setup()
    add('budi', 'b', 75, 50)
    const before = state.effects.activeCount

    fireAndLand(createBattleAction({ type: 'nuke', target: sideTarget('b'), value: 0 }), deps)

    // Satu efek ledakan plus satu efek hit dari damage-nya.
    expect(state.effects.activeCount).toBe(before + 2)
  })

  it('nuke tanpa sisi jatuh ke lawan sisi caster, bukan dibuang', () => {
    const { deps, state, events, actor, add } = setup()
    add('andi', 'a')

    applyAction(
      createBattleAction({
        type: 'nuke',
        target: fighterTarget(actor('andi')),
        value: 10,
        actor: actor('andi'),
      }),
      deps,
    )

    expect(state.pendingUltimates[0]?.targetSide).toBe('b')
    expect(events.filter((e) => e.type === 'actionDiscarded')).toHaveLength(0)
  })

  it('nuke ke sisi yang sudah habis tetap diakui — damage hangus, pengakuannya tidak', () => {
    const { deps, state, events } = setup()
    applyAction(createBattleAction({ type: 'nuke', target: sideTarget('b'), value: 10 }), deps)

    expect(state.pendingUltimates).toHaveLength(1)
    expect(events).toContainEqual(expect.objectContaining({ type: 'actionApplied' }))
    expect(events.filter((e) => e.type === 'actionDiscarded')).toHaveLength(0)
  })
})

describe('auto-join gifter (Plan 6a)', () => {
  const giftHeal = (username: string): BattleAction =>
    createBattleAction({
      type: 'heal',
      target: fighterTarget({ platform: 'tiktok', username }),
      value: 10,
      actor: { platform: 'tiktok', username, avatarUrl: null },
      ruleId: 'gift-heal',
      giftName: 'Rose',
      giftCoins: 30,
    })

  it('gifter tanpa fighter otomatis didaftarkan ke sisi yang paling sepi', () => {
    const { deps, state, add } = setup()
    add('andi', 'a')
    add('budi', 'a')
    add('cici', 'b')

    applyAction(giftHeal('dedi'), deps)

    expect(state.fighters.get('tiktok:dedi')?.side).toBe('b')
  })

  it('menghitung yang HIDUP, bukan yang terdaftar: sisi penuh mayat justru yang dipilih', () => {
    // Fighter mati tetap terdaftar (lihat CLAUDE.md), jadi menghitung registrasi membuat
    // sisi yang baru saja dibantai terlihat PALING RAMAI — dan gifter dikirim ke sisi
    // yang justru sedang menang. Kebalikan dari maksudnya.
    const { deps, state, add } = setup()
    add('andi', 'a').alive = false
    add('budi', 'a').alive = false
    add('caca', 'a')
    add('dedi', 'b')
    add('euis', 'b')

    applyAction(giftHeal('fani'), deps)

    expect(state.fighters.get('tiktok:fani')?.side).toBe('a')
  })

  it('tidak mendaftarkan siapa pun saat autoJoinGifter mati', () => {
    const { deps, state, config, add } = setup()
    config.gameplay.autoJoinGifter = false
    add('andi', 'a')
    add('cici', 'b')

    applyAction(giftHeal('dedi'), deps)

    expect(state.fighters.get('tiktok:dedi')).toBeUndefined()
  })

  it('mencoba sisi lawan saat sisi terpilih penuh', () => {
    const { deps, state, config, add } = setup()
    config.gameplay.maxFightersPerSide = 1
    add('andi', 'a')

    applyAction(giftHeal('dedi'), deps)

    expect(state.fighters.get('tiktok:dedi')?.side).toBe('b')
  })

  it('kedua sisi penuh: tidak ada fighter baru, tidak ada error', () => {
    const { deps, state, config, add } = setup()
    config.gameplay.maxFightersPerSide = 1
    add('andi', 'a')
    add('cici', 'b')

    applyAction(giftHeal('dedi'), deps)

    expect(state.fighters.get('tiktok:dedi')).toBeUndefined()
    expect(state.fighters.count).toBe(2)
  })

  it('aksi non-gift tidak pernah mendaftarkan siapa pun', () => {
    const { deps, state, add } = setup()
    add('andi', 'a')
    add('cici', 'b')

    applyAction(
      createBattleAction({
        type: 'heal',
        target: fighterTarget({ platform: 'tiktok', username: 'dedi' }),
        value: 10,
        actor: { platform: 'tiktok', username: 'dedi', avatarUrl: null },
      }),
      deps,
    )

    expect(state.fighters.get('tiktok:dedi')).toBeUndefined()
  })

  it('gifter yang sudah punya fighter tidak dipindahkan sisinya', () => {
    const { deps, state, add } = setup()
    add('dedi', 'a')
    add('cici', 'b')
    add('budi', 'b')

    applyAction(giftHeal('dedi'), deps)

    expect(state.fighters.get('tiktok:dedi')?.side).toBe('a')
  })
})

describe('nuke mengantre, bukan meledak seketika (Plan 6a)', () => {
  const nuke = (username: string, target: string, coins = 0): BattleAction =>
    createBattleAction({
      type: 'nuke',
      target,
      value: 50,
      actor: { platform: 'tiktok', username, avatarUrl: null },
      ruleId: 'gift-nuke',
      giftName: 'Lion',
      giftCoins: coins,
    })

  it('tidak menurunkan HP siapa pun pada tick tembak', () => {
    const { deps, state, add } = setup()
    add('andi', 'a')
    const enemy = add('cici', 'b', 75, 50)

    applyAction(nuke('andi', sideTarget('b')), deps)

    expect(enemy.hp).toBe(enemy.maxHp)
    expect(state.pendingUltimates).toHaveLength(1)
  })

  it('menerbitkan actionApplied saat tembak, bahkan ketika sisi sasaran kosong', () => {
    const { deps, events, add } = setup()
    add('andi', 'a')

    applyAction(nuke('andi', sideTarget('b')), deps)

    expect(events.filter((e) => e.type === 'actionApplied')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'actionDiscarded')).toHaveLength(0)
  })

  it('membawa jenis ultimate dari rule, bukan dari gameplay.nuke.type', () => {
    const { deps, state, config, add } = setup()
    config.gameplay.nuke.type = 'bomb'
    config.triggers.push({
      id: 'gift-nuke',
      label: 'Nuke',
      enabled: true,
      when: { kind: 'gift', giftNames: [], minCount: 1 },
      then: { actionType: 'nuke', target: 'sideB', value: 50, nukeType: 'laser' },
      legend: { show: true, caption: 'NUKE', icon: 'gift' },
    })
    add('andi', 'a')
    add('cici', 'b')

    applyAction(nuke('andi', sideTarget('b')), deps)

    expect(state.pendingUltimates[0]?.nukeType).toBe('laser')
  })

  it('jatuh ke gameplay.nuke.type saat rule tidak menyebut jenisnya', () => {
    const { deps, state, config, add } = setup()
    config.gameplay.nuke.type = 'bomb'
    add('andi', 'a')
    add('cici', 'b')

    applyAction(nuke('andi', sideTarget('b')), deps)

    expect(state.pendingUltimates[0]?.nukeType).toBe('bomb')
  })

  it('gifter tanpa fighter memakai casterSlot NO_SLOT dan origin di tepi luar sisinya', () => {
    const { deps, state, config, add } = setup()
    config.gameplay.autoJoinGifter = false
    add('andi', 'a')
    add('cici', 'b')

    applyAction(nuke('dedi', sideTarget('b')), deps)

    const pendingItem = state.pendingUltimates[0]
    expect(pendingItem?.casterSlot).toBe(NO_SLOT)
    expect(pendingItem?.side).toBe('a')
    expect(pendingItem?.originX).toBe(0)
    expect(pendingItem?.originY).toBe(50)
  })

  it('target acak tetap menghasilkan sisi sasaran, bukan aksi yang dibuang', () => {
    const { deps, state, events, add } = setup()
    add('andi', 'a')
    add('cici', 'b')

    applyAction(nuke('andi', 'randomEnemy:tiktok:andi'), deps)

    expect(state.pendingUltimates).toHaveLength(1)
    expect(events.filter((e) => e.type === 'actionDiscarded')).toHaveLength(0)
  })

  it('koin gift ikut ke antrean untuk pemilihan tier', () => {
    const { deps, state, add } = setup()
    add('andi', 'a')
    add('cici', 'b')

    applyAction(nuke('andi', sideTarget('b'), 1500), deps)

    expect(state.pendingUltimates[0]?.giftCoins).toBe(1500)
  })
})
