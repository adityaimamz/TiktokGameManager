import { beforeEach, describe, expect, it } from 'vitest'
import { EntityPool } from '../../../src/framework/entity/pool.js'
import { resetEntityIds } from '../../../src/framework/entity/factory.js'
import type { Entity } from '../../../src/framework/entity/entity.js'

const collectActive = (pool: EntityPool): Entity[] => {
  const out: Entity[] = []
  pool.forEachActive((e) => out.push(e))
  return out
}

describe('EntityPool', () => {
  beforeEach(() => resetEntityIds())

  it('pre-allocates the requested capacity as inactive instances', () => {
    const pool = new EntityPool('projectile', 5)
    expect(pool.capacity).toBe(5)
    expect(pool.activeCount).toBe(0)
  })

  it('acquire returns an active entity and applies init values', () => {
    const pool = new EntityPool('projectile', 2)
    const e = pool.acquire({ x: 3, y: 4, vx: 1, vy: -1, lifetime: 500 })
    expect(e.active).toBe(true)
    expect(e.position).toEqual({ x: 3, y: 4 })
    expect(e.velocity).toEqual({ x: 1, y: -1 })
    expect(e.lifetime).toBe(500)
    expect(pool.activeCount).toBe(1)
  })

  it('release deactivates the entity and removes it from active iteration', () => {
    const pool = new EntityPool('projectile', 2)
    const e = pool.acquire()
    pool.release(e)
    expect(e.active).toBe(false)
    expect(pool.activeCount).toBe(0)
    expect(collectActive(pool)).toHaveLength(0)
  })

  it('reuses the released instance instead of allocating a new one', () => {
    const pool = new EntityPool('projectile', 1)
    const first = pool.acquire()
    pool.release(first)
    const second = pool.acquire()
    expect(second).toBe(first)
    expect(pool.capacity).toBe(1)
  })

  it('grows capacity by one when the pool is exhausted', () => {
    const pool = new EntityPool('projectile', 1)
    pool.acquire()
    pool.acquire()
    expect(pool.capacity).toBe(2)
    expect(pool.activeCount).toBe(2)
  })

  it('resets stale state when an instance is reused', () => {
    const pool = new EntityPool('projectile', 1)
    const first = pool.acquire({ x: 50, y: 60, vx: 9, vy: 9, lifetime: 100 })
    pool.release(first)
    const second = pool.acquire()
    expect(second.position).toEqual({ x: 0, y: 0 })
    expect(second.velocity).toEqual({ x: 0, y: 0 })
    expect(second.lifetime).toBe(-1)
  })

  it('iterates only active entities', () => {
    const pool = new EntityPool('projectile', 4)
    const a = pool.acquire()
    const b = pool.acquire()
    const c = pool.acquire()
    pool.release(b)
    const seen = collectActive(pool)
    expect(seen).toHaveLength(2)
    expect(seen).toContain(a)
    expect(seen).toContain(c)
    expect(seen).not.toContain(b)
  })

  it('allows releasing the entity currently being visited', () => {
    const pool = new EntityPool('projectile', 4)
    pool.acquire()
    pool.acquire()
    pool.acquire()
    pool.forEachActive((e) => pool.release(e))
    expect(pool.activeCount).toBe(0)
  })

  it('ignores a double release', () => {
    const pool = new EntityPool('projectile', 2)
    const e = pool.acquire()
    pool.release(e)
    pool.release(e)
    expect(pool.capacity).toBe(2)
    expect(pool.activeCount).toBe(0)
  })

  it('releaseAll empties the active list', () => {
    const pool = new EntityPool('projectile', 3)
    pool.acquire()
    pool.acquire()
    pool.releaseAll()
    expect(pool.activeCount).toBe(0)
    expect(pool.capacity).toBe(3)
  })
})
