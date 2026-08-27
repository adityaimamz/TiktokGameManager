import { APP_KEY_QUERY, WIRE_VERSION, WS_PATH, idleStatus, nextDelayMs } from '@lga/shared'
import { serverWsUrl } from '../server-url.js'
import type { ChatMessage, ConnectionStatus, ServerEvent } from '@lga/shared'
import type { ChatSource } from './source.js'

/** Bagian dari `WebSocket` yang benar-benar dipakai — sisanya tidak perlu ada di test. */
export interface SocketLike {
  readonly url: string
  close(): void
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}

export interface TikTokChatSourceOptions {
  url?: string
  /** Dibawa di query, bukan header: soket tidak bisa memasang header. */
  appKey?: string | null
  createSocket?: (url: string) => SocketLike
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  onStatus?: (status: ConnectionStatus) => void
}

function withKey(base: string, appKey: string | null): string {
  if (appKey === null || appKey === '') return base
  return `${base}?${APP_KEY_QUERY}=${encodeURIComponent(appKey)}`
}

/**
 * Chat TikTok sungguhan, dibawa dari server lewat WebSocket.
 *
 * Ia memenuhi `ChatSource` yang sama dengan simulator, jadi `ChatEngine` dan seluruh
 * lapisan sesudahnya tidak bisa membedakan keduanya kecuali dari field `platform` —
 * itulah yang membuat simulator berguna sebagai pengganti yang setara saat mengembangkan.
 *
 * Reconnect di sini memakai `nextDelayMs` yang sama dengan yang dipakai server untuk
 * menyambung ulang ke TikTok. Dua jarak yang berbeda, satu aturan.
 */
export class TikTokChatSource implements ChatSource {
  readonly id = 'tiktok'
  readonly platform = 'tiktok' as const

  private readonly url: string
  private readonly createSocket: (url: string) => SocketLike
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private readonly onStatus: (status: ConnectionStatus) => void

  private socket: SocketLike | null = null
  private emit: ((message: ChatMessage) => void) | null = null
  private retryHandle: unknown = null
  private attempt = 0
  private running = false

  constructor(opts: TikTokChatSourceOptions = {}) {
    this.url = withKey(opts.url ?? serverWsUrl(WS_PATH), opts.appKey ?? null)
    this.createSocket =
      opts.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike)
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = opts.clearTimer ?? ((handle) => clearTimeout(handle as number))
    this.onStatus = opts.onStatus ?? (() => {})
  }

  connect(emit: (message: ChatMessage) => void): void {
    this.emit = emit
    this.running = true
    this.open()
  }

  disconnect(): void {
    this.running = false
    this.emit = null
    if (this.retryHandle !== null) {
      this.clearTimer(this.retryHandle)
      this.retryHandle = null
    }
    const socket = this.socket
    this.socket = null
    socket?.close()
    this.onStatus(idleStatus())
  }

  private open(): void {
    const socket = this.createSocket(this.url)
    this.socket = socket

    socket.onmessage = (event) => {
      if (!this.running || socket !== this.socket) return
      // Pesan yang benar-benar tiba adalah satu-satunya bukti server sehat. Soket yang
      // terbuka lalu langsung ditutup tidak membuktikan apa pun, jadi mereset penghitung
      // di sana akan mengubah backoff menjadi percobaan tiap lima detik selamanya.
      this.attempt = 0
      this.handleFrame(event.data)
    }

    socket.onerror = () => {
      // `onclose` selalu menyusul; menangani keduanya akan menjadwalkan dua reconnect.
    }

    socket.onclose = () => {
      if (!this.running || socket !== this.socket) return
      this.socket = null
      this.scheduleRetry()
    }
  }

  private handleFrame(data: unknown): void {
    if (typeof data !== 'string') return

    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      // Proxy yang salah konfigurasi mengirim HTML lewat soket. Bukan alasan untuk
      // menjatuhkan sumber chat.
      return
    }

    if (typeof parsed !== 'object' || parsed === null) return
    const event = parsed as Partial<ServerEvent>
    if (event.v !== WIRE_VERSION) return

    if (event.type === 'status' && event.status !== undefined) {
      this.onStatus(event.status)
      return
    }
    if (event.type === 'chat' && event.message !== undefined) {
      this.emit?.(event.message)
    }
  }

  private scheduleRetry(): void {
    this.attempt++
    this.retryHandle = this.setTimer(() => {
      this.retryHandle = null
      if (this.running) this.open()
    }, nextDelayMs(this.attempt))
  }
}
