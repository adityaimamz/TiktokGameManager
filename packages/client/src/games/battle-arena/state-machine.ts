import type { Clock } from '../../framework/clock.js'

/** Tujuh state Req 23 AC1, dalam urutan yang disebut requirement. */
export type MatchState =
  | 'idle'
  | 'waitingFighters'
  | 'countdown'
  | 'battle'
  | 'victory'
  | 'result'
  | 'reset'

export const MATCH_STATES: readonly MatchState[] = [
  'idle',
  'waitingFighters',
  'countdown',
  'battle',
  'victory',
  'result',
  'reset',
]

/**
 * Transisi yang sah.
 *
 * Victory punya DUA jalan keluar — itulah cara sistem ronde best-of ditangani tanpa
 * menambah state baru: engine memilih 'countdown' bila match belum selesai, atau
 * 'result' bila sudah. 'reset' bisa dicapai dari setiap state yang sedang berjalan karena
 * creator boleh mengakhiri sesi kapan saja.
 */
export const ALLOWED_TRANSITIONS: Record<MatchState, readonly MatchState[]> = {
  idle: ['waitingFighters'],
  waitingFighters: ['countdown', 'reset'],
  countdown: ['battle', 'reset'],
  battle: ['victory', 'reset'],
  victory: ['countdown', 'result', 'reset'],
  result: ['reset'],
  reset: ['idle'],
}

export interface MatchStateMachineOptions {
  clock: Clock
  onTransition?: (from: MatchState, to: MatchState, atMs: number) => void
  /** Default console.warn. Diinjeksi di test supaya penolakan bisa di-assert. */
  warn?: (message: string) => void
}

/**
 * Penjaga legalitas transisi match.
 *
 * Sengaja tidak tahu apa pun soal ronde, skor, atau fighter — hanya state saat ini dan
 * kapan ia dimasuki. Transisi tidak sah ditolak dengan peringatan dan TIDAK mengubah state
 * (Req 23 AC9).
 */
export class MatchStateMachine {
  private current: MatchState = 'idle'
  private entered: number
  private readonly clock: Clock
  private readonly onTransition: ((from: MatchState, to: MatchState, atMs: number) => void) | undefined
  private readonly warn: (message: string) => void

  constructor(opts: MatchStateMachineOptions) {
    this.clock = opts.clock
    this.entered = opts.clock.now()
    this.onTransition = opts.onTransition
    this.warn = opts.warn ?? ((message) => console.warn(message))
  }

  get state(): MatchState {
    return this.current
  }

  get enteredAtMs(): number {
    return this.entered
  }

  get elapsedMs(): number {
    return this.clock.now() - this.entered
  }

  canTransition(to: MatchState): boolean {
    return ALLOWED_TRANSITIONS[this.current].includes(to)
  }

  /** Mengembalikan false bila transisi ditolak. */
  transition(to: MatchState): boolean {
    if (!this.canTransition(to)) {
      this.warn(`[battle-arena] rejected state transition ${this.current} -> ${to}`)
      return false
    }
    const from = this.current
    this.current = to
    this.entered = this.clock.now()
    this.onTransition?.(from, to, this.entered)
    return true
  }

  /**
   * Memulihkan state tersimpan setelah reload (Req 23 AC10).
   *
   * Sengaja MELEWATI validasi: yang tersimpan adalah state yang pernah sah, dan
   * memaksanya lewat jalur transisi normal justru akan ditolak.
   */
  restore(state: MatchState, enteredAtMs: number): void {
    this.current = state
    this.entered = enteredAtMs
  }
}
