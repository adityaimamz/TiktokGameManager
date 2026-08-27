/**
 * Setelan Comment Reader.
 *
 * Ia tinggal di `platform/` karena tidak satu pun angkanya milik sebuah game — dan tidak
 * satu pun menyentuh DOM. Yang tahu soal `speechSynthesis` hanya adapter di `ui/speech/`.
 */
export interface ReaderSettings {
  enabled: boolean
  /** `voiceURI` pilihan creator; null berarti "voice bawaan browser". */
  voiceUri: string | null
  rate: number
  volume: number
  /** Batas panjang KOMENTAR, bukan panjang kalimat yang diucapkan. */
  maxChars: number
  /** Sudah lowercase dan sudah dipangkas; dibandingkan sebagai substring. */
  blockedWords: string[]
}

/**
 * Bentuknya cocok SECARA STRUKTURAL dengan `NumericRange`, dan memang harus begitu: tipe itu
 * tinggal di `games/battle-arena/config`, dan `platform/` tidak boleh mengimpor dari `games/`.
 * Alasan yang sama sudah dipakai `ALERT_GIFT_COINS_RANGE` di Plan 7b.
 */
export const READER_RATE_RANGE = { min: 0.5, max: 2, integer: false }
export const READER_VOLUME_RANGE = { min: 0, max: 1, integer: false }
export const READER_MAX_CHARS_RANGE = { min: 20, max: 300, integer: true }

/** Cukup untuk daftar umpatan yang wajar, dan tetap muat di localStorage. */
export const READER_BLOCKED_WORDS_MAX = 40
export const READER_WORD_MAX_LENGTH = 24

/**
 * Lahir MATI, dan itu disengaja.
 *
 * Membacakan setiap komentar penonton ke siaran adalah keputusan yang harus diambil creator
 * sadar-sadar, bukan sesuatu yang menyala sendiri saat dashboard pertama kali dibuka.
 */
export const DEFAULT_READER: ReaderSettings = {
  enabled: false,
  voiceUri: null,
  rate: 1,
  volume: 1,
  maxChars: 120,
  blockedWords: [],
}
