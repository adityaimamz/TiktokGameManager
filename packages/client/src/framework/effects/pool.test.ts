import { describe, expect, it } from 'vitest'
import { createManualClock } from '../clock.js'
import { EffectPool, effectProgress } from './pool.js'
import type { Effect } from './pool.js'

const collect = (pool: EffectPool): Effect[] => {
  const out: Effect[] = []
  pool.forEachActive((e) => out.push(e))
  return out
}

describe('EffectPool', () => {
  it('pre-allocates 200 instances by default', () => {
    expect(new EffectPool(createManualClock()).capacity).toBe(200)
  })

  it('spawn returns an active effect carrying the requested values', () => {
    const clock = createManualClock(1000)
    const pool = new EffectPool(clock, 4)
    const e = pool.spawn({
      type: 'hit',
      x: 10,
      y: 20,
      duration: 300,
      intensity: 1.5,
      value: 42,
      soundCue: 'hit',
    })
    expect(e.active).toBe(true)
    expect(e.type).toBe('hit')
    expect(e.x).toBe(10)
    expect(e.y).toBe(20)
    expect(e.duration).toBe(300)
    expect(e.intensity).toBe(1.5)
    expect(e.value).toBe(42)
    expect(e.soundCue).toBe('hit')
    expect(e.spawnedAt).toBe(1000)
    expect(pool.activeCount).toBe(1)
  })

  it('defaults intensity to 1, value to 0 and soundCue to null', () => {
    const pool = new EffectPool(createManualClock(), 4)
    const e = pool.spawn({ type: 'heal', x: 0, y: 0, duration: 100 })
    expect(e.intensity).toBe(1)
    expect(e.value).toBe(0)
    expect(e.soundCue).toBeNull()
  })

  it('keeps effects alive until their duration elapses', () => {
    const clock = createManualClock()
    const pool = new EffectPool(clock, 4)
    pool.spawn({ type: 'hit', x: 0, y: 0, duration: 300 })
    clock.advance(299)
    expect(pool.update()).toBe(0)
    expect(pool.activeCount).toBe(1)
  })

  it('retires effects once their duration has elapsed', () => {
    const clock = createManualClock()
    const pool = new EffectPool(clock, 4)
    pool.spawn({ type: 'hit', x: 0, y: 0, duration: 300 })
    clock.advance(300)
    expect(pool.update()).toBe(1)
    expect(pool.activeCount).toBe(0)
    expect(collect(pool)).toHaveLength(0)
  })

  it('recycles retired instances instead of allocating', () => {
    const clock = createManualClock()
    const pool = new EffectPool(clock, 1)
    const first = pool.spawn({ type: 'hit', x: 0, y: 0, duration: 100 })
    clock.advance(100)
    pool.update()
    const second = pool.spawn({ type: 'heal', x: 0, y: 0, duration: 100 })
    expect(second).toBe(first)
    expect(pool.capacity).toBe(1)
  })

  it('grows by one when exhausted', () => {
    const pool = new EffectPool(createManualClock(), 1)
    pool.spawn({ type: 'hit', x: 0, y: 0, duration: 100 })
    pool.spawn({ type: 'hit', x: 0, y: 0, duration: 100 })
    expect(pool.capacity).toBe(2)
  })

  it('releaseAll clears every active effect', () => {
    const pool = new EffectPool(createManualClock(), 4)
    pool.spawn({ type: 'hit', x: 0, y: 0, duration: 100 })
    pool.spawn({ type: 'hit', x: 0, y: 0, duration: 100 })
    pool.releaseAll()
    expect(pool.activeCount).toBe(0)
  })
})

describe('EffectPool onSpawn', () => {
  it('memberi tahu pengamat setiap kali efek lahir, sesuai urutan', () => {
    const clock = createManualClock()
    const seen: string[] = []
    const pool = new EffectPool(clock, 2, (e) => seen.push(e.type))

    pool.spawn({ type: 'hit', x: 0, y: 0, duration: 100 })
    pool.spawn({ type: 'join', x: 1, y: 1, duration: 100 })

    expect(seen).toEqual(['hit', 'join'])
  })

  it('menyerahkan efek yang sudah terisi penuh, bukan cangkang kosong', () => {
    const clock = createManualClock(500)
    let captured: Effect | null = null
    const pool = new EffectPool(clock, 1, (e) => {
      captured = e
    })

    pool.spawn({ type: 'nuke', x: 30, y: 40, duration: 250, intensity: 1.5, soundCue: 'death' })

    expect(captured).toMatchObject({
      type: 'nuke',
      x: 30,
      y: 40,
      duration: 250,
      intensity: 1.5,
      soundCue: 'death',
      spawnedAt: 500,
      active: true,
    })
  })

  it('diam saat efek dipensiunkan — bunyi hanya milik kelahiran', () => {
    const clock = createManualClock()
    let calls = 0
    const pool = new EffectPool(clock, 1, () => {
      calls++
    })

    pool.spawn({ type: 'hit', x: 0, y: 0, duration: 100 })
    clock.advance(200)
    pool.update()
    pool.releaseAll()

    expect(calls).toBe(1)
  })
})

describe('effectProgress', () => {
  const effect = (spawnedAt: number, duration: number): Effect => ({
    id: 'e#0',
    type: 'hit',
    x: 0,
    y: 0,
    spawnedAt,
    duration,
    intensity: 1,
    value: 0,
    soundCue: null,
    active: true,
  })

  it('is zero at spawn time', () => {
    expect(effectProgress(effect(1000, 400), 1000)).toBe(0)
  })

  it('is one half at the midpoint', () => {
    expect(effectProgress(effect(1000, 400), 1200)).toBeCloseTo(0.5)
  })

  it('clamps to one past the end', () => {
    expect(effectProgress(effect(1000, 400), 9999)).toBe(1)
  })

  it('returns one for a zero duration', () => {
    expect(effectProgress(effect(1000, 0), 1000)).toBe(1)
  })
})
