import { battleArenaConfig } from '../../games/battle-arena/config/index.js'
import type { BattleArenaConfig } from '../../games/battle-arena/config/index.js'
import type { LocalStore } from '../../platform/persistence/index.js'

export const CONFIG_KEY = 'battle-arena.config'

/**
 * Config tersimpan selalu dilewatkan validate(), bukan dipakai apa adanya.
 *
 * validate() memigrasikan lebih dulu lalu mengganti tiap field yang hilang, salah tipe, atau
 * di luar rentang dengan default-nya (Req 31 AC3). Artinya config dari versi skema lama, dari
 * tangan yang mengedit localStorage, atau yang separuh tertulis tetap menghasilkan dashboard
 * yang jalan — bukan layar putih.
 */
export function loadConfig(store: LocalStore): BattleArenaConfig {
  return battleArenaConfig.validate(store.read<unknown>(CONFIG_KEY, null))
}

export function saveConfig(store: LocalStore, config: BattleArenaConfig): void {
  store.write(CONFIG_KEY, config)
}
