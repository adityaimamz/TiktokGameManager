import type { BattleAction } from './actions.js'
import type { NukeType } from './config/index.js'
import type { JoinOutcome } from './fighters.js'
import type { MatchState } from './state-machine.js'
import type { ActorIdentity, Fighter, SideId } from './types.js'

export type ActionDiscardReason =
  | 'unknownTarget'
  | 'inactiveTarget'
  | 'sideFull'
  | 'alreadyJoined'
  | 'noActor'
  | 'deferredToPhase2'

/**
 * Hook observable yang dipancarkan tiap stage pipeline.
 *
 * Chat log, analytics, dan panel debug berlangganan ke sini alih-alih mengintip state —
 * itulah yang membuat Plan 4 bisa menambahkan panel tanpa menyentuh engine.
 */
export type EngineEvent =
  | { type: 'stateChanged'; from: MatchState; to: MatchState; atMs: number }
  | { type: 'fighterJoined'; fighter: Fighter; outcome: JoinOutcome }
  | { type: 'joinRejected'; actor: ActorIdentity; side: SideId; reason: JoinOutcome }
  | { type: 'fighterDied'; fighter: Fighter; killer: Fighter | null }
  | { type: 'actionApplied'; action: BattleAction }
  | { type: 'actionDiscarded'; action: BattleAction; reason: ActionDiscardReason }
  /**
   * Terbit saat ultimate benar-benar MELESAT, bukan saat gift-nya diantre.
   *
   * Varian dibawa di sini alih-alih diturunkan ulang dari `action.ruleId`: yang memilihnya
   * `applyAction` lewat config, dan pendengar yang menghitungnya sendiri pasti menyimpang
   * begitu creator mengganti `then.nukeType` di tengah sesi.
   */
  | { type: 'ultimateFired'; nukeType: NukeType }
  /**
   * Terbit saat sasaran PERTAMA kena — tick yang sama dengan efek `explosion`-nya.
   *
   * Bukan `ultimateLanded`: yang itu menunggu sasaran terakhir supaya `killCount` dan
   * `totalDamage` final, dan untuk salvo berjenjang ia jatuh jauh setelah ledakan pertama
   * digambar. Bunyi ledakan tidak boleh menunggu angka.
   */
  | { type: 'ultimateImpact'; nukeType: NukeType }
  | { type: 'ultimateLanded'; id: string; gifterKey: string; killCount: number; totalDamage: number }
  /**
   * Satu terbitan per DETIK hitung mundur, bukan per tick engine.
   *
   * Ada karena `stateChanged` hanya menandai masuknya countdown, sementara bunyi 3-2-1
   * butuh satu penanda per detik. `secondsLeft` menghitung mundur sampai 0.
   */
  | { type: 'countdownTick'; secondsLeft: number }
  /**
   * Satu terbitan per TICK yang ada tembakannya, bukan per tembakan.
   *
   * Dengan 200 fighter puluhan peluru lepas dalam satu tick; satu event per peluru berarti
   * pendengar harus menjepitnya sendiri, dan yang lupa akan menyalakan 200 bunyi sekaligus.
   * Tanpa muatan: berapa yang menembak tidak mengubah apa pun di hilir.
   */
  | { type: 'attacksFired' }
  | { type: 'roundEnded'; winner: SideId; roundIndex: number }
  | { type: 'matchEnded'; winner: SideId }
  | { type: 'realViewerArrived'; removedDemoFighters: number }

export type EngineEventListener = (event: EngineEvent) => void
