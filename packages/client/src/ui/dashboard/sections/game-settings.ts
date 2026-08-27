import { MAX_ALIASES, SOUND_EVENTS } from '../../../games/battle-arena/config/index.js'
import type {
  BattleArenaConfig,
  GameplayConfig,
  OverlayConfig,
  SideConfig,
  SimulationConfig,
  SoundEvent,
  UiConfig,
} from '../../../games/battle-arena/config/index.js'
import type { SideId } from '../../../games/battle-arena/types.js'

/**
 * Kunci berjalur "section.field", bukan dua daftar terpisah.
 *
 * Sakelar di form bercampur antara ui dan gameplay, dan creator tidak peduli field itu
 * tinggal di section mana. Union eksplisit ini menjaga withToggle tetap total tanpa
 * membuka pintu ke field mana pun yang belum dirancang punya sakelar.
 */
export type ToggleKey =
  | 'gameplay.practiceFighters'
  | 'gameplay.idleMovement'
  | 'ui.screenShake'
  | 'ui.showJoinedMessages'
  | 'ui.showFloatingDamage'
  | 'ui.showFighterNames'
  | 'ui.showTopFighters'

export interface ToggleRow {
  key: ToggleKey
  label: string
  hint?: string
  checked: boolean
}

export function toggleRows(config: BattleArenaConfig): ToggleRow[] {
  return [
    {
      key: 'gameplay.practiceFighters',
      label: 'Isi arena dengan fighter latihan saat penonton masih sedikit',
      checked: config.gameplay.practiceFighters,
    },
    {
      key: 'gameplay.idleMovement',
      label: 'Fighter bergerak-gerak kecil selama menunggu',
      checked: config.gameplay.idleMovement,
    },
    {
      key: 'ui.screenShake',
      label: 'Guncangkan layar pada nuke dan pukulan besar',
      checked: config.ui.screenShake,
    },
    {
      key: 'ui.showJoinedMessages',
      label: 'Tampilkan pesan "joined" saat penonton memilih sisi',
      checked: config.ui.showJoinedMessages,
    },
    {
      key: 'ui.showFloatingDamage',
      label: 'Tampilkan angka damage melayang saat kena',
      checked: config.ui.showFloatingDamage,
    },
    {
      key: 'ui.showFighterNames',
      label: 'Tampilkan nama di bawah tiap blob',
      checked: config.ui.showFighterNames,
    },
    {
      key: 'ui.showTopFighters',
      label: 'Tampilkan papan top fighters',
      checked: config.ui.showTopFighters,
    },
  ]
}

export function withToggle(
  config: BattleArenaConfig,
  key: ToggleKey,
  value: boolean,
): BattleArenaConfig {
  switch (key) {
    case 'gameplay.practiceFighters':
      return withGameplay(config, { practiceFighters: value })
    case 'gameplay.idleMovement':
      return withGameplay(config, { idleMovement: value })
    case 'ui.screenShake':
      return withUi(config, { screenShake: value })
    case 'ui.showJoinedMessages':
      return withUi(config, { showJoinedMessages: value })
    case 'ui.showFloatingDamage':
      return withUi(config, { showFloatingDamage: value })
    case 'ui.showFighterNames':
      return withUi(config, { showFighterNames: value })
    case 'ui.showTopFighters':
      return withUi(config, { showTopFighters: value })
  }
}

export interface SoundRow {
  event: SoundEvent
  label: string
  enabled: boolean
  volume: number
}

const SOUND_LABELS: Record<SoundEvent, string> = {
  attack: 'Tembakan',
  hit: 'Kena pukul',
  heal: 'Pemulihan',
  death: 'Fighter tumbang',
  join: 'Penonton bergabung',
  countdown: 'Hitung mundur',
  roundWin: 'Ronde selesai',
  matchWin: 'Match selesai',
  ultimate: 'Ultimate (nuke)',
}

export function soundRows(config: BattleArenaConfig): SoundRow[] {
  return SOUND_EVENTS.map((event) => ({
    event,
    label: SOUND_LABELS[event],
    enabled: config.sound[event].enabled,
    volume: config.sound[event].volume,
  }))
}

export function withSound(
  config: BattleArenaConfig,
  event: SoundEvent,
  patch: { enabled?: boolean; volume?: number },
): BattleArenaConfig {
  return {
    ...config,
    sound: { ...config.sound, [event]: { ...config.sound[event], ...patch } },
  }
}

export function withSide(
  config: BattleArenaConfig,
  side: SideId,
  patch: Partial<SideConfig>,
): BattleArenaConfig {
  return { ...config, sides: { ...config.sides, [side]: { ...config.sides[side], ...patch } } }
}

export function withGameplay(
  config: BattleArenaConfig,
  patch: Partial<GameplayConfig>,
): BattleArenaConfig {
  return { ...config, gameplay: { ...config.gameplay, ...patch } }
}

export function withUi(config: BattleArenaConfig, patch: Partial<UiConfig>): BattleArenaConfig {
  return { ...config, ui: { ...config.ui, ...patch } }
}

export function withOverlay(
  config: BattleArenaConfig,
  patch: Partial<OverlayConfig>,
): BattleArenaConfig {
  return { ...config, overlay: { ...config.overlay, ...patch } }
}

export function withSimulation(
  config: BattleArenaConfig,
  patch: Partial<SimulationConfig>,
): BattleArenaConfig {
  return { ...config, simulation: { ...config.simulation, ...patch } }
}

/** Alias diketik sebagai satu baris berkoma; validateConfig tetap memotong di MAX_ALIASES. */
export function parseAliases(raw: string): string[] {
  return raw
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0)
    .slice(0, MAX_ALIASES)
}

export function formatAliases(aliases: string[]): string {
  return aliases.join(', ')
}
