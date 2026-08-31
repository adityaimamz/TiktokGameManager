import {
  FIGHTER_STRIDE,
  NO_SIDE,
  NO_SLOT,
  PROJECTILE_STRIDE,
  SIDE_A,
  SIDE_B,
  SNAPSHOT_HEADER_LENGTH,
  ULTIMATE_MAX_TARGETS,
  ULTIMATE_STRIDE,
  snapshotLength,
} from '@lga/shared'
import type { ChatPlatform } from '@lga/shared'
import { effectProgress } from '../../framework/effects/pool.js'
import { PROJECTILE_LIFETIME_MS, sideHalfCenter } from './arena.js'
import { EFFECT_TYPES, NUKE_TYPES } from './config/index.js'
import type { EffectType, NukeType } from './config/index.js'
import { ultimateProgress } from './ultimate.js'
import { MATCH_STATES } from './state-machine.js'
import type { MatchState } from './state-machine.js'
import { topSessionGifter } from './state.js'
import type { BattleArenaState } from './state.js'
import type { SessionGifter, SideId } from './types.js'
// Di-re-export supaya renderer mengambilnya dari sini bersama RosterEntry; ia dilarang
// menyentuh state.ts, dan tipe ini justru lahir di sana.
export type { SessionGifter } from './types.js'

/**
 * Menerjemahkan state Battle Arena ke tata letak numerik §6.2.
 *
 * Encoder tinggal di lapisan game, bukan di platform/, karena ia harus membaca
 * FighterRegistry dan EffectPool. Yang menyeberang ke platform/ hanya Float32Array
 * yang tidak berarti apa-apa tanpa modul ini (keputusan E3).
 */

const EFFECT_INDEX = new Map<string, number>(EFFECT_TYPES.map((type, index) => [type, index]))

export function sideIndex(side: SideId): number {
  return side === 'a' ? SIDE_A : SIDE_B
}

export function sideFromIndex(index: number): SideId {
  return index === SIDE_B ? 'b' : 'a'
}

export function effectTypeIndex(type: string): number {
  return EFFECT_INDEX.get(type) ?? -1
}

export function effectTypeFromIndex(index: number): EffectType | null {
  return EFFECT_TYPES[index] ?? null
}

/** Pasangan pembalik dari NUKE_TYPES.indexOf yang ditulis encoder di field `variant`. */
export function nukeTypeFromIndex(index: number): NukeType | null {
  return NUKE_TYPES[index] ?? null
}

export function matchStateIndex(state: MatchState): number {
  return MATCH_STATES.indexOf(state)
}

export function matchStateFromIndex(index: number): MatchState {
  return MATCH_STATES[index] ?? 'idle'
}

/** Kapasitas awal: cukup untuk satu arena ramai tanpa realokasi di menit pertama. */
const DEFAULT_CAPACITY = snapshotLength(64, 128, 64, 8)

export class SnapshotWriter {
  private buffer: Float32Array

  constructor(initialCapacity: number = DEFAULT_CAPACITY) {
    this.buffer = new Float32Array(Math.max(SNAPSHOT_HEADER_LENGTH, initialCapacity))
  }

  get capacity(): number {
    return this.buffer.length
  }

  /**
   * Menulis satu snapshot dan mengembalikan VIEW ke buffer internal.
   *
   * View itu hanya sah sampai `write()` berikutnya. Pemanggil yang mengirimnya ke tab
   * lain wajib memanggil `.slice()` lebih dulu.
   */
  write(state: Readonly<BattleArenaState>, nowMs: number): Float32Array {
    const fighterCount = state.fighters.count
    const projectileCount = state.projectiles.activeCount
    const effectCount = state.effects.activeCount
    const ultimateCount = state.activeUltimates.length
    const length = snapshotLength(fighterCount, projectileCount, effectCount, ultimateCount)
    if (length > this.buffer.length) this.buffer = new Float32Array(Math.ceil(length * 1.5))

    const buf = this.buffer
    buf[0] = state.tick
    buf[1] = nowMs
    buf[2] = matchStateIndex(state.matchState)
    buf[3] = state.roundScore.a
    buf[4] = state.roundScore.b
    buf[5] = state.roundsWon.a
    buf[6] = state.roundsWon.b
    buf[7] = fighterCount
    buf[8] = projectileCount
    buf[9] = effectCount
    buf[10] = state.roundWinner === null ? NO_SIDE : sideIndex(state.roundWinner)
    buf[11] = ultimateCount

    let offset = SNAPSHOT_HEADER_LENGTH
    for (const fighter of state.fighters.values()) {
      const target = fighter.targetKey === null ? undefined : state.fighters.get(fighter.targetKey)
      buf[offset] = fighter.slotIndex
      buf[offset + 1] = fighter.position.x
      buf[offset + 2] = fighter.position.y
      buf[offset + 3] = fighter.hp
      buf[offset + 4] = fighter.maxHp
      buf[offset + 5] = sideIndex(fighter.side)
      buf[offset + 6] = fighter.alive ? 1 : 0
      buf[offset + 7] = fighter.facingAngle
      buf[offset + 8] = target?.slotIndex ?? NO_SLOT
      buf[offset + 9] = fighter.kills
      buf[offset + 10] = fighter.giftCoins
      offset += FIGHTER_STRIDE
    }

    state.projectiles.forEachActive((projectile) => {
      buf[offset] = projectile.position.x
      buf[offset + 1] = projectile.position.y
      buf[offset + 2] = projectile.velocity.x
      buf[offset + 3] = projectile.velocity.y
      // `kind` dipakai sebagai sisi pemilik: renderer mewarnai trail tanpa perlu
      // kiriman terpisah, dan Fase 2 bisa memperluasnya jadi jenis tembakan.
      buf[offset + 4] = sideIndex(projectile.ownerSide)
      // Umur, bukan sisa hidup: renderer memakainya untuk menumbuhkan berkas dari nol.
      buf[offset + 5] = PROJECTILE_LIFETIME_MS - projectile.lifetime
      offset += PROJECTILE_STRIDE
    })

    state.effects.forEachActive((effect) => {
      buf[offset] = effectTypeIndex(effect.type)
      buf[offset + 1] = effect.x
      buf[offset + 2] = effect.y
      buf[offset + 3] = effectProgress(effect, nowMs)
      buf[offset + 4] = effect.intensity
      buf[offset + 5] = effect.value
      offset += 6
    })

    for (const u of state.activeUltimates) {
      // targetX/targetY DITURUNKAN di sini, tidak disimpan di record: dua angka yang selalu
      // bisa dihitung dari satu enum adalah dua tempat yang bisa menyimpang.
      const target = sideHalfCenter(u.targetSide)
      buf[offset] = u.casterSlot
      buf[offset + 1] = NUKE_TYPES.indexOf(u.nukeType)
      buf[offset + 2] = u.tier
      buf[offset + 3] = u.originX
      buf[offset + 4] = u.originY
      buf[offset + 5] = target.x
      buf[offset + 6] = target.y
      // Dari TICK, bukan dari nowMs — pause membekukan animasi dan damage dalam fase yang
      // sama justru karena keduanya tidak pernah menyentuh jam dinding (keputusan D2).
      buf[offset + 7] = ultimateProgress(u, state.tick)
      buf[offset + 8] = u.killCount
      buf[offset + 9] = u.totalDamage
      buf[offset + 10] = u.stale ? 1 : 0
      buf[offset + 11] = u.slot
      buf[offset + 12] = u.staggerProgress
      buf[offset + 13] = u.msPerProgress
      // Daftar DIPADATKAN sampai penuh, tidak berhenti di panjang aslinya: buffer dipakai
      // ulang antar-tick, jadi ekor yang tidak ditimpa akan menyisakan slot milik ultimate
      // yang sudah selesai — dan rudal akan mengejar fighter yang salah.
      for (let t = 0; t < ULTIMATE_MAX_TARGETS; t++) {
        buf[offset + 14 + t] = u.targetSlots[t] ?? NO_SLOT
      }
      offset += ULTIMATE_STRIDE
    }

    return buf.subarray(0, length)
  }
}

export interface RosterEntry {
  slotIndex: number
  username: string
  avatarUrl: string | null
  side: SideId
  platform: ChatPlatform
}

export interface RosterPayload {
  version: number
  entries: RosterEntry[]
  /**
   * Penyumbang terbesar SESI, atau null selama belum ada gift.
   *
   * Menumpang payload roster dan bukan topik sinyal sendiri, karena topik baru harus ikut
   * masuk `SIGNAL_TOPICS`, `REPLAYED_TOPICS` di server, dan jalur republish — sementara
   * roster sudah menempuh ketiganya. Ia juga sudah berupa objek, jadi ada tempat menaruhnya.
   *
   * Konsekuensinya `RosterPublisher` ikut menerbitkan saat pemuncaknya berganti, bukan hanya
   * saat komposisi roster berubah; lihat signature-nya.
   */
  topGifter: SessionGifter | null
}

/**
 * Data teks roster, dikirim HANYA saat komposisinya berubah (§6.2).
 *
 * Yang sering berubah — posisi, HP, kill — sudah ada di snapshot numerik. Sengaja tidak
 * memuat status hidup/mati supaya kematian tidak memicu kiriman JSON tiap detik.
 */
export class RosterPublisher {
  private signature = ''
  private current = 0

  get version(): number {
    return this.current
  }

  next(state: Readonly<BattleArenaState>): RosterPayload | null {
    const entries: RosterEntry[] = []
    for (const fighter of state.fighters.values()) {
      entries.push({
        slotIndex: fighter.slotIndex,
        username: fighter.username,
        avatarUrl: fighter.avatarUrl,
        side: fighter.side,
        platform: fighter.platform,
      })
    }
    entries.sort((a, b) => a.slotIndex - b.slotIndex)

    // Pemuncak gift ikut ke signature: tanpa itu papan TOP GIFTER hanya berubah saat ada
    // yang join atau keluar, dan gift yang menggeser juara tidak pernah sampai ke overlay.
    const topGifter = topSessionGifter(state)
    const signature = [
      ...entries.map(
        (e) => `${e.slotIndex}:${e.platform}:${e.username}:${e.side}:${e.avatarUrl ?? ''}`,
      ),
      `top:${topGifter?.username ?? ''}:${topGifter?.coins ?? 0}`,
    ].join('|')
    if (signature === this.signature) return null

    this.signature = signature
    this.current++
    return { version: this.current, entries, topGifter }
  }
}
