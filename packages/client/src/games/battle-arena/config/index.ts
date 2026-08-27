import type { IGameConfig } from '../../../framework/types/plugin.js'
import { defaultConfig } from './defaults.js'
import { CURRENT_SCHEMA_VERSION, migrateConfig, runMigrations } from './migrations.js'
import type { BattleArenaConfig } from './schema.js'
import { validateConfig } from './validate.js'

export * from './schema.js'
export { defaultConfig } from './defaults.js'
export {
  validateConfig,
  validateSection,
  validateNumericInput,
  validateNumericRange,
} from './validate.js'
export type { NumericInputResult } from './validate.js'
export {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  migrateConfig,
  readSchemaVersion,
  runMigrations,
} from './migrations.js'
export type { Migration } from './migrations.js'

/**
 * Implementasi IGameConfig untuk Battle Arena.
 *
 * validate() sengaja memigrasikan lebih dulu: pemanggil hanya perlu menyerahkan apa pun
 * yang ada di penyimpanan dan selalu menerima config yang sah untuk versi saat ini.
 */
export const battleArenaConfig: IGameConfig<BattleArenaConfig> = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  defaults: () => defaultConfig(),
  validate: (raw) => {
    const config = validateConfig(migrateConfig(raw))
    config.schemaVersion = CURRENT_SCHEMA_VERSION
    return config
  },
  migrate: (raw, fromVersion) => runMigrations(raw, fromVersion),
}
