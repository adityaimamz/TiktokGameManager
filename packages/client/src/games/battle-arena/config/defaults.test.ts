import { describe, expect, it } from 'vitest'
import { computeStageLayout } from '../renderer/layout.js'
import { defaultConfig } from './defaults.js'
import { EFFECT_TYPES, NUMERIC_RANGES, SOUND_EVENTS } from './schema.js'
import type { NumericField } from './schema.js'

describe('defaultConfig', () => {
  it('starts at schema version 2', () => {
    expect(defaultConfig().schemaVersion).toBe(2)
  })

  it('returns a fresh object every call', () => {
    const a = defaultConfig()
    const b = defaultConfig()
    expect(a).not.toBe(b)
    a.sides.a.name = 'mutated'
    a.triggers.push({
      id: 'extra',
      label: 'extra',
      enabled: false,
      when: { kind: 'comment', matchSide: 'a' },
      then: { actionType: 'spawn', target: 'sideA', value: 0 },
      legend: { show: false, caption: '', icon: '' },
    })
    expect(b.sides.a.name).not.toBe('mutated')
    expect(b.triggers).toHaveLength(6)
  })

  it('uses the documented gameplay defaults', () => {
    const g = defaultConfig().gameplay
    expect(g.winMode).toBe('firstToNKills')
    expect(g.roundsBestOf).toBe(5)
    expect(g.killsToWinRound).toBe(30)
    expect(g.maxFightersPerSide).toBe(30)
    expect(g.baseHp).toBe(200)
    expect(g.baseDamage).toBe(10)
    expect(g.attackIntervalSec).toBe(1)
    expect(g.hpGainedPerGrow).toBe(5)
    expect(g.growMode).toBe('flat')
    expect(g.countdownDurationSec).toBe(5)
    expect(g.celebrationDurationSec).toBe(5)
    expect(g.idleMovement).toBe(true)
    expect(g.practiceFighters).toBe(true)
  })

  it('uses the documented ui defaults', () => {
    const ui = defaultConfig().ui
    expect(ui.showJoinedMessages).toBe(true)
    expect(ui.showFloatingDamage).toBe(true)
    expect(ui.showFighterNames).toBe(false)
    expect(ui.showTopFighters).toBe(true)
    expect(ui.leaderboardEntries).toBe(5)
    expect(ui.screenShake).toBe(true)
  })

  it('gives both sides a distinct keyword and colour', () => {
    const sides = defaultConfig().sides
    expect(sides.a.keyword).not.toBe(sides.b.keyword)
    expect(sides.a.color).not.toBe(sides.b.color)
    expect(sides.a.aliases).toEqual([])
    expect(sides.a.backgroundImage).toBeNull()
  })

  it('ships one join rule per side plus a grow rule, all enabled', () => {
    const rules = defaultConfig().triggers
    expect(rules.slice(0, 3).map((r) => r.id)).toEqual(['join-a', 'join-b', 'grow-hp'])
    expect(rules.slice(0, 3).every((r) => r.enabled)).toBe(true)
    expect(rules[0]?.when).toEqual({ kind: 'comment', matchSide: 'a' })
    expect(rules[0]?.then).toEqual({ actionType: 'spawn', target: 'sideA', value: 0 })
    expect(rules[2]?.when).toEqual({ kind: 'like', everyNLikes: 10 })
    expect(rules[2]?.then.actionType).toBe('grow')
  })

  it('ships three gift examples that are all switched off', () => {
    const rules = defaultConfig().triggers
    expect(rules.slice(3).map((r) => r.id)).toEqual(['gift-heal', 'gift-hasten', 'gift-barrage'])
    expect(rules.slice(3).every((r) => !r.enabled)).toBe(true)
  })

  it('has an entry for every effect type and every sound event', () => {
    const config = defaultConfig()
    for (const type of EFFECT_TYPES) {
      expect(config.effects[type].intensity).toBe(1)
      expect(config.effects[type].durationMultiplier).toBe(1)
    }
    for (const event of SOUND_EVENTS) {
      expect(config.sound[event].enabled).toBe(true)
      expect(config.sound[event].volume).toBeGreaterThan(0)
    }
  })

  /**
   * TikTok Live tidak punya orientasi lain.
   *
   * Selama default-nya 'landscape', `fitStage` memasang panggung 16:9 ke dalam bingkai 9:16
   * dan menghasilkan strip pendek dengan pita hitam tebal di atas dan bawah — arena terlihat
   * salah di preview dashboard MAUPUN di overlay OBS.
   */
  it('ships portrait, and that portrait stage fills a 9:16 frame edge to edge', () => {
    const config = defaultConfig()
    expect(config.overlay.orientation).toBe('portrait')

    const { stage } = computeStageLayout(360, 640, config.overlay.orientation)
    expect(stage.width).toBeCloseTo(360, 5)
    expect(stage.height).toBeCloseTo(640, 5)
    expect(stage.y).toBeCloseTo(0, 5)
  })

  it('keeps every numeric default inside its declared range', () => {
    const config = defaultConfig() as unknown as Record<string, unknown>
    for (const [field, range] of Object.entries(NUMERIC_RANGES) as [
      NumericField,
      (typeof NUMERIC_RANGES)[NumericField],
    ][]) {
      // Jalur bisa lebih dari dua ruas — `gameplay.nuke.damage` bersarang satu tingkat lagi.
      const value = field
        .split('.')
        .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], config)
      expect(typeof value, `${field} is missing from defaultConfig()`).toBe('number')
      expect(value as number, `${field} is below its minimum`).toBeGreaterThanOrEqual(range.min)
      expect(value as number, `${field} is above its maximum`).toBeLessThanOrEqual(range.max)
    }
  })
})

describe('defaultConfig — filler', () => {
  it('lahir dengan panel filler mati, supaya pemutakhiran tidak menyiarkan band kosong', () => {
    const config = defaultConfig()

    expect(config.filler.enabled).toBe(false)
    expect(config.filler.items).toStrictEqual([])
  })
})
