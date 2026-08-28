import { describe, expect, it } from 'vitest'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import { createBattleArenaState } from '../../../src/games/battle-arena/state.js'
import type { BattleArenaState } from '../../../src/games/battle-arena/state.js'
import { lockTargets, targetCountFor } from '../../../src/games/battle-arena/ultimate-targets.js'
import type { Fighter } from '../../../src/games/battle-arena/types.js'

const setup = (): BattleArenaState =>
  createBattleArenaState({ rng: createRng(3), clock: createManualClock() })

/** `n` fighter hidup di sisi b, berjajar menjauhi pusat zona. */
function seed(state: BattleArenaState, n: number, hp: number[] = []): Fighter[] {
  const { gameplay } = defaultConfig()
  const out: Fighter[] = []
  for (let i = 0; i < n; i++) {
    const result = state.fighters.join(
      { platform: 'tiktok', username: `bot${i}`, avatarUrl: null },
      'b',
      gameplay,
    )
    const fighter = result.fighter
    if (fighter === null) throw new Error(`sisi penuh pada fighter ke-${i}`)
    // Posisi diatur tangan supaya urutan jarak ke pusat zona deterministik, bukan bergantung
    // pada titik spawn yang di-seed rng.
    fighter.position.x = 60 + i * 3
    fighter.position.y = 50
    fighter.hp = hp[i] ?? 100
    out.push(fighter)
  }
  return out
}

describe('targetCountFor', () => {
  it('menskalakan jumlah rudal menurut tier: 4, 6, 8', () => {
    const config = defaultConfig()
    expect(targetCountFor('missileRain', config, 0)).toBe(4)
    expect(targetCountFor('missileRain', config, 1)).toBe(6)
    expect(targetCountFor('missileRain', config, 2)).toBe(8)
  })

  it('memberi satu sasaran untuk tiga varian lainnya, berapa pun tiernya', () => {
    const config = defaultConfig()
    for (const type of ['laser', 'bomb', 'lightning'] as const) {
      expect(targetCountFor(type, config, 2)).toBe(1)
    }
  })

  /*
   * Creator boleh memendekkan daftar tier di tengah sesi sementara record yang sudah di udara
   * masih membawa indeks lama. Tanpa penjepit, pengalinya undefined dan jumlah rudalnya NaN.
   */
  it('menjepit indeks tier yang sudah tidak ada', () => {
    const config = defaultConfig()
    config.gameplay.nuke.tiers = config.gameplay.nuke.tiers.slice(0, 1)
    expect(targetCountFor('missileRain', config, 9)).toBe(4)
  })

  it('tidak pernah melebihi batas sasaran satu ultimate', () => {
    const config = defaultConfig()
    config.gameplay.nuke.missile.baseCount = 10
    expect(targetCountFor('missileRain', config, 2)).toBe(10)
  })
})

describe('lockTargets', () => {
  it('memberi tiap rudal musuh yang berbeda', () => {
    const state = setup()
    seed(state, 6)
    const slots = lockTargets(state, defaultConfig(), 'missileRain', 'b', 0)
    expect(slots).toHaveLength(4)
    expect(new Set(slots).size).toBe(4)
  })

  /*
   * Setiap rudal tetap harus punya sasaran. Memangkas jumlah rudal saat lawan tinggal sedikit
   * akan membuat gift mahal terlihat lebih kecil justru ketika ia paling menentukan.
   */
  it('mengulang dari awal saat musuh lebih sedikit daripada rudal', () => {
    const state = setup()
    seed(state, 2)
    const slots = lockTargets(state, defaultConfig(), 'missileRain', 'b', 0)
    expect(slots).toHaveLength(4)
    expect(slots[0]).toBe(slots[2])
    expect(slots[1]).toBe(slots[3])
  })

  it('mengembalikan daftar kosong saat sisi lawan habis', () => {
    expect(lockTargets(setup(), defaultConfig(), 'missileRain', 'b', 0)).toEqual([])
  })

  it('melewati fighter yang sudah mati', () => {
    const state = setup()
    const fighters = seed(state, 3)
    const dead = fighters[0] as Fighter
    dead.alive = false
    const slots = lockTargets(state, defaultConfig(), 'missileRain', 'b', 0)
    expect(slots).not.toContain(dead.slotIndex)
  })

  it('membuat laser mengeksekusi fighter ber-HP tertinggi', () => {
    const state = setup()
    const fighters = seed(state, 3, [10, 180, 90])
    const slots = lockTargets(state, defaultConfig(), 'laser', 'b', 0)
    expect(slots).toEqual([(fighters[1] as Fighter).slotIndex])
  })

  /*
   * Ketiga aturan sengaja menunjuk fighter yang BERBEDA di susunan ini, supaya test benar-
   * benar membedakannya alih-alih kebetulan sepakat. Pusat zona b ada di x=75, jadi fighter
   * dengan x terbesar (bot2) yang paling dekat — bukan yang pertama di array.
   */
  it('menghormati ketiga aturan sasaran laser', () => {
    const state = setup()
    const fighters = seed(state, 3, [10, 180, 90])
    ;(fighters[0] as Fighter).kills = 7

    const ruleFor = (rule: 'highestHp' | 'mostKills' | 'nearest'): number[] => {
      const config = defaultConfig()
      config.gameplay.nuke.laser.targetRule = rule
      return lockTargets(state, config, 'laser', 'b', 0)
    }

    expect(ruleFor('highestHp')).toEqual([(fighters[1] as Fighter).slotIndex])
    expect(ruleFor('mostKills')).toEqual([(fighters[0] as Fighter).slotIndex])
    expect(ruleFor('nearest')).toEqual([(fighters[2] as Fighter).slotIndex])
  })

  it('bomb dan lightning mengunci satu jangkar, bukan area', () => {
    const state = setup()
    seed(state, 6)
    for (const type of ['bomb', 'lightning'] as const) {
      expect(lockTargets(state, defaultConfig(), type, 'b', 2)).toHaveLength(1)
    }
  })

  it('daftarnya tidak pernah melebihi batas sasaran satu ultimate', () => {
    const state = setup()
    seed(state, 25)
    const config = defaultConfig()
    config.gameplay.nuke.missile.baseCount = 10
    expect(lockTargets(state, config, 'missileRain', 'b', 2).length).toBeLessThanOrEqual(10)
  })

  it('deterministik: state yang sama menghasilkan daftar yang sama', () => {
    const state = setup()
    seed(state, 6)
    const config = defaultConfig()
    expect(lockTargets(state, config, 'missileRain', 'b', 1)).toEqual(
      lockTargets(state, config, 'missileRain', 'b', 1),
    )
  })
})
