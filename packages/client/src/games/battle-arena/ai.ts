import { distanceSquared } from '../../framework/collision/circle.js'
import type { Rng } from '../../framework/rng.js'
import { IDLE_SPEED_PER_TICK, IDLE_TURN_MAX_MS, IDLE_TURN_MIN_MS } from './arena.js'
import type { FighterRegistry } from './fighters.js'
import type { Fighter } from './types.js'

export interface AiDeps {
  fighters: FighterRegistry
  rng: Rng
  nowMs: number
  idleMovement: boolean
}

/** Musuh hidup terdekat menurut jarak Euclid (Req 8 AC2). */
export function findNearestEnemy(fighter: Fighter, fighters: FighterRegistry): Fighter | null {
  let nearest: Fighter | null = null
  let nearestSq = Number.POSITIVE_INFINITY

  // for-of atas values() alih-alih forEach: tanpa alokasi, dan penyempitan tipe `nearest`
  // tetap benar karena tidak ada closure yang menugasinya.
  for (const other of fighters.values()) {
    if (!other.alive || other.side === fighter.side) continue
    const d = distanceSquared(fighter.position.x, fighter.position.y, other.position.x, other.position.y)
    if (d < nearestSq) {
      nearestSq = d
      nearest = other
    }
  }

  return nearest
}

function stop(fighter: Fighter): void {
  fighter.velocity.x = 0
  fighter.velocity.y = 0
}

/**
 * Jalan-jalan kecil di separuh sendiri, arah baru tiap 500–1500 ms (Req 32 AC6).
 *
 * Satu-satunya gerak yang dimiliki fighter, apa pun status tempurnya — mengejar tidak
 * ada lagi (Req 8 AC1). Referensi gameplay menunjukkan fighter terus melayang pelan
 * meski sedang menyerang atau menunggu cooldown, jadi ini dipanggil tanpa syarat dari
 * `stepAi`, bukan hanya dari state 'idle'.
 */
function wander(fighter: Fighter, deps: AiDeps): void {
  if (!deps.idleMovement) {
    stop(fighter)
    return
  }
  if (deps.nowMs < fighter.nextIdleTurnAtMs) return

  const angle = deps.rng.range(0, Math.PI * 2)
  const speed = deps.rng.range(0, IDLE_SPEED_PER_TICK)
  fighter.facingAngle = angle
  fighter.velocity.x = Math.cos(angle) * speed
  fighter.velocity.y = Math.sin(angle) * speed
  fighter.nextIdleTurnAtMs = deps.nowMs + deps.rng.range(IDLE_TURN_MIN_MS, IDLE_TURN_MAX_MS)
}

/**
 * Satu langkah loop perilaku untuk satu fighter.
 *
 * State 'attack' sengaja TIDAK diproses di sini: AI hanya menandai kesiapan menyerang,
 * dan fase Combat yang menembakkan projectile lalu memindahkan fighter ke 'cooldown'.
 *
 * Jarak tidak lagi menggerbang kesiapan menyerang (Req 9 AC1): begitu target didapat,
 * fighter langsung siap menyerang pada tick yang sama, tanpa fase MoveToTarget yang
 * mengejar. Empat state (Req 32 AC1) — AcquireTarget, Attack, Cooldown, Idle.
 */
export function stepAi(fighter: Fighter, deps: AiDeps): void {
  if (!fighter.alive) {
    stop(fighter)
    return
  }

  wander(fighter, deps)

  switch (fighter.aiState) {
    case 'idle':
    case 'acquireTarget': {
      const target = findNearestEnemy(fighter, deps.fighters)
      if (target === null) {
        fighter.aiState = 'idle'
        fighter.targetKey = null
        return
      }
      fighter.targetKey = target.key
      fighter.aiState = 'attack'
      return
    }

    case 'attack':
      return

    case 'cooldown': {
      const since = fighter.lastAttackAtMs
      if (since === null || deps.nowMs - since >= fighter.attackIntervalMs) {
        fighter.aiState = 'acquireTarget'
      }
      return
    }
  }
}

/** Fase AI dari tick loop: seluruh fighter melangkah sekali. */
export function aiPhase(deps: AiDeps): void {
  deps.fighters.forEach((fighter) => stepAi(fighter, deps))
}
