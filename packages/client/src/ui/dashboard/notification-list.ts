import type { ConnectionState, ConnectionStatus } from '@lga/shared'
import type { MatchState } from '../../games/battle-arena/state-machine.js'

export type NotificationKind = 'alert' | 'connection' | 'error' | 'match'

export interface NotificationEntry {
  id: string
  kind: NotificationKind
  text: string
  atMs: number
  read: boolean
}

/** Ring buang-tertua, pola yang sama dengan `ActionQueue` dan feed Plan 5c. */
export const NOTIFICATION_MAX = 30

/** Di atas ini badge berhenti menghitung: bedanya 12 dan 47 tidak mengubah satu pun tindakan. */
const BADGE_MAX = 9

export function pushNotification(
  list: readonly NotificationEntry[],
  entry: NotificationEntry,
): NotificationEntry[] {
  return [entry, ...list].slice(0, NOTIFICATION_MAX)
}

export function unreadCount(list: readonly NotificationEntry[]): number {
  return list.reduce((total, item) => (item.read ? total : total + 1), 0)
}

/**
 * Daftar yang sama dikembalikan saat tidak ada yang berubah.
 *
 * Membuka dropdown menandai SEMUANYA terbaca — bukan per-baris: badge yang terus menyala
 * karena satu baris di bawah lipatan tidak pernah diklik adalah badge yang creator belajar
 * abaikan. Identitas yang dipertahankan menjaga pembukaan kedua tidak merender ulang apa pun.
 */
export function markAllRead(list: readonly NotificationEntry[]): NotificationEntry[] {
  if (unreadCount(list) === 0) return list as NotificationEntry[]
  return list.map((item) => (item.read ? item : { ...item, read: true }))
}

export function badgeLabel(count: number): string {
  if (count <= 0) return ''
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count)
}

/** Jam lokal, bukan `toLocaleTimeString`: ICU kecil diam-diam mencetak format lain. */
export function timeLabel(atMs: number): string {
  const date = new Date(atMs)
  const hours = String(date.getHours()).padStart(2, '0')
  return `${hours}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * Perubahan koneksi yang layak diberitahukan — dan hanya itu.
 *
 * 'connecting' tidak masuk: creator baru saja menekan tombolnya, dan panel Connection sudah
 * mengatakannya. Notifikasi yang mengulang apa yang sedang ditatap creator adalah kebisingan.
 */
export function connectionNotice(
  previous: ConnectionState,
  status: ConnectionStatus,
): string | null {
  if (previous === status.state) return null

  if (status.state === 'connected') return `Terhubung ke @${status.username ?? 'akun'}`
  if (status.state === 'failed') return status.error ?? 'Koneksi gagal'
  if (status.state === 'reconnecting') return `Menyambung ulang (percobaan ${status.attempt})`
  if (status.state === 'idle' && (previous === 'connected' || previous === 'reconnecting')) {
    return 'Koneksi diputus'
  }
  return null
}

export function matchNotice(state: MatchState): string | null {
  if (state === 'victory') return 'Ronde selesai'
  if (state === 'result') return 'Match selesai'
  return null
}
