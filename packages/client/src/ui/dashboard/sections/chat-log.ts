import { isSyntheticPlatform } from '@lga/shared'
import type { ChatMessage } from '@lga/shared'

/** Cukup untuk dua menit chat ramai, terlalu kecil untuk tumbuh sepanjang sesi 60 menit. */
export const CHAT_LOG_MAX = 60
export const CHAT_RATE_WINDOW_MS = 60_000

export interface ChatLogEntry {
  id: string
  username: string
  /** Inisial di lingkaran avatar. Viewer sintetis selalu "S". */
  initials: string
  /** Isi komentar; null untuk event yang dijelaskan `meta`. */
  text: string | null
  /** Penjelasan miring untuk like, gift, follow, member, dan share. */
  meta: string | null
  synthetic: boolean
  atMs: number
}

function describeEvent(message: ChatMessage): string | null {
  switch (message.kind) {
    case 'textMessageEvent':
      return null
    case 'likeEvent':
      return `mengirim ${message.likeCount} suka`
    case 'giftEvent':
      return `mengirim ${message.giftCount}× ${message.giftName ?? 'hadiah'}`
    case 'followEvent':
      return 'mulai mengikuti'
    case 'memberEvent':
      return 'bergabung ke live'
    case 'shareEvent':
      return 'membagikan live'
  }
}

export function chatLogEntry(message: ChatMessage): ChatLogEntry {
  const synthetic = isSyntheticPlatform(message.platform)
  const meta = describeEvent(message)

  return {
    id: message.id,
    username: message.username,
    initials: synthetic ? 'S' : message.username.slice(0, 2).toUpperCase(),
    text: meta === null ? message.text : null,
    meta,
    synthetic,
    atMs: message.timestampMs,
  }
}

/** Terbaru di atas, mengikuti arah baca sungai chat. */
export function pushChatLog(list: readonly ChatLogEntry[], entry: ChatLogEntry): ChatLogEntry[] {
  return [entry, ...list].slice(0, CHAT_LOG_MAX)
}

export function pruneTimestamps(timestamps: readonly number[], nowMs: number): number[] {
  const cutoff = nowMs - CHAT_RATE_WINDOW_MS
  return timestamps.filter((at) => at > cutoff)
}

export function chatRateLabel(timestamps: readonly number[], nowMs: number): string {
  const count = pruneTimestamps(timestamps, nowMs).length
  return count === 0 ? 'diam' : `${count} / menit`
}

/** Dua belas ember lima detik, menutupi jendela laju yang sama persis dengan labelnya. */
export const CHAT_RATE_BARS = 12

/**
 * Bentuk satu menit terakhir, dinormalkan ke ember tersibuk.
 *
 * Angka laju menjawab "seramai apa"; bentuknya menjawab "sedang naik atau sudah lewat" —
 * pertanyaan yang justru menentukan kapan creator memancing chat. Relatif, bukan absolut:
 * yang dicari mata adalah lerengnya.
 */
export function chatRateBars(timestamps: readonly number[], nowMs: number): number[] {
  const bucketMs = CHAT_RATE_WINDOW_MS / CHAT_RATE_BARS
  const counts = new Array<number>(CHAT_RATE_BARS).fill(0)

  for (const at of timestamps) {
    const age = nowMs - at
    if (age < 0 || age >= CHAT_RATE_WINDOW_MS) continue
    // Ember terakhir adalah detik-detik terakhir: waktu mengalir ke kanan, arah baca.
    const index = CHAT_RATE_BARS - 1 - Math.floor(age / bucketMs)
    counts[index] = (counts[index] ?? 0) + 1
  }

  const peak = Math.max(...counts)
  return peak === 0 ? counts : counts.map((count) => count / peak)
}
