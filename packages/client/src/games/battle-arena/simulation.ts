import { aiPhase } from './ai.js'
import { ARENA_ASPECT, TICK_MS, clampToSideZone, fighterScale } from './arena.js'
import { applyDamage, combatPhase, freezeUltimateOrigins } from './combat.js'
import type { CombatDeps } from './combat.js'
import { projectilePhase, retireProjectiles, steerProjectiles } from './projectiles.js'
import { SIDES } from './types.js'
import { expireUltimates } from './ultimate.js'

/**
 * Urutan fase satu tick. TETAP — tidak boleh diubah (Req 24 AC3).
 *
 * Diekspor sebagai data supaya urutannya bisa di-assert, bukan hanya dipercaya.
 */
export const TICK_PHASES = [
  'physics',
  'ai',
  'combat',
  'projectiles',
  'effects',
  'cleanup',
] as const

/** Sama dengan CombatDeps: rng kini hidup di sana, dipakai target acak maupun fase AI. */
export type TickDeps = CombatDeps

/**
 * Fase 1 — Physics: posisi mengikuti velocity yang ditetapkan tick sebelumnya.
 *
 * Fighter tidak pernah meninggalkan separuhnya, apa pun status tempurnya (Req 7 AC3).
 * Hanya projectile yang masuk wilayah lawan.
 *
 * Projectile dibidik ulang SEBELUM digerakkan, supaya langkah tick ini memakai posisi
 * target yang berlaku sekarang — itulah yang membuat tembakan mengunci (Req 26 AC2).
 */
export function physicsPhase(deps: TickDeps): void {
  const baseHp = deps.config.gameplay.baseHp
  const sideCount = deps.config.gameplay.sideCount

  deps.state.fighters.forEach((fighter) => {
    if (!fighter.alive) return
    fighter.position.x += fighter.velocity.x
    fighter.position.y += fighter.velocity.y
    clampToSideZone(fighter.position, fighter.side, sideCount, fighterScale(fighter.hp, baseHp))
  })

  steerProjectiles(deps.state.projectiles, deps.state.fighters)

  deps.state.projectiles.forEachActive((projectile) => {
    projectile.position.x += projectile.velocity.x
    projectile.position.y += projectile.velocity.y
    projectile.lifetime -= TICK_MS
  })
}

/** Fase 5 — Effects: efek yang habis umurnya kembali ke pool (Req 27 AC4). */
export function effectsPhase(deps: TickDeps): number {
  freezeUltimateOrigins(deps)
  return deps.state.effects.update()
}

/**
 * Fase 6 — Cleanup: buang projectile mati, lalu evaluasi kondisi menang.
 *
 * SATU-SATUNYA kondisi menang adalah target kill (Req 11). Sisi yang habis TIDAK
 * memenangkan ronde bagi lawannya — keputusan creator, dan ia punya konsekuensi yang
 * disengaja: selama target belum tercapai, ronde menunggu. Tidak ada lagi musuh untuk
 * dibunuh berarti skor berhenti naik dan state machine tetap di Battle sampai ada viewer
 * mengetik ulang keyword-nya (respawn otomatis dibatalkan, Plan 5c §1) atau creator menekan
 * Restart. Join tetap berlaku di tengah Battle karena drainActions ikut jalan tiap tick.
 *
 * Pemenang ronde mungkin sudah ditetapkan lebih awal oleh applyDamage saat kedua sisi
 * mencapai target pada event yang sama (Req 11 AC4); nilai itu tidak ditimpa di sini.
 */
export function cleanupPhase(deps: TickDeps): number {
  expireUltimates(deps.state, deps.state.tick)
  const retired = retireProjectiles(deps.state.projectiles)

  if (deps.state.roundWinner === null) {
    for (const side of SIDES) {
      if (deps.state.roundScore[side] >= deps.config.gameplay.killsToWinRound) {
        deps.state.roundWinner = side
        break
      }
    }
  }

  return retired
}

/** Satu tick simulasi penuh. Hanya dipanggil saat state machine berada di Battle. */
export function runTick(deps: TickDeps): void {
  physicsPhase(deps)

  aiPhase({
    fighters: deps.state.fighters,
    rng: deps.rng,
    nowMs: deps.nowMs,
    idleMovement: deps.config.gameplay.idleMovement,
  })

  combatPhase(deps)

  projectilePhase({
    projectiles: deps.state.projectiles,
    fighters: deps.state.fighters,
    // Bentuk kotak arena — dan karenanya bentuk hitbox — memang berbeda antara landscape
    // dan portrait; arena portrait sungguh jauh lebih sempit, bukan sekadar diputar.
    aspect: ARENA_ASPECT[deps.config.overlay.orientation],
    baseHp: deps.config.gameplay.baseHp,
    onHit: (projectile, target) => {
      const owner = deps.state.fighters.get(projectile.ownerKey) ?? null
      applyDamage(target, projectile.damage, owner, deps, projectile.ownerSide)
    },
  })

  effectsPhase(deps)
  cleanupPhase(deps)

  deps.state.tick++
}
