import { describe, expect, it } from 'vitest'
import { SIDE_A, SIDE_B, createSnapshotView } from '@lga/shared'
import type { SnapshotFighter, SnapshotView } from '@lga/shared'
import { defaultConfig } from '../../../../src/games/battle-arena/config/index.js'
import type { RosterEntry } from '../../../../src/games/battle-arena/snapshot.js'
import { TEST_ACTIONS, randomCaster, testActionBatch } from '../../../../src/ui/dashboard/sections/test-actions.js'

describe('TEST_ACTIONS', () => {
  it('offers exactly the seven buttons the mockup draws', () => {
    expect(TEST_ACTIONS.map((button) => button.id)).toEqual([
      'spawnA',
      'spawnB',
      'growA',
      'growB',
      'barrageA',
      'barrageB',
      'fillArena',
    ])
  })
})

describe('testActionBatch', () => {
  it('spawns one fighter per click, with an identity that is new every time', () => {
    const config = defaultConfig()
    const first = testActionBatch('spawnA', config, 1)
    const second = testActionBatch('spawnA', config, 2)

    expect(first).toHaveLength(1)
    expect(first[0]?.type).toBe('spawn')
    expect(first[0]?.target).toBe('side:a')
    expect(first[0]?.actor?.platform).toBe('creator')
    expect(first[0]?.actor?.username).not.toBe(second[0]?.actor?.username)
  })

  it('grows a whole side by the configured HP step', () => {
    const config = defaultConfig()
    const [action] = testActionBatch('growB', config, 1)

    expect(action?.type).toBe('grow')
    expect(action?.target).toBe('side:b')
    expect(action?.value).toBe(config.gameplay.hpGainedPerGrow)
  })

  it('fires a barrage as five separate damage actions, not one big one', () => {
    const config = defaultConfig()
    const batch = testActionBatch('barrageA', config, 1)

    expect(batch).toHaveLength(5)
    expect(batch.every((action) => action.type === 'damage')).toBe(true)
    expect(batch.every((action) => action.target === 'side:a')).toBe(true)
    expect(batch[0]?.value).toBe(config.gameplay.baseDamage)
  })

  it('fills the arena with ten fighters per side in one click', () => {
    const batch = testActionBatch('fillArena', defaultConfig(), 1)

    expect(batch).toHaveLength(20)
    expect(batch.filter((action) => action.target === 'side:a')).toHaveLength(10)
    expect(batch.filter((action) => action.target === 'side:b')).toHaveLength(10)
    expect(new Set(batch.map((action) => action.actor?.username)).size).toBe(20)
  })
})

describe('nuke', () => {
  it('menghasilkan satu aksi nuke ke sisi yang disebut', () => {
    const actions = testActionBatch('nukeB', defaultConfig(), 1)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ type: 'nuke', target: 'side:b' })
  })

  // Damage milik config, bukan action: validateConfig menyamakan keduanya.
  it('tidak menaruh damage di action nuke', () => {
    expect(testActionBatch('nukeA', defaultConfig(), 1)[0]?.value).toBe(0)
  })

  it('tidak menambah tombol baru ke TEST_ACTIONS', () => {
    expect(TEST_ACTIONS.map((button) => button.id)).not.toContain('nukeA')
  })

  it('memakai pengirim yang diberikan, bukan identitas creator', () => {
    const caster = { platform: 'tiktok' as const, username: 'budi', avatarUrl: null }
    expect(testActionBatch('nukeA', defaultConfig(), 1, caster)[0]?.actor).toEqual(caster)
  })
})

describe('randomCaster', () => {
  const fighter = (over: Partial<SnapshotFighter>): SnapshotFighter => ({
    slotIndex: 0,
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    side: SIDE_A,
    alive: 1,
    facingAngle: 0,
    targetSlot: -1,
    kills: 0,
    giftCoins: 0,
    ...over,
  })

  const view = (fighters: SnapshotFighter[]): SnapshotView => {
    const snapshot = createSnapshotView()
    snapshot.header.fighterCount = fighters.length
    snapshot.fighters = fighters
    return snapshot
  }

  const roster = (...entries: [number, string, 'a' | 'b'][]): Map<number, RosterEntry> =>
    new Map(
      entries.map(([slotIndex, username, side]) => [
        slotIndex,
        { slotIndex, username, avatarUrl: null, side, platform: 'tiktok' as const },
      ]),
    )

  it('memilih dari sisi penyerang, bukan sisi sasaran', () => {
    const chosen = randomCaster(
      'a',
      view([fighter({ slotIndex: 0 }), fighter({ slotIndex: 1, side: SIDE_B })]),
      roster([0, 'andi', 'a'], [1, 'budi', 'b']),
      () => 0,
    )

    expect(chosen?.username).toBe('budi')
  })

  /*
   * Fighter mati sudah tidak digambar; berkas yang keluar dari titik kosong sama
   * menyesatkannya dengan berkas dari tepi arena.
   */
  it('melewati fighter yang sudah mati', () => {
    const chosen = randomCaster(
      'a',
      view([
        fighter({ slotIndex: 1, side: SIDE_B, alive: 0 }),
        fighter({ slotIndex: 2, side: SIDE_B }),
      ]),
      roster([1, 'budi', 'b'], [2, 'cici', 'b']),
      () => 0,
    )

    expect(chosen?.username).toBe('cici')
  })

  it('menyebar pilihannya ke seluruh kandidat', () => {
    const snapshot = view([
      fighter({ slotIndex: 0, side: SIDE_B }),
      fighter({ slotIndex: 1, side: SIDE_B }),
      fighter({ slotIndex: 2, side: SIDE_B }),
    ])
    const entries = roster([0, 'andi', 'b'], [1, 'budi', 'b'], [2, 'cici', 'b'])

    const names = [0, 0.5, 0.99].map((p) => randomCaster('a', snapshot, entries, () => p)?.username)
    expect(names).toEqual(['andi', 'budi', 'cici'])
  })

  it('menjawab null saat sisi penyerang kosong — pemanggil jatuh ke creator', () => {
    expect(randomCaster('a', view([]), roster(), () => 0)).toBeNull()
    expect(
      randomCaster('a', view([fighter({ slotIndex: 0 })]), roster([0, 'andi', 'a']), () => 0),
    ).toBeNull()
  })

  it('tidak memilih slot yang belum ada di roster', () => {
    const chosen = randomCaster(
      'a',
      view([fighter({ slotIndex: 9, side: SIDE_B })]),
      roster(),
      () => 0,
    )
    expect(chosen).toBeNull()
  })
})
