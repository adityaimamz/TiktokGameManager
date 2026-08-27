import { describe, expect, it } from 'vitest'
import { createManualClock } from '../clock.js'
import { TickScheduler } from './tick-scheduler.js'

const setup = () => {
  const clock = createManualClock()
  const ticks: number[] = []
  const scheduler = new TickScheduler({ clock, onTick: (i) => ticks.push(i) })
  return { clock, ticks, scheduler }
}

describe('TickScheduler', () => {
  it('runs no ticks before start()', () => {
    const { clock, scheduler, ticks } = setup()
    clock.advance(500)
    expect(scheduler.update().ticksRun).toBe(0)
    expect(ticks).toHaveLength(0)
  })

  it('runs exactly one tick after 50ms', () => {
    const { clock, scheduler, ticks } = setup()
    scheduler.start()
    clock.advance(50)
    const result = scheduler.update()
    expect(result.ticksRun).toBe(1)
    expect(result.alpha).toBe(0)
    expect(ticks).toEqual([0])
  })

  it('runs no tick and reports a partial alpha before 50ms elapses', () => {
    const { clock, scheduler } = setup()
    scheduler.start()
    clock.advance(25)
    const result = scheduler.update()
    expect(result.ticksRun).toBe(0)
    expect(result.alpha).toBeCloseTo(0.5)
  })

  it('accumulates leftover time across updates', () => {
    const { clock, scheduler } = setup()
    scheduler.start()
    clock.advance(30)
    scheduler.update()
    clock.advance(30)
    const result = scheduler.update()
    expect(result.ticksRun).toBe(1)
    expect(result.alpha).toBeCloseTo(0.2)
  })

  it('runs multiple ticks to catch up', () => {
    const { clock, scheduler, ticks } = setup()
    scheduler.start()
    clock.advance(125)
    const result = scheduler.update()
    expect(result.ticksRun).toBe(2)
    expect(result.alpha).toBeCloseTo(0.5)
    expect(ticks).toEqual([0, 1])
  })

  it('caps catch-up at three pending ticks and reports the drop', () => {
    const { clock, scheduler, ticks } = setup()
    scheduler.start()
    clock.advance(500)
    const result = scheduler.update()
    expect(result.ticksRun).toBe(3)
    expect(result.dropped).toBe(7)
    expect(ticks).toEqual([0, 1, 2])
  })

  it('increments the tick index monotonically across updates', () => {
    const { clock, scheduler } = setup()
    scheduler.start()
    clock.advance(100)
    scheduler.update()
    clock.advance(50)
    scheduler.update()
    expect(scheduler.currentTick).toBe(3)
  })

  it('stops running ticks after stop()', () => {
    const { clock, scheduler, ticks } = setup()
    scheduler.start()
    clock.advance(50)
    scheduler.update()
    scheduler.stop()
    clock.advance(500)
    expect(scheduler.update().ticksRun).toBe(0)
    expect(ticks).toEqual([0])
  })

  it('does not replay buffered time after a restart', () => {
    const { clock, scheduler, ticks } = setup()
    scheduler.start()
    clock.advance(500)
    scheduler.stop()
    scheduler.start()
    const result = scheduler.update()
    expect(result.ticksRun).toBe(0)
    expect(ticks).toHaveLength(0)
  })
})
