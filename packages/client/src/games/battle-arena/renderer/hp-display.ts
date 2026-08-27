import type { InterpolatedFighter } from './interpolate.js'

/** Lama bar mengejar nilai sebenarnya setelah satu pukulan (spec §7.4). */
export const HP_CATCHUP_MS = 350

/** Lama UKURAN menyusul HP yang naik — lebih cepat daripada turunnya, dan memantul. */
export const SIZE_GROW_MS = 180

/**
 * Seberapa jauh nilai yang naik melampaui targetnya sebelum kembali.
 *
 * Ini yang membuat gift terasa mendarat: tumbuh mulus sampai pas terbaca sebagai
 * penyesuaian, tumbuh melewati batas lalu balik terbaca sebagai kejadian.
 */
export const SIZE_OVERSHOOT = 1.7

interface Track {
  /** Nilai yang sedang digambar saat animasi ini mulai. */
  from: number
  target: number
  startedAtMs: number
  seenAtMs: number
  rising: boolean
}

export interface ChaseOptions {
  /** Lama mengejar nilai yang TURUN. */
  fallMs: number
  /** Lama mengejar nilai yang NAIK. 0 berarti langsung, tanpa animasi sama sekali. */
  riseMs: number
  /** Kuat pantulan saat naik. 0 berarti tanpa lewat-batas. */
  overshoot: number
}

/**
 * Pantulan standar "back out": melewati 1 lalu kembali.
 *
 * `c1 = 0` menjadikannya kubik biasa tanpa lewat-batas, jadi satu rumus melayani kedua
 * mode dan tidak ada cabang tambahan di jalur panas.
 */
function easeOutBack(t: number, c1: number): number {
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}

/**
 * HP bar yang TURUN beranimasi, bukan melompat.
 *
 * Aftermath adalah porsi terbesar kurva ultimate, dan yang harus terjadi di sana adalah
 * HP korban turun terlihat — bar yang melompat membuat ledakan terasa tidak berakibat.
 * Berlaku untuk SEMUA sumber damage, bukan hanya ultimate: mengejar adalah properti
 * tampilan, bukan properti ultimate.
 *
 * Waktunya dari `view.header.timestampMs`, tidak pernah jam dinding — sama seperti
 * DeathFade, supaya dashboard dan overlay beranimasi dalam fase yang sama.
 */
export class HpDisplay {
  private readonly tracks = new Map<number, Track>()
  private readonly opts: ChaseOptions

  /**
   * Bawaannya perilaku HP bar: turun mengejar, naik melompat.
   *
   * Ukuran fighter memakai kelas yang SAMA dengan opsi lain — turun 350 ms, naik 180 ms
   * dengan pantulan. Dua kelas terpisah berarti dua salinan pembukuan slot yang pasti
   * menyimpang; yang berbeda hanya kurva dan durasinya.
   */
  constructor(opts: Partial<ChaseOptions> = {}) {
    this.opts = { fallMs: HP_CATCHUP_MS, riseMs: 0, overshoot: 0, ...opts }
  }

  observe(fighters: readonly InterpolatedFighter[], count: number, nowMs: number): void {
    for (let i = 0; i < count; i++) {
      const fighter = fighters[i]
      if (fighter === undefined) continue

      const existing = this.tracks.get(fighter.slotIndex)

      // Slot baru atau slot yang didaur ulang: tidak ada yang perlu dikejar, yang muncul
      // adalah fighter lain atau ronde baru. HP yang NAIK ikut ke sini hanya kalau kejaran
      // naik memang dimatikan (`riseMs = 0`), yaitu untuk bar-nya.
      if (
        existing === undefined ||
        (fighter.hp > existing.target && this.opts.riseMs <= 0)
      ) {
        this.tracks.set(fighter.slotIndex, {
          from: fighter.hp,
          target: fighter.hp,
          startedAtMs: nowMs,
          seenAtMs: nowMs,
          rising: false,
        })
        continue
      }

      // HP yang tidak berubah membiarkan animasi berjalan sampai selesai; menyetel ulang
      // di sini akan mengunci bar di nilai barunya satu tick setelah pukulan.
      const previousSeenMs = existing.seenAtMs
      existing.seenAtMs = nowMs
      if (fighter.hp === existing.target) continue

      /*
       * Animasi bermula di frame TERAKHIR yang sudah digambar, bukan di frame yang baru
       * datang: damage-nya terjadi di antara keduanya, dan bar yang menghitung dari frame
       * baru akan diam satu tick penuh sebelum bergerak.
       *
       * `from` adalah nilai yang SEDANG digambar, bukan target lama — pukulan susulan di
       * tengah animasi tidak boleh menyentak bar mundur.
       */
      existing.rising = fighter.hp > existing.target
      existing.from = this.shown(existing, previousSeenMs)
      existing.target = fighter.hp
      existing.startedAtMs = previousSeenMs
    }

    // Slot yang tidak muncul di frame ini sudah keluar dari arena. Membiarkannya berarti
    // slot yang dipakai ulang mewarisi HP orang sebelumnya.
    for (const [slot, track] of this.tracks) {
      if (track.seenAtMs !== nowMs) this.tracks.delete(slot)
    }
  }

  private shown(track: Track, nowMs: number): number {
    const duration = track.rising ? this.opts.riseMs : this.opts.fallMs
    if (duration <= 0) return track.target

    const elapsed = nowMs - track.startedAtMs
    if (elapsed <= 0) return track.from
    if (elapsed >= duration) return track.target

    const eased = track.rising
      ? easeOutBack(elapsed / duration, this.opts.overshoot)
      : elapsed / duration
    return track.from + (track.target - track.from) * eased
  }

  /** HP yang harus digambar untuk slot ini; `actual` dipakai bila slotnya belum dikenal. */
  hpFor(slotIndex: number, actual: number): number {
    const track = this.tracks.get(slotIndex)
    if (track === undefined) return actual
    return this.shown(track, track.seenAtMs)
  }
}
