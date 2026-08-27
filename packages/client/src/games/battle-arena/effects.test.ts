import { describe, expect, it } from 'vitest'
import { createManualClock } from '../../framework/clock.js'
import { EffectPool } from '../../framework/effects/pool.js'
import { EFFECT_TYPES, SOUND_EVENTS, defaultConfig } from './config/index.js'
import {
  EFFECT_DURATIONS_MS,
  EFFECT_SOUND_CUES,
  EVENT_SOUND_CUES,
  spawnGameEffect,
} from './effects.js'

const setup = () => {
  const clock = createManualClock(500)
  return { clock, pool: new EffectPool(clock, 4), config: defaultConfig() }
}

describe('effect tables', () => {
  it('gives every effect type a positive default duration', () => {
    for (const type of EFFECT_TYPES) expect(EFFECT_DURATIONS_MS[type]).toBeGreaterThan(0)
  })

  it('declares a sound cue slot for every effect type', () => {
    for (const type of EFFECT_TYPES) expect(EFFECT_SOUND_CUES).toHaveProperty(type)
  })

  /*
   * Penjaga baris mati di panel SOUND.
   *
   * `attack`, `countdown`, `roundWin`, dan `matchWin` pernah hidup di panel tanpa satu pun
   * penerbit: knopnya bisa digeser dan tidak ada bunyi yang berubah, karena tidak ada
   * bunyinya sama sekali. Test ini gagal begitu sebuah SoundEvent kehilangan penerbitnya
   * lagi — atau begitu ada yang menambah baris baru ke panel tanpa menyambungkannya.
   */
  it('gives every SoundEvent a producer, so no panel row is dead', () => {
    const produced = new Set<string>([
      ...Object.values(EFFECT_SOUND_CUES).filter((cue) => cue !== null),
      ...Object.values(EVENT_SOUND_CUES),
    ])
    // `ultimate` sengaja di luar: berkas .wav lewat ULTIMATE_SOUND, bukan oscillator.
    const oscillated = SOUND_EVENTS.filter((event) => event !== 'ultimate')

    expect(oscillated.filter((event) => !produced.has(event))).toEqual([])
  })
})

describe('spawnGameEffect', () => {
  it('uses the default duration and intensity for that type', () => {
    const { pool, config } = setup()
    const effect = spawnGameEffect(pool, config, { type: 'hit', x: 10, y: 20 })
    expect(effect.type).toBe('hit')
    expect(effect.x).toBe(10)
    expect(effect.y).toBe(20)
    expect(effect.duration).toBe(EFFECT_DURATIONS_MS.hit)
    expect(effect.intensity).toBe(1)
    expect(effect.spawnedAt).toBe(500)
  })

  it('scales the duration by the creator duration multiplier', () => {
    const { pool, config } = setup()
    config.effects.hit.durationMultiplier = 2
    expect(spawnGameEffect(pool, config, { type: 'hit', x: 0, y: 0 }).duration).toBe(
      EFFECT_DURATIONS_MS.hit * 2,
    )
  })

  it('applies the creator intensity', () => {
    const { pool, config } = setup()
    config.effects.kill.intensity = 1.8
    expect(spawnGameEffect(pool, config, { type: 'kill', x: 0, y: 0 }).intensity).toBe(1.8)
  })

  it('carries a numeric payload such as the damage dealt', () => {
    const { pool, config } = setup()
    expect(spawnGameEffect(pool, config, { type: 'hit', x: 0, y: 0, value: 37 }).value).toBe(37)
  })

  it('attaches the sound cue of that effect type', () => {
    const { pool, config } = setup()
    expect(spawnGameEffect(pool, config, { type: 'heal', x: 0, y: 0 }).soundCue).toBe('heal')
  })

  it('drops the sound cue when the creator disabled that sound', () => {
    const { pool, config } = setup()
    config.sound.heal.enabled = false
    expect(spawnGameEffect(pool, config, { type: 'heal', x: 0, y: 0 }).soundCue).toBeNull()
  })

  it('takes an effect out of the pool', () => {
    const { pool, config } = setup()
    spawnGameEffect(pool, config, { type: 'join', x: 0, y: 0 })
    expect(pool.activeCount).toBe(1)
  })
})
