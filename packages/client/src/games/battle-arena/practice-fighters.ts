import { createChatMessage } from '@lga/shared'
import type { ChatMessage, ChatPlatform } from '@lga/shared'
import type { BattleArenaConfig } from './config/index.js'
import type { RosterFiller } from './engine.js'
import type { FighterRegistry } from './fighters.js'
import { SIDES } from './types.js'
import { viewerName } from './usernames.js'
import type { SideId } from './types.js'

/**
 * Jumlah minimum fighter hidup per sisi sebelum bot ikut mengisi.
 *
 * Angka ini ditinjau ulang setelah terlihat berjalan di layar — arena dengan enam blob
 * per sisi mungkin terasa terlalu ramai atau terlalu sepi.
 */
export const PRACTICE_MIN_PER_SIDE = 6

/** Bot tidak pernah ditulis ke database dan tidak pernah masuk statistik viewer. */
export const PRACTICE_PLATFORM: ChatPlatform = 'practice'

export class PracticeFighters implements RosterFiller {
  private nextIndex = 0

  /**
   * Pesan join untuk menambal kekurangan bot di kedua sisi.
   *
   * Mengembalikan ChatMessage alih-alih menyentuh registry, supaya bot melewati trigger
   * dan ActionQueue yang sama persis dengan viewer sungguhan.
   */
  fill(fighters: FighterRegistry, config: BattleArenaConfig, nowMs: number): ChatMessage[] {
    const target = Math.min(PRACTICE_MIN_PER_SIDE, config.gameplay.maxFightersPerSide)
    const messages: ChatMessage[] = []

    for (const side of SIDES) {
      const missing = target - fighters.countOnSide(side, { aliveOnly: true })
      for (let i = 0; i < missing; i++) {
        const username = viewerName(this.nextIndex++)
        messages.push(
          createChatMessage({
            id: `practice-${username}`,
            kind: 'textMessageEvent',
            platform: PRACTICE_PLATFORM,
            username,
            text: config.sides[side].keyword,
            timestampMs: nowMs,
          }),
        )
      }
    }

    return messages
  }

  /** Satu bot mundur untuk memberi tempat pada satu viewer asli di sisi yang sama. */
  releaseOne(fighters: FighterRegistry, side: SideId): string | null {
    for (const fighter of fighters.values()) {
      if (fighter.side === side && fighter.platform === PRACTICE_PLATFORM) {
        const key = fighter.key
        fighters.remove(key)
        return key
      }
    }
    return null
  }
}
