import { afterEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../src/framework/clock.js'
import { EffectPool } from '../../../src/framework/effects/pool.js'
import { SoundQueue } from '../../../src/framework/sound/queue.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import { spawnGameEffect } from '../../../src/games/battle-arena/effects.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rantai efek → bunyi', () => {
  it('membunyikan cue milik efek dengan volume dari config', () => {
    const clock = createManualClock()
    const played: { id: string; volume: number }[] = []
    const sounds = new SoundQueue({ clock, play: (id, volume) => played.push({ id, volume }) })

    const config = defaultConfig()
    config.sound.join.volume = 0.4

    const pool = new EffectPool(clock, 4, (effect) => {
      if (effect.soundCue === null) return
      const setting = config.sound[effect.soundCue as keyof typeof config.sound]
      if (setting === undefined || !setting.enabled) return
      sounds.request(effect.soundCue, setting.volume, 100)
    })

    spawnGameEffect(pool, config, { type: 'join', x: 10, y: 10 })

    expect(played).toEqual([{ id: 'join', volume: 0.4 }])
  })

  it('diam ketika creator mematikan event itu di config', () => {
    const clock = createManualClock()
    const played: string[] = []
    const sounds = new SoundQueue({ clock, play: (id) => played.push(id) })

    const config = defaultConfig()
    config.sound.join.enabled = false

    const pool = new EffectPool(clock, 4, (effect) => {
      if (effect.soundCue === null) return
      sounds.request(effect.soundCue, 1, 100)
    })

    spawnGameEffect(pool, config, { type: 'join', x: 0, y: 0 })

    expect(played).toEqual([])
  })

  it('menelan hit beruntun lewat throttle 50 ms milik SoundQueue', () => {
    const clock = createManualClock()
    const played: string[] = []
    const sounds = new SoundQueue({ clock, play: (id) => played.push(id) })
    const config = defaultConfig()

    const pool = new EffectPool(clock, 8, (effect) => {
      if (effect.soundCue !== null) sounds.request(effect.soundCue, 1, 100)
    })

    spawnGameEffect(pool, config, { type: 'hit', x: 0, y: 0 })
    clock.advance(10)
    spawnGameEffect(pool, config, { type: 'hit', x: 1, y: 1 })

    expect(played).toEqual(['hit'])
  })

  it('menerbitkan cue suara ke sinyal saat bunyi dimainkan', () => {
    const clock = createManualClock()
    const published: { cue: string; volume: number }[] = []
    const sounds = new SoundQueue({
      clock,
      play: (id, volume) => {
        published.push({ cue: id, volume })
      },
    })
    const config = defaultConfig()
    config.sound.join.volume = 0.6

    const pool = new EffectPool(clock, 4, (effect) => {
      if (effect.soundCue === null) return
      const setting = config.sound[effect.soundCue as keyof typeof config.sound]
      if (setting === undefined || !setting.enabled) return
      sounds.request(effect.soundCue, setting.volume, 100)
    })

    spawnGameEffect(pool, config, { type: 'join', x: 0, y: 0 })

    expect(published).toEqual([{ cue: 'join', volume: 0.6 }])
  })
})
