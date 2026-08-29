/** Versi skema wire untuk pesan antar-proses. Dinaikkan bila bentuk pesan berubah. */
export const WIRE_VERSION = 2

export { createChatMessage, isSyntheticPlatform } from './chat-message.js'
export type { ChatEventKind, ChatMessage, ChatMessageInit, ChatPlatform } from './chat-message.js'

export {
  EFFECT_STRIDE,
  FIGHTER_STRIDE,
  NO_SIDE,
  NO_SLOT,
  PROJECTILE_STRIDE,
  SIDE_A,
  SIDE_B,
  SNAPSHOT_HEADER_LENGTH,
  ULTIMATE_MAX_TARGETS,
  ULTIMATE_STRIDE,
  SnapshotHistory,
  createSnapshotView,
  decodeSnapshot,
  snapshotLength,
} from './snapshot.js'
export type {
  SnapshotEffect,
  SnapshotFighter,
  SnapshotHeader,
  SnapshotProjectile,
  SnapshotUltimate,
  SnapshotView,
} from './snapshot.js'

export {
  CHARGE_END,
  IMPACT_AT,
  IMPACT_END,
  TRAVEL_END,
  ultimateProgressAt,
  ultimateTiming,
} from './ultimate.js'
export type { UltimateTiming } from './ultimate.js'

export { GIFT_SEED } from './gift.js'
export type { GiftCatalogEntry } from './gift.js'

export { BACKOFF_BASE_MS, BACKOFF_MAX_MS, nextDelayMs } from './backoff.js'

export {
  APP_KEY_HEADER,
  APP_KEY_QUERY,
  OVERLAY_ROLE,
  OVERLAY_ROLE_QUERY,
  WS_PATH,
  idleStatus,
} from './api.js'
export type {
  AnalyticsEvent,
  ClientEvent,
  ConnectionState,
  ConnectionStatus,
  MatchPlayerRecord,
  MatchRecord,
  MatchSummary,
  PlayerIdentity,
  PlayerProgress,
  PlayerStats,
  ServerEvent,
} from './api.js'

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_LIMIT } from './upload.js'
