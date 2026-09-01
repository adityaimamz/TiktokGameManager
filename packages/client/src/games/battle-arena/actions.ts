import type { Action } from '../../framework/actions/action.js'
import { fighterKey } from './types.js'
import type { ActorIdentity, SideId } from './types.js'

/**
 * Sembilan tipe Req 30 AC1, dengan 'ultimate' memakai nama 'nuke' (§4) dan dua tambahan:
 * 'grow' dan 'hasten'. Grow menaikkan maxHp, sesuatu yang 'heal' — yang justru dibatasi
 * maxHp — tidak bisa lakukan (§15 butir 8). Hasten memperpendek attackIntervalMs, sesuatu
 * yang 'buff' — yang hanya menyentuh damage — juga tidak bisa (Req 13 AC3).
 */
export type BattleActionType =
  | 'spawn'
  | 'grow'
  | 'heal'
  | 'damage'
  | 'buff'
  | 'debuff'
  | 'hasten'
  | 'nuke'
  | 'spawnEffect'
  | 'playSound'
  | 'cameraShake'

/**
 * Empat target relatif butuh tahu SIAPA pengirimnya, sesuatu yang hanya state ketahui.
 * Karena itu kunci aktor ikut disandikan ke string target dan dibuka di combat.ts —
 * pola yang sama dengan `sender`, yang sudah jadi `fighter:<kunci>` sejak Fase 1.
 */
export type RelativeScope = 'ownSide' | 'enemySide' | 'randomAlly' | 'randomEnemy'

export const RELATIVE_SCOPES: readonly RelativeScope[] = [
  'ownSide',
  'enemySide',
  'randomAlly',
  'randomEnemy',
]

/** Sasaran sebuah TriggerRule, diselesaikan jadi target string saat rule dipicu. */
export type TargetKind = 'sender' | 'sideA' | 'sideB' | 'sideC' | 'sideD' | 'all' | RelativeScope

export interface BattleAction extends Action<BattleActionType> {
  /** Viewer di balik aksi ini, atau null untuk aksi tanpa pengirim. */
  actor: ActorIdentity | null
  /** TriggerRule yang melahirkan aksi ini, atau null bila ia tidak lahir dari rule. */
  ruleId: string | null
  /**
   * Nama gift yang memicunya. Non-null HANYA untuk aksi dari event gift — itulah yang
   * dipakai gift history untuk memisahkannya dari aksi komentar, like, dan follow.
   */
  giftName: string | null
  /**
   * Koin gift kejadian ini, 0 untuk aksi non-gift.
   *
   * Tier ultimate dipilih dari angka INI, bukan dari total kumulatif Fighter.giftCoins —
   * dan gifter yang belum punya fighter memang tidak punya total apa pun.
   */
  giftCoins: number
}

export const ALL_TARGET = 'all'

export function fighterTarget(actor: { platform: ActorIdentity['platform']; username: string }): string {
  return `fighter:${fighterKey(actor)}`
}

export function sideTarget(side: SideId): string {
  return `side:${side}`
}

export type ResolvedTarget =
  | { kind: 'fighter'; key: string }
  | { kind: 'side'; side: SideId }
  | { kind: 'all' }
  | { kind: 'relative'; scope: RelativeScope; key: string }
  | { kind: 'unknown' }

export function parseTarget(target: string): ResolvedTarget {
  if (target === ALL_TARGET) return { kind: 'all' }
  if (target.startsWith('fighter:')) return { kind: 'fighter', key: target.slice('fighter:'.length) }
  if (target === 'side:a') return { kind: 'side', side: 'a' }
  if (target === 'side:b') return { kind: 'side', side: 'b' }
  if (target === 'side:c') return { kind: 'side', side: 'c' }
  if (target === 'side:d') return { kind: 'side', side: 'd' }

  for (const scope of RELATIVE_SCOPES) {
    const prefix = `${scope}:`
    // slice(prefix.length), bukan split(':'), karena kunci fighter sendiri memuat titik dua.
    if (target.startsWith(prefix)) return { kind: 'relative', scope, key: target.slice(prefix.length) }
  }

  return { kind: 'unknown' }
}

/** Sebuah rule menyebut sasarannya secara simbolik; di sini ia jadi target konkret. */
export function targetFromKind(kind: TargetKind, actor: ActorIdentity | null): string {
  switch (kind) {
    case 'sender':
      return actor === null ? ALL_TARGET : fighterTarget(actor)
    case 'sideA':
      return sideTarget('a')
    case 'sideB':
      return sideTarget('b')
    case 'sideC':
      return sideTarget('c')
    case 'sideD':
      return sideTarget('d')
    case 'all':
      return ALL_TARGET
    default:
      // Tanpa pengirim tidak ada titik acuan; jatuh ke ALL_TARGET seperti 'sender'.
      return actor === null ? ALL_TARGET : `${kind}:${fighterKey(actor)}`
  }
}

export interface BattleActionInit {
  type: BattleActionType
  target: string
  value?: number
  duration?: number
  actor?: ActorIdentity | null
  ruleId?: string | null
  giftName?: string | null
  giftCoins?: number
}

export function createBattleAction(init: BattleActionInit): BattleAction {
  return {
    type: init.type,
    target: init.target,
    value: init.value ?? 0,
    duration: init.duration ?? 0,
    actor: init.actor ?? null,
    ruleId: init.ruleId ?? null,
    giftName: init.giftName ?? null,
    giftCoins: init.giftCoins ?? 0,
    // HANYA nuke yang mendapat perlindungan eviction. Action lain yang juga punya
    // giftCoins > 0 (grow/heal/hasten dari gift) TIDAK dilindungi: kehilangan satu
    // grow dari like berarti sedikit HP yang tidak naik, sementara kehilangan satu nuke
    // berarti PANGGUNG TAYANG dari gift yang SUDAH DIBAYAR hilang permanen — nama
    // pengirim tidak pernah muncul di layar dan animasi ultimatenya tidak pernah
    // terputar. Keduanya beda tingkat keparahan secara fundamental.
    neverEvict: init.type === 'nuke' || undefined,
  }
}
