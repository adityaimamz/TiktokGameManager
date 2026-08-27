import { beforeEach, describe, expect, it } from 'vitest'
import { createEntity, resetEntityIds } from './factory.js'

describe('createEntity', () => {
  beforeEach(() => resetEntityIds())

  it('assigns a unique id per call', () => {
    const a = createEntity('projectile')
    const b = createEntity('projectile')
    expect(a.id).not.toBe(b.id)
  })

  it('prefixes the id with the entity type', () => {
    expect(createEntity('particle').id.startsWith('particle')).toBe(true)
  })

  it('sets active to true', () => {
    expect(createEntity('projectile').active).toBe(true)
  })

  it('defaults position, velocity and lifetime', () => {
    const e = createEntity('projectile')
    expect(e.position).toEqual({ x: 0, y: 0 })
    expect(e.velocity).toEqual({ x: 0, y: 0 })
    expect(e.lifetime).toBe(-1)
  })

  it('applies caller-provided position, velocity and lifetime', () => {
    const e = createEntity('projectile', { x: 10, y: 20, vx: -1, vy: 2, lifetime: 3000 })
    expect(e.position).toEqual({ x: 10, y: 20 })
    expect(e.velocity).toEqual({ x: -1, y: 2 })
    expect(e.lifetime).toBe(3000)
  })

  it('gives each entity its own position object', () => {
    const a = createEntity('projectile')
    const b = createEntity('projectile')
    a.position.x = 99
    expect(b.position.x).toBe(0)
  })
})
