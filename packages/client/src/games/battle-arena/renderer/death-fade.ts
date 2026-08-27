import type { InterpolatedFighter } from './interpolate.js'

/**
 * Berapa lama fighter mati masih terlihat sebelum hilang sepenuhnya (Req 10 AC2).
 *
 * Waktunya datang dari `view.header.timestampMs`, bukan jam dinding: renderer tidak boleh
 * memanggil Date.now(), dan dashboard serta overlay harus memudar dalam fase yang sama
 * karena keduanya membaca stempel dari snapshot yang sama.
 */
export const DEATH_FADE_MS = 500

export class DeathFade {
  /** Slot yang pernah terlihat hidup. Syarat sebuah kematian boleh distempel. */
  private readonly seenAlive = new Set<number>()
  private readonly diedAtMs = new Map<number, number>()

  observe(fighters: readonly InterpolatedFighter[], count: number, nowMs: number): void {
    for (let i = 0; i < count; i++) {
      const fighter = fighters[i]
      if (fighter === undefined) continue

      if (fighter.alive === 1) {
        this.seenAlive.add(fighter.slotIndex)
        this.diedAtMs.delete(fighter.slotIndex)
        continue
      }

      // delete() menjawab true HANYA sekali: pada frame pertama setelah kematian yang
      // benar-benar disaksikan. Frame berikutnya tidak menimpa stempelnya, dan slot yang
      // sejak awal sudah mati tidak pernah masuk ke sini sama sekali.
      if (this.seenAlive.delete(fighter.slotIndex)) {
        this.diedAtMs.set(fighter.slotIndex, nowMs)
      }
    }
  }

  /** 1 tepat saat mati, turun lurus ke 0 di DEATH_FADE_MS. 0 berarti jangan digambar. */
  alphaFor(slotIndex: number, nowMs: number): number {
    const diedAt = this.diedAtMs.get(slotIndex)
    if (diedAt === undefined) return 0

    const elapsed = nowMs - diedAt
    if (elapsed <= 0) return 1
    if (elapsed >= DEATH_FADE_MS) return 0
    return 1 - elapsed / DEATH_FADE_MS
  }
}
