import { describe, expect, it } from 'vitest'
import { createManualClock, systemClock } from './clock.js'

describe('createManualClock', () => {
  it('starts at zero by default', () => {
    expect(createManualClock().now()).toBe(0)
  })

  it('starts at the provided time', () => {
    expect(createManualClock(1000).now()).toBe(1000)
  })

  it('advances by the given amount', () => {
    const clock = createManualClock()
    clock.advance(50)
    clock.advance(25)
    expect(clock.now()).toBe(75)
  })

  it('jumps to an absolute time with set()', () => {
    const clock = createManualClock(100)
    clock.set(5)
    expect(clock.now()).toBe(5)
  })
})

describe('systemClock', () => {
  it('returns a non-decreasing number', () => {
    const clock = systemClock()
    const a = clock.now()
    const b = clock.now()
    expect(typeof a).toBe('number')
    expect(b).toBeGreaterThanOrEqual(a)
  })
})
