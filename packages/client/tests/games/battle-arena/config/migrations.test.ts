import { describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../../../src/games/battle-arena/config/defaults.js'
import { validateConfig } from '../../../../src/games/battle-arena/config/validate.js'
import { battleArenaConfig } from '../../../../src/games/battle-arena/config/index.js'
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  migrateConfig,
  readSchemaVersion,
  runMigrations,
} from '../../../../src/games/battle-arena/config/migrations.js'
import type { Migration } from '../../../../src/games/battle-arena/config/migrations.js'

describe('CURRENT_SCHEMA_VERSION', () => {
  it('is 3 in fase 2 and ships one migration step per version bump', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3)
    expect(Object.keys(MIGRATIONS)).toEqual(['1', '2'])
  })
})

describe('migrasi 2 → 3', () => {
  /*
   * Blok varian yang baru TIDAK perlu disuntikkan — validateConfig sudah mengisinya. Yang
   * harus disentuh justru dua nilai yang BERUBAH: config creator yang tersimpan akan
   * mempertahankan durasi 2000 ms dan pengali durasi per tier, dan keduanya sudah bukan
   * keputusan yang berlaku lagi.
   */
  it('menyetel ulang durasi nuke tersimpan dan mematikan pengali durasi per tier', () => {
    const migrated = migrateConfig({
      schemaVersion: 2,
      gameplay: {
        nuke: {
          durationMs: 2000,
          tiers: [
            { minCoins: 0, durationMultiplier: 1, densityMultiplier: 1 },
            { minCoins: 100, durationMultiplier: 1.8, densityMultiplier: 1.6 },
          ],
        },
      },
    }) as Record<string, any>

    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.gameplay.nuke.durationMs).toBe(2600)
    expect(migrated.gameplay.nuke.tiers[1].durationMultiplier).toBe(1)
    // Yang BUKAN durasi tidak boleh ikut disentuh.
    expect(migrated.gameplay.nuke.tiers[1].densityMultiplier).toBe(1.6)
  })

  it('membiarkan config tanpa blok nuke lewat tanpa error', () => {
    const migrated = migrateConfig({ schemaVersion: 2, gameplay: {} }) as Record<string, any>
    expect(migrated.schemaVersion).toBe(3)
  })

  it('tidak menyentuh section lain', () => {
    const migrated = migrateConfig({
      schemaVersion: 2,
      likes: { threshold: 42 },
      gameplay: { nuke: { durationMs: 2000 }, baseHp: 300 },
    }) as Record<string, any>

    expect(migrated.likes.threshold).toBe(42)
    expect(migrated.gameplay.baseHp).toBe(300)
  })
})

describe('migrasi 1 → 2', () => {
  it('menaikkan versi tanpa menyentuh rule yang tersimpan', () => {
    const stored = {
      schemaVersion: 1,
      triggers: [
        {
          id: 'join-a',
          label: 'Join Side A',
          enabled: true,
          when: { kind: 'comment', matchSide: 'a' },
          then: { actionType: 'spawn', target: 'sideA', value: 0 },
          legend: { show: true, caption: 'JOIN {side}', icon: 'join' },
        },
      ],
    }

    const migrated = migrateConfig(stored) as Record<string, unknown>

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.triggers).toEqual(stored.triggers)
  })

  it('tidak menyuntikkan rule gift ke config yang sudah tersimpan', () => {
    const migrated = validateConfig(migrateConfig({ schemaVersion: 1, triggers: [] }))
    expect(migrated.triggers.some((r) => r.when.kind === 'gift' && r.enabled)).toBe(false)
  })

  it('membiarkan config yang sudah versi terkini apa adanya', () => {
    const stored = { schemaVersion: CURRENT_SCHEMA_VERSION, gameplay: { baseHp: 300 } }
    expect(migrateConfig(stored)).toBe(stored)
  })
})

describe('rule contoh gift', () => {
  it('memberi tiga rule gift bawaan yang semuanya mati', () => {
    const gifts = defaultConfig().triggers.filter((r) => r.when.kind === 'gift')
    expect(gifts.map((r) => r.id)).toEqual(['gift-heal', 'gift-hasten', 'gift-barrage'])
    expect(gifts.every((r) => !r.enabled)).toBe(true)
  })

  it('lolos validasi tanpa satu rule pun dibuang', () => {
    expect(validateConfig(defaultConfig()).triggers).toHaveLength(8)
  })
})

describe('readSchemaVersion', () => {
  it('reads a stored version', () => {
    expect(readSchemaVersion({ schemaVersion: 3 })).toBe(3)
  })

  it('treats missing or unusable version data as version 1', () => {
    expect(readSchemaVersion({})).toBe(1)
    expect(readSchemaVersion(null)).toBe(1)
    expect(readSchemaVersion({ schemaVersion: 'two' })).toBe(1)
    expect(readSchemaVersion({ schemaVersion: 0 })).toBe(1)
  })
})

describe('runMigrations', () => {
  const fake: Record<number, Migration> = {
    1: (raw) => ({ ...raw, addedInV2: true, schemaVersion: 2 }),
    2: (raw) => ({ ...raw, addedInV3: true, schemaVersion: 3 }),
  }

  it('runs every step in order up to the target version', () => {
    const result = runMigrations({ schemaVersion: 1, keep: 'me' }, 1, fake, 3) as Record<string, unknown>
    expect(result.keep).toBe('me')
    expect(result.addedInV2).toBe(true)
    expect(result.addedInV3).toBe(true)
    expect(result.schemaVersion).toBe(3)
  })

  it('runs only the steps that are still missing', () => {
    const result = runMigrations({ schemaVersion: 2 }, 2, fake, 3) as Record<string, unknown>
    expect(result.addedInV2).toBeUndefined()
    expect(result.addedInV3).toBe(true)
  })

  it('returns the data untouched when it is already current', () => {
    const raw = { schemaVersion: 3, value: 1 }
    expect(runMigrations(raw, 3, fake, 3)).toEqual(raw)
  })

  it('leaves a config from a newer version alone instead of guessing', () => {
    const raw = { schemaVersion: 9 }
    expect(runMigrations(raw, 9, fake, 3)).toEqual(raw)
  })

  it('throws when a step in the chain is missing', () => {
    expect(() => runMigrations({ schemaVersion: 1 }, 1, { 2: fake[2] as Migration }, 3)).toThrow(
      /migration from version 1/i,
    )
  })

  it('does not mutate the input', () => {
    const raw = { schemaVersion: 1 }
    runMigrations(raw, 1, fake, 3)
    expect(raw).toEqual({ schemaVersion: 1 })
  })
})

describe('migrateConfig', () => {
  it('reads the version from the data before migrating', () => {
    const fake: Record<number, Migration> = { 1: (raw) => ({ ...raw, migrated: true, schemaVersion: 2 }) }
    expect(migrateConfig({ schemaVersion: 1 }, fake, 2)).toEqual({ schemaVersion: 2, migrated: true })
  })

  it('menjalankan seluruh rantai dari 1 sampai versi terkini', () => {
    // Tanpa blok nuke, langkah 2 → 3 hanya menaikkan versi — sisanya diisi validateConfig.
    expect(migrateConfig({ schemaVersion: 1, gameplay: { baseHp: 300 } })).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      gameplay: { baseHp: 300 },
    })
  })
})

describe('battleArenaConfig plugin', () => {
  it('reports the current schema version', () => {
    expect(battleArenaConfig.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('produces usable defaults', () => {
    expect(battleArenaConfig.defaults().gameplay.baseHp).toBe(200)
  })

  it('migrates then validates in one call', () => {
    const result = battleArenaConfig.validate({ gameplay: { baseHp: 99999 } })
    expect(result.gameplay.baseHp).toBe(200)
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('never throws on corrupt data', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => battleArenaConfig.validate('{{ not json }}')).not.toThrow()
    warn.mockRestore()
  })
})
