import { defaultConfig } from './defaults.js'
import {
  EFFECT_DURATION_MULTIPLIER_RANGE,
  EFFECT_INTENSITY_RANGE,
  EFFECT_TYPES,
  FILLER_ITEMS_MAX,
  FILLER_URL_MAX_LENGTH,
  GIFT_MIN_COUNT_RANGE,
  GIFT_NAME_MAX_LENGTH,
  KEYWORD_MAX_LENGTH,
  LEGEND_CAPTION_MAX_LENGTH,
  LASER_TARGET_RULES,
  MAX_ALIASES,
  MAX_GIFT_NAMES,
  MAX_NUKE_TIERS,
  MAX_TRIGGER_RULES,
  RULE_LABEL_MAX_LENGTH,
  NUKE_TYPES,
  NUMERIC_RANGES,
  ROUNDS_BEST_OF_VALUES,
  SIDE_NAME_MAX_LENGTH,
  SOUND_EVENTS,
  SOUND_VOLUME_RANGE,
  TIER_MIN_COINS_RANGE,
  TIER_MULTIPLIER_RANGE,
} from './schema.js'
import type {
  ArenaBackground,
  BattleArenaConfig,
  EffectConfig,
  EffectType,
  FillerItem,
  MissileConfig,
  NukeTier,
  NumericField,
  NumericRange,
  SideConfig,
  SoundConfig,
  SoundEvent,
  TriggerRule,
} from './schema.js'
import type { SideId } from '../types.js'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const pick = (source: unknown, key: string): unknown => (isRecord(source) ? source[key] : undefined)

/** Angka yang lolos tipe DAN rentang; kalau tidak, nilai default yang dipakai. */
function num(raw: unknown, range: NumericRange, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  const value = range.integer ? Math.round(raw) : raw
  if (value < range.min || value > range.max) return fallback
  return value
}

const bool = (raw: unknown, fallback: boolean): boolean => (typeof raw === 'boolean' ? raw : fallback)

function str(raw: unknown, maxLength: number, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  if (trimmed.length === 0) return fallback
  return trimmed.slice(0, maxLength)
}

function oneOf<T>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

function validateSide(raw: unknown, fallback: SideConfig): SideConfig {
  const aliasesRaw = pick(raw, 'aliases')
  const aliases = Array.isArray(aliasesRaw)
    ? aliasesRaw
        .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
        .map((a) => a.trim().slice(0, KEYWORD_MAX_LENGTH))
        .slice(0, MAX_ALIASES)
    : [...fallback.aliases]

  const backgroundRaw = pick(raw, 'backgroundImage')
  return {
    name: str(pick(raw, 'name'), SIDE_NAME_MAX_LENGTH, fallback.name),
    keyword: str(pick(raw, 'keyword'), KEYWORD_MAX_LENGTH, fallback.keyword),
    aliases,
    color: str(pick(raw, 'color'), 32, fallback.color),
    backgroundImage: typeof backgroundRaw === 'string' && backgroundRaw.length > 0 ? backgroundRaw : null,
  }
}

const ACTION_TYPES = [
  'spawn',
  'grow',
  'heal',
  'damage',
  'buff',
  'debuff',
  'hasten',
  'nuke',
  'spawnEffect',
  'playSound',
  'cameraShake',
] as const
const TARGET_KINDS = [
  'sender',
  'sideA',
  'sideB',
  'all',
  'ownSide',
  'enemySide',
  'randomAlly',
  'randomEnemy',
] as const

/** Mengembalikan null bila rule tidak bisa diselamatkan — rule seperti itu dibuang. */
function validateRule(
  raw: unknown,
  likeThreshold: number,
  hpGainedPerGrow: number,
  nukeDamage: number,
): TriggerRule | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null
  if (id === null) return null

  const whenRaw = raw.when
  if (!isRecord(whenRaw)) return null

  let when: TriggerRule['when']
  if (whenRaw.kind === 'comment') {
    when = { kind: 'comment', matchSide: oneOf<SideId>(whenRaw.matchSide, ['a', 'b'], 'a') }
  } else if (whenRaw.kind === 'like') {
    // D3: ambang like selalu mengikuti config, bukan angka yang tersimpan di rule.
    when = { kind: 'like', everyNLikes: likeThreshold }
  } else if (whenRaw.kind === 'gift') {
    const namesRaw = Array.isArray(whenRaw.giftNames) ? whenRaw.giftNames : []
    when = {
      kind: 'gift',
      giftNames: namesRaw
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
        .map((n) => n.trim().slice(0, GIFT_NAME_MAX_LENGTH))
        .slice(0, MAX_GIFT_NAMES),
      minCount: num(whenRaw.minCount, GIFT_MIN_COUNT_RANGE, 1),
    }
  } else if (whenRaw.kind === 'follow') {
    when = { kind: 'follow' }
  } else {
    return null
  }

  const thenRaw = raw.then
  if (!isRecord(thenRaw)) return null
  const actionType = oneOf(thenRaw.actionType, ACTION_TYPES, null as (typeof ACTION_TYPES)[number] | null)
  if (actionType === null) return null

  const legendRaw = isRecord(raw.legend) ? raw.legend : {}
  return {
    id,
    label: str(raw.label, RULE_LABEL_MAX_LENGTH, id),
    enabled: bool(raw.enabled, true),
    when,
    then: {
      actionType,
      target: oneOf(thenRaw.target, TARGET_KINDS, 'sender'),
      // D3 diperluas: nilai Grow mengikuti gameplay.hpGainedPerGrow, nilai Nuke mengikuti
      // gameplay.nuke.damage. Legend karena itu tidak bisa memajang angka yang tidak berlaku.
      value:
        actionType === 'grow'
          ? hpGainedPerGrow
          : actionType === 'nuke'
            ? nukeDamage
            : typeof thenRaw.value === 'number' && Number.isFinite(thenRaw.value)
              ? thenRaw.value
              : 0,
      // Hanya diisi kalau memang sah: rule non-nuke yang membawa nukeType nyasar tidak
      // boleh menyeret field mati ke config creator.
      ...(actionType === 'nuke' && NUKE_TYPES.includes(thenRaw.nukeType as (typeof NUKE_TYPES)[number])
        ? { nukeType: thenRaw.nukeType as TriggerRule['then']['nukeType'] }
        : {}),
    },
    legend: {
      show: bool(legendRaw.show, true),
      caption: str(legendRaw.caption, LEGEND_CAPTION_MAX_LENGTH, id.toUpperCase()),
      icon: str(legendRaw.icon, 40, 'action'),
    },
  }
}

function validateBackground(raw: unknown, fallback: ArenaBackground): ArenaBackground {
  if (!isRecord(raw)) return fallback
  if (raw.kind === 'transparent') return { kind: 'transparent' }
  if (raw.kind === 'color' && typeof raw.value === 'string') return { kind: 'color', value: raw.value }
  if (raw.kind === 'image' && typeof raw.url === 'string') return { kind: 'image', url: raw.url }
  return fallback
}

/**
 * Daftar tier yang selalu bisa dipakai.
 *
 * Dua hal ditegakkan di sini karena pemilih tier di engine mengandalkannya: urutan MENAIK,
 * dan entri pertama ber-minCoins 0. Tanpa keduanya, gift dengan koin di bawah ambang terkecil
 * tidak akan cocok dengan satu tier pun dan ultimate-nya kehilangan seluruh skala presentasi.
 */
function validateTiers(raw: unknown, fallback: NukeTier[]): NukeTier[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback.map((t) => ({ ...t }))

  const tiers = raw
    .filter(isRecord)
    .map((entry) => ({
      minCoins: num(entry.minCoins, TIER_MIN_COINS_RANGE, 0),
      durationMultiplier: num(entry.durationMultiplier, TIER_MULTIPLIER_RANGE, 1),
      densityMultiplier: num(entry.densityMultiplier, TIER_MULTIPLIER_RANGE, 1),
      radiusMultiplier: num(entry.radiusMultiplier, TIER_MULTIPLIER_RANGE, 1),
      calloutIntensity: num(entry.calloutIntensity, TIER_MULTIPLIER_RANGE, 1),
    }))
    .sort((a, b) => a.minCoins - b.minCoins)
    .slice(0, MAX_NUKE_TIERS)

  if (tiers.length === 0) return fallback.map((t) => ({ ...t }))
  const first = tiers[0] as NukeTier
  first.minCoins = 0
  return tiers
}

function validateMissile(raw: unknown, fallback: MissileConfig): MissileConfig {
  return {
    baseCount: num(
      pick(raw, 'baseCount'),
      NUMERIC_RANGES['gameplay.nuke.missile.baseCount'],
      fallback.baseCount,
    ),
    turnRateDegPerSec: num(
      pick(raw, 'turnRateDegPerSec'),
      NUMERIC_RANGES['gameplay.nuke.missile.turnRateDegPerSec'],
      fallback.turnRateDegPerSec,
    ),
    launchStaggerMs: num(
      pick(raw, 'launchStaggerMs'),
      NUMERIC_RANGES['gameplay.nuke.missile.launchStaggerMs'],
      fallback.launchStaggerMs,
    ),
    speedPctPerSec: num(
      pick(raw, 'speedPctPerSec'),
      NUMERIC_RANGES['gameplay.nuke.missile.speedPctPerSec'],
      fallback.speedPctPerSec,
    ),
  }
}

/**
 * Memvalidasi satu section secara mandiri (Req 31 AC6).
 *
 * Selalu mengembalikan section yang sah: field yang hilang, salah tipe, atau di luar
 * rentang diganti default tanpa menggagalkan pemuatan (Req 31 AC3).
 */
/**
 * Satu item filler, atau `null` kalau ia tidak berbentuk.
 *
 * Berbeda dari section lain, item yang cacat DIBUANG dan tidak diperbaiki: sebuah URL tidak
 * punya nilai bawaan yang masuk akal, dan menggantinya dengan string kosong hanya memindahkan
 * kegagalannya ke `<video>` di tengah siaran.
 */
function validateFillerItem(raw: unknown): FillerItem | null {
  const url = pick(raw, 'url')
  if (typeof url !== 'string' || url.trim().length === 0) return null
  const kind = pick(raw, 'kind')
  if (kind !== 'video' && kind !== 'image') return null
  return { url: url.trim().slice(0, FILLER_URL_MAX_LENGTH), kind }
}

export function validateSection<K extends keyof BattleArenaConfig>(
  section: K,
  raw: unknown,
): BattleArenaConfig[K] {
  const defaults = defaultConfig()
  const d = defaults[section]

  switch (section) {
    case 'schemaVersion': {
      return (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1
        ? raw
        : defaults.schemaVersion) as BattleArenaConfig[K]
    }
    case 'ui': {
      const ui = defaults.ui
      return {
        interfaceLanguage: oneOf(pick(raw, 'interfaceLanguage'), ['en', 'id'] as const, ui.interfaceLanguage),
        showJoinedMessages: bool(pick(raw, 'showJoinedMessages'), ui.showJoinedMessages),
        showFloatingDamage: bool(pick(raw, 'showFloatingDamage'), ui.showFloatingDamage),
        showFighterNames: bool(pick(raw, 'showFighterNames'), ui.showFighterNames),
        showTopFighters: bool(pick(raw, 'showTopFighters'), ui.showTopFighters),
        leaderboardEntries: num(
          pick(raw, 'leaderboardEntries'),
          NUMERIC_RANGES['ui.leaderboardEntries'],
          ui.leaderboardEntries,
        ),
        screenShake: bool(pick(raw, 'screenShake'), ui.screenShake),
      } as BattleArenaConfig[K]
    }
    case 'sides': {
      return {
        a: validateSide(pick(raw, 'a'), defaults.sides.a),
        b: validateSide(pick(raw, 'b'), defaults.sides.b),
      } as BattleArenaConfig[K]
    }
    case 'gameplay': {
      const g = defaults.gameplay
      return {
        winMode: oneOf(pick(raw, 'winMode'), ['firstToNKills'] as const, g.winMode),
        roundsBestOf: oneOf(pick(raw, 'roundsBestOf'), ROUNDS_BEST_OF_VALUES, g.roundsBestOf),
        killsToWinRound: num(
          pick(raw, 'killsToWinRound'),
          NUMERIC_RANGES['gameplay.killsToWinRound'],
          g.killsToWinRound,
        ),
        maxFightersPerSide: num(
          pick(raw, 'maxFightersPerSide'),
          NUMERIC_RANGES['gameplay.maxFightersPerSide'],
          g.maxFightersPerSide,
        ),
        baseHp: num(pick(raw, 'baseHp'), NUMERIC_RANGES['gameplay.baseHp'], g.baseHp),
        baseDamage: num(pick(raw, 'baseDamage'), NUMERIC_RANGES['gameplay.baseDamage'], g.baseDamage),
        attackIntervalSec: num(
          pick(raw, 'attackIntervalSec'),
          NUMERIC_RANGES['gameplay.attackIntervalSec'],
          g.attackIntervalSec,
        ),
        hpGainedPerGrow: num(
          pick(raw, 'hpGainedPerGrow'),
          NUMERIC_RANGES['gameplay.hpGainedPerGrow'],
          g.hpGainedPerGrow,
        ),
        growMode: oneOf(pick(raw, 'growMode'), ['flat', 'perCoin', 'perLike', 'perFollow'] as const, g.growMode),
        nuke: {
          type: oneOf(pick(pick(raw, 'nuke'), 'type'), NUKE_TYPES, g.nuke.type),
          damage: num(
            pick(pick(raw, 'nuke'), 'damage'),
            NUMERIC_RANGES['gameplay.nuke.damage'],
            g.nuke.damage,
          ),
          durationMs: num(
            pick(pick(raw, 'nuke'), 'durationMs'),
            NUMERIC_RANGES['gameplay.nuke.durationMs'],
            g.nuke.durationMs,
          ),
          hardCap: num(
            pick(pick(raw, 'nuke'), 'hardCap'),
            NUMERIC_RANGES['gameplay.nuke.hardCap'],
            g.nuke.hardCap,
          ),
          calloutHoldMs: num(
            pick(pick(raw, 'nuke'), 'calloutHoldMs'),
            NUMERIC_RANGES['gameplay.nuke.calloutHoldMs'],
            g.nuke.calloutHoldMs,
          ),
          blastRadiusPct: num(
            pick(pick(raw, 'nuke'), 'blastRadiusPct'),
            NUMERIC_RANGES['gameplay.nuke.blastRadiusPct'],
            g.nuke.blastRadiusPct,
          ),
          particleBase: num(
            pick(pick(raw, 'nuke'), 'particleBase'),
            NUMERIC_RANGES['gameplay.nuke.particleBase'],
            g.nuke.particleBase,
          ),
          missile: validateMissile(pick(pick(raw, 'nuke'), 'missile'), g.nuke.missile),
          lightning: {
            branches: num(
              pick(pick(pick(raw, 'nuke'), 'lightning'), 'branches'),
              NUMERIC_RANGES['gameplay.nuke.lightning.branches'],
              g.nuke.lightning.branches,
            ),
          },
          laser: {
            targetRule: oneOf(
              pick(pick(pick(raw, 'nuke'), 'laser'), 'targetRule'),
              LASER_TARGET_RULES,
              g.nuke.laser.targetRule,
            ),
          },
          tiers: validateTiers(pick(pick(raw, 'nuke'), 'tiers'), g.nuke.tiers),
        },
        autoJoinGifter: bool(pick(raw, 'autoJoinGifter'), g.autoJoinGifter),
        countdownDurationSec: num(
          pick(raw, 'countdownDurationSec'),
          NUMERIC_RANGES['gameplay.countdownDurationSec'],
          g.countdownDurationSec,
        ),
        celebrationDurationSec: num(
          pick(raw, 'celebrationDurationSec'),
          NUMERIC_RANGES['gameplay.celebrationDurationSec'],
          g.celebrationDurationSec,
        ),
        idleMovement: bool(pick(raw, 'idleMovement'), g.idleMovement),
        practiceFighters: bool(pick(raw, 'practiceFighters'), g.practiceFighters),
      } as BattleArenaConfig[K]
    }
    case 'likes': {
      return {
        threshold: num(pick(raw, 'threshold'), NUMERIC_RANGES['likes.threshold'], defaults.likes.threshold),
      } as BattleArenaConfig[K]
    }
    case 'effects': {
      const out = {} as Record<EffectType, EffectConfig>
      for (const type of EFFECT_TYPES) {
        const entry = pick(raw, type)
        out[type] = {
          intensity: num(pick(entry, 'intensity'), EFFECT_INTENSITY_RANGE, 1),
          durationMultiplier: num(pick(entry, 'durationMultiplier'), EFFECT_DURATION_MULTIPLIER_RANGE, 1),
        }
      }
      return out as BattleArenaConfig[K]
    }
    case 'sound': {
      const out = {} as Record<SoundEvent, SoundConfig>
      for (const event of SOUND_EVENTS) {
        const entry = pick(raw, event)
        out[event] = {
          enabled: bool(pick(entry, 'enabled'), true),
          volume: num(pick(entry, 'volume'), SOUND_VOLUME_RANGE, 0.8),
        }
      }
      return out as BattleArenaConfig[K]
    }
    case 'simulation': {
      const s = defaults.simulation
      return {
        commentsPerSecond: num(
          pick(raw, 'commentsPerSecond'),
          NUMERIC_RANGES['simulation.commentsPerSecond'],
          s.commentsPerSecond,
        ),
        likesPerSecond: num(
          pick(raw, 'likesPerSecond'),
          NUMERIC_RANGES['simulation.likesPerSecond'],
          s.likesPerSecond,
        ),
        giftsPerSecond: num(
          pick(raw, 'giftsPerSecond'),
          NUMERIC_RANGES['simulation.giftsPerSecond'],
          s.giftsPerSecond,
        ),
      } as BattleArenaConfig[K]
    }
    case 'overlay': {
      const o = defaults.overlay
      return {
        transparency: num(pick(raw, 'transparency'), NUMERIC_RANGES['overlay.transparency'], o.transparency),
        mode: oneOf(pick(raw, 'mode'), ['fullscreen', 'compact'] as const, o.mode),
        orientation: oneOf(pick(raw, 'orientation'), ['landscape', 'portrait'] as const, o.orientation),
        arenaBackground: validateBackground(pick(raw, 'arenaBackground'), o.arenaBackground),
        flashCeiling: num(pick(raw, 'flashCeiling'), NUMERIC_RANGES['overlay.flashCeiling'], o.flashCeiling),
        flashCeilingReducedMotion: num(
          pick(raw, 'flashCeilingReducedMotion'),
          NUMERIC_RANGES['overlay.flashCeilingReducedMotion'],
          o.flashCeilingReducedMotion,
        ),
      } as BattleArenaConfig[K]
    }
    case 'filler': {
      const f = defaults.filler
      const rawItems = pick(raw, 'items')
      return {
        enabled: bool(pick(raw, 'enabled'), f.enabled),
        // Daftar kosong TETAP kosong — berbeda dari `triggers`, bawaannya memang kosong, dan
        // creator yang menghapus semua itemnya berhak mendapat band bawah yang diam.
        items: (Array.isArray(rawItems) ? rawItems : [])
          .map(validateFillerItem)
          .filter((item): item is FillerItem => item !== null)
          .slice(0, FILLER_ITEMS_MAX),
        imageDurationSec: num(
          pick(raw, 'imageDurationSec'),
          NUMERIC_RANGES['filler.imageDurationSec'],
          f.imageDurationSec,
        ),
      } as BattleArenaConfig[K]
    }
    default:
      return d
  }
}

/** Config yang selalu sah, apa pun bentuk data yang tersimpan (Req 31 AC3). */
export function validateConfig(raw: unknown): BattleArenaConfig {
  const defaults = defaultConfig()
  const source = isRecord(raw) ? raw : {}

  const gameplay = validateSection('gameplay', source.gameplay)
  const likes = validateSection('likes', source.likes)

  const rulesRaw = Array.isArray(source.triggers) ? source.triggers : []
  const rules = rulesRaw
    .map((r) => validateRule(r, likes.threshold, gameplay.hpGainedPerGrow, gameplay.nuke.damage))
    .filter((r): r is TriggerRule => r !== null)
    .slice(0, MAX_TRIGGER_RULES)

  return {
    schemaVersion:
      typeof source.schemaVersion === 'number' &&
      Number.isInteger(source.schemaVersion) &&
      source.schemaVersion >= 1
        ? source.schemaVersion
        : defaults.schemaVersion,
    ui: validateSection('ui', source.ui),
    sides: validateSection('sides', source.sides),
    gameplay,
    likes,
    triggers: rules.length > 0 ? rules : defaults.triggers,
    effects: validateSection('effects', source.effects),
    sound: validateSection('sound', source.sound),
    simulation: validateSection('simulation', source.simulation),
    overlay: validateSection('overlay', source.overlay),
    filler: validateSection('filler', source.filler),
  }
}

export type NumericInputResult = { ok: true; value: number } | { ok: false; error: string }

/**
 * Jalur untuk input creator, bukan untuk memuat data tersimpan.
 *
 * Nilai di luar rentang DITOLAK — pemanggil mempertahankan nilai lama dan menampilkan
 * pesan error yang menyebut rentang yang boleh (Req 16 AC6).
 */
export function validateNumericRange(
  label: string,
  range: NumericRange,
  raw: unknown,
): NumericInputResult {
  const error = `${label} must be ${range.integer ? 'a whole number ' : ''}between ${range.min} and ${range.max}`

  const value = typeof raw === 'string' ? Number(raw.trim()) : raw
  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, error }
  if (range.integer && !Number.isInteger(value)) return { ok: false, error }
  if (value < range.min || value > range.max) return { ok: false, error }
  return { ok: true, value }
}

/** Rentang dari tabel section datar. Angka tingkat-rule memakai validateNumericRange. */
export function validateNumericInput(field: NumericField, raw: unknown): NumericInputResult {
  return validateNumericRange(field, NUMERIC_RANGES[field], raw)
}
