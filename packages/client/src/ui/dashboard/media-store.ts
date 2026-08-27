import { DEFAULT_ALERTS, MEDIA_KINDS } from '../../platform/signals/index.js'
import type { AlertRule, CatalogEntry, MediaKind } from '../../platform/signals/index.js'
import type { LocalStore } from '../../platform/persistence/index.js'
import {
  DEFAULT_READER,
  READER_BLOCKED_WORDS_MAX,
  READER_MAX_CHARS_RANGE,
  READER_RATE_RANGE,
  READER_WORD_MAX_LENGTH,
} from '../../platform/speech/index.js'
import type { ReaderSettings } from '../../platform/speech/index.js'

export const MEDIA_KEY = 'media.soundboard'

export interface MediaState {
  cues: CatalogEntry[]
  alerts: AlertRule[]
  /** Setelan Comment Reader — perkakas siaran, bukan setelan game. */
  reader: ReaderSettings
  /** Satu knop untuk seluruh kanal musik; volume per-cue diabaikan untuk kind ini. */
  musicVolume: number
}

const clamp01 = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1

const isCatalogEntry = (raw: unknown): raw is CatalogEntry => {
  if (raw === null || typeof raw !== 'object') return false
  const entry = raw as Partial<CatalogEntry>
  return (
    typeof entry.id === 'string' &&
    typeof entry.label === 'string' &&
    typeof entry.url === 'string' &&
    MEDIA_KINDS.includes(entry.kind as MediaKind)
  )
}

const isAlertRule = (raw: unknown): raw is AlertRule => {
  if (raw === null || typeof raw !== 'object') return false
  const rule = raw as Partial<AlertRule>
  return (
    typeof rule.enabled === 'boolean' &&
    typeof rule.threshold === 'number' &&
    Number.isFinite(rule.threshold) &&
    typeof rule.text === 'string' &&
    (rule.cueId === null || typeof rule.cueId === 'string')
  )
}

const clampNumber = (raw: unknown, fallback: number, min: number, max: number): number =>
  typeof raw === 'number' && Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : fallback

/**
 * Setelan reader menumpang blob yang sama, bukan kunci localStorage kedua.
 *
 * `MEDIA_KEY` sengaja tidak diganti nama meski isinya kini lebih dari soundboard: mengubahnya
 * berarti katalog cue setiap creator yang sudah memakai Plan 7b lenyap diam-diam.
 */
function normalizeReader(raw: unknown): ReaderSettings {
  const source = (raw !== null && typeof raw === 'object' ? raw : {}) as Partial<ReaderSettings>
  const words = Array.isArray(source.blockedWords) ? source.blockedWords : []

  return {
    enabled: source.enabled === true,
    voiceUri: typeof source.voiceUri === 'string' ? source.voiceUri : null,
    rate: clampNumber(
      source.rate,
      DEFAULT_READER.rate,
      READER_RATE_RANGE.min,
      READER_RATE_RANGE.max,
    ),
    volume: clamp01(source.volume),
    maxChars: Math.round(
      clampNumber(
        source.maxChars,
        DEFAULT_READER.maxChars,
        READER_MAX_CHARS_RANGE.min,
        READER_MAX_CHARS_RANGE.max,
      ),
    ),
    blockedWords: words
      .filter((word): word is string => typeof word === 'string' && word.trim() !== '')
      .map((word) => word.trim().toLowerCase().slice(0, READER_WORD_MAX_LENGTH))
      .slice(0, READER_BLOCKED_WORDS_MAX),
  }
}

/**
 * Isi localStorage yang rusak menghasilkan panel yang jalan, bukan layar putih.
 *
 * Aturannya sama dengan `validateConfig` untuk config game: apa pun yang tidak berbentuk
 * diganti bawaannya, dan sisanya dipertahankan. Rule yang hilang selalu kembali — daftar
 * alert berukuran tetap empat, jadi form-nya tidak pernah kehilangan barisnya.
 */
export function normalizeMedia(raw: unknown): MediaState {
  const source = (raw !== null && typeof raw === 'object' ? raw : {}) as Partial<MediaState>
  const storedCues = Array.isArray(source.cues) ? source.cues : []
  const storedAlerts = Array.isArray(source.alerts) ? source.alerts : []

  return {
    cues: storedCues
      .filter(isCatalogEntry)
      .map((entry) => ({ ...entry, volume: clamp01(entry.volume) })),
    alerts: DEFAULT_ALERTS.map((fallback) => {
      const found = storedAlerts.find(
        (rule) => (rule as Partial<AlertRule>)?.kind === fallback.kind,
      )
      return isAlertRule(found) ? { ...found, kind: fallback.kind } : { ...fallback }
    }),
    reader: normalizeReader(source.reader),
    musicVolume: clamp01(source.musicVolume),
  }
}

export function loadMedia(store: LocalStore): MediaState {
  return normalizeMedia(store.read<unknown>(MEDIA_KEY, null))
}

export function saveMedia(store: LocalStore, state: MediaState): void {
  store.write(MEDIA_KEY, state)
}
