import { describe, expect, it } from 'vitest'
import { CHARGE_END, IMPACT_AT, IMPACT_END } from '@lga/shared'
import { defaultConfig } from '../config/index.js'
import { nukeTypeFromIndex } from '../snapshot.js'
import { ultimateWith } from '../../../testing/ultimate-fixtures.js'
import type { InterpolatedUltimate } from './interpolate.js'
import { flashAlpha, phaseProgress, tierFor, ultimatePhaseAt } from './ultimate.js'

describe('ultimatePhaseAt', () => {
  it('memetakan tengah tiap fase', () => {
    expect(ultimatePhaseAt(0)).toBe('charge')
    expect(ultimatePhaseAt(0.1)).toBe('charge')
    expect(ultimatePhaseAt(0.3)).toBe('travel')
    expect(ultimatePhaseAt(0.5)).toBe('travel')
    expect(ultimatePhaseAt(0.58)).toBe('impact')
    expect(ultimatePhaseAt(0.8)).toBe('aftermath')
    expect(ultimatePhaseAt(1)).toBe('aftermath')
  })

  /*
   * Batas diuji TEPAT di angkanya (spec §9). Aturannya: batas milik fase SESUDAHNYA,
   * supaya damage yang mendarat di IMPACT_AT jatuh pada frame pertama fase impact —
   * bukan pada frame terakhir travel, yang akan terlihat seperti HP turun sebelum ledakan.
   */
  it('batas fase milik fase sesudahnya', () => {
    expect(ultimatePhaseAt(CHARGE_END)).toBe('travel')
    expect(ultimatePhaseAt(IMPACT_AT)).toBe('impact')
    expect(ultimatePhaseAt(IMPACT_END)).toBe('aftermath')
  })

  it('nilai di luar 0–1 tidak menghasilkan fase yang tidak ada', () => {
    expect(ultimatePhaseAt(-1)).toBe('charge')
    expect(ultimatePhaseAt(99)).toBe('aftermath')
  })
})

describe('phaseProgress', () => {
  it('mulai di 0 pada awal tiap fase', () => {
    expect(phaseProgress(0)).toBe(0)
    expect(phaseProgress(CHARGE_END)).toBe(0)
    expect(phaseProgress(IMPACT_AT)).toBe(0)
    expect(phaseProgress(IMPACT_END)).toBe(0)
  })

  it('mendekati 1 di ujung tiap fase', () => {
    expect(phaseProgress(CHARGE_END - 0.0001)).toBeCloseTo(1, 2)
    expect(phaseProgress(IMPACT_AT - 0.0001)).toBeCloseTo(1, 2)
    expect(phaseProgress(1)).toBe(1)
  })

  it('tidak pernah keluar dari 0–1', () => {
    for (const p of [-5, 0, 0.2, 0.45, 0.9, 1, 7]) {
      expect(phaseProgress(p)).toBeGreaterThanOrEqual(0)
      expect(phaseProgress(p)).toBeLessThanOrEqual(1)
    }
  })
})

describe('tierFor', () => {
  it('mengembalikan entri tier yang diminta', () => {
    const config = defaultConfig()
    expect(tierFor(2, config)).toEqual(config.gameplay.nuke.tiers[2])
  })

  /*
   * Creator boleh memendekkan daftar tier di tengah sesi, dan record yang sudah di udara
   * masih membawa indeks lama. Tanpa penjepit, pengalinya jadi NaN dan ultimate menghilang
   * dari layar tanpa satu pesan error pun.
   */
  it('menjepit indeks yang sudah tidak ada ke tier terakhir yang masih ada', () => {
    const config = defaultConfig()
    config.gameplay.nuke.tiers = config.gameplay.nuke.tiers.slice(0, 2)
    expect(tierFor(9, config)).toEqual(config.gameplay.nuke.tiers[1])
    expect(tierFor(-3, config)).toEqual(config.gameplay.nuke.tiers[0])
  })

  it('tidak pernah mengembalikan undefined walau daftar tier kosong', () => {
    const config = defaultConfig()
    config.gameplay.nuke.tiers = []
    expect(tierFor(0, config).durationMultiplier).toBe(1)
  })
})

describe('nukeTypeFromIndex', () => {
  it('membalik NUKE_TYPES.indexOf yang dipakai encoder', () => {
    expect(nukeTypeFromIndex(0)).toBe('missileRain')
    expect(nukeTypeFromIndex(1)).toBe('laser')
  })

  it('menjawab null untuk indeks yang tidak dikenal', () => {
    expect(nukeTypeFromIndex(-1)).toBeNull()
    expect(nukeTypeFromIndex(99)).toBeNull()
  })
})

describe('flashAlpha', () => {
  const at = (progress: number, tier = 0): InterpolatedUltimate =>
    ultimateWith({ variant: 1, tier, originX: 10, progress })

  it('nol di luar fase impact', () => {
    const config = defaultConfig()
    expect(flashAlpha([at(0.1)], 1, config, false)).toBe(0)
    expect(flashAlpha([at(0.3)], 1, config, false)).toBe(0)
    expect(flashAlpha([at(0.9)], 1, config, false)).toBe(0)
  })

  it('paling terang di awal impact lalu memudar', () => {
    const config = defaultConfig()
    const early = flashAlpha([at(IMPACT_AT)], 1, config, false)
    const late = flashAlpha([at(IMPACT_END - 0.001)], 1, config, false)

    expect(early).toBeGreaterThan(0)
    expect(late).toBeLessThan(early)
  })

  /*
   * Freeze frame dan slow-motion dilarang, jadi bobot impact dipikul KONTRAS — dan kontras
   * butuh kilatannya habis dalam 1–2 frame, bukan memudar sepanjang fase. Peluruhan linier
   * pada fase 182 ms berarti layar memutih selama 11 frame penuh.
   */
  it('memadamkan flash dalam dua frame pertama impact, bukan sepanjang fasenya', () => {
    const config = defaultConfig()
    const atStart = flashAlpha([at(IMPACT_AT)], 1, config, false)
    // Seperempat fase impact ≈ 45 ms ≈ 3 frame. Di sini flash harus sudah nyaris habis.
    const quarterIn = flashAlpha(
      [at(IMPACT_AT + (IMPACT_END - IMPACT_AT) * 0.25)],
      1,
      config,
      false,
    )
    expect(atStart).toBeGreaterThan(0.3)
    expect(quarterIn).toBeLessThan(atStart * 0.15)
  })

  /*
   * Aturan keras spec §7.6: puncak yang menumpuk di-CLAMP, bukan dijumlah. Enam ultimate
   * meledak bersamaan tidak boleh memutihkan arena.
   */
  it('menjepit ke overlay.flashCeiling, tidak menjumlahkannya', () => {
    const config = defaultConfig()
    const many = Array.from({ length: 6 }, () => at(IMPACT_AT))
    expect(flashAlpha(many, 6, config, false)).toBe(config.overlay.flashCeiling)
  })

  it('memakai plafon reduced-motion saat jalur itu aktif', () => {
    const config = defaultConfig()
    const many = Array.from({ length: 6 }, () => at(IMPACT_AT))
    expect(flashAlpha(many, 6, config, true)).toBe(config.overlay.flashCeilingReducedMotion)
  })

  it('menghormati count, bukan panjang array', () => {
    const config = defaultConfig()
    const list = [at(IMPACT_AT), at(IMPACT_AT)]
    expect(flashAlpha(list, 0, config, false)).toBe(0)
  })

  it('record stale tidak berkilat — animasinya sudah hangus', () => {
    const config = defaultConfig()
    const staleOne = { ...at(IMPACT_AT), stale: 1 }
    expect(flashAlpha([staleOne], 1, config, false)).toBe(0)
  })

  it('tier tinggi berkilat lebih terang, sampai plafonnya', () => {
    const config = defaultConfig()
    config.overlay.flashCeiling = 1
    expect(flashAlpha([at(IMPACT_AT, 2)], 1, config, false)).toBeGreaterThan(
      flashAlpha([at(IMPACT_AT, 0)], 1, config, false),
    )
  })
})
