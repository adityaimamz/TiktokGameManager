import { ultimateProgressAt, ultimateTiming } from '@lga/shared'
import type { UltimateTiming } from '@lga/shared'
import { TICK_MS, sideHalfCenter } from './arena.js'
import type { BattleArenaConfig, NukeTier, NukeType } from './config/index.js'
import type { ActiveUltimate, BattleArenaState, PendingUltimate } from './state.js'
import { lockTargets } from './ultimate-targets.js'

/**
 * Panggung tambahan yang dibutuhkan jalur FX (Ultimate FX Lab), per tipe.
 *
 * Bukan config creator — ini konstanta desain, sama sifatnya dengan tiga konstanta gerak di
 * arena.ts. `gameplay.nuke.durationMs` (bawaan 2600 ms) tetap satu-satunya dial creator; ini
 * mengalikannya SETELAH tier dan `effects.nuke.durationMultiplier`, supaya ultimate lama tetap
 * ~2600 ms kalau creator tidak menyentuh apa pun, dan hanya jalur FX yang mendapat panggung
 * lebih lebar. Empat varian lama naik ke ~3100 ms (rujukan playground `FX_DURATION_MS`);
 * singularity dan chainFreeze — yang punya fase tarik/rantai — naik ke ~3500 ms
 * (`FX_DURATION_MS_NEW`).
 */
export const NUKE_TYPE_DURATION_SCALE: Record<NukeType, number> = {
  missileRain: 1.19,
  laser: 1.19,
  bomb: 1.19,
  lightning: 1.19,
  singularity: 1.35,
  chainFreeze: 1.35,
}

/**
 * Perilaku ultimate: pemilihan tier, antrean, pelepasan, dan kedaluwarsa.
 *
 * BENTUKNYA tinggal di `state.ts` — `depcruise` menolak siklus antara kedua berkas ini
 * bahkan ketika keduanya `import type`. Re-export di bawah membuat pembagian itu tidak
 * terlihat dari sisi pemakai.
 */
export type { ActiveUltimate, PendingUltimate } from './state.js'

/** Tier TERTINGGI yang ambangnya terlampaui. Daftar dijamin menaik oleh validateConfig. */
export function tierIndexFor(coins: number, tiers: readonly NukeTier[]): number {
  let index = 0
  for (let i = 0; i < tiers.length; i++) {
    if (coins >= (tiers[i] as NukeTier).minCoins) index = i
  }
  return index
}

export function ultimateProgress(u: ActiveUltimate, tick: number): number {
  return ultimateProgressAt(tick - u.firedAtTick, u.timing)
}

/** Yang masih BERANIMASI. Record yang ditahan demi callout tidak memakai slot hardCap. */
export function animatingCount(state: BattleArenaState, tick: number): number {
  let total = 0
  for (const u of state.activeUltimates) {
    if (!u.stale && ultimateProgress(u, tick) < 1) total++
  }
  return total
}

export function enqueueUltimate(state: BattleArenaState, init: PendingUltimate): void {
  state.pendingUltimates.push(init)
}

function lowestFreeSlot(state: BattleArenaState): number {
  const taken = new Set(state.activeUltimates.map((u) => u.slot))
  let slot = 0
  while (taken.has(slot)) slot++
  return slot
}

const isBusy = (state: BattleArenaState, gifterKey: string, tick: number): boolean =>
  state.activeUltimates.some(
    (u) => u.gifterKey === gifterKey && !u.stale && ultimateProgress(u, tick) < 1,
  )

/**
 * Porsi jendela pasca-pendaratan yang boleh dipakai sebaran salvo.
 *
 * Sisanya milik aftermath rudal TERAKHIR — dan itu justru ledakan yang paling ditonton,
 * karena mata penonton sudah mengikuti salvo sampai ke sana.
 */
const MISSILE_SPREAD_SHARE = 0.5

/**
 * Jarak pendaratan antar-sasaran, dalam tick DAN dalam progress.
 *
 * Dijepit ke jendela yang benar-benar tersedia: `launchStaggerMs` yang disetel creator
 * terlalu besar tertahan di sini, dan tanpa itu rudal terakhir mendarat setelah progress
 * melewati 1 — ledakannya tidak pernah digambar sementara damage-nya tetap jatuh.
 *
 * `count` ada di PENYEBUT, jadi jumlah rudal tidak pernah dipangkas demi sebaran: jumlah rudal
 * adalah yang berskala menurut tier, dan memangkasnya saat ramai membuat gift mahal justru
 * terlihat lebih kecil tepat ketika paling banyak orang menonton.
 *
 * `staggerProgress` dikirim ke renderer apa adanya. Renderer tidak boleh menghitungnya
 * sendiri: ia tidak memegang `totalTicks`, dan `durationMs` di config masih durasi NOMINAL —
 * pengali tier, `effects.nuke.durationMultiplier`, dan `NUKE_TYPE_DURATION_SCALE` semuanya
 * berlaku di atasnya sebelum angka yang sebenarnya keluar.
 */
function staggerFor(
  count: number,
  timing: UltimateTiming,
  launchStaggerMs: number,
): { ticks: number; progress: number } {
  const postLanding = timing.totalTicks - timing.landsAfterTicks
  const budget = Math.floor(postLanding * MISSILE_SPREAD_SHARE)
  const requested = Math.round(launchStaggerMs / TICK_MS)
  const ticks = Math.max(0, Math.min(requested, Math.floor(budget / Math.max(1, count - 1))))
  return { ticks, progress: ticks / timing.totalTicks }
}

/**
 * Melepas sebanyak mungkin ultimate yang boleh melesat sekarang.
 *
 * Serialisasi per-gifter MENGALAHKAN FIFO: entri yang terblokir dilewati, bukan menahan
 * antrean. Kalau ia menahan, satu orang yang mengirim tiga gift beruntun akan menunda semua
 * orang di belakangnya — persis yang dilarang aturan pertama spec §6.4.
 */
export function releaseUltimates(
  state: BattleArenaState,
  config: BattleArenaConfig,
  tick: number,
): ActiveUltimate[] {
  const released: ActiveUltimate[] = []
  const nuke = config.gameplay.nuke

  for (let i = 0; i < state.pendingUltimates.length; ) {
    if (animatingCount(state, tick) >= nuke.hardCap) break

    const item = state.pendingUltimates[i] as PendingUltimate
    if (isBusy(state, item.gifterKey, tick) || released.some((u) => u.gifterKey === item.gifterKey)) {
      i++
      continue
    }

    state.pendingUltimates.splice(i, 1)

    const tierIndex = tierIndexFor(item.giftCoins, nuke.tiers)
    const tier = nuke.tiers[tierIndex] as NukeTier
    const durationMs =
      nuke.durationMs *
      tier.durationMultiplier *
      config.effects.nuke.durationMultiplier *
      NUKE_TYPE_DURATION_SCALE[item.nukeType]
    const timing = ultimateTiming(durationMs, TICK_MS)

    const targetSlots = lockTargets(state, config, item.nukeType, item.targetSide, tierIndex)
    /*
     * Stagger HANYA milik missileRain, dan cabang ini tidak bisa dihilangkan.
     *
     * Tiga varian lain memang mengunci satu sasaran, tapi `expandToBlast` menumbuhkan
     * daftarnya saat mendarat — satu bom bisa berakhir dengan sepuluh entri. Tanpa cabang
     * ini, korban-korban satu ledakan bom akan kehilangan HP berjenjang dua tick sekali,
     * seolah bom meledak sepuluh kali.
     *
     * `count` minimal 1: sisi lawan yang kosong tetap harus punya stagger yang sah, dan
     * pembagian dengan nol di staggerFor menghasilkan Infinity.
     */
    const stagger =
      item.nukeType === 'missileRain'
        ? staggerFor(Math.max(1, targetSlots.length), timing, nuke.missile.launchStaggerMs)
        : { ticks: 0, progress: 0 }
    const origin = sideHalfCenter(item.side)

    const ultimate: ActiveUltimate = {
      id: `ult-${tick}-${item.gifterKey}-${state.nextUltimateId++}`,
      slot: lowestFreeSlot(state),
      gifterKey: item.gifterKey,
      casterSlot: item.casterSlot,
      side: item.side,
      targetSide: item.targetSide,
      nukeType: item.nukeType,
      tier: tierIndex,
      damage: item.damage,
      timing,
      firedAtTick: tick,
      landsAtTick: tick + timing.landsAfterTicks,
      landed: false,
      landedCount: 0,
      hitSlots: [],
      targetSlots,
      landStaggerTicks: stagger.ticks,
      staggerProgress: stagger.progress,
      msPerProgress: durationMs,
      stale: false,
      expiresAtTick: null,
      // Cadangannya pusat separuh sisi caster, BUKAN 0,0 — itu pojok kiri atas arena, dan
      // gifter tanpa fighter bukan kasus langka (autoJoinGifter bisa dimatikan creator).
      originX: item.originX ?? origin.x,
      originY: item.originY ?? origin.y,
      killCount: 0,
      totalDamage: 0,
    }

    state.activeUltimates.push(ultimate)
    released.push(ultimate)
  }

  return released
}

const holdTicks = (config: BattleArenaConfig): number =>
  Math.max(1, Math.round(config.gameplay.nuke.calloutHoldMs / TICK_MS))

/** Memberi record tenggang tampil sebelum dibuang. Idempoten: tenggang tidak diperpanjang. */
export function holdForCallout(u: ActiveUltimate, config: BattleArenaConfig, tick: number): void {
  if (u.expiresAtTick === null) u.expiresAtTick = tick + holdTicks(config)
}

/**
 * Ronde berakhir: semua yang di udara ditandai stale dan antrean dilepas sebagai stale juga.
 *
 * Yang belum dilepas TIDAK boleh hilang diam-diam — orangnya sudah membayar sebelum ronde
 * berakhir, dan aturan keras spec §1 berlaku penuh untuk mereka. hardCap tidak berlaku di
 * sini: tidak ada yang beranimasi, yang tampil hanya callout.
 */
export function markUltimatesStale(
  state: BattleArenaState,
  config: BattleArenaConfig,
  tick: number,
): void {
  for (const u of state.activeUltimates) {
    if (u.stale) continue
    u.stale = true
    u.expiresAtTick = tick + holdTicks(config)
  }

  for (const item of state.pendingUltimates) {
    state.activeUltimates.push({
      id: `ult-stale-${tick}-${item.gifterKey}-${state.nextUltimateId++}`,
      slot: lowestFreeSlot(state),
      gifterKey: item.gifterKey,
      casterSlot: item.casterSlot,
      side: item.side,
      targetSide: item.targetSide,
      nukeType: item.nukeType,
      tier: tierIndexFor(item.giftCoins, config.gameplay.nuke.tiers),
      damage: item.damage,
      timing: ultimateTiming(config.gameplay.nuke.durationMs, TICK_MS),
      firedAtTick: tick,
      landsAtTick: tick,
      landed: false,
      landedCount: 0,
      hitSlots: [],
      // Record stale tidak pernah menggambar rudal maupun mendaratkan damage; angkanya ada
      // supaya encoder tidak menulis undefined ke buffer.
      targetSlots: [],
      landStaggerTicks: 0,
      staggerProgress: 0,
      msPerProgress: config.gameplay.nuke.durationMs,
      stale: true,
      expiresAtTick: tick + holdTicks(config),
      originX: item.originX ?? sideHalfCenter(item.side).x,
      originY: item.originY ?? sideHalfCenter(item.side).y,
      killCount: 0,
      totalDamage: 0,
    })
  }
  state.pendingUltimates.length = 0
}

/** Fase Cleanup: satu-satunya tempat record dibuang selain startNewRound(). */
export function expireUltimates(state: BattleArenaState, tick: number): number {
  let removed = 0
  for (let i = state.activeUltimates.length - 1; i >= 0; i--) {
    const u = state.activeUltimates[i] as ActiveUltimate
    if (u.expiresAtTick !== null && tick >= u.expiresAtTick) {
      state.activeUltimates.splice(i, 1)
      removed++
    }
  }
  return removed
}
