import { describe, expect, it } from 'vitest'
import { SOUND_EVENTS, defaultConfig } from '../../../games/battle-arena/config/index.js'
import {
  formatAliases,
  parseAliases,
  soundRows,
  toggleRows,
  withGameplay,
  withOverlay,
  withSide,
  withSimulation,
  withSound,
  withToggle,
  withUi,
} from './game-settings.js'

describe('toggleRows', () => {
  it('mencakup tujuh sakelar yang benar-benar dibaca kode', () => {
    expect(toggleRows(defaultConfig()).map((row) => row.key)).toEqual([
      'gameplay.practiceFighters',
      'gameplay.idleMovement',
      'ui.screenShake',
      'ui.showJoinedMessages',
      'ui.showFloatingDamage',
      'ui.showFighterNames',
      'ui.showTopFighters',
    ])
  })

  it('membaca keadaan berjalan dari config', () => {
    const config = defaultConfig()
    config.ui.showFighterNames = true
    const row = toggleRows(config).find((entry) => entry.key === 'ui.showFighterNames')
    expect(row?.checked).toBe(true)
  })
})

describe('withToggle', () => {
  it('menulis ke section ui', () => {
    expect(withToggle(defaultConfig(), 'ui.screenShake', false).ui.screenShake).toBe(false)
  })

  it('menulis ke section gameplay', () => {
    expect(withToggle(defaultConfig(), 'gameplay.idleMovement', false).gameplay.idleMovement).toBe(
      false,
    )
  })

  it('tidak memutasi config yang diberikan', () => {
    const config = defaultConfig()
    withToggle(config, 'ui.screenShake', false)
    expect(config.ui.screenShake).toBe(true)
  })
})

describe('soundRows', () => {
  it('memberi satu baris berlabel untuk tiap sound event', () => {
    const rows = soundRows(defaultConfig())
    // Diturunkan dari SOUND_EVENTS, bukan angka: menambah event ke-sepuluh tidak boleh
    // menggagalkan test yang sebenarnya menegaskan "tiap event punya satu baris berlabel".
    expect(rows).toHaveLength(SOUND_EVENTS.length)
    expect(rows.every((row) => row.label.length > 0)).toBe(true)
  })
})

describe('withSound', () => {
  it('mengubah satu event saja', () => {
    const next = withSound(defaultConfig(), 'hit', { enabled: false })
    expect(next.sound.hit.enabled).toBe(false)
    expect(next.sound.join.enabled).toBe(true)
  })

  it('mengubah volume tanpa menyentuh enabled', () => {
    const next = withSound(defaultConfig(), 'hit', { volume: 0.2 })
    expect(next.sound.hit).toEqual({ enabled: true, volume: 0.2 })
  })
})

describe('mutator section', () => {
  it('withSide menulis ke satu sisi', () => {
    const next = withSide(defaultConfig(), 'b', { name: 'Team Ronaldo' })
    expect(next.sides.b.name).toBe('Team Ronaldo')
    expect(next.sides.a.name).toBe(defaultConfig().sides.a.name)
  })

  it('withGameplay, withUi, withOverlay, withSimulation menambal per-field', () => {
    const config = defaultConfig()
    expect(withGameplay(config, { baseHp: 500 }).gameplay.baseHp).toBe(500)
    expect(withUi(config, { leaderboardEntries: 9 }).ui.leaderboardEntries).toBe(9)
    expect(withOverlay(config, { transparency: 40 }).overlay.transparency).toBe(40)
    expect(withSimulation(config, { likesPerSecond: 4 }).simulation.likesPerSecond).toBe(4)
  })
})

describe('alias', () => {
  it('memecah teks berkoma jadi daftar bersih', () => {
    expect(parseAliases(' messi , m10 ,, ')).toEqual(['messi', 'm10'])
  })

  it('memotong pada lima alias, sesuai MAX_ALIASES', () => {
    expect(parseAliases('a,b,c,d,e,f,g')).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('bolak-balik lewat format tanpa kehilangan apa pun', () => {
    expect(parseAliases(formatAliases(['messi', 'm10']))).toEqual(['messi', 'm10'])
  })
})
