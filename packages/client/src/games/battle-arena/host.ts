import type { Clock } from '../../framework/clock.js'
import type { Effect } from '../../framework/effects/pool.js'
import type { GameSignals } from '../../platform/signals/index.js'
import { defaultConfig } from './config/index.js'
import type { BattleArenaConfig } from './config/index.js'
import { BattleArenaEngine } from './engine.js'
import type { RosterFiller } from './engine.js'
import type { EngineEvent } from './events.js'
import { feedEntryFromEvent } from './renderer/hud/feed.js'
import type { FeedEntry } from './renderer/hud/feed.js'
import { RosterPublisher, SnapshotWriter } from './snapshot.js'
import type { RosterEntry, RosterPayload, SessionGifter } from './snapshot.js'
import type { MatchState } from './state-machine.js'

export type BattleArenaSignals = GameSignals<RosterPayload, BattleArenaConfig, FeedEntry>

export interface BattleArenaHostOptions {
  clock: Clock
  signals: BattleArenaSignals
  seed?: number
  config?: BattleArenaConfig
  roster?: RosterFiller
  onEvent?: (event: EngineEvent) => void
  onEffect?: (e: Effect) => void
}

/**
 * Pemilik simulasi (§6.1).
 *
 * Tab yang memegang host inilah yang menjalankan game; halaman overlay hanya menerima
 * siarannya. Menutup tab ini menghentikan pertandingan — konsekuensi yang harus
 * diketahui creator, dan yang dijaga peringatan beforeunload di Plan 4.
 */
export class BattleArenaHost {
  readonly engine: BattleArenaEngine

  private readonly clock: Clock
  private readonly signals: BattleArenaSignals
  private readonly writer = new SnapshotWriter()
  private readonly rosterPublisher = new RosterPublisher()
  private readonly onEvent: (event: EngineEvent) => void

  private lastTick = -1
  private lastState: MatchState | null = null
  private published: Float32Array | null = null
  private readonly rosterBySlot = new Map<number, RosterEntry>()
  private topGifters: SessionGifter[] = []

  constructor(opts: BattleArenaHostOptions) {
    this.clock = opts.clock
    this.signals = opts.signals
    this.onEvent = opts.onEvent ?? (() => {})

    this.engine = new BattleArenaEngine({
      clock: opts.clock,
      seed: opts.seed ?? 1,
      config: opts.config ?? defaultConfig(),
      roster: opts.roster,
      onEffect: opts.onEffect,
      onEvent: (event) => this.handleEvent(event),
    })
  }

  start(): void {
    this.signals.publishConfig(this.engine.getConfig() as BattleArenaConfig)
    this.engine.start()
  }

  stop(): void {
    this.engine.stop()
  }

  setConfig(config: BattleArenaConfig): void {
    this.engine.setConfig(config)
    this.signals.publishConfig(config)
  }

  /** Dipanggil sekali per frame render oleh pemilik loop. Mengembalikan alpha interpolasi. */
  frame(): number {
    const alpha = this.engine.update()

    const state = this.engine.getState()
    const stateChanged = state.matchState !== this.lastState
    // Tick 20 Hz, frame 60 Hz: menyiarkan tiap frame berarti tiga kali trafik tanpa satu
    // pun informasi baru. State machine ikut memicu supaya layar lobi dan kemenangan —
    // yang tidak menjalankan tick sama sekali — tetap sampai ke overlay.
    if (state.tick === this.lastTick && !stateChanged) return alpha

    this.lastTick = state.tick
    this.lastState = state.matchState

    const roster = this.rosterPublisher.next(state)
    if (roster !== null) {
      this.rosterBySlot.clear()
      for (const entry of roster.entries) this.rosterBySlot.set(entry.slotIndex, entry)
      this.topGifters = roster.topGifters
      this.signals.publishRoster(roster)
    }

    // .slice() bukan pemborosan melainkan syarat: writer memakai ulang buffer-nya, jadi
    // tanpa salinan, penerima akan membaca isi yang sudah ditimpa tick berikutnya.
    this.published = this.writer.write(state, this.clock.now()).slice()
    this.signals.publishSnapshot(this.published)
    return alpha
  }

  /** Snapshot terakhir yang disiarkan — dipakai tab pemilik untuk menggambar sendiri. */
  get lastSnapshot(): Float32Array | null {
    return this.published
  }

  /** Roster terakhir yang disiarkan, sebagai peta slot → entri. */
  get currentRoster(): ReadonlyMap<number, RosterEntry> {
    return this.rosterBySlot
  }

  /**
   * Lima penyumbang terbesar sesi, dari payload roster yang sama.
   *
   * Menumpang di sini supaya tab pemilik membaca angka yang PERSIS sama dengan yang dikirim
   * ke overlay — aturan yang sama yang membuat tab pemilik menggambar dari snapshot-nya
   * sendiri alih-alih langsung dari state.
   */
  get currentTopGifters(): readonly SessionGifter[] {
    return this.topGifters
  }

  dispose(): void {
    this.engine.stop()
    this.signals.flush()
    this.signals.close()
  }

  private handleEvent(event: EngineEvent): void {
    const entry = feedEntryFromEvent(
      event,
      this.clock.now(),
      this.engine.getConfig() as BattleArenaConfig,
    )
    if (entry !== null) this.signals.publishFeed(entry)
    this.onEvent(event)
  }
}
