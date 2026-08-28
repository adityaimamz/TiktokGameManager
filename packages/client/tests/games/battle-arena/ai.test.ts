import { beforeEach, describe, expect, it } from 'vitest'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import { IDLE_SPEED_PER_TICK } from '../../../src/games/battle-arena/arena.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import { FighterRegistry } from '../../../src/games/battle-arena/fighters.js'
import { aiPhase, findNearestEnemy, stepAi } from '../../../src/games/battle-arena/ai.js'
import type { Fighter, SideId } from '../../../src/games/battle-arena/types.js'

const gameplay = defaultConfig().gameplay

const setup = () => {
  const registry = new FighterRegistry({ rng: createRng(1), clock: createManualClock() })
  const deps = { fighters: registry, rng: createRng(5), nowMs: 0, idleMovement: true }
  const add = (username: string, side: SideId, x: number, y: number): Fighter => {
    const fighter = registry.join({ platform: 'tiktok', username, avatarUrl: null }, side, gameplay).fighter
    if (fighter === null) throw new Error('expected a fighter')
    fighter.position.x = x
    fighter.position.y = y
    return fighter
  }
  return { registry, deps, add }
}

describe('findNearestEnemy', () => {
  beforeEach(() => resetEntityIds())

  it('picks the closest living fighter on the other side', () => {
    const { add, registry } = setup()
    const me = add('me', 'a', 10, 50)
    add('far', 'b', 90, 50)
    const near = add('near', 'b', 60, 50)
    expect(findNearestEnemy(me, registry)).toBe(near)
  })

  it('ignores dead enemies', () => {
    const { add, registry } = setup()
    const me = add('me', 'a', 10, 50)
    const dead = add('dead', 'b', 55, 50)
    dead.alive = false
    const alive = add('alive', 'b', 90, 50)
    expect(findNearestEnemy(me, registry)).toBe(alive)
  })

  it('ignores fighters on its own side', () => {
    const { add, registry } = setup()
    const me = add('me', 'a', 10, 50)
    add('mate', 'a', 12, 50)
    expect(findNearestEnemy(me, registry)).toBeNull()
  })

  it('returns null when the other side is empty', () => {
    const { add, registry } = setup()
    expect(findNearestEnemy(add('me', 'a', 10, 50), registry)).toBeNull()
  })
})

describe('stepAi', () => {
  beforeEach(() => resetEntityIds())

  it('leaves a dead fighter alone and stops it moving', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 10, 50)
    me.alive = false
    me.aiState = 'attack'
    me.velocity.x = 5
    stepAi(me, deps)
    expect(me.aiState).toBe('attack')
    expect(me.velocity).toEqual({ x: 0, y: 0 })
  })

  /**
   * Jarak tidak lagi menggerbang kesiapan menyerang (Req 9 AC1) — referensi gameplay
   * menembak dari mana saja di wilayah sendiri. Karena itu MoveToTarget tidak lagi ada:
   * begitu target didapat, fighter langsung siap menyerang pada tick yang sama (Req 32 AC2).
   */
  it('acquires the nearest enemy and is ready to attack in the same tick, however far away', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 1, 50)
    const enemy = add('enemy', 'b', 99, 50)
    me.aiState = 'acquireTarget'
    stepAi(me, deps)
    expect(me.targetKey).toBe(enemy.key)
    expect(me.aiState).toBe('attack')
  })

  it('goes idle when there is nobody to fight', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 10, 50)
    me.aiState = 'acquireTarget'
    stepAi(me, deps)
    expect(me.aiState).toBe('idle')
    expect(me.targetKey).toBeNull()
  })

  it('leaves the attack state for the combat phase to resolve', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 45, 50)
    const enemy = add('enemy', 'b', 50, 50)
    me.aiState = 'attack'
    me.targetKey = enemy.key
    stepAi(me, deps)
    expect(me.aiState).toBe('attack')
  })

  it('waits out the attack interval in cooldown', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 45, 50)
    const enemy = add('enemy', 'b', 50, 50)
    me.aiState = 'cooldown'
    me.targetKey = enemy.key
    me.lastAttackAtMs = 1000
    me.attackIntervalMs = 3000

    stepAi(me, { ...deps, nowMs: 3999 })
    expect(me.aiState).toBe('cooldown')

    stepAi(me, { ...deps, nowMs: 4000 })
    expect(me.aiState).toBe('acquireTarget')
  })

  it('leaves idle as soon as an enemy exists', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 10, 50)
    add('enemy', 'b', 60, 50)
    me.aiState = 'idle'
    stepAi(me, deps)
    expect(me.aiState).toBe('attack')
  })

  it('wanders slowly while idle and changes direction on a schedule', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 25, 50)
    me.aiState = 'idle'

    stepAi(me, { ...deps, nowMs: 0 })
    const first = { ...me.velocity }
    expect(Math.hypot(first.x, first.y)).toBeLessThanOrEqual(IDLE_SPEED_PER_TICK)
    expect(me.nextIdleTurnAtMs).toBeGreaterThanOrEqual(500)
    expect(me.nextIdleTurnAtMs).toBeLessThanOrEqual(1500)

    stepAi(me, { ...deps, nowMs: me.nextIdleTurnAtMs - 1 })
    expect(me.velocity).toEqual(first)

    stepAi(me, { ...deps, nowMs: me.nextIdleTurnAtMs })
    expect(me.velocity).not.toEqual(first)
  })

  it('stands still while idle when idle movement is switched off', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 25, 50)
    me.aiState = 'idle'
    stepAi(me, { ...deps, idleMovement: false })
    expect(me.velocity).toEqual({ x: 0, y: 0 })
  })

  /**
   * Referensi gameplay: fighter terus melayang pelan meski sedang menyerang atau
   * cooldown, bukan berhenti begitu punya target (Req 8 AC1). Gerak sekarang lepas dari
   * status tempur — satu-satunya jenis gerak adalah wander yang sama di setiap state.
   */
  it('keeps wandering while it has a target ready to attack', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 25, 50)
    add('enemy', 'b', 75, 50)
    me.aiState = 'acquireTarget'

    stepAi(me, { ...deps, nowMs: 0 })

    expect(me.aiState).toBe('attack')
    expect(Math.hypot(me.velocity.x, me.velocity.y)).toBeGreaterThan(0)
  })

  it('keeps wandering while on cooldown', () => {
    const { add, deps } = setup()
    const me = add('me', 'a', 25, 50)
    const enemy = add('enemy', 'b', 75, 50)
    me.aiState = 'cooldown'
    me.targetKey = enemy.key
    me.lastAttackAtMs = 0
    me.attackIntervalMs = 3000

    stepAi(me, { ...deps, nowMs: 100 })

    expect(me.aiState).toBe('cooldown')
    expect(Math.hypot(me.velocity.x, me.velocity.y)).toBeGreaterThan(0)
  })
})

describe('aiPhase', () => {
  beforeEach(() => resetEntityIds())

  it('steps every registered fighter', () => {
    const { add, deps } = setup()
    const a = add('a1', 'a', 10, 50)
    const b = add('b1', 'b', 90, 50)
    a.aiState = 'acquireTarget'
    b.aiState = 'acquireTarget'
    aiPhase(deps)
    expect(a.aiState).toBe('attack')
    expect(b.aiState).toBe('attack')
  })
})
