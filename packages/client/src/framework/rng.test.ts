import { describe, expect, it } from 'vitest'
import { createRng } from './rng.js'

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = [a.next(), a.next(), a.next(), a.next(), a.next()]
    const seqB = [b.next(), b.next(), b.next(), b.next(), b.next()]
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('returns values in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int() stays within [min, maxExclusive)', () => {
    const rng = createRng(99)
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThan(7)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('range() stays within [min, max)', () => {
    const rng = createRng(5)
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(10, 20)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThan(20)
    }
  })

  it('pick() always returns a member of the array', () => {
    const rng = createRng(11)
    const items = ['a', 'b', 'c'] as const
    for (let i = 0; i < 200; i++) {
      expect(items).toContain(rng.pick(items))
    }
  })
})
