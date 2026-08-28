import { describe, expect, it } from 'vitest'
import { CHARGE_END, IMPACT_AT, NO_SLOT } from '@lga/shared'
import { createManualClock } from '../../../src/framework/clock.js'
import { createRng } from '../../../src/framework/rng.js'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import { createBattleArenaState } from '../../../src/games/battle-arena/state.js'
import type { BattleArenaState } from '../../../src/games/battle-arena/state.js'
import {
  animatingCount,
  enqueueUltimate,
  expireUltimates,
  releaseUltimates,
  tierIndexFor,
  ultimateProgress,
} from '../../../src/games/battle-arena/ultimate.js'
import type { ActiveUltimate, PendingUltimate } from '../../../src/games/battle-arena/ultimate.js'
import type { SideId } from '../../../src/games/battle-arena/types.js'

const setup = (): BattleArenaState =>
  createBattleArenaState({ rng: createRng(3), clock: createManualClock() })

const pending = (gifter: string, tick: number, coins = 0): PendingUltimate => ({
  gifterKey: `tiktok:${gifter}`,
  casterSlot: 0,
  side: 'a',
  targetSide: 'b',
  nukeType: 'laser',
  damage: 50,
  giftCoins: coins,
  queuedAtTick: tick,
})

/** `n` fighter hidup di sisi b, supaya lockTargets punya sasaran. */
function seedEnemies(state: BattleArenaState, n: number): void {
  const { gameplay } = defaultConfig()
  for (let i = 0; i < n; i++) {
    const result = state.fighters.join(
      { platform: 'tiktok', username: `bot${i}`, avatarUrl: null },
      'b',
      gameplay,
    )
    if (result.fighter === null) throw new Error(`sisi penuh pada fighter ke-${i}`)
    result.fighter.position.x = 60 + i * 3
    result.fighter.position.y = 50
  }
}

const salvoPending = (over: Partial<PendingUltimate> = {}): PendingUltimate => ({
  gifterKey: 'tiktok:andi',
  casterSlot: 0,
  side: 'a',
  targetSide: 'b',
  nukeType: 'missileRain',
  damage: 50,
  giftCoins: 0,
  queuedAtTick: 0,
  ...over,
})

/** Satu salvo yang sudah dilepas. */
function releaseMissileSalvo(o: { count: number; launchStaggerMs?: number }): ActiveUltimate {
  const state = setup()
  const config = defaultConfig()
  config.gameplay.nuke.missile.baseCount = o.count
  if (o.launchStaggerMs !== undefined) {
    config.gameplay.nuke.missile.launchStaggerMs = o.launchStaggerMs
  }
  seedEnemies(state, o.count)

  enqueueUltimate(state, salvoPending())

  const released = releaseUltimates(state, config, 0)
  const first = released[0]
  if (first === undefined) throw new Error('expected a released ultimate')
  return first
}

/** Progress pada elapsed-tick tertentu, dari timing record itu sendiri. */
const progressAt = (u: ActiveUltimate, elapsed: number): number => elapsed / u.timing.totalTicks

describe('tierIndexFor', () => {
  const tiers = defaultConfig().gameplay.nuke.tiers

  it('gift termurah tetap mendapat tier 0', () => {
    expect(tierIndexFor(0, tiers)).toBe(0)
    expect(tierIndexFor(1, tiers)).toBe(0)
  })

  it('memilih tier TERTINGGI yang ambangnya terlampaui', () => {
    expect(tierIndexFor(100, tiers)).toBe(1)
    expect(tierIndexFor(999, tiers)).toBe(1)
    expect(tierIndexFor(50_000, tiers)).toBe(2)
  })
})

describe('stagger salvo (spec D3)', () => {
  // Budgetnya lebih lebar sejak missileRain memakai NUKE_TYPE_DURATION_SCALE (jalur FX): dua
  // dari empat kasus dapat satu tick stagger ekstra dibanding kurva 6c yang tidak diskalakan.
  for (const count of [4, 8]) {
    it(`${count} rudal memakai stagger 2 tick`, () => {
      expect(releaseMissileSalvo({ count }).landStaggerTicks).toBe(2)
    })

    /*
     * Kedatangan menurut ENGINE dihitung dari tick pendaratan damage; kedatangan menurut
     * RENDERER hanya dari angka yang benar-benar dikirim lewat snapshot. Kalau keduanya
     * berselisih, HP turun tanpa ledakan yang terlihat — dan kalau kedatangannya melewati 1,
     * ledakannya tidak pernah digambar sama sekali.
     */
    it(`${count} rudal: kedatangan visual dan pendaratan damage bertemu sebelum animasinya habis`, () => {
      const u = releaseMissileSalvo({ count })

      const engineArrival = progressAt(u, u.timing.landsAfterTicks + (count - 1) * u.landStaggerTicks)
      const renderArrival = IMPACT_AT + (count - 1) * u.staggerProgress

      expect(Math.abs(engineArrival - renderArrival)).toBeLessThan(1 / u.timing.totalTicks)
      expect(engineArrival).toBeLessThan(1)
    })

    it(`${count} rudal menyisakan ruang aftermath untuk rudal terakhir`, () => {
      const u = releaseMissileSalvo({ count })
      const lastArrival = u.timing.landsAfterTicks + (count - 1) * u.landStaggerTicks
      expect(u.timing.totalTicks - lastArrival).toBeGreaterThanOrEqual(4)
    })
  }

  it('tetap aman saat creator menyetel jeda peluncuran jauh melebihi jendelanya', () => {
    const u = releaseMissileSalvo({ count: 8, launchStaggerMs: 500 })
    expect(u.staggerProgress).toBeGreaterThanOrEqual(0)
    expect(progressAt(u, u.timing.landsAfterTicks + 7 * u.landStaggerTicks)).toBeLessThan(1)
  })

  it('mengubah progress menjadi milidetik dengan benar', () => {
    // 2600 × NUKE_TYPE_DURATION_SCALE.missileRain (1.19): jalur FX butuh panggung lebih lebar.
    expect(releaseMissileSalvo({ count: 4 }).msPerProgress).toBeCloseTo(3094, 0)
  })

  it('mengunci sasaran sebanyak rudalnya', () => {
    expect(releaseMissileSalvo({ count: 6 }).targetSlots).toHaveLength(6)
  })

  it('membiarkan tiga varian bersasaran tunggal tidak terpengaruh', () => {
    const state = setup()
    seedEnemies(state, 5)
    enqueueUltimate(state, salvoPending({ nukeType: 'bomb' }))
    const u = releaseUltimates(state, defaultConfig(), 0)[0] as ActiveUltimate
    expect(u.targetSlots).toHaveLength(1)
  })
})

describe('origin ultimate (spec D4)', () => {
  /*
   * 0,0 adalah POJOK KIRI ATAS arena. Ultimate yang lahir di sana melanggar kriteria terima
   * "titik asalnya jelas satu fighter tertentu, bukan tepi layar" — dan gifter tanpa fighter
   * bukan kasus langka: autoJoinGifter bisa dimatikan creator.
   */
  it('menaruh origin di pusat sisi caster saat gifter tidak punya fighter', () => {
    for (const side of ['a', 'b'] as SideId[]) {
      const state = setup()
      seedEnemies(state, 3)
      enqueueUltimate(
        state,
        salvoPending({ side, targetSide: side === 'a' ? 'b' : 'a', casterSlot: NO_SLOT }),
      )
      const u = releaseUltimates(state, defaultConfig(), 0)[0] as ActiveUltimate

      expect(u.originY).toBeGreaterThan(0)
      if (side === 'a') {
        expect(u.originX).toBeGreaterThan(0)
        expect(u.originX).toBeLessThan(50)
      } else {
        expect(u.originX).toBeGreaterThan(50)
      }
    }
  })

  it('tetap memakai origin yang dikirim pemanggil bila ada', () => {
    const state = setup()
    seedEnemies(state, 3)
    enqueueUltimate(state, salvoPending({ originX: 12, originY: 34 }))
    const u = releaseUltimates(state, defaultConfig(), 0)[0] as ActiveUltimate
    expect(u.originX).toBe(12)
    expect(u.originY).toBe(34)
  })
})

describe('pelepasan antrean', () => {
  it('gifter berbeda melesat bersamaan tanpa stagger', () => {
    const state = setup()
    const config = defaultConfig()
    enqueueUltimate(state, pending('andi', 0))
    enqueueUltimate(state, pending('budi', 0))
    enqueueUltimate(state, pending('cici', 0))

    releaseUltimates(state, config, 0)

    expect(state.activeUltimates).toHaveLength(3)
    expect(state.pendingUltimates).toHaveLength(0)
  })

  it('gift kedua dari gifter yang sama menunggu ultimate pertamanya selesai', () => {
    const state = setup()
    const config = defaultConfig()
    enqueueUltimate(state, pending('andi', 0))
    enqueueUltimate(state, pending('andi', 0))

    releaseUltimates(state, config, 0)
    expect(state.activeUltimates).toHaveLength(1)
    expect(state.pendingUltimates).toHaveLength(1)

    // Setelah yang pertama habis animasinya, yang kedua boleh naik.
    const first = state.activeUltimates[0]
    if (first === undefined) throw new Error('expected an active ultimate')
    const done = first.firedAtTick + first.timing.totalTicks
    releaseUltimates(state, config, done)
    expect(state.activeUltimates).toHaveLength(2)
  })

  it('entri yang terblokir gifter-nya sendiri dilewati, tidak menahan orang di belakangnya', () => {
    const state = setup()
    const config = defaultConfig()
    enqueueUltimate(state, pending('andi', 0))
    releaseUltimates(state, config, 0)

    enqueueUltimate(state, pending('andi', 1))
    enqueueUltimate(state, pending('budi', 1))
    releaseUltimates(state, config, 1)

    expect(state.activeUltimates.map((u) => u.gifterKey)).toEqual(['tiktok:andi', 'tiktok:budi'])
    expect(state.pendingUltimates).toHaveLength(1)
  })

  it('hardCap membatasi yang beranimasi; sisanya menunggu, tidak dibuang', () => {
    const state = setup()
    const config = defaultConfig()
    config.gameplay.nuke.hardCap = 6
    for (let i = 0; i < 8; i++) enqueueUltimate(state, pending(`gifter${i}`, 0))

    releaseUltimates(state, config, 0)

    expect(state.activeUltimates).toHaveLength(6)
    expect(state.pendingUltimates).toHaveLength(2)
  })

  it('delapan gifter serentak dengan hardCap 6: semuanya memakai kurva yang SAMA', () => {
    // Antrean tidak lagi mempercepat siapa pun. Yang menunggu tetap menunggu, dan yang tampil
    // tampil penuh — orang kedelapan melihat animasi yang sama dengan orang pertama.
    const state = setup()
    const config = defaultConfig()
    config.gameplay.nuke.hardCap = 6
    for (let i = 0; i < 8; i++) enqueueUltimate(state, pending(`gifter${i}`, 0))

    releaseUltimates(state, config, 0)
    const curve = state.activeUltimates[0]?.timing.totalTicks
    expect(state.activeUltimates.every((u) => u.timing.totalTicks === curve)).toBe(true)

    releaseUltimates(state, config, (curve ?? 0) + 1)
    expect(state.activeUltimates).toHaveLength(8)
    expect(state.activeUltimates.every((u) => u.timing.totalTicks === curve)).toBe(true)
  })

  it('dua gifter yang melesat BERSAMAAN memakai kurva yang sama', () => {
    const state = setup()
    const config = defaultConfig()
    enqueueUltimate(state, pending('andi', 0))
    enqueueUltimate(state, pending('budi', 0))

    const released = releaseUltimates(state, config, 0)

    expect(released).toHaveLength(2)
    expect(released[0]?.timing).toEqual(released[1]?.timing)
  })

  it('gift yang sempat mengantre tetap memakai kurva penuh', () => {
    // Dulu entri seperti ini berjalan mode ekspres — 40% durasi, charge dilewati. Sekarang ia
    // menunggu gilirannya lalu tampil persis seperti gift yang datang sendirian.
    const state = setup()
    const config = defaultConfig()
    config.gameplay.nuke.hardCap = 1
    enqueueUltimate(state, pending('andi', 0))
    enqueueUltimate(state, pending('budi', 0))

    const alone = releaseUltimates(state, config, 0)[0]
    if (alone === undefined) throw new Error('expected an active ultimate')
    expect(state.pendingUltimates).toHaveLength(1)

    const waited = releaseUltimates(state, config, alone.timing.totalTicks + 1)[0]
    expect(waited?.timing).toEqual(alone.timing)
  })

  it('slot dipakai ulang terkecil-dulu supaya renderer bisa mencocokkan record', () => {
    const state = setup()
    const config = defaultConfig()
    enqueueUltimate(state, pending('andi', 0))
    enqueueUltimate(state, pending('budi', 0))
    releaseUltimates(state, config, 0)
    expect(state.activeUltimates.map((u) => u.slot)).toEqual([0, 1])

    state.activeUltimates.splice(0, 1)
    enqueueUltimate(state, pending('cici', 1))
    releaseUltimates(state, config, 1)
    expect(state.activeUltimates.map((u) => u.slot)).toEqual([1, 0])
  })
})

describe('progress dan kedaluwarsa', () => {
  it('setiap ultimate mulai di 0 dan memainkan fase charge-nya', () => {
    const state = setup()
    const config = defaultConfig()
    config.gameplay.nuke.hardCap = 1
    enqueueUltimate(state, pending('andi', 0))
    enqueueUltimate(state, pending('budi', 0))
    releaseUltimates(state, config, 0)

    const first = state.activeUltimates[0]
    if (first === undefined) throw new Error('expected an active ultimate')
    expect(ultimateProgress(first, 0)).toBe(0)
    expect(ultimateProgress(first, first.timing.totalTicks)).toBe(1)
  })

  it('record yang animasinya habis berhenti dihitung hardCap', () => {
    const state = setup()
    const config = defaultConfig()
    enqueueUltimate(state, pending('andi', 0))
    releaseUltimates(state, config, 0)

    const u = state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')
    expect(animatingCount(state, 0)).toBe(1)
    expect(animatingCount(state, u.timing.totalTicks)).toBe(0)
  })

  it('expireUltimates hanya membuang yang expiresAtTick-nya terlewat', () => {
    const state = setup()
    const config = defaultConfig()
    enqueueUltimate(state, pending('andi', 0))
    releaseUltimates(state, config, 0)
    const u = state.activeUltimates[0]
    if (u === undefined) throw new Error('expected an active ultimate')

    u.expiresAtTick = 100
    expect(expireUltimates(state, 99)).toBe(0)
    expect(state.activeUltimates).toHaveLength(1)
    expect(expireUltimates(state, 100)).toBe(1)
    expect(state.activeUltimates).toHaveLength(0)
  })

  it('record tanpa expiresAtTick tidak pernah dibuang', () => {
    const state = setup()
    const config = defaultConfig()
    enqueueUltimate(state, pending('andi', 0))
    releaseUltimates(state, config, 0)

    expect(expireUltimates(state, 100_000)).toBe(0)
    expect(state.activeUltimates).toHaveLength(1)
  })
})
