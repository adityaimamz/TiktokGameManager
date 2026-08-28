import type { GameId } from './game-id.js'

export interface GameEntry {
  id: GameId
  /** Nama yang dibaca creator di top bar dan di kartu katalog. */
  label: string
  /** Satu kalimat di kartu katalog: apa yang penonton lakukan, bukan apa isi mesinnya. */
  tagline: string
  /** Label pendek untuk memilah katalog begitu penghuninya lebih dari satu. */
  tags: readonly string[]
  /** Thumbnail landscape kartu katalog. `null` jatuh ke placeholder grid. */
  thumbnail: string | null
}

/**
 * Daftar game yang tersedia (Req 1 AC9, sebagian).
 *
 * Sengaja TIDAK memuat `durations` maupun `rotationOrder`: auto-rotate dan infinite-loop
 * tidak ada di Fase 1 mana pun, jadi tidak ada satu baris kode yang akan membacanya. Record
 * kosong yang tak pernah dibaca bukan bukti bahwa game kedua akan muat — ia hanya bentuk
 * yang belum diuji. Keduanya lahir bersama mekanisme yang membacanya.
 *
 * `tagline` dan `tags` LAIN ceritanya: katalog di `ui/dashboard/Lobby.tsx` membacanya tiap
 * kali halaman itu dibuka, jadi keduanya punya pembaca sejak hari pertama.
 */
export const GAMES: readonly GameEntry[] = [
  {
    id: 'battle-arena',
    label: 'Battle Arena',
    tagline:
      'PvP dua sisi. Penonton bergabung dengan mengetik keyword di chat, dan fighter-nya bertarung otomatis. Like menyembuhkan, gift memicu grow, damage boost, dan ultimate.',
    tags: ['Arena', 'Kompetitif', 'PvP 2 sisi'],
    thumbnail: '/tumbnail/battle-arena-landscape.png',
  },
]

export function gameLabel(id: GameId): string {
  return GAMES.find((entry) => entry.id === id)?.label ?? id
}

/** Entri lengkapnya, atau null kalau id-nya datang dari URL yang salah ketik. */
export function gameById(id: string): GameEntry | null {
  return GAMES.find((entry) => entry.id === id) ?? null
}
