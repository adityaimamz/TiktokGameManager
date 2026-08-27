/**
 * Media non-game yang tampil dan berbunyi di overlay: soundboard dan alert.
 *
 * Lapisan ini tidak tahu game apa pun sedang berjalan. Ia hanya tahu ada berkas yang harus
 * diputar atau digambar, dan ada aturan yang menentukan kapan.
 */

export type MediaKind = 'sound' | 'gif' | 'music'
export const MEDIA_KINDS: readonly MediaKind[] = ['sound', 'gif', 'music']

/**
 * Satu pelepasan media, lengkap dan swasembada.
 *
 * Yang dikirim adalah cue UTUH, bukan id yang harus dicari di sebuah katalog. Itulah yang
 * membuat overlay tidak perlu menyimpan katalog, tidak perlu memulihkannya saat reload, dan
 * tidak perlu tahu apa itu soundboard.
 *
 * `url: null` berarti "hentikan kanal musik" — HANYA sah untuk `kind: 'music'`. Untuk `gif`
 * ia berarti banner tanpa gambar, yang memang terjadi saat alert menunjuk cue yang sudah
 * dihapus creator.
 */
export interface MediaCue {
  /** Unik per PELEPASAN, bukan id katalog. Overlay memakainya sebagai key antrean. */
  id: string
  kind: MediaKind
  url: string | null
  /** 0–1. */
  volume: number
  /** Isi banner. Kosong berarti tidak ada tulisan — mis. GIF polos yang diklik creator. */
  text: string
  avatarUrl: string | null
}

/** Satu tombol di kisi soundboard. Hidup di localStorage dashboard, tidak pernah menyeberang. */
export interface CatalogEntry {
  id: string
  kind: MediaKind
  label: string
  url: string
  volume: number
}

export type AlertKind = 'gift' | 'likes' | 'follow' | 'share'
export const ALERT_KINDS: readonly AlertKind[] = ['gift', 'likes', 'follow', 'share']

/**
 * Satu aturan alert.
 *
 * Bentuknya seragam untuk keempat kind — union ber-payload akan lebih rapi di kertas dan
 * memaksa empat cabang form di layar. Pola datar yang sama sudah dipakai `ChatMessage`.
 */
export interface AlertRule {
  kind: AlertKind
  enabled: boolean
  /** Minimum koin untuk `gift`, tiap-N-like untuk `likes`, diabaikan untuk dua sisanya. */
  threshold: number
  cueId: string | null
  /** Mendukung `{user}` dan `{value}`. */
  text: string
}

export const DEFAULT_ALERTS: readonly AlertRule[] = [
  { kind: 'gift', enabled: true, threshold: 500, cueId: null, text: '{user} mengirim {value}!' },
  { kind: 'likes', enabled: true, threshold: 10000, cueId: null, text: '{value} like tercapai!' },
  { kind: 'follow', enabled: true, threshold: 0, cueId: null, text: '{user} baru follow!' },
  { kind: 'share', enabled: false, threshold: 0, cueId: null, text: '{user} membagikan live ini!' },
]

export const ALERT_LABEL: Record<AlertKind, string> = {
  gift: 'Gift besar',
  likes: 'Milestone like',
  follow: 'Follower baru',
  share: 'Live dibagikan',
}

/**
 * Rentang untuk NumberField di panel Alerts; keduanya hidup di dalam rule, bukan di config.
 *
 * Bentuknya cocok SECARA STRUKTURAL dengan `NumericRange`, dan memang harus begitu: tipe itu
 * tinggal di `games/battle-arena/config`, dan `platform/` tidak boleh mengimpor dari `games/`.
 */
export const ALERT_GIFT_COINS_RANGE = { min: 1, max: 1_000_000, integer: true }
export const ALERT_LIKES_RANGE = { min: 100, max: 1_000_000, integer: true }

/** Cue yang dilepas saat creator menekan tombol katalog: media tanpa tulisan. */
export function cueFromEntry(entry: CatalogEntry, id: string): MediaCue {
  return { id, kind: entry.kind, url: entry.url, volume: entry.volume, text: '', avatarUrl: null }
}

export function stopMusicCue(id: string): MediaCue {
  return { id, kind: 'music', url: null, volume: 0, text: '', avatarUrl: null }
}
