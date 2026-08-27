import { WIRE_VERSION } from '@lga/shared'
import type { ClientEvent, ServerEvent } from '@lga/shared'

/** Bagian dari `WebSocket` yang benar-benar dipakai — sisanya tidak perlu ada di test. */
export interface OverlaySocket {
  readonly readyState: number
  send(data: string | Buffer): void
}

/** Nilai `readyState` untuk soket yang siap menerima kiriman. */
const OPEN = 1

/**
 * Topik JSON yang ditahan untuk soket overlay berikutnya.
 *
 * `snapshot` tidak ada di sini karena ia frame biner, ditahan terpisah. `feed` dan `media`
 * tidak ada karena keduanya KEJADIAN: memutar ulang kill feed sepuluh menit lalu itu
 * berbohong, dan callout gift lama akan berbunyi lagi di tengah siaran (§6 spec).
 *
 * Ini satu-satunya tempat server menafsirkan nama topik. Ia tidak pernah tahu bentuk
 * isinya, dan itu yang menjaganya tetap buta terhadap game.
 */
export const REPLAYED_TOPICS: readonly string[] = ['roster', 'config']

export interface SignalHubOptions {
  /** Dipanggil tiap jumlah overlay berubah. Dashboard menampilkannya di top bar. */
  onCount?: (count: number) => void
  /** Default: `console.warn`. */
  onDropped?: (error: unknown) => void
}

/**
 * Kumpulan overlay jauh, dan memori terakhir yang mereka butuhkan saat menyambung.
 *
 * Terpisah dari `WsHub` dengan sengaja: dua kumpulan soket, dua tanggung jawab, tidak ada
 * `if (role === …)` yang bercabang di tengah siaran. Overlay tidak butuh chat; dashboard
 * tidak butuh snapshot balik dari server.
 */
export class SignalHub {
  private readonly sockets = new Set<OverlaySocket>()
  private readonly retained = new Map<string, string>()
  private lastSnapshot: Buffer | null = null
  private readonly onCount: (count: number) => void
  private readonly onDropped: (error: unknown) => void

  constructor(opts: SignalHubOptions = {}) {
    this.onCount = opts.onCount ?? (() => {})
    this.onDropped =
      opts.onDropped ??
      ((error) => {
        console.warn('[SignalHub] dropping an overlay socket that failed to receive', error)
      })
  }

  get size(): number {
    return this.sockets.size
  }

  add(socket: OverlaySocket): void {
    this.sockets.add(socket)
    this.send(socket, JSON.stringify({ v: WIRE_VERSION, type: 'hello' } satisfies ServerEvent))
    for (const frame of this.retained.values()) this.send(socket, frame)
    if (this.lastSnapshot !== null) this.send(socket, this.lastSnapshot)
    this.onCount(this.sockets.size)
  }

  remove(socket: OverlaySocket): void {
    if (this.sockets.delete(socket)) this.onCount(this.sockets.size)
  }

  relaySignal(topic: string, payload: unknown): void {
    const frame = JSON.stringify({
      v: WIRE_VERSION,
      type: 'signal',
      topic,
      payload,
    } satisfies ServerEvent)
    if (REPLAYED_TOPICS.includes(topic)) this.retained.set(topic, frame)
    this.broadcast(frame)
  }

  relaySnapshot(buffer: Buffer): void {
    // Disalin, tidak ditahan langsung: `ws` menyerahkan view ke buffer yang dipakai ulang,
    // jadi menahannya apa adanya berarti menahan byte yang frame berikutnya timpa.
    const copy = Buffer.from(buffer)
    this.lastSnapshot = copy
    this.broadcast(copy)
  }

  private broadcast(frame: string | Buffer): void {
    // Salin dulu: `send` yang gagal menghapus anggota, dan menghapus saat iterasi
    // berlangsung membuat sisa penerima terlewat.
    for (const socket of [...this.sockets]) this.send(socket, frame)
  }

  private send(socket: OverlaySocket, frame: string | Buffer): void {
    if (socket.readyState !== OPEN) return
    try {
      socket.send(frame)
    } catch (error) {
      this.sockets.delete(socket)
      this.onDropped(error)
    }
  }
}

/**
 * Frame naik dari dashboard, dibaca seketat mungkin.
 *
 * Server tidak menafsirkan `topic` maupun `payload` — ia hanya memastikan bentuk luarnya
 * benar dan versinya cocok, lalu meneruskannya. Itu yang menjaga `packages/server` tetap
 * buta terhadap game.
 */
export function readClientSignal(data: unknown): { topic: string; payload: unknown } | null {
  if (typeof data !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const event = parsed as Partial<ClientEvent>
  if (event.v !== WIRE_VERSION || event.type !== 'signal') return null
  if (typeof event.topic !== 'string') return null
  return { topic: event.topic, payload: event.payload }
}
