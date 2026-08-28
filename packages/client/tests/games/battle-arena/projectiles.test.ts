import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import {
  ARENA_ASPECT,
  FIGHTER_HIT_RADIUS,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED_PER_TICK,
} from '../../../src/games/battle-arena/arena.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import { FighterRegistry } from '../../../src/games/battle-arena/fighters.js'
import {
  PROJECTILE_POOL_SIZE,
  createProjectilePool,
  fireProjectile,
  projectilePhase,
  retireProjectiles,
  steerProjectiles,
} from '../../../src/games/battle-arena/projectiles.js'
import type { Fighter, SideId } from '../../../src/games/battle-arena/types.js'

const gameplay = defaultConfig().gameplay
const ASPECT = ARENA_ASPECT.landscape

const setup = () => {
  const fighters = new FighterRegistry({ rng: createRng(1), clock: createManualClock() })
  const projectiles = createProjectilePool(8)
  const add = (username: string, side: SideId, x: number, y: number): Fighter => {
    const f = fighters.join({ platform: 'tiktok', username, avatarUrl: null }, side, gameplay).fighter
    if (f === null) throw new Error('expected a fighter')
    f.position.x = x
    f.position.y = y
    return f
  }
  return { fighters, projectiles, add }
}

describe('createProjectilePool', () => {
  it('pre-allocates 500 projectiles by default', () => {
    expect(createProjectilePool().capacity).toBe(PROJECTILE_POOL_SIZE)
  })
})

describe('fireProjectile', () => {
  beforeEach(() => resetEntityIds())

  it('starts at the attacker and aims at the target', () => {
    const { projectiles, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    const target = add('enemy', 'b', 30, 50)
    const p = fireProjectile(projectiles, attacker, target)
    expect(p.position).toEqual({ x: 20, y: 50 })
    expect(p.velocity.x).toBeCloseTo(PROJECTILE_SPEED_PER_TICK)
    expect(p.velocity.y).toBeCloseTo(0)
  })

  it('travels at its full speed in any direction', () => {
    const { projectiles, add } = setup()
    const attacker = add('me', 'a', 20, 20)
    const target = add('enemy', 'b', 60, 60)
    const p = fireProjectile(projectiles, attacker, target)
    expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeCloseTo(PROJECTILE_SPEED_PER_TICK)
  })

  it('carries the attacker damage, side and lifetime', () => {
    const { projectiles, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    attacker.damage = 37
    const target = add('enemy', 'b', 30, 50)
    const p = fireProjectile(projectiles, attacker, target)
    expect(p.damage).toBe(37)
    expect(p.ownerKey).toBe(attacker.key)
    expect(p.ownerSide).toBe('a')
    expect(p.targetKey).toBe(target.key)
    expect(p.lifetime).toBe(PROJECTILE_LIFETIME_MS)
  })

  it('still picks a direction when attacker and target sit on the same spot', () => {
    const { projectiles, add } = setup()
    const attacker = add('me', 'a', 40, 50)
    const target = add('enemy', 'b', 40, 50)
    const p = fireProjectile(projectiles, attacker, target)
    expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeCloseTo(PROJECTILE_SPEED_PER_TICK)
  })
})

describe('steerProjectiles', () => {
  beforeEach(() => resetEntityIds())

  it('re-aims a shot at where its target has moved to', () => {
    const { projectiles, fighters, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    const target = add('enemy', 'b', 60, 50)
    const p = fireProjectile(projectiles, attacker, target)
    expect(p.velocity.y).toBeCloseTo(0)

    // Target berpindah ke bawah setelah tembakan lepas.
    target.position.y = 90

    steerProjectiles(projectiles, fighters)

    expect(p.velocity.y).toBeGreaterThan(0)
    expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeCloseTo(PROJECTILE_SPEED_PER_TICK)
    // Arahnya persis ke posisi target yang baru.
    expect(p.velocity.y / p.velocity.x).toBeCloseTo(40 / 40)
  })

  /**
   * Tanpa aturan ini, kecepatan projectile yang jauh lebih besar daripada radius hitbox
   * membuat tembakan melompati targetnya tanpa pernah tumpang tindih, lalu berbalik dan
   * berosilasi selamanya sampai umurnya habis — kebalikan dari "auto lock".
   */
  it('lands exactly on the target instead of overshooting it', () => {
    const { projectiles, fighters, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    const target = add('enemy', 'b', 60, 50)
    const p = fireProjectile(projectiles, attacker, target)

    // Satu langkah penuh masih lebih jauh daripada sisa jaraknya.
    p.position.x = target.position.x - PROJECTILE_SPEED_PER_TICK / 2
    p.position.y = target.position.y

    steerProjectiles(projectiles, fighters)

    expect(p.position.x + p.velocity.x).toBeCloseTo(target.position.x)
    expect(p.position.y + p.velocity.y).toBeCloseTo(target.position.y)
  })

  it('leaves a shot flying straight once its target has died', () => {
    const { projectiles, fighters, add } = setup()
    const p = fireProjectile(projectiles, add('me', 'a', 20, 50), add('enemy', 'b', 60, 50))
    const before = { ...p.velocity }
    const target = fighters.get(p.targetKey)
    if (target === undefined) throw new Error('expected the target')
    target.alive = false
    target.position.y = 90

    steerProjectiles(projectiles, fighters)

    expect(p.velocity).toEqual(before)
  })

  it('leaves a shot flying straight once its target has left the registry', () => {
    const { projectiles, add } = setup()
    const emptyRegistry = new FighterRegistry({ rng: createRng(2), clock: createManualClock() })
    const p = fireProjectile(projectiles, add('me', 'a', 20, 50), add('enemy', 'b', 60, 50))
    const before = { ...p.velocity }

    steerProjectiles(projectiles, emptyRegistry)

    expect(p.velocity).toEqual(before)
  })

  it('keeps a shot sitting exactly on its target moving', () => {
    const { projectiles, fighters, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    const target = add('enemy', 'b', 60, 50)
    const p = fireProjectile(projectiles, attacker, target)
    p.position.x = target.position.x
    p.position.y = target.position.y

    steerProjectiles(projectiles, fighters)

    expect(Number.isNaN(p.velocity.x)).toBe(false)
    expect(Number.isNaN(p.velocity.y)).toBe(false)
  })
})

describe('projectilePhase', () => {
  beforeEach(() => resetEntityIds())

  it('reports a hit and returns the projectile to the pool', () => {
    const { projectiles, fighters, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    const target = add('enemy', 'b', 60, 50)
    const p = fireProjectile(projectiles, attacker, target)
    p.position.x = 60
    p.position.y = 50

    const onHit = vi.fn()
    expect(projectilePhase({ projectiles, fighters, aspect: ASPECT, baseHp: gameplay.baseHp, onHit })).toBe(1)
    expect(onHit).toHaveBeenCalledWith(p, target)
    expect(projectiles.activeCount).toBe(0)
  })

  it('passes straight through its own side', () => {
    const { projectiles, fighters, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    const mate = add('mate', 'a', 25, 50)
    const target = add('enemy', 'b', 60, 50)
    const p = fireProjectile(projectiles, attacker, target)
    p.position.x = mate.position.x
    p.position.y = mate.position.y

    const onHit = vi.fn()
    expect(projectilePhase({ projectiles, fighters, aspect: ASPECT, baseHp: gameplay.baseHp, onHit })).toBe(0)
    expect(onHit).not.toHaveBeenCalled()
    expect(projectiles.activeCount).toBe(1)
  })

  it('passes straight through a dead enemy', () => {
    const { projectiles, fighters, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    const target = add('enemy', 'b', 60, 50)
    target.alive = false
    const p = fireProjectile(projectiles, attacker, target)
    p.position.x = 60
    p.position.y = 50

    expect(projectilePhase({ projectiles, fighters, aspect: ASPECT, baseHp: gameplay.baseHp, onHit: () => {} })).toBe(0)
    expect(projectiles.activeCount).toBe(1)
  })

  it('hits at most one fighter per projectile', () => {
    const { projectiles, fighters, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    const first = add('e1', 'b', 60, 50)
    const second = add('e2', 'b', 60, 50)
    const p = fireProjectile(projectiles, attacker, first)
    p.position.x = 60
    p.position.y = 50

    const hits: string[] = []
    expect(projectilePhase({ projectiles, fighters, aspect: ASPECT, baseHp: gameplay.baseHp, onHit: (_, f) => hits.push(f.key) })).toBe(1)
    expect(hits).toHaveLength(1)
    expect([first.key, second.key]).toContain(hits[0])
  })

  /**
   * Jangkauan kena yang SAMA ke segala arah — ini yang dulu rusak.
   *
   * Dengan uji lama, tembakan dari samping mendaftar kena pada 67 px sementara dari atas
   * baru pada 26 px: hitbox-nya elips. Di sini jarak horizontal dinyatakan dalam persen-X
   * (dibagi aspek) dan vertikal dalam persen-Y, dan keduanya harus berperilaku identik.
   */
  it('menjangkau sejauh yang sama dari samping dan dari atas', () => {
    const reach = FIGHTER_HIT_RADIUS + PROJECTILE_RADIUS

    const at = (dxPercentY: number, dyPercentY: number): boolean => {
      const { projectiles, fighters, add } = setup()
      const attacker = add('me', 'a', 20, 50)
      const target = add('enemy', 'b', 60, 50)
      const p = fireProjectile(projectiles, attacker, target)
      p.position.x = target.position.x + dxPercentY / ASPECT
      p.position.y = target.position.y + dyPercentY
      return projectilePhase({ projectiles, fighters, aspect: ASPECT, baseHp: gameplay.baseHp, onHit: () => {} }) === 1
    }

    expect(at(reach * 0.99, 0)).toBe(true)
    expect(at(0, reach * 0.99)).toBe(true)
    expect(at(reach * 1.01, 0)).toBe(false)
    expect(at(0, reach * 1.01)).toBe(false)
  })

  /**
   * Fighter yang tumbuh benar-benar jadi sasaran yang lebih lebar.
   *
   * Ini setengah dari tawar-menawarnya: HP naik linier, radius naik `sqrt`, jadi tumbuh
   * tetap menguntungkan — tapi bukan gratis. Tembakan yang meleset tipis dari blob ukuran
   * dasar mengenai blob yang sama di posisi sama begitu ia membesar.
   */
  it('menjadikan fighter yang membesar sasaran yang lebih lebar', () => {
    const fire = (hp: number, offsetY: number): number => {
      const { projectiles, fighters, add } = setup()
      const attacker = add('me', 'a', 20, 50)
      const target = add('enemy', 'b', 60, 50)
      target.maxHp = hp
      target.hp = hp
      const p = fireProjectile(projectiles, attacker, target)
      p.position.x = target.position.x
      p.position.y = target.position.y + offsetY
      return projectilePhase({ projectiles, fighters, aspect: ASPECT, baseHp: gameplay.baseHp, onHit: () => {} })
    }

    // Tepat di luar jangkauan ukuran dasar, tapi di dalam jangkauan ukuran maksimum.
    const justOutside = (FIGHTER_HIT_RADIUS + PROJECTILE_RADIUS) * 1.1

    expect(fire(gameplay.baseHp, justOutside)).toBe(0)
    expect(fire(gameplay.baseHp * 4, justOutside)).toBe(1)
  })

  it('leaves a projectile alone while it is still in flight', () => {
    const { projectiles, fighters, add } = setup()
    const attacker = add('me', 'a', 20, 50)
    const target = add('enemy', 'b', 90, 50)
    fireProjectile(projectiles, attacker, target)
    expect(projectilePhase({ projectiles, fighters, aspect: ASPECT, baseHp: gameplay.baseHp, onHit: () => {} })).toBe(0)
    expect(projectiles.activeCount).toBe(1)
  })
})

describe('retireProjectiles', () => {
  beforeEach(() => resetEntityIds())

  it('drops a projectile whose lifetime has run out', () => {
    const { projectiles, add } = setup()
    const p = fireProjectile(projectiles, add('me', 'a', 20, 50), add('enemy', 'b', 60, 50))
    p.lifetime = 0
    expect(retireProjectiles(projectiles)).toBe(1)
    expect(projectiles.activeCount).toBe(0)
  })

  it('drops a projectile that left the arena', () => {
    const { projectiles, add } = setup()
    const p = fireProjectile(projectiles, add('me', 'a', 20, 50), add('enemy', 'b', 60, 50))
    p.position.x = 101
    expect(retireProjectiles(projectiles)).toBe(1)
    expect(projectiles.activeCount).toBe(0)
  })

  it('keeps a projectile that is still inside with time left', () => {
    const { projectiles, add } = setup()
    fireProjectile(projectiles, add('me', 'a', 20, 50), add('enemy', 'b', 60, 50))
    expect(retireProjectiles(projectiles)).toBe(0)
    expect(projectiles.activeCount).toBe(1)
  })
})
