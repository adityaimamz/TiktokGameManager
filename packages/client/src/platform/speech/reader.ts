import type { ChatMessage } from '@lga/shared'
import type { ReaderSettings } from './settings.js'

export interface SpeechRequest {
  /** Unik per PELEPASAN, dari pencacah. Adapter memakainya sebagai key. */
  id: string
  /** Kalimat final yang diucapkan, sudah dirakit dan dipotong. */
  text: string
}

export interface CommentReader {
  /** Ucapan yang harus dilepas, atau null bila komentar ini tidak dibacakan. */
  onMessage(message: ChatMessage): SpeechRequest | null
}

/** Tautan dibuang, bukan dieja: "h-t-t-p-titik-dua" tidak berarti apa-apa bagi pendengar. */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi

export function stripUrls(text: string): string {
  return text.replace(URL_PATTERN, ' ').replace(/\s+/g, ' ').trim()
}

export function isBlocked(text: string, words: readonly string[]): boolean {
  const haystack = text.toLowerCase()
  return words.some((word) => {
    const needle = word.trim().toLowerCase()
    return needle !== '' && haystack.includes(needle)
  })
}

/**
 * Chat masuk, ucapan keluar.
 *
 * Tanpa `Date.now` dan tanpa `Math.random`: id datang dari pencacah, dan tidak ada satu pun
 * keputusan di sini yang bergantung waktu atau DOM. Bentuknya sengaja kembar dengan
 * `createAlertWatcher` — satu pola untuk dua konsumen chat berarti satu tempat memperbaiki
 * bug yang sama.
 */
export function createCommentReader(opts: { getSettings: () => ReaderSettings }): CommentReader {
  let sequence = 0

  return {
    onMessage(message) {
      const settings = opts.getSettings()
      if (!settings.enabled) return null
      // Gift, follow, dan share sudah punya banner alert sendiri sejak Plan 7b. Dua
      // pengumuman untuk satu kejadian saling menimpa, bukan saling menguatkan.
      if (message.kind !== 'textMessageEvent') return null

      const cleaned = stripUrls(message.text)
      if (cleaned === '') return null

      // Sebelum dipotong, supaya potongan tidak pernah menyembunyikan kata terlarang di
      // ekornya. Username TIDAK ikut diperiksa: ia tidak lagi dibacakan (lihat di bawah),
      // jadi kata terlarang di dalamnya tidak pernah sampai ke pendengar.
      if (isBlocked(cleaned, settings.blockedWords)) return null

      // Hanya isi komentarnya, bukan "{username} bilang ...": nama penonton menambah durasi
      // bacaan tanpa menambah informasi, dan creator yang membaca komentarnya sendiri di
      // layar chat tidak butuh nama diulang lewat suara.
      return {
        id: `speech-${sequence++}`,
        text: cleaned.slice(0, settings.maxChars),
      }
    },
  }
}
