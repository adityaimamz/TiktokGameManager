import type { ChatPlatform } from '@lga/shared'
import type { Entity } from '../../framework/entity/entity.js'

/** Empat sisi arena: 'a', 'b', 'c', 'd'. Mode 2 kubu hanya mengaktifkan 'a' dan 'b'. */
export type SideId = 'a' | 'b' | 'c' | 'd'

export const SIDES: readonly SideId[] = ['a', 'b']
export const SIDES_ALL: readonly SideId[] = ['a', 'b', 'c', 'd']

/** Sisi-sisi yang aktif berdasarkan jumlah kubu yang dipilih. */
export function activeSides(sideCount: 2 | 4): readonly SideId[] {
  return sideCount === 4 ? SIDES_ALL : SIDES
}

/** Mengembalikan daftar seluruh kubu lawan yang aktif (mode FFA). */
export function enemySides(side: SideId, sideCount: 2 | 4): SideId[] {
  const active = activeSides(sideCount)
  return active.filter((s) => s !== side)
}

/**
 * Pemetaan lawan langsung (kompatibilitas mode 2 sisi dan fallback).
 * Pada mode 2 sisi: 'a' <-> 'b'.
 */
export function otherSide(side: SideId): SideId {
  switch (side) {
    case 'a':
      return 'b'
    case 'b':
      return 'a'
    case 'c':
      return 'd'
    case 'd':
      return 'c'
  }
}

/** Empat state loop perilaku per fighter (Req 32 AC1). */
export type AiState = 'acquireTarget' | 'attack' | 'cooldown' | 'idle'

/** Identitas viewer di balik sebuah aksi. */
export interface ActorIdentity {
  platform: ChatPlatform
  username: string
  avatarUrl: string | null
}

/**
 * Kunci identitas lintas ronde dan lintas sisi.
 *
 * Platform ikut masuk kunci supaya viewer demo bernama sama dengan viewer TikTok
 * tetap terhitung dua orang berbeda.
 */
export function fighterKey(actor: { platform: ChatPlatform; username: string }): string {
  return `${actor.platform}:${actor.username}`
}

export interface Fighter extends Entity {
  key: string
  /** Slot stabil untuk pencocokan antar-tick di overlay. Dialokasikan saat join. */
  slotIndex: number
  platform: ChatPlatform
  username: string
  avatarUrl: string | null
  side: SideId
  hp: number
  /** Ikut naik saat Grow — HP bar dihitung terhadap ini, bukan baseHp. */
  maxHp: number
  damage: number
  attackIntervalMs: number
  kills: number
  deaths: number
  /** Total koin gift dari viewer ini sepanjang match. Sumber kartu top gifter di 5b. */
  giftCoins: number
  joinedAtMs: number
  lastAttackAtMs: number | null
  alive: boolean
  aiState: AiState
  targetKey: string | null
  /** Like yang belum mencapai ambang Grow berikutnya. */
  likeAccumulator: number
  facingAngle: number
  nextIdleTurnAtMs: number
}

export interface Projectile extends Entity {
  ownerKey: string
  ownerSide: SideId
  targetKey: string
  damage: number
}

/**
 * Satu penyumbang gift sepanjang sesi.
 *
 * Tinggal di sini, bukan di `state.ts`, karena renderer harus membacanya — dan
 * `renderer/boundaries.test.ts` menggagalkan build kalau sebuah berkas renderer menyentuh
 * `state.ts`. Avatar ikut disimpan karena penyumbang terbesar belum tentu punya fighter,
 * jadi ia belum tentu ada di roster untuk dicari.
 */
export interface SessionGifter {
  username: string
  avatarUrl: string | null
  coins: number
}

/** Jumlah penyumbang sesi yang ditampilkan di papan arena. */
export const SESSION_GIFTER_LIMIT = 5
