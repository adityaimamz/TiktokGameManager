import type { Action } from '../actions/action.js'
import type { EffectSpawn } from '../effects/pool.js'

/**
 * Kontrak yang dipenuhi setiap game agar bisa berjalan di atas sistem bersama.
 *
 * Seluruh interface memakai type parameter untuk state, config, pesan, dan aksi
 * milik game itu sendiri, sehingga game kedua bisa memakai tipe domainnya sendiri
 * tanpa menyentuh satu baris pun kode framework.
 */

/** Memajukan state satu langkah tetap. Tidak boleh menggambar apa pun. */
export interface IGameSimulation<TState> {
  tick(state: TState, tickIndex: number, dtMs: number): void
}

/** Menggambar state. Tidak boleh memutasi state atau memanggil simulasi. */
export interface IGameRenderer<TState, TConfig> {
  render(
    ctx: CanvasRenderingContext2D,
    state: Readonly<TState>,
    config: Readonly<TConfig>,
    alpha: number,
  ): void
}

/** Menerjemahkan event luar menjadi aksi. Tidak boleh memutasi state. */
export interface IGameTriggers<TMessage, TAction extends Action = Action> {
  resolve(message: TMessage): TAction[]
}

/** Siklus hidup efek visual milik sebuah game. */
export interface IGameEffects {
  spawn(effect: EffectSpawn): void
  update(): void
  clear(): void
}

/** Skema, default, validasi, dan migrasi konfigurasi sebuah game. */
export interface IGameConfig<TConfig> {
  readonly schemaVersion: number
  defaults(): TConfig
  /** Selalu mengembalikan config yang sah; field tak valid diganti default. */
  validate(raw: unknown): TConfig
  migrate(raw: unknown, fromVersion: number): unknown
}

/** Orkestrator sebuah game. Modul lain tidak boleh mengimpor implementasinya. */
export interface IGameEngine<TState, TConfig, TMessage, TAction extends Action = Action> {
  readonly id: string
  start(): void
  stop(): void
  reset(): void
  /** Menyerahkan satu event luar untuk diresolusi jadi aksi. */
  handleMessage(message: TMessage): void
  /** Dipanggil sekali per frame; menjalankan tick yang jatuh tempo. */
  update(): void
  getState(): Readonly<TState>
  getConfig(): Readonly<TConfig>
  setConfig(config: TConfig): void
  enqueue(action: TAction): void
}
