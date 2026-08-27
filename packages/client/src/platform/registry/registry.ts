import type { GameId } from './game-id.js'

export interface GameEntry {
  id: GameId
  /** Nama yang dibaca creator di top bar. */
  label: string
}

/**
 * Daftar game yang tersedia (Req 1 AC9, sebagian).
 *
 * Sengaja TIDAK memuat `durations` maupun `rotationOrder`: auto-rotate dan infinite-loop
 * tidak ada di Fase 1 mana pun, jadi tidak ada satu baris kode yang akan membacanya. Record
 * kosong yang tak pernah dibaca bukan bukti bahwa game kedua akan muat — ia hanya bentuk
 * yang belum diuji. Keduanya lahir bersama mekanisme yang membacanya.
 */
export const GAMES: readonly GameEntry[] = [{ id: 'battle-arena', label: 'Battle Arena' }]

export function gameLabel(id: GameId): string {
  return GAMES.find((entry) => entry.id === id)?.label ?? id
}
