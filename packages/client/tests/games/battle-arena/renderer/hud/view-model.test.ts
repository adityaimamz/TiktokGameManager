import { describe, expect, it } from 'vitest'
import { NO_SLOT, SIDE_A, SIDE_B, createSnapshotView } from '@lga/shared'
import type { SnapshotFighter, SnapshotUltimate, SnapshotView } from '@lga/shared'
import { defaultConfig } from '../../../../../src/games/battle-arena/config/index.js'
import { matchStateIndex } from '../../../../../src/games/battle-arena/snapshot.js'
import type { RosterEntry } from '../../../../../src/games/battle-arena/snapshot.js'
import type { SideId } from '../../../../../src/games/battle-arena/types.js'
import { ultimateWith } from '../../../../testing/ultimate-fixtures.js'
import { buildActionLegend } from '../../../../../src/games/battle-arena/triggers.js'
import {
  RAIL_BOTTOM_RESERVE_PX,
  calloutModel,
  formatCoins,
  legendRails,
  matchStatusLabel,
  railCapacity,
  railTopReservePx,
  mvp,
  scoreBarModel,
  topFighters,
  topGifter,
  victoryModel,
} from '../../../../../src/games/battle-arena/renderer/hud/view-model.js'

const fighter = (over: Partial<SnapshotFighter> = {}): SnapshotFighter => ({
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

const view = (
  over: Partial<SnapshotView['header']>,
  fighters: SnapshotFighter[] = [],
): SnapshotView => {
  const snapshot = createSnapshotView()
  Object.assign(snapshot.header, over, { fighterCount: fighters.length })
  snapshot.fighters = fighters
  return snapshot
}

const roster = (...entries: Partial<RosterEntry>[]): Map<number, RosterEntry> => {
  const map = new Map<number, RosterEntry>()
  entries.forEach((entry, index) =>
    map.set(entry.slotIndex ?? index, {
      slotIndex: entry.slotIndex ?? index,
      username: entry.username ?? `viewer-${index}`,
      avatarUrl: entry.avatarUrl ?? null,
      side: entry.side ?? 'a',
      platform: 'tiktok',
    }),
  )
  return map
}

describe('matchStatusLabel', () => {
  it('diam selama battle: arena sudah menjawabnya sendiri', () => {
    expect(matchStatusLabel(view({ matchState: matchStateIndex('battle') }))).toBeNull()
  })

  it('tetap menjelaskan arena yang diam', () => {
    expect(matchStatusLabel(view({ matchState: matchStateIndex('waitingFighters') }))).toBe(
      'WAITING FOR PLAYERS',
    )
    expect(matchStatusLabel(view({ matchState: matchStateIndex('countdown') }))).toBe('GET READY')
  })
})

describe('scoreBarModel', () => {
  it('takes names and colours from the side config', () => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'Team Messi', color: '#ff0000' }
    config.sides.b = { ...config.sides.b, name: 'Team Ronaldo', color: '#0000ff' }

    const model = scoreBarModel(view({ roundScoreA: 4, roundScoreB: 2 }), config)

    expect(model.a.name).toBe('Team Messi')
    expect(model.a.color).toBe('#ff0000')
    expect(model.a.score).toBe(4)
    expect(model.b.name).toBe('Team Ronaldo')
    expect(model.b.score).toBe(2)
  })

  it('crowns the side in front', () => {
    const model = scoreBarModel(view({ roundScoreA: 1, roundScoreB: 5 }), defaultConfig())

    expect(model.a.leading).toBe(false)
    expect(model.b.leading).toBe(true)
  })

  it('crowns nobody on a tie', () => {
    const model = scoreBarModel(view({ roundScoreA: 3, roundScoreB: 3 }), defaultConfig())

    expect(model.a.leading).toBe(false)
    expect(model.b.leading).toBe(false)
  })

  it('shows one round dot per round of the series, filled by rounds won', () => {
    const config = defaultConfig()
    config.gameplay.roundsBestOf = 5
    const model = scoreBarModel(view({ roundsWonA: 2, roundsWonB: 1 }), config)

    expect(model.a.roundDots).toEqual([true, true, false, false, false])
    expect(model.b.roundDots).toEqual([true, false, false, false, false])
  })

  it('numbers the current round from the rounds already decided', () => {
    const config = defaultConfig()
    config.gameplay.roundsBestOf = 3
    expect(scoreBarModel(view({}), config).roundNumber).toBe(1)
    expect(scoreBarModel(view({ roundsWonA: 1, roundsWonB: 1 }), config).roundNumber).toBe(3)
  })

  it('never numbers a round past the end of the series', () => {
    const config = defaultConfig()
    config.gameplay.roundsBestOf = 3
    expect(scoreBarModel(view({ roundsWonA: 2, roundsWonB: 1 }), config).roundNumber).toBe(3)
  })

  it('carries the kill target so the bar can show progress (Req 33 AC4)', () => {
    const config = defaultConfig()
    config.gameplay.killsToWinRound = 30
    expect(scoreBarModel(view({}), config).killsToWin).toBe(30)
  })
})

describe('topFighters', () => {
  const fighters = [
    fighter({ slotIndex: 0, kills: 3 }),
    fighter({ slotIndex: 1, kills: 7, side: SIDE_B }),
    fighter({ slotIndex: 2, kills: 3 }),
    fighter({ slotIndex: 3, kills: 0 }),
  ]

  it('ranks by kills, breaking ties by slot so the board does not flicker', () => {
    const rows = topFighters(
      view({}, fighters),
      roster(
        { username: 'andi' },
        { username: 'budi', side: 'b' },
        { username: 'cinta' },
        { username: 'dedi' },
      ),
      defaultConfig(),
    )

    expect(rows.map((row) => row.username)).toEqual(['budi', 'andi', 'cinta'])
  })

  it('leaves out fighters who have not killed anyone', () => {
    const rows = topFighters(view({}, fighters), roster({}, {}, {}, {}), defaultConfig())
    expect(rows.every((row) => row.kills > 0)).toBe(true)
  })

  it('respects the configured entry count', () => {
    const config = defaultConfig()
    config.ui.leaderboardEntries = 2
    expect(topFighters(view({}, fighters), roster({}, {}, {}, {}), config)).toHaveLength(2)
  })

  it('returns nothing when the creator turned the board off', () => {
    const config = defaultConfig()
    config.ui.showTopFighters = false
    expect(topFighters(view({}, fighters), roster({}, {}, {}, {}), config)).toEqual([])
  })

  it('skips fighters missing from the roster instead of inventing a name', () => {
    const rows = topFighters(
      view({}, [fighter({ slotIndex: 9, kills: 5 })]),
      roster(),
      defaultConfig(),
    )
    expect(rows).toEqual([])
  })
})

describe('mvp', () => {
  it('is the single best killer, regardless of the leaderboard toggle', () => {
    const config = defaultConfig()
    config.ui.showTopFighters = false
    const snapshot = view({}, [
      fighter({ slotIndex: 0, kills: 2 }),
      fighter({ slotIndex: 1, kills: 9 }),
    ])

    expect(mvp(snapshot, roster({ username: 'andi' }, { username: 'budi' }))?.username).toBe('budi')
    expect(config.ui.showTopFighters).toBe(false)
  })

  it('is null when nobody has killed yet', () => {
    expect(mvp(view({}, [fighter({ kills: 0 })]), roster({}))).toBeNull()
  })
})

describe('victoryModel', () => {
  it('is null while the match is still being played', () => {
    expect(
      victoryModel(view({ matchState: matchStateIndex('battle') }), roster(), defaultConfig()),
    ).toBeNull()
  })

  it('announces the round winner during the celebration', () => {
    const config = defaultConfig()
    config.sides.b = { ...config.sides.b, name: 'Team Ronaldo', color: '#0000ff' }
    const snapshot = view({
      matchState: matchStateIndex('victory'),
      roundWinner: SIDE_B,
      roundsWonB: 1,
    })

    const model = victoryModel(snapshot, roster(), config)

    expect(model?.kind).toBe('round')
    expect(model?.side).toBe('b')
    expect(model?.name).toBe('Team Ronaldo')
    expect(model?.color).toBe('#0000ff')
  })

  it('announces the match winner on the result screen, with MVP and totals', () => {
    const fighters = [
      fighter({ slotIndex: 0, kills: 5 }),
      fighter({ slotIndex: 1, kills: 8, side: SIDE_B }),
    ]
    const snapshot = view(
      { matchState: matchStateIndex('result'), roundsWonA: 1, roundsWonB: 2, roundWinner: SIDE_B },
      fighters,
    )

    const model = victoryModel(
      snapshot,
      roster({ username: 'andi' }, { username: 'budi', side: 'b' }),
      defaultConfig(),
    )

    expect(model?.kind).toBe('match')
    expect(model?.side).toBe('b')
    expect(model?.mvp?.username).toBe('budi')
    expect(model?.totalKills).toEqual({ a: 5, b: 8 })
    expect(model?.fighterCount).toBe(2)
    expect(model?.roundsWon).toEqual({ a: 1, b: 2 })
  })

  it('says nothing rather than guessing when no round winner was recorded', () => {
    const snapshot = view({ matchState: matchStateIndex('victory'), roundWinner: -1 })
    expect(victoryModel(snapshot, roster(), defaultConfig())).toBeNull()
  })
})

describe('topGifter', () => {
  it('memilih koin tertinggi', () => {
    const snapshot = view({}, [
      fighter({ slotIndex: 0, giftCoins: 100 }),
      fighter({ slotIndex: 1, giftCoins: 900 }),
    ])
    const map = roster({ slotIndex: 0, username: 'andi' }, { slotIndex: 1, username: 'budi' })
    expect(topGifter(snapshot, map)?.username).toBe('budi')
    expect(topGifter(snapshot, map)?.coins).toBe(900)
  })

  // Papan kosong lebih jujur daripada nama dengan angka nol.
  it('tidak menghasilkan apa pun saat belum ada yang memberi hadiah', () => {
    const snapshot = view({}, [fighter({ slotIndex: 0, giftCoins: 0 })])
    expect(topGifter(snapshot, roster({ slotIndex: 0, username: 'andi' }))).toBeNull()
  })

  it('melewati fighter yang tidak ada di roster', () => {
    const snapshot = view({}, [fighter({ slotIndex: 4, giftCoins: 500 })])
    expect(topGifter(snapshot, new Map())).toBeNull()
  })

  it('memutus seri dengan slot terkecil supaya kartu tidak berkedip', () => {
    const snapshot = view({}, [
      fighter({ slotIndex: 3, giftCoins: 50 }),
      fighter({ slotIndex: 1, giftCoins: 50 }),
    ])
    const map = roster({ slotIndex: 1, username: 'andi' }, { slotIndex: 3, username: 'budi' })
    expect(topGifter(snapshot, map)?.username).toBe('andi')
  })

  // Fighter yang mati tetap menyumbang: koin adalah sumbangan, bukan performa.
  it('tetap menghitung fighter yang sudah mati', () => {
    const snapshot = view({}, [fighter({ slotIndex: 0, giftCoins: 700, alive: 0 })])
    expect(topGifter(snapshot, roster({ slotIndex: 0, username: 'andi' }))?.coins).toBe(700)
  })
})

describe('calloutModel', () => {
  const entry = (slotIndex: number, username: string, side: SideId = 'a'): RosterEntry => ({
    slotIndex,
    username,
    avatarUrl: null,
    side,
    platform: 'tiktok',
  })

  const viewWith = (ultimates: Partial<SnapshotUltimate>[]): SnapshotView => {
    const snapshot = createSnapshotView()
    snapshot.header.ultimateCount = ultimates.length
    snapshot.ultimates = ultimates.map((u, i) =>
      ultimateWith({ variant: 1, originX: 0, progress: 0.3, slot: i, ...u }),
    )
    return snapshot
  }

  const casters = new Map([
    [0, entry(0, 'andi')],
    [1, entry(1, 'budi', 'b')],
    [2, entry(2, 'cici')],
    [3, entry(3, 'dedi')],
  ])

  /*
   * Gejalanya: "Bot 2 LASER" muncul dua kali di frame yang sama. Hipotesisnya ada di
   * serialisasi per-gifter — `holdForCallout` menahan record selama calloutHoldMs setelah
   * animasinya habis, sementara `isBusy` sudah melepas gifter-nya begitu progress mencapai 1.
   * Orang yang sama karena itu bisa punya DUA record hidup sekaligus.
   */
  it('tidak pernah menampilkan satu gifter dua kali di frame yang sama', () => {
    const view = viewWith([
      { casterSlot: 0, slot: 0, progress: 1 },
      { casterSlot: 0, slot: 1, progress: 0.3 },
    ])
    expect(calloutModel(view, casters, defaultConfig()).rows).toHaveLength(1)
  })

  it('mempertahankan record yang masih beranimasi, bukan yang sedang ditahan', () => {
    const view = viewWith([
      { casterSlot: 0, slot: 0, progress: 1, killCount: 2 },
      { casterSlot: 0, slot: 1, progress: 0.3, killCount: 0 },
    ])
    expect(calloutModel(view, casters, defaultConfig()).rows[0]?.slot).toBe(1)
  })

  /*
   * URUTANNYA MENGIKAT: NO_SLOT disaring lebih dulu, baru dedup. Dua gifter tanpa fighter
   * sama-sama ber-casterSlot NO_SLOT, dan dedup yang mendahului penyaringan akan
   * menggabungkan dua ORANG BERBEDA jadi satu baris. Hari ini tidak berbahaya karena baris
   * NO_SLOT memang disembunyikan — tapi itu kebetulan, dan kalau suatu saat diaktifkan,
   * urutan yang terbalik menghapus nama seseorang. Aturan keras spec §1 melarangnya.
   */
  it('tidak menggabungkan dua gifter berbeda yang sama-sama tanpa fighter', () => {
    const view = viewWith([
      { casterSlot: NO_SLOT, slot: 0 },
      { casterSlot: NO_SLOT, slot: 1 },
    ])
    const model = calloutModel(view, casters, defaultConfig())
    expect(model.rows).toHaveLength(0)
    expect(model.overflow).toBe(0)
  })

  it('satu baris per ultimate, dengan nama dan jenisnya', () => {
    const model = calloutModel(viewWith([{ casterSlot: 0 }]), casters, defaultConfig())

    expect(model.rows).toHaveLength(1)
    expect(model.rows[0]?.username).toBe('andi')
    expect(model.rows[0]?.label).toBe('LASER')
    expect(model.overflow).toBe(0)
  })

  it('warna aksen mengikuti sisi caster', () => {
    const model = calloutModel(viewWith([{ casterSlot: 1 }]), casters, defaultConfig())
    expect(model.rows[0]?.side).toBe('b')
  })

  /*
   * Aturan spec §7.2: callout adalah lapis MEWAH. Tanpa identitas, jaminan §1 jatuh ke
   * lapis lantai — gift history — dan baris tanpa nama justru lebih buruk daripada tidak
   * ada baris sama sekali.
   */
  it('casterSlot NO_SLOT tidak menghasilkan baris', () => {
    const model = calloutModel(viewWith([{ casterSlot: NO_SLOT }]), casters, defaultConfig())
    expect(model.rows).toEqual([])
  })

  it('slot yang tidak ada di roster tidak menghasilkan baris', () => {
    const model = calloutModel(viewWith([{ casterSlot: 77 }]), casters, defaultConfig())
    expect(model.rows).toEqual([])
  })

  it('baris hasil kosong sebelum mendarat, terisi sesudahnya', () => {
    const before = calloutModel(viewWith([{ casterSlot: 0 }]), casters, defaultConfig())
    const after = calloutModel(
      viewWith([{ casterSlot: 0, killCount: 3, totalDamage: 150 }]),
      casters,
      defaultConfig(),
    )

    expect(before.rows[0]?.killCount).toBe(0)
    expect(after.rows[0]?.killCount).toBe(3)
    expect(after.rows[0]?.totalDamage).toBe(150)
  })

  it('menahan paling banyak tiga baris dan menghitung sisanya', () => {
    const model = calloutModel(
      viewWith([
        { casterSlot: 0, slot: 0 },
        { casterSlot: 1, slot: 1 },
        { casterSlot: 2, slot: 2 },
        { casterSlot: 3, slot: 3 },
      ]),
      casters,
      defaultConfig(),
    )

    expect(model.rows).toHaveLength(3)
    expect(model.overflow).toBe(1)
  })

  it('record stale tetap menghasilkan baris — orangnya sudah membayar', () => {
    const model = calloutModel(viewWith([{ casterSlot: 0, stale: 1 }]), casters, defaultConfig())
    expect(model.rows).toHaveLength(1)
  })

  it('intensitas mengikuti tier', () => {
    const config = defaultConfig()
    const model = calloutModel(viewWith([{ casterSlot: 0, tier: 2 }]), casters, config)
    expect(model.rows[0]?.intensity).toBe(config.gameplay.nuke.tiers[2]?.calloutIntensity)
  })

  it('berhenti di ultimateCount, tidak di panjang array', () => {
    const snapshot = viewWith([{ casterSlot: 0 }, { casterSlot: 1 }])
    snapshot.header.ultimateCount = 1
    expect(calloutModel(snapshot, casters, defaultConfig()).rows).toHaveLength(1)
  })
})

describe('legendRails', () => {
  it('menaruh rule sisi A di kiri dan rule sisi B di kanan', () => {
    const config = defaultConfig()

    const rails = legendRails(config)

    expect(rails.left.find((entry) => entry.side === 'a')).toBeDefined()
    expect(rails.right.find((entry) => entry.side === 'b')).toBeDefined()
    expect(rails.right.some((entry) => entry.side === 'a')).toBe(false)
    expect(rails.left.some((entry) => entry.side === 'b')).toBe(false)
  })

  it('tidak pernah menggambar satu entri di kedua rail', () => {
    const config = defaultConfig()

    const rails = legendRails(config)
    const ids = [...rails.left, ...rails.right].map((entry) => entry.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(buildActionLegend(config).length)
  })

  it('mengisi rail kanan lebih dulu dengan entri tanpa sisi tertentu', () => {
    const config = defaultConfig()

    const rails = legendRails(config)
    const neutral = buildActionLegend(config).filter((entry) => entry.side === null)

    expect(neutral.length).toBeGreaterThan(0)
    for (const entry of neutral) {
      expect(rails.right.some((candidate) => candidate.id === entry.id)).toBe(true)
    }
  })

  it('menumpahkan sisanya ke rail kiri saat kanan sudah penuh', () => {
    const config = defaultConfig()
    const gift = config.triggers.find((rule) => rule.when.kind === 'gift')
    if (gift === undefined) throw new Error('expected a gift rule to clone')
    // Dua belas rule netral melawan kapasitasnya: kelebihannya tumpah ke rail kiri.
    config.triggers = Array.from({ length: 12 }, (_, index) => ({
      ...gift,
      id: `gift-${index}`,
      enabled: true,
    }))

    const rails = legendRails(config)
    const capacity = railCapacity(config)

    expect(capacity).toBeLessThan(12)
    expect(rails.right).toHaveLength(capacity)
    expect(rails.left).toHaveLength(12 - capacity)
    expect(rails.right[0]?.id).toBe('gift-0')
    expect(rails.left[0]?.id).toBe(`gift-${capacity}`)
  })

  it('menyisakan ruang untuk TOP FIGHTERS, dan memanjang lagi saat papan itu dimatikan', () => {
    const config = defaultConfig()
    config.ui.leaderboardEntries = 8

    const withBoard = railTopReservePx(config)
    const withoutBoard = railTopReservePx({ ...config, ui: { ...config.ui, showTopFighters: false } })

    // Papan itu duduk di sudut kiri ATAS arena, persis di kepala rail.
    expect(withBoard).toBeGreaterThan(withoutBoard)
    expect(railCapacity({ ...config, ui: { ...config.ui, showTopFighters: false } })).toBeGreaterThan(
      railCapacity(config),
    )
  })

  it('menyisakan ruang di kaki arena untuk pil status dan kill feed', () => {
    expect(RAIL_BOTTOM_RESERVE_PX).toBeGreaterThan(0)
    expect(railCapacity(defaultConfig())).toBeGreaterThanOrEqual(1)
  })

  it('mempertahankan urutan config.triggers di dalam satu rail', () => {
    const config = defaultConfig()

    const rails = legendRails(config)
    const order = config.triggers.map((rule) => rule.id)
    const leftOrder = rails.left.map((entry) => order.indexOf(entry.id))

    expect(leftOrder).toStrictEqual([...leftOrder].sort((a, b) => a - b))
  })

  it('mengosongkan kedua rail saat semua rule dimatikan', () => {
    const config = defaultConfig()
    config.triggers = config.triggers.map((rule) => ({ ...rule, enabled: false }))

    expect(legendRails(config)).toStrictEqual({ left: [], right: [] })
  })
})

describe('formatCoins', () => {
  it('memakai koma sebagai pemisah ribuan, bukan titik', () => {
    expect(formatCoins(1_240)).toBe('1,240')
    expect(formatCoins(999)).toBe('999')
    expect(formatCoins(1_000_000)).toBe('1,000,000')
  })
})
