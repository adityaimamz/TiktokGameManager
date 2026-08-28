import { describe, expect, it } from 'vitest'
import { RenderLoop } from '../../../src/framework/loop/render-loop.js'

/** Penjadwal frame palsu yang hanya berjalan saat kita menyuruhnya. */
const createFakeScheduler = () => {
  let next = 1
  const pending = new Map<number, (t: number) => void>()
  return {
    schedule: (cb: (t: number) => void) => {
      const handle = next++
      pending.set(handle, cb)
      return handle
    },
    cancel: (handle: number) => {
      pending.delete(handle)
    },
    /** Jalankan semua callback yang tertunda dengan timestamp tertentu. */
    flush(timestamp: number) {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const cb of callbacks) cb(timestamp)
    },
    get pendingCount() {
      return pending.size
    },
  }
}

describe('RenderLoop', () => {
  it('does not invoke onFrame before start()', () => {
    const fake = createFakeScheduler()
    const frames: number[] = []
    new RenderLoop({
      onFrame: (t) => frames.push(t),
      scheduleFrame: fake.schedule,
      cancelFrame: fake.cancel,
    })
    fake.flush(16)
    expect(frames).toHaveLength(0)
  })

  it('invokes onFrame with the frame timestamp', () => {
    const fake = createFakeScheduler()
    const frames: number[] = []
    const loop = new RenderLoop({
      onFrame: (t) => frames.push(t),
      scheduleFrame: fake.schedule,
      cancelFrame: fake.cancel,
    })
    loop.start()
    fake.flush(16)
    expect(frames).toEqual([16])
  })

  it('reschedules itself so frames keep coming', () => {
    const fake = createFakeScheduler()
    const frames: number[] = []
    const loop = new RenderLoop({
      onFrame: (t) => frames.push(t),
      scheduleFrame: fake.schedule,
      cancelFrame: fake.cancel,
    })
    loop.start()
    fake.flush(16)
    fake.flush(32)
    fake.flush(48)
    expect(frames).toEqual([16, 32, 48])
  })

  it('stops delivering frames after stop()', () => {
    const fake = createFakeScheduler()
    const frames: number[] = []
    const loop = new RenderLoop({
      onFrame: (t) => frames.push(t),
      scheduleFrame: fake.schedule,
      cancelFrame: fake.cancel,
    })
    loop.start()
    fake.flush(16)
    loop.stop()
    fake.flush(32)
    expect(frames).toEqual([16])
    expect(fake.pendingCount).toBe(0)
  })

  it('is idempotent when start() is called twice', () => {
    const fake = createFakeScheduler()
    const frames: number[] = []
    const loop = new RenderLoop({
      onFrame: (t) => frames.push(t),
      scheduleFrame: fake.schedule,
      cancelFrame: fake.cancel,
    })
    loop.start()
    loop.start()
    fake.flush(16)
    expect(frames).toEqual([16])
  })

  it('reports its running state', () => {
    const fake = createFakeScheduler()
    const loop = new RenderLoop({
      onFrame: () => {},
      scheduleFrame: fake.schedule,
      cancelFrame: fake.cancel,
    })
    expect(loop.isRunning).toBe(false)
    loop.start()
    expect(loop.isRunning).toBe(true)
    loop.stop()
    expect(loop.isRunning).toBe(false)
  })
})
