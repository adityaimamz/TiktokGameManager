import {
  APP_KEY_QUERY,
  OVERLAY_ROLE,
  OVERLAY_ROLE_QUERY,
  WIRE_VERSION,
  WS_PATH,
  nextDelayMs,
} from '@lga/shared'
import { serverWsUrl } from '../server-url.js'
import type { ClientEvent, ServerEvent } from '@lga/shared'
import type { SignalChannel, SignalListener, SignalMessage } from './channel.js'

/** Bagian dari `WebSocket` yang benar-benar dipakai — sisanya tidak perlu ada di test. */
export interface WsSocketLike {
  binaryType: string
  readonly readyState: number
  send(data: string | ArrayBufferView): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}

export interface WsSignalChannelOptions {
  /**
   * Satu topik yang diangkut sebagai frame biner telanjang; payload-nya wajib
   * `Float32Array`. Diterima sebagai parameter, bukan dituliskan, karena `platform/`
   * tidak boleh tahu game apa pun.
   */
  binaryTopic: string
  /** Default `'dashboard'`. Hanya `'overlay'` yang menerima relay. */
  role?: 'dashboard' | 'overlay'
  appKey?: string | null
  url?: string
  createSocket?: (url: string) => WsSocketLike
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** Berapa overlay jauh yang server lihat. Dashboard menampilkannya di top bar. */
  onOverlays?: (count: number) => void
}

const OPEN = 1

function socketUrl(base: string, role: string, appKey: string | null): string {
  const query = new URLSearchParams()
  if (role === OVERLAY_ROLE) query.set(OVERLAY_ROLE_QUERY, OVERLAY_ROLE)
  if (appKey !== null && appKey !== '') query.set(APP_KEY_QUERY, appKey)
  const suffix = query.toString()
  return suffix === '' ? base : `${base}?${suffix}`
}

/**
 * Kanal sinyal ketiga: menyeberangi jaringan (§2 spec Plan 9).
 *
 * Dua mode lama — `BroadcastChannel` dan polling `localStorage` — keduanya berhenti di
 * batas satu peramban di satu device. Kanal ini tidak mengubah antarmuka `SignalChannel`
 * sedikit pun, jadi tidak ada satu berkas pun di `games/` yang tahu ia ada.
 *
 * Snapshot naik sebagai frame biner TANPA header: `Float32Array` menuntut penjajaran 4
 * byte, dan satu byte penanda di depan akan memaksa penyalinan seluruh buffer 20 kali per
 * detik. Aman karena versinya sudah disepakati lewat JSON sebelum satu frame biner pun
 * mengalir — lihat gerbang `overlays` di bawah.
 *
 * ponytail: relay dikunci 20 Hz. Menurunkannya menuntut alphaFromElapsed menerima interval
 * snapshot yang sebenarnya, bukan TICK_MS — kalau tidak, gerakannya tersendat, bukan hemat.
 */
export function createWsSignalChannel(opts: WsSignalChannelOptions): SignalChannel {
  const listeners = new Set<SignalListener>()
  const createSocket = opts.createSocket ?? ((url) => new WebSocket(url) as unknown as WsSocketLike)
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((handle) => clearTimeout(handle as number))
  const onOverlays = opts.onOverlays ?? (() => {})
  const url = socketUrl(
    opts.url ?? serverWsUrl(WS_PATH),
    opts.role ?? 'dashboard',
    opts.appKey ?? null,
  )

  let socket: WsSocketLike | null = null
  let retryHandle: unknown = null
  let attempt = 0
  let running = true
  /**
   * Gerbang kirim, dan satu-satunya gerbang yang ada.
   *
   * Nol berarti relay membuang setiap post tanpa mengirim satu byte pun — OBS di PC yang
   * sama tidak boleh membuat creator membayar upstream (§4). Angkanya hanya bisa datang
   * dari frame JSON yang versinya cocok, jadi ia sekaligus bukti kedua pihak sepakat versi.
   */
  let overlays = 0

  const emit = (message: SignalMessage): void => {
    for (const listener of [...listeners]) listener(message)
  }

  const handleJson = (raw: string): void => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Proxy yang salah konfigurasi mengirim HTML lewat soket. Bukan alasan menyerah.
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const event = parsed as Partial<ServerEvent>
    if (event.v !== WIRE_VERSION) {
      // Versi asing: berhenti selamanya. Menyambung ulang hanya mengulangi kegagalan.
      running = false
      overlays = 0
      const live = socket
      socket = null
      live?.close()
      return
    }
    if (event.type === 'overlays' && typeof event.count === 'number') {
      overlays = event.count
      onOverlays(event.count)
      return
    }
    if (event.type === 'signal' && typeof event.topic === 'string') {
      emit({ topic: event.topic, payload: event.payload })
    }
  }

  const open = (): void => {
    const next = createSocket(url)
    socket = next
    next.binaryType = 'arraybuffer'

    next.onmessage = (event) => {
      if (!running || next !== socket) return
      // Pesan yang benar-benar tiba adalah satu-satunya bukti server sehat — aturan yang
      // sama dengan TikTokChatSource, dan alasan yang sama: soket yang terbuka lalu
      // langsung ditutup tidak membuktikan apa pun.
      attempt = 0
      if (typeof event.data === 'string') {
        handleJson(event.data)
        return
      }
      if (event.data instanceof ArrayBuffer) {
        emit({ topic: opts.binaryTopic, payload: new Float32Array(event.data) })
      }
    }

    next.onerror = () => {
      // `onclose` selalu menyusul; menangani keduanya menjadwalkan dua reconnect.
    }

    next.onclose = () => {
      if (!running || next !== socket) return
      socket = null
      overlays = 0
      attempt++
      retryHandle = setTimer(() => {
        retryHandle = null
        if (running) open()
      }, nextDelayMs(attempt))
    }
  }

  open()

  return {
    mode: 'ws',
    post: (topic, payload) => {
      const live = socket
      if (overlays === 0 || live === null || live.readyState !== OPEN) return
      try {
        if (topic === opts.binaryTopic) {
          if (payload instanceof Float32Array) live.send(payload)
          return
        }
        const event: ClientEvent = { v: WIRE_VERSION, type: 'signal', topic, payload }
        live.send(JSON.stringify(event))
      } catch {
        // Soket yang menolak kiriman tidak boleh menjatuhkan tick yang memanggilnya.
        // `onclose` yang menyusul akan menjadwalkan sambungan ulang.
        overlays = 0
      }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => {
      running = false
      listeners.clear()
      if (retryHandle !== null) {
        clearTimer(retryHandle)
        retryHandle = null
      }
      const live = socket
      socket = null
      live?.close()
    },
  }
}
