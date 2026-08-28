import { describe, expect, it } from 'vitest'
import {
  EFFECT_STRIDE,
  FIGHTER_STRIDE,
  NO_SLOT,
  PROJECTILE_STRIDE,
  SNAPSHOT_HEADER_LENGTH,
  ULTIMATE_MAX_TARGETS,
  ULTIMATE_STRIDE,
  SnapshotHistory,
  createSnapshotView,
  decodeSnapshot,
  snapshotLength,
} from '../src/snapshot.js'

/** Daftar slot sepanjang ULTIMATE_MAX_TARGETS, dipadatkan dari depan dengan NO_SLOT. */
const padSlots = (slots: readonly number[]): number[] => {
  const out = new Array<number>(ULTIMATE_MAX_TARGETS).fill(NO_SLOT)
  slots.forEach((slot, i) => {
    out[i] = slot
  })
  return out
}

/**
 * Satu snapshot buatan tangan: 1 fighter, 1 projectile, 1 efek.
 *
 * Angka-angkanya sengaja dipilih yang eksak di float32 (1.25, bukan 1.2) supaya
 * assertion bisa `toEqual` persis. Nilai seperti 1.2 kembali sebagai
 * 1.2000000476837158 — itu sifat Float32Array, bukan bug decoder.
 */
const sample = (tick = 7): Float32Array => {
  const buf = new Float32Array(snapshotLength(1, 1, 1))
  buf.set([tick, 1000, 3, 2, 1, 1, 0, 1, 1, 1, -1], 0)
  buf.set([4, 25, 60, 80, 200, 0, 1, 1.57, 9, 3], SNAPSHOT_HEADER_LENGTH)
  buf.set([30, 40, 1.5, 0, 0, 150], SNAPSHOT_HEADER_LENGTH + FIGHTER_STRIDE)
  buf.set([2, 55, 20, 0.5, 1.25, 12], SNAPSHOT_HEADER_LENGTH + FIGHTER_STRIDE + PROJECTILE_STRIDE)
  return buf
}

describe('snapshotLength', () => {
  it('is the header plus one record per entity', () => {
    expect(snapshotLength(0, 0, 0)).toBe(SNAPSHOT_HEADER_LENGTH)
    expect(snapshotLength(2, 3, 4)).toBe(
      SNAPSHOT_HEADER_LENGTH + 2 * FIGHTER_STRIDE + 3 * PROJECTILE_STRIDE + 4 * EFFECT_STRIDE,
    )
  })
})

describe('decodeSnapshot', () => {
  it('reads the header', () => {
    const view = decodeSnapshot(sample())
    expect(view.header.tick).toBe(7)
    expect(view.header.timestampMs).toBe(1000)
    expect(view.header.matchState).toBe(3)
    expect(view.header.roundScoreA).toBe(2)
    expect(view.header.roundScoreB).toBe(1)
    expect(view.header.roundsWonA).toBe(1)
    expect(view.header.roundsWonB).toBe(0)
    expect(view.header.fighterCount).toBe(1)
    expect(view.header.projectileCount).toBe(1)
    expect(view.header.effectCount).toBe(1)
    expect(view.header.roundWinner).toBe(-1)
  })

  it('reads the round winner when a round has been decided', () => {
    const buf = sample()
    buf[10] = 1
    expect(decodeSnapshot(buf).header.roundWinner).toBe(1)
  })

  it('reads every field of a fighter record', () => {
    const f = decodeSnapshot(sample()).fighters[0]
    expect(f).toBeDefined()
    expect(f?.slotIndex).toBe(4)
    expect(f?.x).toBe(25)
    expect(f?.y).toBe(60)
    expect(f?.hp).toBe(80)
    expect(f?.maxHp).toBe(200)
    expect(f?.side).toBe(0)
    expect(f?.alive).toBe(1)
    expect(f?.facingAngle).toBeCloseTo(1.57, 5)
    expect(f?.targetSlot).toBe(9)
    expect(f?.kills).toBe(3)
  })

  it('reads projectiles and effects', () => {
    const view = decodeSnapshot(sample())
    expect(view.projectiles[0]).toEqual({ x: 30, y: 40, vx: 1.5, vy: 0, kind: 0, age: 150 })
    expect(view.effects[0]).toEqual({
      type: 2,
      x: 55,
      y: 20,
      progress: 0.5,
      intensity: 1.25,
      value: 12,
    })
  })

  it('reuses its record objects instead of allocating every frame', () => {
    const view = createSnapshotView()
    decodeSnapshot(sample(1), view)
    const first = view.fighters[0]
    decodeSnapshot(sample(2), view)
    expect(view.fighters[0]).toBe(first)
    expect(view.header.tick).toBe(2)
  })

  it('keeps the array long when the count shrinks, so callers must trust the count', () => {
    const view = createSnapshotView()
    decodeSnapshot(sample(), view)
    const empty = new Float32Array(snapshotLength(0, 0, 0))
    decodeSnapshot(empty, view)
    expect(view.header.fighterCount).toBe(0)
    expect(view.fighters.length).toBeGreaterThan(0)
  })
})

describe('SnapshotHistory', () => {
  it('has no data before the first push', () => {
    expect(new SnapshotHistory().hasData).toBe(false)
  })

  it('makes previous equal current on the very first snapshot', () => {
    const history = new SnapshotHistory()
    history.push(sample(1))
    expect(history.hasData).toBe(true)
    expect(history.current.header.tick).toBe(1)
    expect(history.previous.header.tick).toBe(1)
  })

  it('remembers the snapshot before the current one', () => {
    const history = new SnapshotHistory()
    history.push(sample(1))
    history.push(sample(2))
    history.push(sample(3))
    expect(history.current.header.tick).toBe(3)
    expect(history.previous.header.tick).toBe(2)
    expect(history.receivedCount).toBe(3)
  })

  it('never lets current and previous be the same object', () => {
    const history = new SnapshotHistory()
    history.push(sample(1))
    history.push(sample(2))
    expect(history.current).not.toBe(history.previous)
  })
})

describe('koin gift di record fighter', () => {
  it('membawa giftCoins melewati round-trip', () => {
    const buf = new Float32Array(snapshotLength(1, 0, 0))
    buf[7] = 1
    buf[SNAPSHOT_HEADER_LENGTH + 9] = 4 // kills
    buf[SNAPSHOT_HEADER_LENGTH + 10] = 1250 // giftCoins

    const view = decodeSnapshot(buf)

    expect(view.fighters[0]?.kills).toBe(4)
    expect(view.fighters[0]?.giftCoins).toBe(1250)
  })

  it('memakai stride 11 per fighter', () => {
    expect(FIGHTER_STRIDE).toBe(11)
    expect(snapshotLength(2, 0, 0)).toBe(SNAPSHOT_HEADER_LENGTH + 22)
  })
})

describe('bagian ultimate', () => {
  it('menyalakan header dan men-decode record utuh', () => {
    const buf = new Float32Array(snapshotLength(0, 0, 0, 1))
    buf[11] = 1 // ultimateCount
    buf.set(
      [3, 1, 2, 20, 40, 75, 50, 0.5, 4, 180, 0, 6, 0.02, 2600, ...padSlots([7, 3])],
      SNAPSHOT_HEADER_LENGTH,
    )

    const view = decodeSnapshot(buf)

    expect(view.header.ultimateCount).toBe(1)
    expect(view.ultimates[0]).toEqual({
      casterSlot: 3,
      variant: 1,
      tier: 2,
      originX: 20,
      originY: 40,
      targetX: 75,
      targetY: 50,
      progress: 0.5,
      killCount: 4,
      totalDamage: 180,
      stale: 0,
      slot: 6,
      staggerProgress: expect.closeTo(0.02, 5) as unknown as number,
      msPerProgress: 2600,
      targetSlots: padSlots([7, 3]),
    })
  })

  /*
   * Float32Array mengembalikan 0 untuk indeks yang tidak pernah ditulis, BUKAN undefined —
   * jadi ekor daftar yang tidak dipadatkan akan terbaca sebagai deretan "slot 0", dan tiap
   * rudal akan mengejar fighter pertama di arena.
   */
  it('mengembalikan slot yang tidak terpakai sebagai NO_SLOT, bukan 0', () => {
    const buf = new Float32Array(snapshotLength(0, 0, 0, 1))
    buf[11] = 1
    buf.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...padSlots([7, 3])], SNAPSHOT_HEADER_LENGTH)

    const decoded = decodeSnapshot(buf).ultimates[0]
    expect(decoded?.targetSlots.slice(0, 2)).toEqual([7, 3])
    expect(decoded?.targetSlots[2]).toBe(NO_SLOT)
    expect(decoded?.targetSlots).toHaveLength(ULTIMATE_MAX_TARGETS)
  })

  it('memakai ulang array targetSlots antar-decode, tanpa alokasi baru', () => {
    const buf = new Float32Array(snapshotLength(0, 0, 0, 1))
    buf[11] = 1
    const view = decodeSnapshot(buf)
    const first = view.ultimates[0]?.targetSlots
    decodeSnapshot(buf, view)
    expect(view.ultimates[0]?.targetSlots).toBe(first)
  })

  it('membawa dua besaran waktu yang dihitung engine', () => {
    expect(ULTIMATE_STRIDE).toBe(12 + 2 + ULTIMATE_MAX_TARGETS)
  })

  it('ultimate ditulis SETELAH bagian efek', () => {
    expect(snapshotLength(1, 1, 1, 1)).toBe(
      SNAPSHOT_HEADER_LENGTH + FIGHTER_STRIDE + PROJECTILE_STRIDE + EFFECT_STRIDE + ULTIMATE_STRIDE,
    )
  })

  it('parameter keempat opsional supaya pemanggil lama tidak berubah', () => {
    expect(snapshotLength(2, 3, 4)).toBe(snapshotLength(2, 3, 4, 0))
  })

  it('stride terkunci', () => {
    expect(SNAPSHOT_HEADER_LENGTH).toBe(12)
    expect(ULTIMATE_STRIDE).toBe(24)
    expect(ULTIMATE_MAX_TARGETS).toBe(10)
  })
})
