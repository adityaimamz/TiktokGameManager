import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../../../src/games/battle-arena/config/defaults.js'
import {
  validateConfig,
  validateNumericInput,
  validateNumericRange,
  validateSection,
} from '../../../../src/games/battle-arena/config/validate.js'
import type { NukeTier } from '../../../../src/games/battle-arena/config/schema.js'

describe('validateConfig', () => {
  it('returns the full defaults for input that is not an object', () => {
    expect(validateConfig(null)).toEqual(defaultConfig())
    expect(validateConfig('nonsense')).toEqual(defaultConfig())
    expect(validateConfig(42)).toEqual(defaultConfig())
  })

  it('fills in every missing section', () => {
    expect(validateConfig({ schemaVersion: 2 })).toEqual(defaultConfig())
  })

  it('keeps valid values the caller provided', () => {
    const result = validateConfig({ gameplay: { baseHp: 500, killsToWinRound: 7 } })
    expect(result.gameplay.baseHp).toBe(500)
    expect(result.gameplay.killsToWinRound).toBe(7)
  })

  it('replaces an out-of-range number with its default instead of failing', () => {
    const result = validateConfig({ gameplay: { baseHp: 99999, baseDamage: 0, attackIntervalSec: 0.1 } })
    expect(result.gameplay.baseHp).toBe(200)
    expect(result.gameplay.baseDamage).toBe(10)
    expect(result.gameplay.attackIntervalSec).toBe(1)
  })

  it('replaces a wrongly typed value with its default', () => {
    const result = validateConfig({ gameplay: { baseHp: 'lots' }, ui: { screenShake: 'yes' } })
    expect(result.gameplay.baseHp).toBe(200)
    expect(result.ui.screenShake).toBe(true)
  })

  it('rounds a non-integer where the range demands an integer', () => {
    expect(validateConfig({ gameplay: { killsToWinRound: 7.6 } }).gameplay.killsToWinRound).toBe(8)
  })

  it('rejects a value outside the enum and falls back to the default', () => {
    const result = validateConfig({ gameplay: { roundsBestOf: 4, growMode: 'perStar' } })
    expect(result.gameplay.roundsBestOf).toBe(5)
    expect(result.gameplay.growMode).toBe('flat')
  })

  it('clamps side strings to their allowed length and keeps at most five aliases', () => {
    const result = validateConfig({
      sides: {
        a: { name: 'x'.repeat(80), keyword: 'y'.repeat(50), aliases: ['1', '2', '3', '4', '5', '6', ''] },
      },
    })
    expect(result.sides.a.name).toHaveLength(30)
    expect(result.sides.a.keyword).toHaveLength(20)
    expect(result.sides.a.aliases).toEqual(['1', '2', '3', '4', '5'])
  })

  it('falls back to the default name when a side name is empty', () => {
    expect(validateConfig({ sides: { a: { name: '   ' } } }).sides.a.name).toBe('Team A')
  })

  it('drops malformed trigger rules and caps the list at fifty', () => {
    const tooMany = Array.from({ length: 60 }, (_, i) => ({
      id: `r${i}`,
      label: `r${i}`,
      enabled: true,
      when: { kind: 'comment', matchSide: 'a' },
      then: { actionType: 'spawn', target: 'sideA', value: 0 },
      legend: { show: true, caption: 'X', icon: 'join' },
    }))
    const result = validateConfig({ triggers: [...tooMany, { id: 'broken' }] })
    expect(result.triggers).toHaveLength(50)
    expect(result.triggers.every((r) => r.id.startsWith('r'))).toBe(true)
  })

  it('falls back to the default rules when every rule is malformed', () => {
    const result = validateConfig({ triggers: [{ id: 'broken' }, 7, null] })
    expect(result.triggers.map((r) => r.id)).toEqual(defaultConfig().triggers.map((r) => r.id))
  })

  it('keeps like rules in step with the like threshold and grow amount (D3)', () => {
    const result = validateConfig({
      likes: { threshold: 25 },
      gameplay: { hpGainedPerGrow: 12 },
      triggers: [
        {
          id: 'grow-hp',
          label: 'Grow',
          enabled: true,
          when: { kind: 'like', everyNLikes: 3 },
          then: { actionType: 'grow', target: 'sender', value: 1 },
          legend: { show: true, caption: 'GROW HP', icon: 'like' },
        },
      ],
    })
    const rule = result.triggers[0]
    expect(rule?.when).toEqual({ kind: 'like', everyNLikes: 25 })
    expect(rule?.then.value).toBe(12)
  })

  it('accepts each arena background variant and rejects anything else', () => {
    expect(
      validateConfig({ overlay: { arenaBackground: { kind: 'color', value: '#fff' } } }).overlay.arenaBackground,
    ).toEqual({ kind: 'color', value: '#fff' })
    expect(
      validateConfig({ overlay: { arenaBackground: { kind: 'image', url: 'a.png' } } }).overlay.arenaBackground,
    ).toEqual({ kind: 'image', url: 'a.png' })
    expect(validateConfig({ overlay: { arenaBackground: { kind: 'video' } } }).overlay.arenaBackground).toEqual({
      kind: 'transparent',
    })
  })

  it('repairs partial effect and sound records', () => {
    const result = validateConfig({ effects: { hit: { intensity: 9 } }, sound: { attack: { volume: -2 } } })
    expect(result.effects.hit.intensity).toBe(1)
    expect(result.effects.heal.durationMultiplier).toBe(1)
    expect(result.sound.attack.volume).toBe(0.8)
    expect(result.sound.death.enabled).toBe(true)
  })
})

describe('validateSection', () => {
  it('validates one section without touching the others', () => {
    const gameplay = validateSection('gameplay', { baseHp: 300, baseDamage: 0 })
    expect(gameplay.baseHp).toBe(300)
    expect(gameplay.baseDamage).toBe(10)
  })

  it('returns the section default when the input is unusable', () => {
    expect(validateSection('likes', 'nope')).toEqual({ threshold: 10 })
  })
})

describe('validateNumericInput', () => {
  it('accepts a value inside the range', () => {
    expect(validateNumericInput('gameplay.baseHp', 250)).toEqual({ ok: true, value: 250 })
  })

  it('accepts a numeric string', () => {
    expect(validateNumericInput('gameplay.baseHp', '250')).toEqual({ ok: true, value: 250 })
  })

  it('rejects a value outside the range and names the allowed range', () => {
    const result = validateNumericInput('gameplay.baseHp', 20000)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('gameplay.baseHp must be a whole number between 1 and 9999')
  })

  it('rejects a non-integer where the range demands an integer', () => {
    const result = validateNumericInput('gameplay.killsToWinRound', 7.5)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('gameplay.killsToWinRound must be a whole number between 1 and 999')
  })

  it('rejects input that is not a number at all', () => {
    const result = validateNumericInput('likes.threshold', 'ten')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('likes.threshold must be a whole number between 1 and 9999')
  })

  it('allows a fractional value where the range permits it', () => {
    expect(validateNumericInput('gameplay.attackIntervalSec', 1.5)).toEqual({ ok: true, value: 1.5 })
  })
})

describe('kondisi gift dan follow', () => {
  const ruleWith = (when: unknown) => ({
    id: 'gift-heal-test',
    label: 'Gift heal',
    enabled: true,
    when,
    then: { actionType: 'heal', target: 'sender', value: 25 },
    legend: { show: true, caption: 'HEAL', icon: 'gift' },
  })

  it('menerima rule gift dengan daftar nama dan minimum', () => {
    const config = validateConfig({
      triggers: [ruleWith({ kind: 'gift', giftNames: ['Rose', 'Galaxy'], minCount: 3 })],
    })
    expect(config.triggers[0]?.when).toEqual({
      kind: 'gift',
      giftNames: ['Rose', 'Galaxy'],
      minCount: 3,
    })
  })

  it('memperlakukan daftar nama kosong sebagai gift apa pun', () => {
    const config = validateConfig({ triggers: [ruleWith({ kind: 'gift' })] })
    expect(config.triggers[0]?.when).toEqual({ kind: 'gift', giftNames: [], minCount: 1 })
  })

  it('membuang nama yang bukan string, memangkas spasi, dan membatasi jumlahnya', () => {
    const names = ['  Rose  ', 42, '', ...Array.from({ length: 25 }, (_, i) => `Gift ${i}`)]
    const config = validateConfig({
      triggers: [ruleWith({ kind: 'gift', giftNames: names, minCount: 1 })],
    })
    const when = config.triggers[0]?.when as { kind: 'gift'; giftNames: string[] }
    expect(when.giftNames[0]).toBe('Rose')
    expect(when.giftNames).toHaveLength(20)
  })

  it('mengembalikan minCount di luar rentang ke 1', () => {
    const config = validateConfig({
      triggers: [ruleWith({ kind: 'gift', giftNames: [], minCount: 0 })],
    })
    expect((config.triggers[0]?.when as { minCount: number }).minCount).toBe(1)
  })

  it('menerima rule follow', () => {
    const config = validateConfig({ triggers: [ruleWith({ kind: 'follow' })] })
    expect(config.triggers[0]?.when).toEqual({ kind: 'follow' })
  })

  it('tetap membuang rule dengan kind yang tidak dikenal', () => {
    const config = validateConfig({ triggers: [ruleWith({ kind: 'share' })] })
    // Rule kosong berarti validator jatuh ke rule bawaan.
    expect(config.triggers.every((r) => r.id !== 'gift-heal-test')).toBe(true)
  })
})

describe('validateNumericRange', () => {
  const range = { min: 1, max: 999, integer: true }

  it('menerima nilai di dalam rentang', () => {
    expect(validateNumericRange('minimal hadiah', range, '5')).toEqual({ ok: true, value: 5 })
  })

  it('menolak di luar rentang dan menyebut batasnya', () => {
    const result = validateNumericRange('minimal hadiah', range, '1000')
    expect(result.ok).toBe(false)
    // Pesan menyebut BATASNYA, bukan angka yang ditolak.
    expect(result.ok === false && result.error).toContain('999')
  })

  it('menolak pecahan pada rentang bilangan bulat', () => {
    expect(validateNumericRange('minimal hadiah', range, '2.5').ok).toBe(false)
  })
})

describe('target relatif di rule tersimpan', () => {
  const ruleWith = (target: unknown) => ({
    id: 'gift-barrage',
    label: 'Barrage',
    enabled: true,
    when: { kind: 'gift', giftNames: [], minCount: 1 },
    then: { actionType: 'damage', target, value: 20 },
  })

  it('menerima keempat target baru', () => {
    for (const target of ['ownSide', 'enemySide', 'randomAlly', 'randomEnemy']) {
      const config = validateConfig({ triggers: [ruleWith(target)] })
      expect(config.triggers[0]?.then.target).toBe(target)
    }
  })

  it('mengganti target tak dikenal dengan sender, bukan membuang rule', () => {
    const config = validateConfig({ triggers: [ruleWith('nearestEnemy')] })
    expect(config.triggers[0]?.then.target).toBe('sender')
  })
})

describe('config nuke', () => {
  it('memberi default missileRain 50 damage 2600 ms', () => {
    const g = defaultConfig().gameplay
    expect(g.nuke).toMatchObject({ type: 'missileRain', damage: 50, durationMs: 2600 })
  })

  it('mengembalikan damage di luar rentang ke default', () => {
    const config = validateConfig({
      gameplay: { nuke: { type: 'laser', damage: 9000, durationMs: 2500 } },
    })
    expect(config.gameplay.nuke).toEqual({
      ...defaultConfig().gameplay.nuke,
      type: 'laser',
      damage: 50,
      durationMs: 2500,
    })
  })

  it('mengembalikan tipe yang tidak dikenal ke default', () => {
    const config = validateConfig({ gameplay: { nuke: { type: 'blackhole' } } })
    expect(config.gameplay.nuke.type).toBe('missileRain')
  })

  it('menulis ulang nilai rule nuke menjadi gameplay.nuke.damage', () => {
    const config = validateConfig({
      gameplay: { nuke: { type: 'bomb', damage: 120, durationMs: 2000 } },
      triggers: [
        {
          id: 'gift-nuke',
          label: 'Nuke',
          enabled: true,
          when: { kind: 'gift', giftNames: ['Galaxy'], minCount: 1 },
          then: { actionType: 'nuke', target: 'sideB', value: 7 },
          legend: { show: true, caption: 'NUKE', icon: 'nuke' },
        },
      ],
    })
    expect(config.triggers[0]?.then.value).toBe(120)
  })
})

describe('config ultimate (Plan 6a)', () => {
  it('mengisi bawaan tier, hardCap, dan calloutHoldMs saat config lama tidak memuatnya', () => {
    const config = validateConfig({ gameplay: { nuke: { type: 'laser', damage: 50, durationMs: 2000 } } })
    expect(config.gameplay.nuke.hardCap).toBe(6)
    expect(config.gameplay.nuke.calloutHoldMs).toBe(1800)
    expect(config.gameplay.nuke.tiers).toHaveLength(3)
    expect(config.gameplay.autoJoinGifter).toBe(true)
    expect(config.overlay.flashCeiling).toBe(0.45)
    expect(config.overlay.flashCeilingReducedMotion).toBe(0.15)
  })

  it('mengurutkan tier menaik menurut minCoins', () => {
    const config = validateConfig({
      gameplay: {
        nuke: {
          tiers: [
            { minCoins: 500, durationMultiplier: 1.5, densityMultiplier: 2, radiusMultiplier: 1.5, calloutIntensity: 2 },
            { minCoins: 0, durationMultiplier: 1, densityMultiplier: 1, radiusMultiplier: 1, calloutIntensity: 1 },
          ],
        },
      },
    })
    expect(config.gameplay.nuke.tiers.map((t) => t.minCoins)).toEqual([0, 500])
  })

  it('menolak daftar tier kosong dan jatuh ke bawaan', () => {
    const config = validateConfig({ gameplay: { nuke: { tiers: [] } } })
    expect(config.gameplay.nuke.tiers).toHaveLength(3)
  })

  it('tier pertama selalu dipaksa minCoins 0 supaya gift termurah tetap punya tier', () => {
    const config = validateConfig({
      gameplay: {
        nuke: {
          tiers: [
            { minCoins: 50, durationMultiplier: 1, densityMultiplier: 1, radiusMultiplier: 1, calloutIntensity: 1 },
          ],
        },
      },
    })
    expect(config.gameplay.nuke.tiers[0]?.minCoins).toBe(0)
  })

  it('mengisi bawaan blok varian saat config lama tidak memuatnya', () => {
    const config = validateConfig({ gameplay: { nuke: { type: 'laser', damage: 50 } } })
    expect(config.gameplay.nuke.blastRadiusPct).toBe(9)
    expect(config.gameplay.nuke.particleBase).toBe(24)
    expect(config.gameplay.nuke.missile.baseCount).toBe(4)
    expect(config.gameplay.nuke.missile.turnRateDegPerSec).toBe(300)
    expect(config.gameplay.nuke.missile.launchStaggerMs).toBe(100)
    expect(config.gameplay.nuke.missile.speedPctPerSec).toBe(120)
    expect(config.gameplay.nuke.lightning.branches).toBe(3)
    expect(config.gameplay.nuke.laser.targetRule).toBe('highestHp')
  })

  /*
   * baseCount dikalikan densityMultiplier lalu dijepit ULTIMATE_MAX_TARGETS saat mengunci
   * sasaran. Menjepitnya di sini juga membuat form dashboard tidak pernah menawarkan angka
   * yang diam-diam dipotong belakangan.
   */
  it('menjepit baseCount ke jumlah sasaran maksimum satu ultimate', () => {
    const config = validateConfig({ gameplay: { nuke: { missile: { baseCount: 999 } } } })
    expect(config.gameplay.nuke.missile.baseCount).toBe(4)
    const ok = validateConfig({ gameplay: { nuke: { missile: { baseCount: 10 } } } })
    expect(ok.gameplay.nuke.missile.baseCount).toBe(10)
  })

  it('menolak targetRule yang tidak dikenal dan jatuh ke bawaan', () => {
    const config = validateConfig({ gameplay: { nuke: { laser: { targetRule: 'lowestHp' } } } })
    expect(config.gameplay.nuke.laser.targetRule).toBe('highestHp')
  })

  it('menerima ketiga aturan sasaran laser yang disediakan', () => {
    for (const rule of ['highestHp', 'mostKills', 'nearest'] as const) {
      const config = validateConfig({ gameplay: { nuke: { laser: { targetRule: rule } } } })
      expect(config.gameplay.nuke.laser.targetRule).toBe(rule)
    }
  })

  /*
   * Durasi tidak termasuk hal yang boleh membesar bersama harga gift: 2600 ms sudah dinilai
   * pas creator di OBS, dan gift mahal harus terasa lebih besar, bukan lebih lama.
   */
  it('tidak lagi menskalakan durasi menurut tier', () => {
    const config = validateConfig({})
    expect(config.gameplay.nuke.durationMs).toBe(2600)
    for (const tier of config.gameplay.nuke.tiers) {
      expect(tier.durationMultiplier).toBe(1)
    }
  })

  it('membuat tier teratas terasa dua kali tier terbawah', () => {
    const tiers = validateConfig({}).gameplay.nuke.tiers
    const first = tiers[0] as NukeTier
    const last = tiers[tiers.length - 1] as NukeTier
    expect(last.densityMultiplier / first.densityMultiplier).toBe(2)
    expect(last.calloutIntensity / first.calloutIntensity).toBe(2)
  })

  it('mempertahankan then.nukeType yang sah dan membuang yang tidak dikenal', () => {
    const config = validateConfig({
      triggers: [
        {
          id: 'gift-nuke',
          when: { kind: 'gift', giftNames: [], minCount: 1 },
          then: { actionType: 'nuke', target: 'enemySide', nukeType: 'laser' },
          legend: { show: true, caption: 'NUKE', icon: 'gift' },
        },
        {
          id: 'gift-nuke-2',
          when: { kind: 'gift', giftNames: [], minCount: 1 },
          then: { actionType: 'nuke', target: 'enemySide', nukeType: 'blackhole' },
          legend: { show: true, caption: 'NUKE', icon: 'gift' },
        },
      ],
    })
    expect(config.triggers[0]?.then.nukeType).toBe('laser')
    expect(config.triggers[1]?.then.nukeType).toBeUndefined()
  })

  /*
   * `growWithNuke` mengikuti aturan `nukeType`, plus satu syarat lagi: hanya gift yang membawa
   * koin untuk diskalakan. Dibiarkan hidup di rule like atau di aksi non-nuke, ia jadi field
   * mati yang membuat panel berperilaku beda sebelum dan sesudah reload.
   */
  it('mempertahankan then.growWithNuke hanya pada rule gift yang aksinya nuke', () => {
    const config = validateConfig({
      triggers: [
        {
          id: 'gift-nuke',
          when: { kind: 'gift', giftNames: [], minCount: 1 },
          then: { actionType: 'nuke', target: 'enemySide', growWithNuke: 500 },
          legend: { show: true, caption: 'NUKE', icon: 'gift' },
        },
        {
          id: 'like-nuke',
          when: { kind: 'like', everyNLikes: 10 },
          then: { actionType: 'nuke', target: 'enemySide', growWithNuke: 500 },
          legend: { show: true, caption: 'NUKE', icon: 'like' },
        },
        {
          id: 'gift-heal',
          when: { kind: 'gift', giftNames: [], minCount: 1 },
          then: { actionType: 'heal', target: 'sender', value: 10, growWithNuke: 500 },
          legend: { show: true, caption: 'HEAL', icon: 'gift' },
        },
      ],
    })
    expect(config.triggers[0]?.then.growWithNuke).toBe(500)
    expect(config.triggers[1]?.then.growWithNuke).toBeUndefined()
    expect(config.triggers[2]?.then.growWithNuke).toBeUndefined()
  })
})

describe('validateConfig — filler', () => {
  it('memakai filler bawaan saat config tersimpan belum mengenalnya', () => {
    expect(validateConfig({}).filler).toStrictEqual({
      enabled: false,
      items: [],
      imageDurationSec: 15,
    })
  })

  it('membuang item filler yang tidak berbentuk dan memotong ke delapan', () => {
    const result = validateConfig({
      filler: {
        enabled: true,
        items: [
          { url: '/a.mp4', kind: 'video' },
          { url: '   ', kind: 'video' },
          { url: '/b.png', kind: 'gambar' },
          { kind: 'image' },
          null,
          ...Array.from({ length: 10 }, (_, i) => ({ url: `/x${i}.png`, kind: 'image' })),
        ],
      },
    })

    expect(result.filler.enabled).toBe(true)
    expect(result.filler.items).toHaveLength(8)
    expect(result.filler.items[0]).toStrictEqual({ url: '/a.mp4', kind: 'video' })
    expect(result.filler.items[1]).toStrictEqual({ url: '/x0.png', kind: 'image' })
  })

  it('menjepit imageDurationSec ke rentangnya', () => {
    expect(validateConfig({ filler: { imageDurationSec: 900 } }).filler.imageDurationSec).toBe(15)
    expect(validateConfig({ filler: { imageDurationSec: 30 } }).filler.imageDurationSec).toBe(30)
  })

  it('membiarkan daftar filler kosong tetap kosong, tidak dikembalikan ke bawaan', () => {
    expect(validateConfig({ filler: { enabled: true, items: [] } }).filler.items).toStrictEqual([])
  })
})
