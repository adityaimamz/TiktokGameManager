import { idleStatus, nextDelayMs } from '@lga/shared'
import type { ChatMessage, ConnectionStatus, GiftCatalogEntry } from '@lga/shared'
import type { TikTokClient, TikTokClientFactory } from './client.js'
import { readGiftCatalog, readGiftFromEvent } from './gift-catalog.js'
import { MAPPED_EVENTS, mapTikTokEvent, readViewerCount } from './map-event.js'
import { log } from '../log.js'

export interface TikTokConnectionOptions {
  createClient: TikTokClientFactory
  now: () => number
  /** Diinjeksi supaya backoff bisa diuji tanpa satu detik pun benar-benar berlalu. */
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  onStatus: (status: ConnectionStatus) => void
  onMessage: (message: ChatMessage) => void
  /**
   * Katalog room, tiap kali ia bertambah — dipakai untuk menyimpannya ke database.
   *
   * Opsional karena katalog tetap berguna tanpa penyimpanan apa pun; yang hilang hanya
   * nama, harga, dan ikon gift setelah koneksi ditutup.
   */
  onGifts?: (entries: readonly GiftCatalogEntry[]) => void
}

/**
 * Satu koneksi TikTok Live, berikut seluruh aturan kapan ia menyambung ulang.
 *
 * Ia tidak tahu library mana yang dipakai — hanya `TikTokClient`. Konsekuensinya setiap
 * cabang di sini, termasuk seluruh urutan backoff, diuji tanpa live stream sungguhan.
 *
 * Kegagalan pada percobaan PERTAMA tidak memicu reconnect: username salah atau creator
 * tidak sedang live adalah kesalahan yang perlu dilihat dan diperbaiki manusia, bukan
 * diulang setiap lima detik. Yang memicu backoff hanyalah koneksi yang sudah pernah
 * berhasil lalu putus (Req 2 AC5).
 */
export class TikTokConnection {
  private readonly opts: TikTokConnectionOptions
  private current: ConnectionStatus = idleStatus()
  private client: TikTokClient | null = null
  private retryHandle: unknown = null
  private sequence = 0
  /**
   * Naik tiap `connect()` dan `disconnect()`.
   *
   * Promise `client.connect()` tidak bisa dibatalkan. Tanpa penanda generasi, koneksi
   * lama yang akhirnya berhasil beberapa detik setelah creator berpindah username akan
   * menimpa status koneksi baru — bug yang hanya muncul saat jaringan lambat.
   */
  private generation = 0
  private gifts: GiftCatalogEntry[] = []

  constructor(opts: TikTokConnectionOptions) {
    this.opts = opts
  }

  get status(): ConnectionStatus {
    return { ...this.current }
  }

  /** Katalog room yang sedang tersambung; kosong sebelum ada koneksi yang berhasil. */
  get giftCatalog(): GiftCatalogEntry[] {
    return [...this.gifts]
  }

  async connect(username: string): Promise<ConnectionStatus> {
    this.teardown()
    this.current = { ...idleStatus(), username }
    return this.attempt(username, 0)
  }

  disconnect(): void {
    this.teardown()
    this.current = idleStatus()
    this.emitStatus()
  }

  private async attempt(username: string, attempt: number): Promise<ConnectionStatus> {
    const generation = this.generation
    this.setStatus({
      state: attempt === 0 ? 'connecting' : 'reconnecting',
      username,
      attempt,
      error: null,
    })

    const client = this.opts.createClient(username)
    this.client = client
    this.bind(client, username, generation)

    try {
      const { roomId } = await client.connect()
      if (generation !== this.generation) return this.status
      this.setStatus({ state: 'connected', username, roomId, attempt: 0, error: null })
      void this.loadGifts(client, generation)
    } catch (error) {
      if (generation !== this.generation) return this.status
      const reason = error instanceof Error ? error.message : String(error)
      if (attempt === 0) {
        this.client = null
        this.setStatus({ state: 'failed', username, error: reason, attempt: 0 })
      } else {
        this.scheduleRetry(username, attempt, reason)
      }
    }
    return this.status
  }

  /**
   * Katalog adalah pelengkap, bukan syarat.
   *
   * Kegagalannya tidak boleh menggagalkan koneksi yang sudah berhasil — `/api/gifts`
   * menjawab seed, dan game tetap berjalan penuh.
   */
  private async loadGifts(client: TikTokClient, generation: number): Promise<void> {
    try {
      const payload = await client.fetchGifts()
      if (generation !== this.generation) return
      this.gifts = readGiftCatalog(payload)
      this.opts.onGifts?.(this.gifts)
      log('info', 'room gift catalog loaded', { gifts: this.gifts.length })
    } catch (error) {
      // Dicatat, bukan ditelan: katalog kosong dan katalog yang gagal diambil terlihat
      // sama persis dari dashboard — keduanya jatuh ke GIFT_SEED — jadi tanpa baris ini
      // tidak ada cara tahu mana yang sedang terjadi saat siaran berlangsung.
      log('warn', 'room gift catalog unavailable, falling back to seed', { err: error })
      if (generation === this.generation) this.gifts = []
    }
  }

  private bind(client: TikTokClient, username: string, generation: number): void {
    for (const event of MAPPED_EVENTS) {
      client.on(event, (payload) => {
        // Event dari klien yang sudah dibuang, atau yang tiba sebelum koneksi mapan,
        // dijatuhkan tanpa mengubah state apa pun (Req 2 AC8).
        if (generation !== this.generation) return
        if (this.current.state !== 'connected') return
        // Sebelum pemetaan, dan sengaja tidak peduli apakah pemetaannya menghasilkan pesan:
        // frame tengah sebuah streak combo dibuang oleh mapper, tapi ia tetap menyebut gift
        // yang sah dan katalognya tetap layak belajar dari situ.
        if (event === 'gift') this.noteGift(payload)
        const message = mapTikTokEvent(event, payload, {
          id: `tiktok-${this.opts.now()}-${this.sequence++}`,
          nowMs: this.opts.now(),
        })
        if (message !== null) this.opts.onMessage(message)
      })
    }

    client.on('roomUser', (payload) => {
      if (generation !== this.generation) return
      if (this.current.state !== 'connected') return
      const viewerCount = readViewerCount(payload)
      if (viewerCount !== null) this.setStatus({ viewerCount })
    })

    client.on('disconnected', () => {
      if (generation !== this.generation) return
      if (this.current.state !== 'connected') return
      this.scheduleRetry(username, 0, 'connection lost')
    })
  }

  /**
   * Menyimpan gift yang barusan lewat, kalau ia belum ada di katalog.
   *
   * Dibandingkan tanpa peduli huruf besar-kecil karena `gift/list/` dan payload event
   * tidak selalu sepakat soal itu, dan dua entri bernama sama akan muncul dua kali di
   * pemilih hadiah creator.
   */
  private noteGift(payload: unknown): void {
    const entry = readGiftFromEvent(payload)
    if (entry === null) return
    const key = entry.name.toLowerCase()
    if (this.gifts.some((gift) => gift.name.toLowerCase() === key)) return
    this.gifts = [...this.gifts, entry]
    this.opts.onGifts?.([entry])
  }

  private scheduleRetry(username: string, previousAttempt: number, reason: string): void {
    const attempt = previousAttempt + 1
    this.client = null
    this.setStatus({ state: 'reconnecting', username, attempt, error: reason })
    this.retryHandle = this.opts.setTimer(() => {
      this.retryHandle = null
      void this.attempt(username, attempt)
    }, nextDelayMs(attempt))
  }

  private teardown(): void {
    this.generation++
    if (this.retryHandle !== null) {
      this.opts.clearTimer(this.retryHandle)
      this.retryHandle = null
    }
    this.client?.disconnect()
    this.client = null
    this.gifts = []
  }

  /**
   * Satu-satunya penulis status, dan karena itu satu-satunya tempat jam siaran diisi.
   *
   * Diisi SEKALI, saat sambungan pertama berhasil. Percobaan ulang yang berhasil menemukan
   * nilainya sudah ada dan membiarkannya — itulah yang membuat jam siaran tidak me-restart
   * tiap kali wifi creator berkedip. `connect()` dan `disconnect()` mengosongkannya lagi,
   * gratis, karena keduanya sudah melewati `idleStatus()`.
   */
  private setStatus(patch: Partial<ConnectionStatus>): void {
    const next = { ...this.current, ...patch }
    if (next.state === 'connected' && next.connectedAtMs === null) {
      next.connectedAtMs = this.opts.now()
    }
    this.current = next
    this.emitStatus()
  }

  private emitStatus(): void {
    this.opts.onStatus(this.status)
  }
}
