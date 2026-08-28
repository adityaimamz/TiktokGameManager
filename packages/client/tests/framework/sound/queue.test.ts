import { describe, expect, it } from 'vitest'
import { createManualClock } from '../../../src/framework/clock.js'
import { SoundQueue } from '../../../src/framework/sound/queue.js'

const setup = (overrides: { maxConcurrent?: number; throttleMs?: number } = {}) => {
  const clock = createManualClock()
  const played: { id: string; volume: number }[] = []
  const queue = new SoundQueue({
    clock,
    play: (id, volume) => played.push({ id, volume }),
    ...overrides,
  })
  return { clock, played, queue }
}

describe('SoundQueue', () => {
  it('plays a requested sound with its volume', () => {
    const { queue, played } = setup()
    expect(queue.request('hit', 60, 200)).toBe(true)
    expect(played).toEqual([{ id: 'hit', volume: 60 }])
  })

  it('throttles an identical sound requested within 50ms', () => {
    const { clock, queue, played } = setup()
    queue.request('hit', 50, 200)
    clock.advance(49)
    expect(queue.request('hit', 50, 200)).toBe(false)
    expect(played).toHaveLength(1)
  })

  it('allows an identical sound once the throttle window has passed', () => {
    const { clock, queue, played } = setup()
    queue.request('hit', 50, 200)
    clock.advance(50)
    expect(queue.request('hit', 50, 200)).toBe(true)
    expect(played).toHaveLength(2)
  })

  it('does not throttle different sound ids', () => {
    const { queue, played } = setup()
    queue.request('hit', 50, 200)
    queue.request('kill', 50, 200)
    expect(played).toHaveLength(2)
  })

  it('caps concurrency at five simultaneous sounds', () => {
    const { clock, queue } = setup()
    for (let i = 0; i < 5; i++) {
      queue.request(`s${i}`, 50, 10_000)
      clock.advance(1)
    }
    expect(queue.concurrentCount).toBe(5)
    queue.request('s5', 50, 10_000)
    expect(queue.concurrentCount).toBe(5)
  })

  it('still plays the new sound when the queue is full', () => {
    const { clock, queue, played } = setup()
    for (let i = 0; i < 5; i++) {
      queue.request(`s${i}`, 50, 10_000)
      clock.advance(1)
    }
    expect(queue.request('s5', 70, 10_000)).toBe(true)
    expect(played.at(-1)).toEqual({ id: 's5', volume: 70 })
  })

  it('frees a slot once a sound has finished', () => {
    const { clock, queue } = setup()
    queue.request('hit', 50, 100)
    expect(queue.concurrentCount).toBe(1)
    clock.advance(100)
    queue.request('kill', 50, 100)
    expect(queue.concurrentCount).toBe(1)
  })

  it('honours custom concurrency and throttle settings', () => {
    const { clock, queue } = setup({ maxConcurrent: 2, throttleMs: 10 })
    queue.request('a', 50, 1000)
    clock.advance(1)
    queue.request('b', 50, 1000)
    clock.advance(1)
    queue.request('c', 50, 1000)
    expect(queue.concurrentCount).toBe(2)
  })

  it('clear resets concurrency and throttle history', () => {
    const { queue } = setup()
    queue.request('hit', 50, 1000)
    queue.clear()
    expect(queue.concurrentCount).toBe(0)
    expect(queue.request('hit', 50, 1000)).toBe(true)
  })
})
