import { isSyntheticPlatform } from '@lga/shared'
import type { ChatMessage } from '@lga/shared'

/**
 * Satu baris per ORANG, bukan per event — itu sebabnya batasnya berbeda dari CHAT_LOG_MAX.
 * Lima puluh baris sudah lebih panjang dari yang pernah digulir creator di tengah siaran.
 */
export const GIFTERS_MAX = 50

export interface GifterEntry {
  username: string
  /** Inisial di lingkaran avatar. Viewer sintetis selalu "S", sama dengan chat log. */
  initials: string
  lastGiftName: string
  lastGiftCount: number
  /** Koin kumulatif sepanjang sesi dashboard ini. */
  coins: number
  lastGiftAtMs: number
  synthetic: boolean
}

/**
 * Menumpuk satu event gift ke dalam daftar.
 *
 * Mencatat SEMUA gift, termasuk dari viewer yang belum punya fighter — merekalah yang
 * paling ingin dilihat creator, karena mereka yang belum ikut bermain. `Fighter.giftCoins`
 * sengaja hanya mencatat peserta; ia memberi makan kartu HUD, bukan panel ini.
 */
export function pushGifter(list: readonly GifterEntry[], message: ChatMessage): GifterEntry[] {
  if (message.kind !== 'giftEvent') return [...list]

  const synthetic = isSyntheticPlatform(message.platform)
  const existing = list.find((entry) => entry.username === message.username)
  const entry: GifterEntry = {
    username: message.username,
    initials: synthetic ? 'S' : message.username.slice(0, 2).toUpperCase(),
    lastGiftName: message.giftName ?? 'hadiah',
    lastGiftCount: Math.max(1, message.giftCount),
    coins: (existing?.coins ?? 0) + Math.max(0, message.giftCoins),
    lastGiftAtMs: message.timestampMs,
    synthetic,
  }

  const others = list.filter((other) => other.username !== message.username)
  return [...others, entry]
    .sort((left, right) => right.coins - left.coins || right.lastGiftAtMs - left.lastGiftAtMs)
    .slice(0, GIFTERS_MAX)
}

/** Dihitung saat render dari `lastGiftAtMs`, bukan disimpan sebagai durasi yang perlu di-tick. */
export function sinceLabel(atMs: number, nowMs: number): string {
  const elapsed = Math.max(0, nowMs - atMs)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} mnt`
  return `${Math.floor(minutes / 60)} jam`
}
