import type { ChatMessage } from './chat-message.js'

/** Path WebSocket yang disiarkan server dan didengarkan browser. */
export const WS_PATH = '/ws'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

/**
 * Satu-satunya kebenaran tentang keadaan koneksi TikTok, dihitung di server.
 *
 * Browser tidak pernah menyimpulkan status dari peristiwa yang ia lihat; ia hanya
 * menampilkan objek ini. Itu yang mencegah dashboard dan server berbeda pendapat.
 */
export interface ConnectionStatus {
  state: ConnectionState
  username: string | null
  roomId: string | null
  viewerCount: number
  /** Alasan yang bisa dibaca creator saat state 'failed' (Req 2 AC4). */
  error: string | null
  /** Percobaan sambung ulang ke-berapa. 0 saat tidak sedang menyambung ulang. */
  attempt: number
  /**
   * Kapan koneksi ini PERTAMA berhasil, atau `null` bila belum pernah.
   *
   * Sambung ulang otomatis TIDAK me-reset-nya: putus 20 detik lalu tersambung lagi tetap satu
   * siaran, dan itu yang creator maksud dengan "sudah live berapa lama". Server yang
   * memegangnya, bukan browser, supaya reload tab dashboard tidak memulai jamnya dari nol —
   * dan supaya dashboard di device kedua melihat angka yang sama.
   */
  connectedAtMs: number | null
}

export function idleStatus(): ConnectionStatus {
  return {
    state: 'idle',
    username: null,
    roomId: null,
    viewerCount: 0,
    error: null,
    attempt: 0,
    connectedAtMs: null,
  }
}

/**
 * Muatan WebSocket, selalu server → client.
 *
 * `v` adalah WIRE_VERSION. Penerima membuang pesan dengan `v` tak dikenal alih-alih
 * mencoba menafsirkannya.
 */
export type ServerEvent =
  | { v: number; type: 'status'; status: ConnectionStatus }
  | { v: number; type: 'chat'; message: ChatMessage }
  /** Satu pesan kanal sinyal, diteruskan apa adanya. Server tidak menafsirkan isinya. */
  | { v: number; type: 'signal'; topic: string; payload: unknown }
  /** Berapa overlay jauh yang sedang mendengarkan. Nol berarti relay diam total. */
  | { v: number; type: 'overlays'; count: number }
  /** Frame pertama ke soket overlay: bukti versi disepakati sebelum satu frame biner mengalir. */
  | { v: number; type: 'hello' }

/**
 * Muatan WebSocket dari client ke server. Hanya dashboard yang mengirimnya.
 *
 * Snapshot TIDAK lewat sini: ia frame biner tanpa pembungkus, karena `Float32Array`
 * menuntut penjajaran 4 byte dan satu byte penanda di depan akan memaksa penyalinan
 * seluruh buffer 20 kali per detik.
 */
export type ClientEvent = { v: number; type: 'signal'; topic: string; payload: unknown }

/** Header kunci untuk `/api`. Query `?k=` melayani soket, yang tidak bisa memasang header. */
export const APP_KEY_HEADER = 'x-app-key'
export const APP_KEY_QUERY = 'k'

/** Peran soket, dibaca dari query saat menyambung. Tanpa ini, soket berperan dashboard. */
export const OVERLAY_ROLE_QUERY = 'role'
export const OVERLAY_ROLE = 'overlay'

/** Siapa orang ini. Dipakai jalur match maupun jalur progres. */
export interface PlayerIdentity {
  platform: 'tiktok'
  username: string
  avatarUrl: string | null
}

/**
 * Delta sejak kiriman terakhir — BUKAN total.
 *
 * Ditumpuk `LiveLedger` di client dari event yang memang sudah berupa delta (kematian dan
 * gift), lalu dijumlahkan server ke kolom `players`. Entri bernilai nol tidak pernah dikirim.
 */
export interface PlayerProgress extends PlayerIdentity {
  kills: number
  deaths: number
  giftCoins: number
}

/**
 * Satu baris `match_players`.
 *
 * Tanpa `giftCoins`: `match_players` tidak punya kolomnya, dan koin sepanjang masa ditulis
 * jalur progres (spec Plan 13 §3 — satu kolom, satu penulis).
 */
export interface MatchPlayerRecord extends PlayerIdentity {
  side: 'a' | 'b' | 'c' | 'd'
  kills: number
  deaths: number
}

/**
 * Hasil satu match, dikirim sekali saat match berakhir.
 *
 * Fighter sintetis sudah disaring di client sebelum record ini dibentuk, jadi `players`
 * hanya berisi viewer TikTok sungguhan. `players` kosong bukan error — match yang
 * seluruhnya diisi bot tetap tercatat, hanya tanpa baris match_players.
 */
export interface MatchRecord {
  gameId: string
  startedAtMs: number
  endedAtMs: number
  winnerSide: 'a' | 'b' | 'c' | 'd' | null
  roundsWonA: number
  roundsWonB: number
  totalFighters: number
  players: MatchPlayerRecord[]
}

export interface AnalyticsEvent {
  type: string
  payload: Record<string, unknown>
  atMs: number
}

export interface PlayerStats {
  platform: string
  username: string
  avatarUrl: string | null
  kills: number
  deaths: number
  gamesPlayed: number
  giftCoins: number
}

/**
 * Satu baris riwayat match, dibaca kembali dari database.
 *
 * Nama tim TIDAK ada di sini karena tidak pernah ditulis ke database (spec 7a §2). Yang
 * memasangkan `winnerSide` dengan nama adalah view-model, dari config yang berlaku saat
 * riwayatnya dibuka — dengan konsekuensi yang disadari bahwa creator yang berganti nama tim
 * melihat riwayat lamanya ikut berganti label.
 *
 * `endedAtMs` dan `gameId` sengaja tidak ikut: tidak ada baris yang menampilkan yang pertama,
 * dan registry masih berisi satu game sehingga tidak ada yang perlu disaring.
 */
export interface MatchSummary {
  id: number
  startedAtMs: number
  winnerSide: 'a' | 'b' | null
  roundsWonA: number
  roundsWonB: number
  /** Nullable karena kolomnya nullable, meski `recordMatch` selalu menulisnya. */
  durationMs: number | null
  totalFighters: number
}
