/**
 * Kanal state antar-tab: tab pemilik engine → tab overlay (§6.1).
 *
 * Kanal ini sengaja bodoh. Ia tidak tahu apa itu snapshot, roster, atau game — hanya
 * topik dan payload. Itulah yang membuatnya bisa dipakai game kedua tanpa perubahan.
 */

export interface SignalMessage {
  topic: string
  payload: unknown
}

export type SignalListener = (message: SignalMessage) => void

export interface BroadcastLike {
  postMessage(data: unknown): void
  close(): void
  onmessage: ((event: { data: unknown }) => void) | null
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Payload yang tidak selamat lewat JSON — mis. Float32Array — melewati codec ini. */
export interface TopicCodec {
  toJson(payload: unknown): unknown
  fromJson(raw: unknown): unknown
}

export interface SignalChannelOptions {
  name: string
  /** Pabrik BroadcastChannel; kembalikan null untuk memaksa fallback. */
  broadcast?: (name: string) => BroadcastLike | null
  storage?: StorageLike | null
  /** Topik yang dipantau saat mode storage. Tanpa ini, tidak ada yang di-poll. */
  topics?: readonly string[]
  codecs?: Record<string, TopicCodec>
  pollIntervalMs?: number
  schedulePoll?: (fn: () => void, ms: number) => number
  cancelPoll?: (handle: number) => void
  now?: () => number
  onError?: (error: unknown, message: SignalMessage) => void
}

export type SignalChannelMode = 'broadcast' | 'storage' | 'none' | 'ws'

export interface SignalChannel {
  readonly mode: SignalChannelMode
  post(topic: string, payload: unknown): void
  subscribe(listener: SignalListener): () => void
  close(): void
}

/** Req 19 AC5 menyebut angka ini sebagai batas atas, bukan saran. */
export const MAX_POLL_INTERVAL_MS = 1000

export function storageKeyFor(name: string, topic: string): string {
  return `lga:${name}:${topic}`
}

const defaultBroadcast = (name: string): BroadcastLike | null => {
  const ctor = (globalThis as { BroadcastChannel?: new (name: string) => BroadcastLike })
    .BroadcastChannel
  return ctor === undefined ? null : new ctor(name)
}

const defaultStorage = (): StorageLike | null => {
  const storage = (globalThis as { localStorage?: StorageLike }).localStorage
  return storage ?? null
}

interface StoredEnvelope {
  seq: number
  payload: unknown
}

export function createSignalChannel(opts: SignalChannelOptions): SignalChannel {
  const listeners = new Set<SignalListener>()
  const codecs = opts.codecs ?? {}
  const now = opts.now ?? (() => 0)
  const onError = opts.onError ?? (() => {})

  const encode = (topic: string, payload: unknown): unknown =>
    codecs[topic]?.toJson(payload) ?? payload
  const decode = (topic: string, raw: unknown): unknown => codecs[topic]?.fromJson(raw) ?? raw

  /** Satu subscriber yang melempar tidak boleh menjatuhkan yang lain (Req 36 AC4). */
  const emit = (message: SignalMessage): void => {
    for (const listener of [...listeners]) {
      try {
        listener(message)
      } catch (error) {
        onError(error, message)
      }
    }
  }

  const broadcast = (opts.broadcast ?? defaultBroadcast)(opts.name)
  if (broadcast !== null) {
    broadcast.onmessage = (event) => {
      const data = event.data as SignalMessage | null
      if (data === null || typeof data !== 'object' || typeof data.topic !== 'string') return
      emit({ topic: data.topic, payload: data.payload })
    }
    return {
      mode: 'broadcast',
      post: (topic, payload) => broadcast.postMessage({ topic, payload }),
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      close: () => {
        listeners.clear()
        broadcast.onmessage = null
        broadcast.close()
      },
    }
  }

  const storage = opts.storage === undefined ? defaultStorage() : opts.storage
  if (storage === null) {
    return {
      mode: 'none',
      post: () => {},
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      close: () => listeners.clear(),
    }
  }

  const topics = opts.topics ?? []
  const lastSeen = new Map<string, number>()
  let sequence = 0

  const poll = (): void => {
    for (const topic of topics) {
      const raw = storage.getItem(storageKeyFor(opts.name, topic))
      if (raw === null) continue
      let envelope: StoredEnvelope
      try {
        envelope = JSON.parse(raw) as StoredEnvelope
      } catch {
        // Storage rusak diperlakukan seperti tidak ada isinya (Req 21 AC5).
        continue
      }
      if (typeof envelope?.seq !== 'number') continue
      if ((lastSeen.get(topic) ?? -1) >= envelope.seq) continue
      lastSeen.set(topic, envelope.seq)
      emit({ topic, payload: decode(topic, envelope.payload) })
    }
  }

  const schedule = opts.schedulePoll ?? ((fn, ms) => setInterval(fn, ms) as unknown as number)
  const cancel = opts.cancelPoll ?? ((handle) => clearInterval(handle as unknown as NodeJS.Timeout))
  const interval = Math.min(opts.pollIntervalMs ?? MAX_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS)
  const handle = schedule(poll, interval)

  return {
    mode: 'storage',
    post: (topic, payload) => {
      const seq = ++sequence + now()
      // Ditandai sudah dilihat SEBELUM ditulis: tanpa ini, poll berikutnya di tab yang
      // sama akan membacakan kembali pesannya sendiri.
      lastSeen.set(topic, seq)
      storage.setItem(
        storageKeyFor(opts.name, topic),
        JSON.stringify({ seq, payload: encode(topic, payload) }),
      )
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: () => {
      listeners.clear()
      cancel(handle)
    },
  }
}
