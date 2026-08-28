import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent } from '@lga/shared'
import { ANALYTICS_CAPACITY, AnalyticsLogger } from '../../../src/platform/analytics/logger.js'

function createRig(options: { capacity?: number; succeed?: boolean } = {}) {
  const batches: AnalyticsEvent[][] = []
  let nowMs = 1_000
  const logger = new AnalyticsLogger({
    send: async (events) => {
      batches.push([...events])
      return options.succeed ?? true
    },
    now: () => nowMs,
    capacity: options.capacity,
  })
  return {
    logger,
    batches,
    advance: (ms: number) => {
      nowMs += ms
    },
  }
}

describe('AnalyticsLogger', () => {
  it('buffers events instead of sending them one by one', async () => {
    const rig = createRig()
    rig.logger.log('matchStarted', { seed: 42 })
    rig.logger.log('fighterJoined', { side: 'a' })

    expect(rig.batches).toEqual([])
    expect(rig.logger.pending).toBe(2)
  })

  it('stamps each event with the time it was logged', async () => {
    const rig = createRig()
    rig.logger.log('a', {})
    rig.advance(500)
    rig.logger.log('b', {})
    await rig.logger.flush()

    expect(rig.batches[0]?.map((event) => event.atMs)).toEqual([1_000, 1_500])
  })

  it('sends everything buffered as one batch on flush', async () => {
    const rig = createRig()
    rig.logger.log('a', { n: 1 })
    rig.logger.log('b', { n: 2 })
    await rig.logger.flush()

    expect(rig.batches).toHaveLength(1)
    expect(rig.batches[0]).toHaveLength(2)
    expect(rig.logger.pending).toBe(0)
  })

  it('does not call send at all when there is nothing buffered', async () => {
    const rig = createRig()
    await rig.logger.flush()
    expect(rig.batches).toEqual([])
  })

  it('drops the oldest event when the buffer is full, like ActionQueue does', () => {
    const rig = createRig({ capacity: 3 })
    for (const type of ['a', 'b', 'c', 'd']) rig.logger.log(type, {})

    expect(rig.logger.pending).toBe(3)
  })

  it('keeps the newest events when it overflows', async () => {
    const rig = createRig({ capacity: 2 })
    for (const type of ['a', 'b', 'c']) rig.logger.log(type, {})
    await rig.logger.flush()

    expect(rig.batches[0]?.map((event) => event.type)).toEqual(['b', 'c'])
  })

  it('discards a batch the server rejected rather than retrying forever', async () => {
    const rig = createRig({ succeed: false })
    rig.logger.log('a', {})
    await rig.logger.flush()

    expect(rig.logger.pending).toBe(0)
    await rig.logger.flush()
    expect(rig.batches).toHaveLength(1)
  })

  it('defaults to a bounded capacity so a long session cannot grow the heap', () => {
    expect(ANALYTICS_CAPACITY).toBeGreaterThan(0)
    expect(Number.isFinite(ANALYTICS_CAPACITY)).toBe(true)
  })
})
