/** Versi skema yang dimengerti kode saat ini. Naikkan bersama satu fungsi migrasi baru. */
export const CURRENT_SCHEMA_VERSION = 3

/** Satu langkah dari versi N ke N+1. Harus murni: kembalikan objek baru. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

// Dideklarasikan DI ATAS MIGRATIONS: `retuneNukeDuration` memakainya saat modul dimuat, dan
// `const` tidak ter-hoist seperti `function`.
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * 2 → 3 (Fase 2 Plan 6c).
 *
 * Blok varian yang baru — `missile`, `lightning`, `laser`, `blastRadiusPct`, `particleBase` —
 * sengaja TIDAK disuntikkan: `validateConfig` sudah mengisi field yang hilang dengan default,
 * dan itu jalur yang sama yang dipakai config baru.
 *
 * Yang harus disentuh justru dua nilai yang BERUBAH, bukan yang bertambah. Config creator
 * yang tersimpan di localStorage akan mempertahankan durasi 2000 ms dan pengali durasi per
 * tier, dan keduanya sudah bukan keputusan yang berlaku: durasi tidak lagi termasuk hal yang
 * membesar bersama harga gift.
 */
const retuneNukeDuration: Migration = (raw) => {
  const gameplay = raw.gameplay
  if (!isRecord(gameplay) || !isRecord(gameplay.nuke)) return { ...raw, schemaVersion: 3 }

  const nuke = gameplay.nuke
  const tiers = Array.isArray(nuke.tiers)
    ? nuke.tiers.map((t) => (isRecord(t) ? { ...t, durationMultiplier: 1 } : t))
    : undefined

  return {
    ...raw,
    schemaVersion: 3,
    gameplay: {
      ...gameplay,
      nuke: { ...nuke, durationMs: 2600, ...(tiers === undefined ? {} : { tiers }) },
    },
  }
}

/**
 * Satu fungsi per kenaikan versi, dikunci pada versi ASAL (Req 31 AC5).
 *
 * 1 → 2 (Fase 2 Plan 5a) hanya menaikkan versi. Kondisi `gift`/`follow` dan `gameplay.nuke`
 * memang lahir di versi 2, tapi keduanya tidak perlu disuntikkan: `validateConfig` sudah
 * mengisi field yang hilang dengan default, dan rule baru tidak boleh muncul sendiri di
 * config creator yang meng-upgrade.
 */
export const MIGRATIONS: Record<number, Migration> = {
  1: (raw) => ({ ...raw, schemaVersion: 2 }),
  2: retuneNukeDuration,
}

export function readSchemaVersion(raw: unknown): number {
  const version = isRecord(raw) ? raw.schemaVersion : undefined
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return 1
  return version
}

/**
 * Menjalankan rantai migrasi dari `fromVersion` sampai `targetVersion`.
 *
 * Config dari versi yang LEBIH BARU dibiarkan apa adanya — menebak-nebak cara menurunkan
 * versi lebih berbahaya daripada membiarkan validator mengganti field yang tak dikenali.
 */
export function runMigrations(
  raw: unknown,
  fromVersion: number,
  migrations: Record<number, Migration> = MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): unknown {
  if (!isRecord(raw)) return raw
  if (fromVersion >= targetVersion) return raw

  let data: Record<string, unknown> = { ...raw }
  for (let version = fromVersion; version < targetVersion; version++) {
    const step = migrations[version]
    if (step === undefined) {
      throw new Error(`Missing config migration from version ${version} to ${version + 1}`)
    }
    data = step(data)
  }
  return data
}

/** Membaca versi dari datanya sendiri lalu menjalankan rantai migrasi. */
export function migrateConfig(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): unknown {
  return runMigrations(raw, readSchemaVersion(raw), migrations, targetVersion)
}
