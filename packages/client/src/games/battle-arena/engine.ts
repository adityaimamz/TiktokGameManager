import type { ChatMessage } from '@lga/shared'
import { ActionQueue } from '../../framework/actions/queue.js'
import type { Clock } from '../../framework/clock.js'
import type { Effect } from '../../framework/effects/pool.js'
import { TickScheduler } from '../../framework/loop/tick-scheduler.js'
import { createRng } from '../../framework/rng.js'
import type { Rng } from '../../framework/rng.js'
import type { IGameEngine } from '../../framework/types/plugin.js'
import { createBattleAction, sideTarget } from './actions.js'
import type { BattleAction } from './actions.js'
import { RESULT_AUTO_ADVANCE_MS, TICK_MS } from './arena.js'
import { drainActions } from './combat.js'
import { defaultConfig } from './config/index.js'
import type { BattleArenaConfig } from './config/index.js'
import type { EngineEvent, EngineEventListener } from './events.js'
import type { FighterRegistry } from './fighters.js'
import { runTick } from './simulation.js'
import type { TickDeps } from './simulation.js'
import { MatchStateMachine } from './state-machine.js'
import type { MatchState } from './state-machine.js'
import { createBattleArenaState, resetMatch, roundsNeeded, startNewRound } from './state.js'
import { markUltimatesStale } from './ultimate.js'
import type { BattleArenaState } from './state.js'
import { BattleArenaTriggers } from './triggers.js'
import { fighterKey } from './types.js'
import type { ActorIdentity, SideId } from './types.js'

/**
 * Pengisi roster saat arena sepi.
 *
 * Dideklarasikan di sini, bukan diimpor dari practice-fighters.ts, supaya engine tidak
 * bergantung pada implementasi bot mana pun — dan tetap bisa jalan tanpa bot sama sekali.
 */
export interface RosterFiller {
  /** Pesan join untuk menambal kekurangan bot. Dikembalikan, bukan diterapkan langsung. */
  fill(fighters: FighterRegistry, config: BattleArenaConfig, nowMs: number): ChatMessage[]
  /** Melepas satu bot di sisi tertentu saat viewer asli bergabung di sana. */
  releaseOne(fighters: FighterRegistry, side: SideId): string | null
}

export interface BattleArenaEngineOptions {
  clock: Clock
  seed?: number
  rng?: Rng
  config?: BattleArenaConfig
  onEvent?: EngineEventListener
  /** Dipanggil tiap efek lahir. Pemakainya: pemutar bunyi di lapisan ui. */
  onEffect?: (e: Effect) => void
  warn?: (message: string) => void
  roster?: RosterFiller
}

/** State yang menerima event chat. Di luar ini, pesan diabaikan (Req 4 AC6). */
const ACTIVE_STATES: ReadonlySet<MatchState> = new Set<MatchState>([
  'waitingFighters',
  'countdown',
  'battle',
  'victory',
])

/** Batas rantai transisi dalam satu update, penjaga terhadap siklus tak terduga. */
const MAX_TRANSITIONS_PER_UPDATE = 8

/**
 * Panjang daftar tunggu dan penampung komentar, keduanya membuang yang TERLAMA saat penuh.
 *
 * Sebesar dua kali sisi terpadat yang pernah ditargetkan (Req 20: 200 fighter). Yang antre
 * lebih lama dari itu sudah berhenti menunggu.
 */
const PENDING_LIMIT = 200

/** Menambah ke ekor, membuang kepala saat penuh. */
function push<T>(list: T[], item: T): void {
  list.push(item)
  if (list.length > PENDING_LIMIT) list.shift()
}

export class BattleArenaEngine
  implements IGameEngine<BattleArenaState, BattleArenaConfig, ChatMessage, BattleAction>
{
  readonly id = 'battle-arena'

  private config: BattleArenaConfig
  private readonly clock: Clock
  private readonly rng: Rng
  private readonly queue = new ActionQueue<BattleAction>(500)
  private readonly state: BattleArenaState
  private readonly machine: MatchStateMachine
  private readonly scheduler: TickScheduler
  private readonly triggersImpl: BattleArenaTriggers
  private readonly roster: RosterFiller | null
  private readonly listener: EngineEventListener
  private sawRealViewer = false
  /**
   * Match yang selesai wajar langsung memulai match berikutnya (siaran tidak pernah
   * berhenti di layar kosong). Creator yang menekan Reset justru mengosongkan tanda ini,
   * jadi "akhiri sesi" tetap berakhir di idle.
   */
  private loopAfterReset = false
  /** Detik terakhir yang sudah dibunyikan, supaya `countdownTick` terbit sekali per detik. */
  private lastCountdownSecond = -1

  constructor(opts: BattleArenaEngineOptions) {
    this.clock = opts.clock
    this.rng = opts.rng ?? createRng(opts.seed ?? 1)
    this.config = opts.config ?? defaultConfig()
    this.listener = opts.onEvent ?? (() => {})
    this.roster = opts.roster ?? null
    this.state = createBattleArenaState({
      rng: this.rng,
      clock: this.clock,
      onEffect: opts.onEffect,
    })
    this.triggersImpl = new BattleArenaTriggers(() => this.config)

    this.machine = new MatchStateMachine({
      clock: this.clock,
      warn: opts.warn,
      onTransition: (from, to, atMs) => {
        this.state.matchState = to
        this.listener({ type: 'stateChanged', from, to, atMs })
      },
    })

    this.scheduler = new TickScheduler({
      clock: this.clock,
      tickMs: TICK_MS,
      onTick: () => runTick(this.tickDeps()),
    })
  }

  get matchState(): MatchState {
    return this.machine.state
  }

  get triggers(): BattleArenaTriggers {
    return this.triggersImpl
  }

  getState(): Readonly<BattleArenaState> {
    return this.state
  }

  getConfig(): Readonly<BattleArenaConfig> {
    return this.config
  }

  /** Berlaku mulai evaluasi berikutnya, tanpa restart match (Req 16 AC5). */
  setConfig(config: BattleArenaConfig): void {
    this.config = config
  }

  start(): void {
    this.enterWaitingFighters()
  }

  /**
   * Satu-satunya pintu menuju lobi, dipakai `start()` maupun lingkaran otomatis sesudah
   * match. Komentar yang tertampung dilepas di sini supaya penonton yang mengetik selama
   * layar hasil tidak perlu mengetik lagi.
   */
  private enterWaitingFighters(): boolean {
    if (!this.machine.transition('waitingFighters')) return false
    this.flushBufferedComments()
    return true
  }

  /** Menjeda simulasi tanpa mengubah state — tombol Pause Game. */
  stop(): void {
    this.scheduler.stop()
  }

  reset(): void {
    this.scheduler.stop()
    this.loopAfterReset = false
    if (this.machine.state === 'idle') {
      resetMatch(this.state, this.config.gameplay)
      return
    }
    if (this.machine.transition('reset')) this.advanceStates()
  }

  /** Creator menekan lanjut di layar Result (Req 23 AC7). */
  confirmResult(): void {
    if (this.machine.state !== 'result') return
    this.loopAfterReset = true
    if (this.machine.transition('reset')) this.advanceStates()
  }

  enqueue(action: BattleAction): void {
    this.queue.enqueue(action)
  }

  /**
   * Penonton yang mengetik saat arena penuh, menunggu kursi kosong.
   *
   * Ada supaya keyword yang diketik selalu berujung fighter: tanpa ini penolakan `sideFull`
   * senyap — penonton mengetik, tidak terjadi apa-apa, dan tidak satu pun tempat di aplikasi
   * ini menyebutkan alasannya. Kursi kosong saat seseorang pindah sisi atau match baru
   * dimulai, dan yang antre masuk sendiri tanpa perlu mengetik ulang.
   */
  private readonly waitlist: { actor: ActorIdentity; side: SideId }[] = []

  /**
   * Komentar yang datang saat match tidak menerima event — layar hasil (10 detik) dan idle.
   *
   * Dibuang begitu saja dulu, dan itu lubang yang sama besarnya: sepuluh detik tiap match
   * ketika penonton mengetik dan tidak pernah masuk arena. Hanya komentar yang ditampung;
   * gift dan like TIDAK, karena memutarnya terlambat berarti ultimate meledak di match yang
   * salah dan koin dihitung dua kali.
   */
  private readonly bufferedComments: ChatMessage[] = []

  handleMessage(message: ChatMessage): void {
    // Viewer asli pertama menyapu bersih fighter demo (Req 18 AC8). Filter satu baris ini
    // yang dimungkinkan oleh keputusan menjadikan simulator sebuah ChatSource biasa.
    if (message.platform === 'tiktok' && !this.sawRealViewer) {
      this.sawRealViewer = true
      const removed = this.state.fighters.removeByPlatform('demo')
      this.listener({ type: 'realViewerArrived', removedDemoFighters: removed })
    }

    if (!ACTIVE_STATES.has(this.machine.state)) {
      if (message.kind === 'textMessageEvent') push(this.bufferedComments, message)
      return
    }

    // Sebelum trigger: Req 15 AC5 menghitung penyumbang terbesar, termasuk gift yang tidak
    // cocok dengan satu rule pun. Trigger sendiri tidak boleh menyentuh state (Req 30 AC4).
    if (message.kind === 'giftEvent') {
      this.state.fighters.addGiftCoins(
        { platform: message.platform, username: message.username, avatarUrl: message.avatarUrl },
        message.giftCoins,
      )
    }

    for (const action of this.triggersImpl.resolve(message)) this.queue.enqueue(action)
  }

  /**
   * Satu langkah dunia. Mengembalikan alpha interpolasi tick terakhir, 0–1.
   *
   * Nilai balik ini yang membuat preview di dashboard semulus overlay: pemilik render loop
   * menggambar di 60 fps di atas state yang hanya berubah 20 kali per detik.
   */
  update(): number {
    this.admitFromWaitlist()
    if (this.machine.state !== 'battle') {
      this.topUpRoster()
      // Keputusan D5: action tetap dikuras di luar Battle, kalau tidak join di lobi tidak
      // akan pernah berlaku dan state machine tidak bisa maju.
      drainActions(this.tickDeps())
    }

    this.advanceStates()

    if (this.machine.state !== 'battle') return 0

    const { alpha } = this.scheduler.update()
    // Kemenangan yang jatuh di tick barusan langsung ditindaklanjuti, bukan menunggu frame
    // berikutnya — supaya tidak ada satu frame pun yang menampilkan skor melewati target.
    if (this.state.roundWinner !== null) this.advanceStates()
    return alpha
  }

  private tickDeps(): TickDeps {
    return {
      state: this.state,
      config: this.config,
      queue: this.queue,
      rng: this.rng,
      nowMs: this.clock.now(),
      emit: (event) => this.emit(event),
    }
  }

  /**
   * Satu bot dilepas per satu viewer asli yang bergabung di sisi yang sama.
   *
   * Tidak berlaku saat sisinya sudah mentok: kursinya baru saja dibebaskan
   * `FighterRegistry.join` — seorang mayat atau justru seekor bot — dan melepas satu bot
   * LAGI di atasnya menyusutkan sisi tiap kali seorang viewer masuk.
   */
  private emit(event: EngineEvent): void {
    if (
      event.type === 'fighterJoined' &&
      this.roster !== null &&
      event.fighter.platform !== 'practice' &&
      this.state.fighters.countOnSide(event.fighter.side) <
        this.config.gameplay.maxFightersPerSide
    ) {
      this.roster.releaseOne(this.state.fighters, event.fighter.side)
    }
    // Hanya sisi yang benar-benar penuh oleh fighter HIDUP yang sampai ke sini: mayat dan bot
    // sudah disuruh mundur `FighterRegistry.join`. `alreadyOnSide` tidak diantre — orangnya
    // sudah bermain.
    if (event.type === 'joinRejected' && event.reason === 'sideFull') {
      const key = fighterKey(event.actor)
      const existing = this.waitlist.find((entry) => fighterKey(entry.actor) === key)
      // Sisinya DITIMPA, bukan ditambah entri kedua: yang berlaku adalah keyword terakhir
      // yang ia ketik, sama seperti pindah sisi bagi yang sudah punya fighter.
      if (existing !== undefined) existing.side = event.side
      else push(this.waitlist, { actor: event.actor, side: event.side })
    }
    this.listener(event)
  }

  /**
   * Memasukkan yang antre begitu sisinya punya kursi.
   *
   * Lewat ActionQueue, bukan langsung ke registry: jalurnya harus sama persis dengan yang
   * ditempuh komentar sungguhan, supaya efek join, event, dan pelepasan bot tidak bisa
   * berbeda antara keduanya.
   */
  private admitFromWaitlist(): void {
    if (this.waitlist.length === 0) return

    const remaining: { actor: ActorIdentity; side: SideId }[] = []

    for (const entry of this.waitlist) {
      // Sudah masuk lewat jalan lain — sisi seberang, atau gift yang mendaftarkannya.
      if (this.state.fighters.get(fighterKey(entry.actor)) !== undefined) continue
      // Ditanyakan ke registry, bukan dihitung sendiri: aturan kursi cuma boleh punya satu
      // sumber, kalau tidak yang antre tertahan di sisi yang sebenarnya masih menerima.
      if (!this.state.fighters.canSeat(entry.side, this.config.gameplay)) {
        remaining.push(entry)
        continue
      }
      this.queue.enqueue(
        createBattleAction({
          type: 'spawn',
          target: sideTarget(entry.side),
          value: 0,
          actor: entry.actor,
        }),
      )
    }

    this.waitlist.length = 0
    this.waitlist.push(...remaining)
  }

  /**
   * Melepas komentar yang tertampung ke lobi yang baru dibuka.
   *
   * Diterjemahkan ulang lewat trigger, bukan disimpan sebagai Action: config bisa berubah
   * selama layar hasil, dan yang berlaku adalah rule yang aktif SEKARANG.
   */
  private flushBufferedComments(): void {
    if (this.bufferedComments.length === 0) return
    const pending = [...this.bufferedComments]
    this.bufferedComments.length = 0
    for (const message of pending) {
      for (const action of this.triggersImpl.resolve(message)) this.queue.enqueue(action)
    }
  }

  private topUpRoster(): void {
    if (this.roster === null || !this.config.gameplay.practiceFighters) return
    if (this.machine.state !== 'waitingFighters' && this.machine.state !== 'countdown') return

    for (const message of this.roster.fill(this.state.fighters, this.config, this.clock.now())) {
      for (const action of this.triggersImpl.resolve(message)) this.queue.enqueue(action)
    }
  }

  private advanceStates(): void {
    for (let guard = 0; guard < MAX_TRANSITIONS_PER_UPDATE; guard++) {
      if (!this.stepState()) return
    }
  }

  /** Mengembalikan true bila terjadi transisi, sehingga pemanggil bisa melanjutkan rantai. */
  private stepState(): boolean {
    const elapsed = this.machine.elapsedMs
    const gameplay = this.config.gameplay

    switch (this.machine.state) {
      case 'waitingFighters':
        return this.hasFightersOnBothSides() ? this.enterCountdown() : false

      case 'countdown': {
        const total = gameplay.countdownDurationSec * 1000
        // Dibaca dari `elapsed`, bukan dari penghitung sendiri: jam yang sama dengan yang
        // memutuskan kapan battle dimulai, jadi bunyi terakhir tidak bisa jatuh setelahnya.
        const secondsLeft = Math.max(0, Math.ceil((total - elapsed) / 1000))
        if (secondsLeft !== this.lastCountdownSecond) {
          this.lastCountdownSecond = secondsLeft
          this.listener({ type: 'countdownTick', secondsLeft })
        }
        return elapsed >= total ? this.enterBattle() : false
      }

      case 'battle':
        return this.state.roundWinner !== null ? this.enterVictory() : false

      case 'victory':
        return elapsed >= gameplay.celebrationDurationSec * 1000 ? this.leaveVictory() : false

      case 'result': {
        if (elapsed < RESULT_AUTO_ADVANCE_MS) return false
        this.loopAfterReset = true
        return this.machine.transition('reset')
      }

      case 'reset':
        // `loopAfterReset` sudah membedakan keduanya sejak lama: match yang selesai lalu
        // melingkar ke lobi berikutnya menandainya, Reset yang ditekan creator tidak. Itu
        // pula yang memisahkan roster yang bertahan dari arena yang benar-benar dikosongkan.
        resetMatch(this.state, this.config.gameplay, this.loopAfterReset)
        return this.machine.transition('idle')

      case 'idle': {
        if (!this.loopAfterReset) return false
        this.loopAfterReset = false
        return this.enterWaitingFighters()
      }

      default:
        return false
    }
  }

  private hasFightersOnBothSides(): boolean {
    return (
      this.state.fighters.countOnSide('a', { aliveOnly: true }) > 0 &&
      this.state.fighters.countOnSide('b', { aliveOnly: true }) > 0
    )
  }

  private enterCountdown(): boolean {
    startNewRound(this.state, this.config.gameplay)
    return this.machine.transition('countdown')
  }

  private enterBattle(): boolean {
    this.scheduler.start()
    return this.machine.transition('battle')
  }

  private enterVictory(): boolean {
    const winner = this.state.roundWinner
    if (winner === null) return false

    // Ditandai SEBELUM scheduler berhenti, pada tick terakhir yang masih disiarkan: damage
    // yang belum mendarat hangus, tapi setiap orang yang sudah membayar tetap muncul di layar
    // (aturan keras spec §1). Yang belum sempat dilepas ikut jadi record stale, bukan hilang.
    markUltimatesStale(this.state, this.config, this.state.tick)

    this.scheduler.stop()
    this.state.roundsWon[winner]++
    this.listener({ type: 'roundEnded', winner, roundIndex: this.state.roundIndex })
    return this.machine.transition('victory')
  }

  /** Percabangan ronde: ronde berikutnya, atau layar hasil bila match sudah direbut. */
  private leaveVictory(): boolean {
    const winner = this.state.roundWinner
    if (
      winner !== null &&
      this.state.roundsWon[winner] >= roundsNeeded(this.config.gameplay.roundsBestOf)
    ) {
      this.state.matchWinner = winner
      this.listener({ type: 'matchEnded', winner })
      return this.machine.transition('result')
    }
    return this.enterCountdown()
  }
}
