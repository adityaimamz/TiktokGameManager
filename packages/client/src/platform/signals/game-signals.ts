import type { SignalChannel, StorageLike, TopicCodec } from './channel.js'
import type { MediaCue } from '../media/cues.js'

export const SNAPSHOT_TOPIC = 'snapshot'
export const ROSTER_TOPIC = 'roster'
export const CONFIG_TOPIC = 'config'
export const FEED_TOPIC = 'feed'
export const MEDIA_TOPIC = 'media'

export const SIGNAL_TOPICS: readonly string[] = [
  SNAPSHOT_TOPIC,
  ROSTER_TOPIC,
  CONFIG_TOPIC,
  FEED_TOPIC,
  MEDIA_TOPIC,
]

/** Menulis 20 snapshot per detik ke localStorage akan membekukan tab. */
export const SNAPSHOT_PERSIST_DEBOUNCE_MS = 500

export const float32Codec: TopicCodec = {
  toJson: (payload) => Array.from(payload as Float32Array),
  fromJson: (raw) => Float32Array.from((raw as number[]) ?? []),
}

export const signalCodecs: Record<string, TopicCodec> = { [SNAPSHOT_TOPIC]: float32Codec }

export interface GameSignalsOptions {
  channel: SignalChannel
  storage?: StorageLike | null
  /** Awalan key penyimpanan snapshot terakhir. Default `lga:last`. */
  storagePrefix?: string
  now: () => number
  debounceMs?: number
}

/**
 * State bersama antara tab pemilik engine dan tab overlay.
 *
 * Tiga parameter tipe menjaga lapisan platform tetap buta terhadap game: ia mengangkut
 * roster, config, dan entri feed tanpa pernah tahu bentuknya.
 */
export class GameSignals<TRoster = unknown, TConfig = unknown, TFeed = unknown> {
  private readonly channel: SignalChannel
  private readonly storage: StorageLike | null
  private readonly prefix: string
  private readonly now: () => number
  private readonly debounceMs: number
  private readonly unsubscribers: (() => void)[] = []

  private lastPersistAtMs = Number.NEGATIVE_INFINITY
  private pendingSnapshot: Float32Array | null = null

  constructor(opts: GameSignalsOptions) {
    this.channel = opts.channel
    this.storage = opts.storage ?? null
    this.prefix = opts.storagePrefix ?? 'lga:last'
    this.now = opts.now
    this.debounceMs = opts.debounceMs ?? SNAPSHOT_PERSIST_DEBOUNCE_MS
  }

  publishSnapshot(buffer: Float32Array): void {
    this.channel.post(SNAPSHOT_TOPIC, buffer)
    this.pendingSnapshot = buffer
    const now = this.now()
    if (now - this.lastPersistAtMs < this.debounceMs) return
    this.lastPersistAtMs = now
    this.flush()
  }

  publishRoster(roster: TRoster): void {
    this.channel.post(ROSTER_TOPIC, roster)
    this.persist(ROSTER_TOPIC, roster)
  }

  publishConfig(config: TConfig): void {
    this.channel.post(CONFIG_TOPIC, config)
    this.persist(CONFIG_TOPIC, config)
  }

  /** Entri feed tidak dipersistensikan: kill lima menit lalu tidak layak dipulihkan. */
  publishFeed(entry: TFeed): void {
    this.channel.post(FEED_TOPIC, entry)
  }

  /**
   * Cue soundboard dan alert. Tidak dipersistensi, dengan alasan yang sama seperti feed.
   *
   * `MediaCue` bertipe konkret, bukan parameter tipe keempat: ketiga yang sudah ada generik
   * karena bentuknya milik game, sementara media bukan milik game mana pun.
   */
  publishMedia(cue: MediaCue): void {
    this.channel.post(MEDIA_TOPIC, cue)
  }

  onSnapshot(handler: (buffer: Float32Array) => void): () => void {
    return this.on(SNAPSHOT_TOPIC, (payload) => handler(payload as Float32Array))
  }

  onRoster(handler: (roster: TRoster) => void): () => void {
    return this.on(ROSTER_TOPIC, (payload) => handler(payload as TRoster))
  }

  onConfig(handler: (config: TConfig) => void): () => void {
    return this.on(CONFIG_TOPIC, (payload) => handler(payload as TConfig))
  }

  onFeed(handler: (entry: TFeed) => void): () => void {
    return this.on(FEED_TOPIC, (payload) => handler(payload as TFeed))
  }

  onMedia(handler: (cue: MediaCue) => void): () => void {
    return this.on(MEDIA_TOPIC, (payload) => handler(payload as MediaCue))
  }

  /** Req 19 AC4: yang ditampilkan overlay sebelum pesan live pertama tiba. */
  restoreLast(): { snapshot: Float32Array | null; roster: TRoster | null; config: TConfig | null } {
    const snapshot = this.read<number[]>(SNAPSHOT_TOPIC)
    return {
      snapshot: snapshot === null ? null : Float32Array.from(snapshot),
      roster: this.read<TRoster>(ROSTER_TOPIC),
      config: this.read<TConfig>(CONFIG_TOPIC),
    }
  }

  /** Menulis snapshot yang sedang ditahan debounce. Dipanggil sebelum tab ditutup. */
  flush(): void {
    if (this.pendingSnapshot === null) return
    this.persist(SNAPSHOT_TOPIC, Array.from(this.pendingSnapshot))
    this.pendingSnapshot = null
  }

  close(): void {
    for (const off of this.unsubscribers) off()
    this.unsubscribers.length = 0
    this.channel.close()
  }

  private on(topic: string, handler: (payload: unknown) => void): () => void {
    const off = this.channel.subscribe((message) => {
      if (message.topic === topic) handler(message.payload)
    })
    this.unsubscribers.push(off)
    return off
  }

  private persist(topic: string, value: unknown): void {
    if (this.storage === null) return
    try {
      this.storage.setItem(`${this.prefix}:${topic}`, JSON.stringify(value))
    } catch {
      // Kuota penuh atau storage diblokir: game tetap jalan, hanya pemulihan yang hilang.
    }
  }

  private read<T>(topic: string): T | null {
    if (this.storage === null) return null
    const raw = this.storage.getItem(`${this.prefix}:${topic}`)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }
}
