import type { BattleArenaConfig } from '../../config/index.js'
import type { EngineEvent } from '../../events.js'
import { resolveCaption } from '../../triggers.js'
import type { SideId } from '../../types.js'

/**
 * Kill feed dan join feed (Req 33 AC1, Req 15).
 *
 * Dibangun dari EngineEvent, bukan dari selisih dua snapshot: kematian adalah kejadian
 * sesaat, dan fighter yang mati lalu bergabung lagi di antara dua tick akan hilang dari
 * pembacaan berbasis selisih.
 */

export const KILL_FEED_MAX = 5
export const KILL_FEED_TTL_MS = 5000
export const JOIN_FEED_MAX = 5
export const JOIN_FEED_TTL_MS = 4000
/** Lama entri memudar di ujung umurnya. */
export const FEED_FADE_MS = 1000
/** Req 33 AC2 menyebut angkanya: tiga kejadian gift terakhir. */
export const GIFT_FEED_MAX = 3
/** Lebih lama dari kill feed: gift jauh lebih jarang dan jauh lebih berarti. */
export const GIFT_FEED_TTL_MS = 6000
/** Lama entri meluncur masuk di awal umurnya. */
export const FEED_ENTRANCE_MS = 250
/** Seberapa jauh ia meluncur, searah kolomnya (kiri). */
export const FEED_ENTRANCE_OFFSET_PX = -16

export interface KillFeedEntry {
  id: string
  kind: 'kill'
  atMs: number
  killer: string | null
  killerSide: SideId | null
  killerAvatarUrl: string | null
  victim: string
  victimSide: SideId
  victimAvatarUrl: string | null
}

export interface JoinFeedEntry {
  id: string
  kind: 'join'
  atMs: number
  username: string
  side: SideId
}

export interface GiftFeedEntry {
  id: string
  kind: 'gift'
  atMs: number
  username: string
  giftName: string
  /** Deskripsi aksi, `{side}` sudah diganti. Dibaca dari config saat entri dibuat. */
  caption: string
  icon: string
}

export type FeedEntry = KillFeedEntry | JoinFeedEntry | GiftFeedEntry

export function feedEntryFromEvent(
  event: EngineEvent,
  nowMs: number,
  config: BattleArenaConfig,
): FeedEntry | null {
  if (event.type === 'fighterDied') {
    return {
      id: `kill-${nowMs}-${event.fighter.key}`,
      kind: 'kill',
      atMs: nowMs,
      killer: event.killer?.username ?? null,
      killerSide: event.killer?.side ?? null,
      killerAvatarUrl: event.killer?.avatarUrl ?? null,
      victim: event.fighter.username,
      victimSide: event.fighter.side,
      victimAvatarUrl: event.fighter.avatarUrl,
    }
  }

  if (event.type === 'fighterJoined') {
    // Rejoin bukan kedatangan baru: viewer-nya sudah ada di layar sepanjang ronde.
    if (event.outcome !== 'joined' && event.outcome !== 'switched') return null
    if (!config.ui.showJoinedMessages) return null
    return {
      id: `join-${nowMs}-${event.fighter.key}`,
      kind: 'join',
      atMs: nowMs,
      username: event.fighter.username,
      side: event.fighter.side,
    }
  }

  /*
   * Digantung pada actionApplied, bukan event gift tersendiri: gift history menampilkan apa
   * yang BENAR-BENAR terjadi, bukan apa yang sempat dicoba. Aksi yang dibuang karena
   * pengirimnya belum punya fighter tidak pernah sampai ke sini.
   */
  if (event.type === 'actionApplied') {
    const { actor, ruleId, giftName } = event.action
    if (giftName === null || ruleId === null || actor === null) return null

    const rule = config.triggers.find((entry) => entry.id === ruleId)
    if (rule === undefined) return null

    return {
      id: `gift-${nowMs}-${actor.username}-${rule.id}`,
      kind: 'gift',
      atMs: nowMs,
      username: actor.username,
      giftName,
      caption: resolveCaption(rule, config).toUpperCase(),
      // ponytail: emoji legend, bukan GiftCatalogEntry.iconUrl. Katalog gift sudah sampai
      // ke ?stage=1 lewat `useGiftCatalog` di StagePage — persis seperti action legend
      // memakainya — tapi ia hidup di `ui/`, dan feed dibangun di sini dari EngineEvent.
      // Naikkan (satu field `iconUrl` di GiftFeedEntry, diisi pemanggil) kalau creator
      // meminta gambar gift sungguhan di gift history juga.
      icon: rule.legend.icon,
    }
  }

  return null
}

export function pruneFeed<T extends FeedEntry>(
  list: readonly T[],
  nowMs: number,
  ttlMs: number,
): T[] {
  const kept = list.filter((entry) => nowMs - entry.atMs < ttlMs)
  return kept.length === list.length ? (list as T[]) : kept
}

export function pushFeed<T extends FeedEntry>(
  list: readonly T[],
  entry: T,
  nowMs: number,
  max: number,
  ttlMs: number,
): T[] {
  const next = [...pruneFeed(list, nowMs, ttlMs), entry]
  return next.length > max ? next.slice(next.length - max) : next
}

/** 1 sampai jendela fade, lalu turun lurus ke 0 di akhir umurnya. */
export function feedOpacity(entry: FeedEntry, nowMs: number, ttlMs: number): number {
  const remaining = ttlMs - (nowMs - entry.atMs)
  if (remaining >= FEED_FADE_MS) return 1
  if (remaining <= 0) return 0
  return remaining / FEED_FADE_MS
}

/**
 * Animasi masuk sebagai fungsi murni, bukan @keyframes.
 *
 * Overlay tidak boleh mengimpor stylesheet dashboard, dan animasi CSS tidak bisa di-assert
 * sama sekali. `feedEntrance` mengurus ujung AWAL umur entri; `feedOpacity` mengurus ujung
 * akhirnya. Keduanya tidak pernah bertabrakan karena FEED_ENTRANCE_MS jauh lebih pendek
 * daripada TTL mana pun dikurangi FEED_FADE_MS.
 */
export function feedEntrance(
  entry: FeedEntry,
  nowMs: number,
): { opacity: number; offsetPx: number } {
  const age = nowMs - entry.atMs
  if (age <= 0) return { opacity: 0, offsetPx: FEED_ENTRANCE_OFFSET_PX }
  if (age >= FEED_ENTRANCE_MS) return { opacity: 1, offsetPx: 0 }

  const t = age / FEED_ENTRANCE_MS
  return { opacity: t, offsetPx: FEED_ENTRANCE_OFFSET_PX * (1 - t) }
}
