import { APP_KEY_HEADER, APP_KEY_QUERY } from '@lga/shared'
import type {
  AnalyticsEvent,
  MatchRecord,
  MatchSummary,
  PlayerProgress,
  PlayerStats,
} from '@lga/shared'
import { serverBaseUrl } from '../server-url.js'

export interface ServerStoreOptions {
  fetch?: typeof fetch
  /** Default `serverBaseUrl()`; kosong berarti origin yang sama. */
  baseUrl?: string
  /** Dipasang sebagai header `x-app-key` bila ada. `null` = server tanpa kunci. */
  appKey?: string | null
  onError?: (error: unknown, context: string) => void
}

/**
 * Statistik lintas sesi, lewat REST ke server.
 *
 * Setiap method menelan kegagalannya dan mengembalikan nilai netral — `null`, `false`,
 * atau array kosong. Ini keputusan mengikat P6: server yang mati tidak boleh terlihat
 * oleh viewer, dan match yang sedang tayang tidak boleh berhenti karena statistiknya
 * gagal tersimpan.
 *
 * Konsekuensinya disadari: hasil satu match bisa hilang bila server mati tepat saat match
 * berakhir. Antrean retry sengaja tidak dibangun di Fase 1 — server dan client hidup-mati
 * bersama di PC yang sama.
 */
export class ServerStore {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly appKey: string | null
  private readonly onError: (error: unknown, context: string) => void

  constructor(opts: ServerStoreOptions = {}) {
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
    this.baseUrl = opts.baseUrl ?? serverBaseUrl()
    this.appKey = opts.appKey ?? null
    this.onError =
      opts.onError ??
      ((error, context) => {
        console.warn(`[ServerStore] ${context}`, error)
      })
  }

  async recordMatch(record: MatchRecord): Promise<number | null> {
    const body = await this.post('/api/matches', record, 'could not store the match result')
    if (body === null) return null
    const matchId = (body as Record<string, unknown>)['matchId']
    return typeof matchId === 'number' ? matchId : null
  }

  /**
   * Delta statistik siaran. `false` berarti ledger menahan angkanya untuk kiriman berikutnya.
   *
   * Satu-satunya method di kelas ini yang nilai baliknya BERARTI: sisanya menelan galat dan
   * mengembalikan nilai netral, sementara di sini "gagal" adalah informasi yang dipakai
   * pemanggilnya untuk tidak membuang data.
   */
  async recordProgress(entries: readonly PlayerProgress[]): Promise<boolean> {
    if (entries.length === 0) return true
    const body = await this.post(
      '/api/players/progress',
      { players: entries },
      'could not send live statistics',
    )
    return body !== null
  }

  /**
   * Kiriman terakhir sebuah sesi, saat tab sedang ditutup.
   *
   * `fetch` yang dimulai pada `pagehide` dibatalkan browser; `sendBeacon` justru dirancang
   * untuk momen ini, dan menutup tab adalah cara paling umum sebuah siaran berakhir. Harganya:
   * ia tidak bisa memasang header, jadi kuncinya ikut di query — jalur yang sama yang sudah
   * dipakai soket WebSocket.
   */
  beaconProgress(entries: readonly PlayerProgress[]): void {
    if (entries.length === 0) return
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return

    const key =
      this.appKey === null || this.appKey === ''
        ? ''
        : `?${APP_KEY_QUERY}=${encodeURIComponent(this.appKey)}`
    const blob = new Blob([JSON.stringify({ players: entries })], { type: 'application/json' })
    navigator.sendBeacon(`${this.baseUrl}/api/players/progress${key}`, blob)
  }

  async sendAnalytics(events: readonly AnalyticsEvent[]): Promise<boolean> {
    if (events.length === 0) return true
    const body = await this.post('/api/analytics', { events }, 'could not send analytics')
    return body !== null
  }

  async topPlayers(limit: number, sort: 'kills' | 'coins' = 'kills'): Promise<PlayerStats[]> {
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}/api/players/top?limit=${limit}&sort=${sort}`,
        { headers: this.headers() },
      )
      if (!response.ok) {
        this.onError(new Error(`HTTP ${response.status}`), 'could not load the leaderboard')
        return []
      }
      const body = (await response.json()) as Record<string, unknown>
      const players = body['players']
      return Array.isArray(players) ? (players as PlayerStats[]) : []
    } catch (error) {
      this.onError(error, 'could not load the leaderboard')
      return []
    }
  }

  /**
   * Riwayat match untuk tab Statistik.
   *
   * Menelan galatnya seperti seluruh method di kelas ini (keputusan mengikat P6): server yang
   * mati muncul sebagai riwayat kosong, bukan sebagai panel yang rusak.
   */
  async recentMatches(limit: number): Promise<MatchSummary[]> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/matches?limit=${limit}`, {
        headers: this.headers(),
      })
      if (!response.ok) {
        this.onError(new Error(`HTTP ${response.status}`), 'could not load the match history')
        return []
      }
      const body = (await response.json()) as Record<string, unknown>
      const rows = body['matches']
      return Array.isArray(rows) ? (rows as MatchSummary[]) : []
    } catch (error) {
      this.onError(error, 'could not load the match history')
      return []
    }
  }

  /**
   * Alamat LAN yang dilaporkan server, untuk link overlay yang benar dari device lain.
   *
   * Menelan galatnya seperti seluruh method di kelas ini: server yang mati muncul sebagai
   * daftar kosong, dan top bar jatuh ke `location.origin` seperti sebelumnya.
   */
  async health(): Promise<string[]> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/health`, {
        headers: this.headers(),
      })
      if (!response.ok) return []
      const body = (await response.json()) as Record<string, unknown>
      const urls = body['lanUrls']
      return Array.isArray(urls) ? (urls as string[]) : []
    } catch (error) {
      this.onError(error, 'could not read the server address list')
      return []
    }
  }

  /** Satu tempat: kunci yang lupa dipasang di satu method akan gagal diam-diam di produksi. */
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.appKey === null || this.appKey === ''
      ? extra
      : { ...extra, [APP_KEY_HEADER]: this.appKey }
  }

  private async post(path: string, payload: unknown, context: string): Promise<unknown | null> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        this.onError(new Error(`HTTP ${response.status}`), context)
        return null
      }
      return await response.json()
    } catch (error) {
      this.onError(error, context)
      return null
    }
  }
}
