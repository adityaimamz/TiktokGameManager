import type { Clock } from '../../framework/clock.js'
import { EffectPool } from '../../framework/effects/pool.js'
import type { Effect } from '../../framework/effects/pool.js'
import type { EntityPool } from '../../framework/entity/pool.js'
import type { Rng } from '../../framework/rng.js'
import type { GameplayConfig } from './config/index.js'
import { FighterRegistry } from './fighters.js'
import { createProjectilePool } from './projectiles.js'
import type { MatchState } from './state-machine.js'
import type { UltimateTiming } from '@lga/shared'
import type { NukeType } from './config/index.js'
import type { Projectile, SideId } from './types.js'

/**
 * Ultimate sebagai record hidup, bukan efek sekali gambar.
 *
 * Bentuknya tinggal DI SINI dan bukan di `ultimate.ts` semata-mata karena arah impor:
 * `state.ts` harus menyebut tipenya, `ultimate.ts` harus menyebut `BattleArenaState`, dan
 * `depcruise` menolak siklus itu bahkan ketika kedua sisinya `import type` (yang terhapus
 * saat kompilasi). `ultimate.ts` me-re-export keduanya, jadi pemakai tetap mengimpornya
 * dari sana.
 *
 * Seluruh waktunya dinyatakan dalam TICK, tidak pernah dalam milidetik jam dinding
 * (keputusan D2): `engine.stop()` hanya menghentikan scheduler sementara jam dinding jalan
 * terus, jadi pendaratan berbasis jam akan menjatuhkan seluruh damage sekaligus begitu
 * creator menekan resume. Karena progress diturunkan dari tick yang sama, animasi dan damage
 * membeku dalam fase yang sama saat pause — bukan sesuatu yang perlu ditambal, melainkan
 * sesuatu yang tidak bisa terjadi.
 */
export interface ActiveUltimate {
  id: string
  /**
   * Identitas stabil seumur hidup record, dipakai ulang terkecil-dulu.
   *
   * Ada supaya renderer bisa mencocokkan record antar-snapshot dan menginterpolasi progress
   * (spec §7.1). Indeks array tidak bisa dipakai: satu record yang selesai menggeser sisanya,
   * dan renderer akan menginterpolasi dua ultimate berbeda menjadi satu. Ini pola slotIndex
   * fighter, dipakai ulang apa adanya.
   */
  slot: number
  gifterKey: string
  /** NO_SLOT bila gifter tidak punya fighter. */
  casterSlot: number
  side: SideId
  targetSide: SideId
  nukeType: NukeType
  tier: number
  damage: number
  timing: UltimateTiming
  firedAtTick: number
  landsAtTick: number
  /** Urutan pendaratannya sudah DIMULAI: ledakan dan event sudah terbit, sekali saja. */
  landed: boolean
  /**
   * Berapa banyak sasaran yang gilirannya sudah lewat.
   *
   * Salvo rudal mendarat berjenjang, jadi pendaratan harus bisa dilanjutkan sebagian dari
   * tick ke tick. HP korban terakhir tidak boleh turun saat rudal PERTAMA menyentuh tanah.
   */
  landedCount: number
  /**
   * Slot yang benar-benar sudah menerima damage dari ultimate ini.
   *
   * Terpisah dari `targetSlots` karena pengalihan damage tidak boleh menyentuh daftar itu
   * (lihat catatannya di bawah), sementara korban pengganti tetap tidak boleh kena dua kali
   * dari satu ultimate yang sama. Tidak ikut ke snapshot: renderer tidak membutuhkannya.
   */
  hitSlots: number[]
  /*
   * targetSlots HANYA BOLEH BERTAMBAH, tidak pernah diganti isinya.
   *
   * Renderer menyelesaikan lintasan rudal dari nol tiap frame terhadap posisi target
   * SEKARANG. Mengganti isi sebuah slot di tengah jalan membuat seluruh lintasan tersolusi
   * ulang terhadap fighter lain dalam satu frame: rudalnya tidak berbelok, ia BERPINDAH
   * TEMPAT. Kunci-ulang saat mendarat karena itu memindahkan DAMAGE lewat variabel lokal di
   * combat.ts, dan tidak pernah menyentuh daftar ini.
   */
  targetSlots: number[]
  /** Jarak tick antar-pendaratan, hasil jepitan saat rilis. 0 = serentak. */
  landStaggerTicks: number
  /** `landStaggerTicks` dalam satuan progress. Dikirim ke renderer apa adanya. */
  staggerProgress: number
  /** Milidetik yang ditempuh satu satuan progress. Dikirim ke renderer apa adanya. */
  msPerProgress: number
  stale: boolean
  /** Diisi saat animasi habis atau saat ditandai stale; null selama masih di udara. */
  expiresAtTick: number | null
  originX: number
  originY: number
  killCount: number
  totalDamage: number
}

/** Ultimate yang sudah dibayar tapi belum dilepas. Belum punya timing — mode belum diputuskan. */
export interface PendingUltimate {
  gifterKey: string
  casterSlot: number
  side: SideId
  targetSide: SideId
  nukeType: NukeType
  damage: number
  giftCoins: number
  queuedAtTick: number
  /** Posisi asal saat tembak, dipakai bila caster tidak punya fighter yang bisa diikuti. */
  originX?: number
  originY?: number
}

export interface BattleArenaState {
  /** Cermin dari MatchStateMachine, disimpan di sini agar ikut ke snapshot overlay. */
  matchState: MatchState
  tick: number
  roundIndex: number
  roundScore: Record<SideId, number>
  roundsWon: Record<SideId, number>
  roundWinner: SideId | null
  matchWinner: SideId | null
  fighters: FighterRegistry
  projectiles: EntityPool<Projectile>
  effects: EffectPool
  /** Ultimate yang sedang tampil, termasuk yang sudah selesai tapi callout-nya masih ditahan. */
  activeUltimates: ActiveUltimate[]
  /** Sudah dibayar, belum dilepas. Menunggu slot hardCap atau ultimate gifter yang sama. */
  pendingUltimates: PendingUltimate[]
  /** Penghitung id ultimate; deterministik karena tidak memakai jam maupun rng. */
  nextUltimateId: number
}

/** Ronde yang harus dimenangkan untuk merebut match: mayoritas sederhana dari best-of. */
export function roundsNeeded(bestOf: number): number {
  return Math.ceil(bestOf / 2)
}

export function createBattleArenaState(deps: {
  rng: Rng
  clock: Clock
  onEffect?: (e: Effect) => void
}): BattleArenaState {
  return {
    matchState: 'idle',
    tick: 0,
    roundIndex: 0,
    roundScore: { a: 0, b: 0 },
    roundsWon: { a: 0, b: 0 },
    roundWinner: null,
    matchWinner: null,
    fighters: new FighterRegistry({ rng: deps.rng, clock: deps.clock }),
    projectiles: createProjectilePool(),
    effects: new EffectPool(deps.clock, 200, deps.onEffect),
    activeUltimates: [],
    pendingUltimates: [],
    nextUltimateId: 0,
  }
}

/**
 * Menyiapkan ronde berikutnya.
 *
 * Fighter TETAP di arena dengan HP dipulihkan penuh dan posisi spawn baru, statistik
 * kumulatif dipertahankan, dan ronde yang sudah dimenangkan tidak disentuh.
 */
export function startNewRound(state: BattleArenaState, gameplay: GameplayConfig): void {
  state.roundIndex++
  state.roundScore.a = 0
  state.roundScore.b = 0
  state.roundWinner = null
  state.projectiles.releaseAll()
  state.effects.releaseAll()
  // Callout ronde lalu sudah sempat terbaca sepanjang layar victory (tick membeku di sana,
  // jadi tenggangnya tidak berjalan). Yang tidak boleh adalah ia menggantung di detik-detik
  // awal ronde baru.
  state.activeUltimates.length = 0
  state.pendingUltimates.length = 0
  state.fighters.restoreForNewRound(gameplay)
}

/** State Reset: arena dikosongkan sepenuhnya (Req 23 AC8). */
export function resetMatch(state: BattleArenaState): void {
  state.tick = 0
  state.roundIndex = 0
  state.roundScore.a = 0
  state.roundScore.b = 0
  state.roundsWon.a = 0
  state.roundsWon.b = 0
  state.roundWinner = null
  state.matchWinner = null
  state.projectiles.releaseAll()
  state.effects.releaseAll()
  state.activeUltimates.length = 0
  state.pendingUltimates.length = 0
  state.nextUltimateId = 0
  state.fighters.clear()
}
