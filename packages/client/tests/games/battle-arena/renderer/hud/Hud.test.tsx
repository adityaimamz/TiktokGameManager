// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NO_SLOT, SIDE_A, SIDE_B, createSnapshotView } from '@lga/shared'
import type { SnapshotUltimate, SnapshotView } from '@lga/shared'
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

const roster = new Map<number, RosterEntry>([
  [0, { slotIndex: 0, username: 'andi', avatarUrl: null, side: 'a', platform: 'tiktok' }],
  [1, { slotIndex: 1, username: 'budi', avatarUrl: null, side: 'b', platform: 'tiktok' }],
])

const hud = (
  view: SnapshotView,
  config = defaultConfig(),
  kills: KillFeedEntry[] = [],
  gifts: GiftFeedEntry[] = [],
  topGifter: SessionGifter | null = null,
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
    topGifter={topGifter}
  />
)

describe('Hud', () => {
  it('shows both side names and their scores', () => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'Team Messi' }
    config.sides.b = { ...config.sides.b, name: 'Team Ronaldo' }

    render(hud(snapshot({ roundScoreA: 4, roundScoreB: 2 }), config))

    expect(screen.getByTestId('score-bar').textContent).toContain('Team Messi')
    expect(screen.getByTestId('score-bar').textContent).toContain('Team Ronaldo')
    expect(screen.getByTestId('score-a').textContent).toBe('4')
    expect(screen.getByTestId('score-b').textContent).toBe('2')
  })

  it('puts the crown on the leading side only', () => {
    render(hud(snapshot({ roundScoreA: 4, roundScoreB: 2 })))

    expect(screen.getByTestId('crown-a')).toBeTruthy()
    expect(screen.queryByTestId('crown-b')).toBeNull()
  })

  it('draws one round dot per round in the series', () => {
    const config = defaultConfig()
    config.gameplay.roundsBestOf = 5

    render(hud(snapshot({ roundsWonA: 2 }), config))

    // Satu baris titik untuk seluruh seri: kemenangan A menumpuk dari kiri, B dari kanan.
    const dots = screen.getAllByTestId('round-dot')
    expect(dots).toHaveLength(5)
    expect(dots.filter((dot) => dot.dataset.dot === 'a')).toHaveLength(2)
  })

  it('lists the top fighters when anyone has a kill', () => {
    render(
      hud(
        snapshot({}, [
          {
            slotIndex: 0,
            x: 0,
            y: 0,
            hp: 1,
            maxHp: 1,
            side: SIDE_A,
            alive: 1,
            facingAngle: 0,
            targetSlot: -1,
            kills: 3,
            giftCoins: 0,
          },
          {
            slotIndex: 1,
            x: 0,
            y: 0,
            hp: 1,
            maxHp: 1,
            side: SIDE_B,
            alive: 1,
            facingAngle: 0,
            targetSlot: -1,
            kills: 9,
            giftCoins: 0,
          },
        ]),
      ),
    )

    const board = screen.getByTestId('top-fighters')
    expect(board.textContent).toContain('budi')
    expect(board.textContent?.indexOf('budi')).toBeLessThan(board.textContent?.indexOf('andi') ?? -1)
  })

  it('hides the board entirely when nobody has killed yet', () => {
    render(hud(snapshot()))
    expect(screen.queryByTestId('top-fighters')).toBeNull()
  })

  it('shows the kill feed', () => {
    render(
      hud(snapshot(), defaultConfig(), [
        {
          id: 'k1',
          kind: 'kill',
          atMs: 0,
          killer: 'andi',
          killerSide: 'a',
          killerAvatarUrl: null,
          victim: 'budi',
          victimSide: 'b',
          victimAvatarUrl: null,
        },
      ]),
    )

    const feed = screen.getByTestId('kill-feed')
    expect(feed.textContent).toContain('andi')
    expect(feed.textContent).toContain('budi')
  })

  it('keeps the victory banner off screen during battle', () => {
    render(hud(snapshot({ matchState: matchStateIndex('battle') })))
    expect(screen.queryByTestId('victory-banner')).toBeNull()
  })

  it('raises the banner with the winner name on the result screen', () => {
    const config = defaultConfig()
    config.sides.b = { ...config.sides.b, name: 'Team Ronaldo' }

    render(
      hud(
        snapshot({ matchState: matchStateIndex('result'), roundWinner: SIDE_B, roundsWonB: 2 }),
        config,
      ),
    )

    expect(screen.getByTestId('victory-banner').textContent).toContain('Team Ronaldo')
  })
})

const fighterWith = (slotIndex: number, giftCoins: number): SnapshotView['fighters'][number] => ({
  slotIndex,
  x: 0,
  y: 0,
  hp: 10,
  maxHp: 10,
  side: SIDE_A,
  alive: 1,
  facingAngle: 0,
  targetSlot: NO_SLOT,
  kills: 0,
  giftCoins,
})

describe('Hud kill feed avatars', () => {
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

/**
 * Kartunya digambar dari PROP, bukan dari snapshot fighter.
 *
 * Sumbernya tally gift sesi di engine, yang menghitung juga penonton tanpa fighter dan
 * bertahan lintas match — dua hal yang `fighter.giftCoins` tidak bisa jawab.
 */
describe('kartu top gifter', () => {
  it('menampilkan penyumbang yang dioper', () => {
    render(
      hud(snapshot(), defaultConfig(), [], [], {
        username: 'andi',
        avatarUrl: null,
        coins: 1250,
      }),
    )
    expect(screen.getByTestId('top-gifter').textContent).toContain('andi')
    expect(screen.getByTestId('top-gifter').textContent).toContain('1,250 coins')
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
