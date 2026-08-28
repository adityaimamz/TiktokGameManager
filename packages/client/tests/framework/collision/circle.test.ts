import { describe, expect, it } from 'vitest'
import { circlesOverlap, distanceSquared } from '../../../src/framework/collision/circle.js'

describe('distanceSquared', () => {
  it('returns zero for identical points', () => {
    expect(distanceSquared(3, 4, 3, 4)).toBe(0)
  })

  it('returns the squared euclidean distance', () => {
    expect(distanceSquared(0, 0, 3, 4)).toBe(25)
  })
})

describe('circlesOverlap', () => {
  it('detects overlapping circles', () => {
    expect(circlesOverlap(0, 0, 2, 3, 0, 2)).toBe(true)
  })

  it('rejects circles that exactly touch', () => {
    expect(circlesOverlap(0, 0, 2, 4, 0, 2)).toBe(false)
  })

  it('rejects separated circles', () => {
    expect(circlesOverlap(0, 0, 1, 10, 10, 1)).toBe(false)
  })

  it('detects a circle fully inside another', () => {
    expect(circlesOverlap(0, 0, 10, 1, 1, 1)).toBe(true)
  })
})
