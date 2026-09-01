// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NO_SLOT, SIDE_A, SIDE_B, createSnapshotView } from '@lga/shared'
import type { SnapshotFighter, SnapshotUltimate, SnapshotView } from '@lga/shared'
import { defaultConfig } from '../../../../../src/games/battle-arena/config/index.js'
import { matchStateIndex } from '../../../../../src/games/battle-arena/snapshot.js'
import type { RosterEntry, SessionGifter } from '../../../../../src/games/battle-arena/snapshot.js'
import { computeStageLayout } from '../../../../../src/games/battle-arena/renderer/layout.js'
import { Hud } from '../../../../../src/games/battle-arena/renderer/hud/Hud.js'
import type { GiftFeedEntry, KillFeedEntry } from '../../../../../src/games/battle-arena/renderer/hud/feed.js'
import { ultimateWith } from '../../../../testing/ultimate-fixtures.js'

afterEach(cleanup)

const layout = computeStageLayout(1600, 900, 'landscape')

const snapshot = (
  over: Partial<SnapshotView['header']> = {},
  fighters: SnapshotView['fighters'] = [],
): SnapshotView => {
  const view = createSnapshotView()
  Object.assign(view.header, over, { fighterCount: fighters.length })
  view.fighters = fighters
  return view
}

const fighterWith = (slotIndex: number, giftCoins: number): SnapshotFighter => ({
  slotIndex,
  x: 0,
  y: 0,
  hp: 1000,
  maxHp: 1000,
  side: SIDE_A,
  alive: 1,
  facingAngle: 0,
  targetSlot: NO_SLOT,
  kills: 0,
  giftCoins,
})

const roster = new Map<number, RosterEntry>([
  [0, { slotIndex: 0, username: 'andi', avatarUrl: null, side: 'a', platform: 'tiktok' }],
  [1, { slotIndex: 1, username: 'budi', avatarUrl: null, side: 'b', platform: 'tiktok' }],
])

const hud = (
  view: SnapshotView,
  config = defaultConfig(),
  kills: KillFeedEntry[] = [],
  gifts: GiftFeedEntry[] = [],
  topGifters: readonly SessionGifter[] = [],
) => (
  <Hud
    view={view}
    config={config}
    roster={roster}
    kills={kills}
    joins={[]}
    gifts={gifts}
    nowMs={0}
    layout={layout}
    topGifters={topGifters}
  />
)

const killEntry = (over: Partial<KillFeedEntry> = {}): KillFeedEntry => ({
  id: 'k1',
  kind: 'kill',
  atMs: 0,
  killer: 'andi',
  killerSide: 'a',
  killerAvatarUrl: 'https://cdn.example/andi.jpg',
  victim: 'budi',
  victimSide: 'b',
  victimAvatarUrl: null,
  ...over,
})

describe('Hud', () => {
  it('shows both side names and their scores', () => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'Team Messi' }
    config.sides.b = { ...config.sides.b, name: 'Team Ronaldo' }

    render(hud(snapshot({ roundScoreA: 4, roundScoreB: 2 }), config))

    const scoreBar = screen.getByTestId('score-bar')
    expect(scoreBar.textContent).toContain('Team Messi')
    expect(scoreBar.textContent).toContain('Team Ronaldo')
    expect(scoreBar.textContent).toContain('4:2')
  })

  it('shows a photo for whoever has one and an initial for whoever does not', () => {
    render(hud(snapshot(), defaultConfig(), [killEntry()]))

    const feed = screen.getByTestId('kill-feed')
    const images = feed.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute('src')).toBe('https://cdn.example/andi.jpg')
    // budi tanpa avatar jatuh ke lingkaran berinisial.
    expect(feed.textContent).toContain('B')
  })

  it('shows only the victim when the kill has no killer', () => {
    render(hud(snapshot(), defaultConfig(), [killEntry({ killer: null, killerAvatarUrl: null })]))

    const feed = screen.getByTestId('kill-feed')
    expect(feed.querySelectorAll('img')).toHaveLength(0)
    expect(feed.textContent).toContain('budi')
  })
})

describe('Hud gift history', () => {
  const gift = (over: Partial<GiftFeedEntry> = {}): GiftFeedEntry => ({
    id: 'g1',
    kind: 'gift',
    atMs: -1000,
    username: 'budi',
    giftName: 'Rose',
    caption: 'BARRAGE TEAM RONALDO',
    icon: 'gift',
    ...over,
  })

  it('shows the gifter, the gift and what it did', () => {
    render(hud(snapshot(), defaultConfig(), [], [gift()]))

    const feed = screen.getByTestId('gift-feed')
    expect(feed.textContent).toContain('budi')
    expect(feed.textContent).toContain('Rose')
    expect(feed.textContent).toContain('BARRAGE TEAM RONALDO')
  })

  it('renders an empty gift feed without crashing', () => {
    render(hud(snapshot()))

    expect(screen.getByTestId('gift-feed').textContent).toBe('')
  })
})

describe('kartu top fighters', () => {
  it('menampilkan top fighters dengan perolehan kill masing-masing', () => {
    const fighters: SnapshotFighter[] = [
      { ...fighterWith(0, 0), kills: 5 },
      { ...fighterWith(1, 0), side: SIDE_B, kills: 2 },
    ]
    render(hud(snapshot({}, fighters)))

    const card = screen.getByTestId('top-fighters')
    expect(card.textContent).toContain('andi')
    expect(card.textContent).toContain('5')
    expect(card.textContent).toContain('budi')
    expect(card.textContent).toContain('2')
  })
})

/**
 * Kartunya digambar dari PROP, bukan dari snapshot fighter.
 *
 * Sumbernya tally gift sesi di engine, yang menghitung juga penonton tanpa fighter dan
 * bertahan lintas match — dua hal yang `fighter.giftCoins` tidak bisa jawab.
 */
describe('kartu top gifter', () => {
  it('menampilkan penyumbang yang dioper', () => {
    render(
      hud(snapshot(), defaultConfig(), [], [], [
        {
          username: 'andi',
          avatarUrl: null,
          coins: 1250,
        },
      ]),
    )
    expect(screen.getByTestId('top-gifter').textContent).toContain('andi')
    expect(screen.getByTestId('top-gifter').textContent).toContain('1,250')
  })

  it('menampilkan lima penyumbang dalam urutan ranking', () => {
    render(
      hud(
        snapshot(),
        defaultConfig(),
        [],
        [],
        ['andi', 'budi', 'cinta', 'dina', 'eka'].map((username, index) => ({
          username,
          avatarUrl: null,
          coins: 500 - index * 50,
        })),
      ),
    )

    const rows = screen.getAllByTestId('top-gifter-row')
    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.textContent)).toEqual([
      '1.andi500',
      '2.budi450',
      '3.cinta400',
      '4.dina350',
      '5.eka300',
    ])
  })

  it('tidak menggambar kartu saat belum ada hadiah', () => {
    render(hud(snapshot()))
    expect(screen.queryByTestId('top-gifter')).toBeNull()
  })

  it('MENGABAIKAN koin gift di snapshot fighter — itu angka per-match, bukan per-sesi', () => {
    render(hud(snapshot({}, [fighterWith(0, 9999)])))
    expect(screen.queryByTestId('top-gifter')).toBeNull()
  })
})

describe('band callout', () => {
  /** `snapshot()` di berkas ini hanya mengurus header dan fighter; ultimate ditempel di sini. */
  const withUltimate = (over: Partial<SnapshotUltimate> = {}): SnapshotView => {
    const view = snapshot()
    view.header.ultimateCount = 1
    view.ultimates = [
      ultimateWith({ variant: 1, originX: 0, progress: 0.3, ...over }),
    ]
    return view
  }

  it('menampilkan nama gifter dan jenis ultimate-nya', () => {
    render(hud(withUltimate()))

    const band = screen.getByTestId('ultimate-callout')
    expect(band.textContent).toContain('andi')
    expect(band.textContent).toContain('LASER')
  })

  it('baris hasil muncul hanya setelah ultimate-nya mendarat', () => {
    render(hud(withUltimate({ killCount: 3 })))
    expect(screen.getByTestId('ultimate-callout').textContent).toContain('3 KILL')
  })

  it('tidak memasang band sama sekali saat tidak ada ultimate', () => {
    render(hud(snapshot()))
    expect(screen.queryByTestId('ultimate-callout')).toBeNull()
  })
})
