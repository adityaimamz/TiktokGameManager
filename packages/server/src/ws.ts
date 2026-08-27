import { WIRE_VERSION } from '@lga/shared'
import type { ChatMessage, ConnectionStatus, ServerEvent } from '@lga/shared'
import { log } from './log.js'

/** Bagian dari `WebSocket` yang benar-benar dipakai — sisanya tidak perlu ada di test. */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
}

/** Nilai `readyState` untuk soket yang siap menerima kiriman. */
const OPEN = 1

export interface WsHubOptions {
  getStatus: () => ConnectionStatus
  /**
   * Berapa overlay jauh yang terhubung. Default 0 — test yang tidak peduli tidak perlu
   * menyebutkannya, dan dashboard yang dimuat ulang di tengah siaran tetap langsung tahu
   * angkanya tanpa menunggu perubahan berikutnya.
   */
  getOverlays?: () => number
  /** Default: satu baris log JSON bertingkat warn. */
  onDropped?: (error: unknown) => void
}

/**
 * Kumpulan browser yang sedang mendengarkan, dan satu-satunya jalan keluar ke sana.
 *
 * Browser yang baru terhubung langsung menerima status terkini, jadi ia tidak perlu
 * memanggil `GET /api/chat/status` saat startup dan tidak pernah menampilkan "idle"
 * sesaat padahal koneksi sudah hidup.
 *
 * Soket yang melempar saat dikirimi dilepas dari kumpulan alih-alih menjatuhkan siaran
 * ke soket lain (Req 36 AC4).
 */
export class WsHub {
  private readonly sockets = new Set<SocketLike>()
  private readonly getStatus: () => ConnectionStatus
  private readonly getOverlays: () => number
  private readonly onDropped: (error: unknown) => void

  constructor(opts: WsHubOptions) {
    this.getStatus = opts.getStatus
    this.getOverlays = opts.getOverlays ?? (() => 0)
    this.onDropped =
      opts.onDropped ??
      ((error) => {
        log('warn', 'dropping a socket that failed to receive', { err: error })
      })
  }

  get size(): number {
    return this.sockets.size
  }

  add(socket: SocketLike): void {
    this.sockets.add(socket)
    this.send(socket, { v: WIRE_VERSION, type: 'status', status: this.getStatus() })
    this.send(socket, { v: WIRE_VERSION, type: 'overlays', count: this.getOverlays() })
  }

  remove(socket: SocketLike): void {
    this.sockets.delete(socket)
  }

  broadcastStatus(status: ConnectionStatus): void {
    this.broadcast({ v: WIRE_VERSION, type: 'status', status })
  }

  broadcastChat(message: ChatMessage): void {
    this.broadcast({ v: WIRE_VERSION, type: 'chat', message })
  }

  broadcastOverlays(count: number): void {
    this.broadcast({ v: WIRE_VERSION, type: 'overlays', count })
  }

  private broadcast(event: ServerEvent): void {
    // Salin dulu: `send` yang gagal menghapus anggota, dan menghapus saat iterasi
    // berlangsung membuat sisa penerima terlewat.
    for (const socket of [...this.sockets]) this.send(socket, event)
  }

  private send(socket: SocketLike, event: ServerEvent): void {
    if (socket.readyState !== OPEN) return
    try {
      socket.send(JSON.stringify(event))
    } catch (error) {
      this.sockets.delete(socket)
      this.onDropped(error)
    }
  }
}
