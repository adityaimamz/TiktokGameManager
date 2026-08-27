import { circlesOverlap } from '../../framework/collision/circle.js'
import { createEntity } from '../../framework/entity/factory.js'
import { EntityPool } from '../../framework/entity/pool.js'
import {
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED_PER_TICK,
  fighterHitRadius,
  isOutsideArena,
} from './arena.js'
import type { FighterRegistry } from './fighters.js'
import type { Fighter, Projectile } from './types.js'

/** Req 20 menargetkan 500 projectile aktif sekaligus tanpa alokasi baru. */
export const PROJECTILE_POOL_SIZE = 500

function makeProjectile(type: string): Projectile {
  return { ...createEntity(type), ownerKey: '', ownerSide: 'a', targetKey: '', damage: 0 }
}

export function createProjectilePool(initialSize = PROJECTILE_POOL_SIZE): EntityPool<Projectile> {
  return new EntityPool<Projectile>('projectile', initialSize, makeProjectile)
}

/**
 * Menembakkan satu projectile dari penyerang ke arah target.
 *
 * Arah awal ini hanya menetapkan bidikan pertama; `steerProjectiles` membidik ulang
 * setiap tick sesudahnya (Req 26 AC2). Velocity di sini tetap diisi supaya renderer
 * punya arah hadap yang benar pada frame projectile itu lahir.
 */
export function fireProjectile(
  pool: EntityPool<Projectile>,
  attacker: Fighter,
  target: Fighter,
): Projectile {
  const dx = target.position.x - attacker.position.x
  const dy = target.position.y - attacker.position.y
  const distance = Math.hypot(dx, dy)

  // Dua fighter yang persis bertumpuk tetap harus menghasilkan tembakan yang bergerak.
  const ux = distance === 0 ? (attacker.side === 'a' ? 1 : -1) : dx / distance
  const uy = distance === 0 ? 0 : dy / distance

  const projectile = pool.acquire({
    x: attacker.position.x,
    y: attacker.position.y,
    vx: ux * PROJECTILE_SPEED_PER_TICK,
    vy: uy * PROJECTILE_SPEED_PER_TICK,
    lifetime: PROJECTILE_LIFETIME_MS,
  })
  projectile.type = 'projectile'
  projectile.ownerKey = attacker.key
  projectile.ownerSide = attacker.side
  projectile.targetKey = target.key
  projectile.damage = attacker.damage
  return projectile
}

/**
 * Membidik ulang setiap projectile ke posisi targetnya SEKARANG (Req 26 AC2).
 *
 * Inilah "auto lock" pada video referensi: tembakan melengkung mengikuti musuh, bukan
 * melaju lurus ke tempat musuh itu berdiri sedetik lalu. Tanpa ini, kecepatan projectile
 * yang jauh di atas kecepatan wander tetap saja sering meleset, karena target sempat
 * bergeser selama peluru di udara.
 *
 * Target yang mati atau sudah keluar dari registry TIDAK membatalkan projectile: ia
 * meneruskan lintasan terakhirnya sampai umurnya habis atau mengenai siapa pun.
 */
export function steerProjectiles(
  projectiles: EntityPool<Projectile>,
  fighters: FighterRegistry,
): void {
  projectiles.forEachActive((projectile) => {
    const target = fighters.get(projectile.targetKey)
    if (target === undefined || !target.alive) return

    const dx = target.position.x - projectile.position.x
    const dy = target.position.y - projectile.position.y
    const distance = Math.hypot(dx, dy)
    if (distance === 0) return

    // Langkah terakhir mendarat PERSIS di target, tidak melewatinya. Satu langkah penuh
    // (5 unit) lebih besar daripada jumlah radius tabrakan (3,5), jadi tanpa penjepitan
    // ini projectile bisa melompati hitbox lalu berbalik dan berosilasi tanpa pernah kena.
    const step = Math.min(PROJECTILE_SPEED_PER_TICK, distance)
    projectile.velocity.x = (dx / distance) * step
    projectile.velocity.y = (dy / distance) * step
  })
}

export interface ProjectilePhaseDeps {
  projectiles: EntityPool<Projectile>
  fighters: FighterRegistry
  /**
   * `ARENA_ASPECT[orientation]` — kurs persen-X → persen-Y (lihat arena.ts).
   *
   * Wajib, bukan opsional dengan default landscape: nilai yang salah diam-diam
   * mengembalikan hitbox elips, persis bug yang perbaikan ini buang.
   */
  aspect: number
  /** HP dasar config — penyebut skala ukuran fighter. */
  baseHp: number
  /** Dipanggil sekali per tabrakan. Modul ini tidak menghitung damage sendiri. */
  onHit: (projectile: Projectile, target: Fighter) => void
}

/**
 * Fase Projectiles: deteksi tabrakan lingkaran-lingkaran, lalu laporkan.
 *
 * Lingkaran di ruang PIKSEL, bukan di ruang persen: kedua koordinat-X dikalikan `aspect`
 * lebih dulu supaya sumbu X dan Y punya satuan yang sama. Radius keduanya sudah dalam
 * persen-Y dan sama besar dengan sprite masing-masing, jadi kena berarti bersentuhan.
 *
 * Projectile hanya bisa mengenai SATU fighter — begitu kena, ia langsung kembali ke pool.
 */
export function projectilePhase(deps: ProjectilePhaseDeps): number {
  let hits = 0

  deps.projectiles.forEachActive((projectile) => {
    for (const fighter of deps.fighters.values()) {
      if (!fighter.alive || fighter.side === projectile.ownerSide) continue
      const overlapping = circlesOverlap(
        projectile.position.x * deps.aspect,
        projectile.position.y,
        PROJECTILE_RADIUS,
        fighter.position.x * deps.aspect,
        fighter.position.y,
        // Fighter besar memang sasaran yang lebih lebar; radiusnya tumbuh bersama blob-nya.
        fighterHitRadius(fighter.hp, deps.baseHp),
      )
      if (!overlapping) continue

      deps.onHit(projectile, fighter)
      deps.projectiles.release(projectile)
      hits++
      return
    }
  })

  return hits
}

/** Fase Cleanup: buang projectile yang kedaluwarsa atau keluar arena (Req 26 AC5–AC6). */
export function retireProjectiles(projectiles: EntityPool<Projectile>): number {
  let retired = 0
  projectiles.forEachActive((projectile) => {
    if (projectile.lifetime <= 0 || isOutsideArena(projectile.position)) {
      projectiles.release(projectile)
      retired++
    }
  })
  return retired
}
