import { describe, expect, it } from 'vitest'
import { NO_SLOT, createSnapshotView } from '@lga/shared'
import type { SnapshotFighter, SnapshotUltimate, SnapshotView } from '@lga/shared'
import { TICK_MS } from '../arena.js'
import {
  alphaFromElapsed,
  extrapolateProjectile,
  interpolateFighters,
  interpolateUltimates,
  lerp,
  lerpAngle,
} from './interpolate.js'
import type { InterpolatedFighter } from './interpolate.js'
import { ultimateWith } from '../../../testing/ultimate-fixtures.js'

const fighter = (over: Partial<SnapshotFighter>): SnapshotFighter => ({
  slotIndex: 0,
  x: 0,
  y: 0,
  hp: 100,
  maxHp: 100,
  side: 0,
  alive: 1,
  facingAngle: 0,
  targetSlot: -1,
  kills: 0,
  giftCoins: 0,
  ...over,
})

const viewOf = (fighters: SnapshotFighter[]): SnapshotView => {
  const view = createSnapshotView()
  view.header.fighterCount = fighters.length
  view.fighters = fighters
  return view
}

describe('lerp and lerpAngle', () => {
  it('walks from a to b', () => {
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 0.5)).toBe(15)
    expect(lerp(10, 20, 1)).toBe(20)
  })

  it('turns the short way around instead of unwinding through zero', () => {
    const result = lerpAngle(3.0, -3.0, 0.5)
    expect(Math.abs(result)).toBeGreaterThan(3.0)
    expect(Math.abs(result)).toBeLessThanOrEqual(Math.PI + 1e-6)
  })

  it('leaves an unchanged angle alone', () => {
    expect(lerpAngle(1.2, 1.2, 0.5)).toBeCloseTo(1.2, 6)
  })
})

describe('alphaFromElapsed', () => {
  it('is the fraction of a tick that has passed', () => {
    expect(alphaFromElapsed(0)).toBe(0)
    expect(alphaFromElapsed(TICK_MS / 2)).toBeCloseTo(0.5, 6)
  })

  it('clamps instead of extrapolating when a snapshot is late', () => {
    expect(alphaFromElapsed(TICK_MS * 4)).toBe(1)
    expect(alphaFromElapsed(-100)).toBe(0)
  })
})

describe('interpolateFighters', () => {
  it('places a fighter halfway between the two snapshots', () => {
    const previous = viewOf([fighter({ slotIndex: 0, x: 10, y: 20 })])
    const current = viewOf([fighter({ slotIndex: 0, x: 30, y: 40 })])
    const out: InterpolatedFighter[] = []

    expect(interpolateFighters(previous, current, 0.5, out)).toBe(1)
    expect(out[0]?.x).toBeCloseTo(20, 6)
    expect(out[0]?.y).toBeCloseTo(30, 6)
  })

  it('copies every non-positional field from the current snapshot', () => {
    const previous = viewOf([fighter({ slotIndex: 3, hp: 100, kills: 1 })])
    const current = viewOf([fighter({ slotIndex: 3, hp: 40, kills: 2, targetSlot: 8, side: 1 })])
    const out: InterpolatedFighter[] = []

    interpolateFighters(previous, current, 0.5, out)

    expect(out[0]?.hp).toBe(40)
    expect(out[0]?.kills).toBe(2)
    expect(out[0]?.targetSlot).toBe(8)
    expect(out[0]?.side).toBe(1)
  })

  it('snaps a slot that did not exist in the previous snapshot', () => {
    const previous = viewOf([])
    const current = viewOf([fighter({ slotIndex: 5, x: 80, y: 50 })])
    const out: InterpolatedFighter[] = []

    interpolateFighters(previous, current, 0.5, out)

    expect(out[0]?.x).toBe(80)
    expect(out[0]?.y).toBe(50)
  })

  it('snaps a fighter that just came back to life instead of sliding it there', () => {
    const previous = viewOf([fighter({ slotIndex: 1, x: 10, y: 10, alive: 0 })])
    const current = viewOf([fighter({ slotIndex: 1, x: 90, y: 90, alive: 1 })])
    const out: InterpolatedFighter[] = []

    interpolateFighters(previous, current, 0.5, out)

    expect(out[0]?.x).toBe(90)
    expect(out[0]?.y).toBe(90)
  })

  it('ignores slots that only exist in the previous snapshot', () => {
    const previous = viewOf([fighter({ slotIndex: 0 }), fighter({ slotIndex: 1 })])
    const current = viewOf([fighter({ slotIndex: 1, x: 7 })])
    const out: InterpolatedFighter[] = []

    expect(interpolateFighters(previous, current, 0.5, out)).toBe(1)
    expect(out[0]?.slotIndex).toBe(1)
  })

  it('reuses its output objects across frames', () => {
    const previous = viewOf([fighter({ slotIndex: 0, x: 0 })])
    const current = viewOf([fighter({ slotIndex: 0, x: 10 })])
    const out: InterpolatedFighter[] = []

    interpolateFighters(previous, current, 0.5, out)
    const first = out[0]
    interpolateFighters(previous, current, 0.75, out)

    expect(out[0]).toBe(first)
    expect(out[0]?.x).toBeCloseTo(7.5, 6)
  })

  it('honours the count rather than the array length', () => {
    const previous = viewOf([fighter({ slotIndex: 0 })])
    const current = viewOf([fighter({ slotIndex: 0, x: 5 }), fighter({ slotIndex: 1, x: 9 })])
    current.header.fighterCount = 1

    const out: InterpolatedFighter[] = []
    expect(interpolateFighters(previous, current, 1, out)).toBe(1)
  })
})

describe('extrapolateProjectile', () => {
  it('carries the projectile forward along its own velocity', () => {
    const out = { x: 0, y: 0 }
    extrapolateProjectile({ x: 10, y: 20, vx: 4, vy: -2, kind: 0, age: 0 }, 0.5, out)

    expect(out.x).toBeCloseTo(12, 6)
    expect(out.y).toBeCloseTo(19, 6)
  })
})

describe('interpolateUltimates', () => {
  const view = (ultimates: Partial<SnapshotUltimate>[]): SnapshotView => {
    const base = createSnapshotView()
    base.header.ultimateCount = ultimates.length
    base.ultimates = ultimates.map((u) =>
      ultimateWith({ variant: 1, originX: 0, progress: 0, ...u }),
    )
    return base
  }

  it('melerp progress dan origin antara dua snapshot', () => {
    const out: SnapshotUltimate[] = []
    const count = interpolateUltimates(
      view([{ slot: 0, progress: 0.2, originX: 10 }]),
      view([{ slot: 0, progress: 0.4, originX: 20 }]),
      0.5,
      out,
    )

    expect(count).toBe(1)
    expect(out[0]?.progress).toBeCloseTo(0.3, 5)
    expect(out[0]?.originX).toBeCloseTo(15, 5)
  })

  it('mencocokkan lewat slot, bukan lewat urutan array', () => {
    const out: SnapshotUltimate[] = []
    interpolateUltimates(
      view([
        { slot: 1, progress: 0.8 },
        { slot: 0, progress: 0.2 },
      ]),
      view([
        { slot: 0, progress: 0.4 },
        { slot: 1, progress: 1 },
      ]),
      0.5,
      out,
    )

    // Slot 0 ada di indeks 1 pada snapshot lama; kalau pencocokannya lewat urutan,
    // nilai ini akan jadi lerp(0.8, 0.4) = 0.6 dan ultimate mundur di layar.
    expect(out[0]?.progress).toBeCloseTo(0.3, 5)
    expect(out[1]?.progress).toBeCloseTo(0.9, 5)
  })

  it('slot yang tidak ada di snapshot sebelumnya digambar tanpa interpolasi', () => {
    const out: SnapshotUltimate[] = []
    interpolateUltimates(view([]), view([{ slot: 3, progress: 0.18 }]), 0.5, out)

    expect(out[0]?.progress).toBe(0.18)
  })

  /*
   * Penjaga aturan spec §7.1: interpolasi MENGEJAR, tidak pernah meramal. Pada alpha berapa
   * pun hasilnya tidak boleh melewati snapshot berikutnya.
   */
  it('tidak pernah melampaui snapshot berikutnya pada alpha mana pun', () => {
    const out: SnapshotUltimate[] = []
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      interpolateUltimates(
        view([{ slot: 0, progress: 0.2 }]),
        view([{ slot: 0, progress: 0.4 }]),
        alpha,
        out,
      )
      expect(out[0]?.progress).toBeGreaterThanOrEqual(0.2)
      expect(out[0]?.progress).toBeLessThanOrEqual(0.4)
    }
  })

  it('berhenti bergerak saat snapshot berhenti datang', () => {
    const out: SnapshotUltimate[] = []
    const frozen = view([{ slot: 0, progress: 0.4 }])

    interpolateUltimates(frozen, frozen, 1, out)
    const first = out[0]?.progress
    interpolateUltimates(frozen, frozen, 1, out)

    expect(out[0]?.progress).toBe(first)
  })

  it('angka diskret disalin apa adanya, tidak pernah dilerp', () => {
    const out: SnapshotUltimate[] = []
    interpolateUltimates(
      view([{ slot: 0, killCount: 0, totalDamage: 0, tier: 0 }]),
      view([{ slot: 0, killCount: 3, totalDamage: 150, tier: 2 }]),
      0.5,
      out,
    )

    expect(out[0]?.killCount).toBe(3)
    expect(out[0]?.totalDamage).toBe(150)
    expect(out[0]?.tier).toBe(2)
  })

  /*
   * Melerp nomor slot menghasilkan "slot 3,5" — dan rudal yang mengejar fighter yang tidak
   * ada. Besaran waktunya sama: keduanya dikunci engine sekali saat rilis dan tidak pernah
   * bergerak, jadi melerpnya hanya bisa membuatnya salah.
   */
  it('daftar sasaran dan besaran waktu disalin, tidak pernah dilerp', () => {
    const out: SnapshotUltimate[] = []
    interpolateUltimates(
      view([{ slot: 0, staggerProgress: 0.02, msPerProgress: 2600, targetSlots: [1, 2] }]),
      view([{ slot: 0, staggerProgress: 0.05, msPerProgress: 1224, targetSlots: [4, 5] }]),
      0.5,
      out,
    )

    expect(out[0]?.staggerProgress).toBeCloseTo(0.05, 6)
    expect(out[0]?.msPerProgress).toBe(1224)
    expect(out[0]?.targetSlots.slice(0, 2)).toEqual([4, 5])
  })

  it('memakai ulang array targetSlots pada keluarannya', () => {
    const out: SnapshotUltimate[] = []
    const snapshot = view([{ slot: 0, targetSlots: [1] }])
    interpolateUltimates(snapshot, snapshot, 0.5, out)
    const first = out[0]?.targetSlots
    interpolateUltimates(snapshot, snapshot, 0.5, out)
    expect(out[0]?.targetSlots).toBe(first)
  })

  it('membersihkan ekor daftar saat sasaran berkurang', () => {
    const out: SnapshotUltimate[] = []
    interpolateUltimates(view([{ slot: 0, targetSlots: [1, 2, 3] }]), view([{ slot: 0, targetSlots: [9] }]), 1, out)
    expect(out[0]?.targetSlots[0]).toBe(9)
    expect(out[0]?.targetSlots[1]).toBe(NO_SLOT)
  })
})
