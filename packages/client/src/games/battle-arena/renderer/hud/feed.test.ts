import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../config/index.js'
import type { Fighter } from '../../types.js'
import type { BattleAction } from '../../actions.js'
import type { EngineEvent } from '../../events.js'
import {
  FEED_ENTRANCE_MS,
  FEED_ENTRANCE_OFFSET_PX,
  FEED_FADE_MS,
  GIFT_FEED_TTL_MS,
  JOIN_FEED_TTL_MS,
  KILL_FEED_MAX,
  KILL_FEED_TTL_MS,
  feedEntrance,
  feedEntryFromEvent,
  feedOpacity,
  pruneFeed,
  pushFeed,
} from './feed.js'
import type { GiftFeedEntry, KillFeedEntry } from './feed.js'

const fighterLike = (username: string, side: 'a' | 'b', avatarUrl: string | null = null): Fighter =>
  ({ username, side, avatarUrl, key: `tiktok:${username}`, platform: 'tiktok' }) as unknown as Fighter

const kill = (atMs: number, victim: string): KillFeedEntry => ({
  id: `kill-${atMs}-${victim}`,
  kind: 'kill',
  atMs,
  killer: 'andi',
  killerSide: 'a',
  killerAvatarUrl: null,
  victim,
  victimSide: 'b',
  victimAvatarUrl: null,
})

describe('feedEntryFromEvent', () => {
  it('turns a death into a kill entry', () => {
    const entry = feedEntryFromEvent(
      { type: 'fighterDied', fighter: fighterLike('budi', 'b'), killer: fighterLike('andi', 'a') },
      1000,
      defaultConfig(),
    )

    expect(entry).toMatchObject({ kind: 'kill', killer: 'andi', victim: 'budi', atMs: 1000 })
  })

  it('records an unattributed death with no killer', () => {
    const entry = feedEntryFromEvent(
      { type: 'fighterDied', fighter: fighterLike('budi', 'b'), killer: null },
      1000,
      defaultConfig(),
    )

    expect(entry).toMatchObject({ kind: 'kill', killer: null, killerSide: null })
  })

  it('carries both avatars so the feed can show faces (Req 33 AC1)', () => {
    const entry = feedEntryFromEvent(
      {
        type: 'fighterDied',
        fighter: fighterLike('budi', 'b', 'https://cdn.example/budi.jpg'),
        killer: fighterLike('andi', 'a', 'https://cdn.example/andi.jpg'),
      },
      1000,
      defaultConfig(),
    )

    expect(entry).toMatchObject({
      killerAvatarUrl: 'https://cdn.example/andi.jpg',
      victimAvatarUrl: 'https://cdn.example/budi.jpg',
    })
  })

  it('leaves the killer avatar null when nobody gets the credit', () => {
    const entry = feedEntryFromEvent(
      {
        type: 'fighterDied',
        fighter: fighterLike('budi', 'b', 'https://cdn.example/budi.jpg'),
        killer: null,
      },
      1000,
      defaultConfig(),
    )

    expect(entry).toMatchObject({
      killerAvatarUrl: null,
      victimAvatarUrl: 'https://cdn.example/budi.jpg',
    })
  })

  it('turns a join into a join entry when the creator wants join messages', () => {
    const entry = feedEntryFromEvent(
      { type: 'fighterJoined', fighter: fighterLike('andi', 'a'), outcome: 'joined' },
      500,
      defaultConfig(),
    )

    expect(entry).toMatchObject({ kind: 'join', username: 'andi', side: 'a' })
  })

  it('stays quiet about joins when the creator turned them off', () => {
    const config = defaultConfig()
    config.ui.showJoinedMessages = false

    expect(
      feedEntryFromEvent(
        { type: 'fighterJoined', fighter: fighterLike('andi', 'a'), outcome: 'joined' },
        500,
        config,
      ),
    ).toBeNull()
  })

  it('ignores a rejoin — the viewer was already on screen', () => {
    expect(
      feedEntryFromEvent(
        { type: 'fighterJoined', fighter: fighterLike('andi', 'a'), outcome: 'rejoined' },
        500,
        defaultConfig(),
      ),
    ).toBeNull()
  })

  it('ignores events the feed has nothing to say about', () => {
    expect(
      feedEntryFromEvent({ type: 'roundEnded', winner: 'a', roundIndex: 1 }, 0, defaultConfig()),
    ).toBeNull()
  })

  it('gives every entry an id unique enough for a React key', () => {
    const first = feedEntryFromEvent(
      { type: 'fighterDied', fighter: fighterLike('budi', 'b'), killer: null },
      1000,
      defaultConfig(),
    )
    const second = feedEntryFromEvent(
      { type: 'fighterDied', fighter: fighterLike('cinta', 'b'), killer: null },
      1000,
      defaultConfig(),
    )

    expect(first?.id).not.toBe(second?.id)
  })
})

describe('pushFeed', () => {
  it('appends the newest entry', () => {
    const list = pushFeed([], kill(0, 'budi'), 0, KILL_FEED_MAX, KILL_FEED_TTL_MS)
    const grown = pushFeed(list, kill(10, 'cinta'), 10, KILL_FEED_MAX, KILL_FEED_TTL_MS)

    expect(grown.map((entry) => entry.victim)).toEqual(['budi', 'cinta'])
  })

  it('never grows past the maximum, dropping the oldest', () => {
    let list: KillFeedEntry[] = []
    for (let i = 0; i < KILL_FEED_MAX + 3; i++) {
      list = pushFeed(list, kill(i, `victim-${i}`), i, KILL_FEED_MAX, KILL_FEED_TTL_MS)
    }

    expect(list).toHaveLength(KILL_FEED_MAX)
    expect(list[0]?.victim).toBe('victim-3')
  })

  it('drops entries that already expired while it is at it', () => {
    const list = pushFeed([], kill(0, 'budi'), 0, KILL_FEED_MAX, KILL_FEED_TTL_MS)
    const later = pushFeed(list, kill(9000, 'cinta'), 9000, KILL_FEED_MAX, KILL_FEED_TTL_MS)

    expect(later.map((entry) => entry.victim)).toEqual(['cinta'])
  })

  it('returns a new array so React notices the change', () => {
    const list: KillFeedEntry[] = []
    expect(pushFeed(list, kill(0, 'budi'), 0, KILL_FEED_MAX, KILL_FEED_TTL_MS)).not.toBe(list)
  })
})

describe('pruneFeed', () => {
  it('keeps entries inside their time to live', () => {
    const list = [kill(0, 'budi')]
    expect(pruneFeed(list, KILL_FEED_TTL_MS - 1, KILL_FEED_TTL_MS)).toHaveLength(1)
    expect(pruneFeed(list, KILL_FEED_TTL_MS + 1, KILL_FEED_TTL_MS)).toHaveLength(0)
  })

  it('returns the same array when there is nothing to drop', () => {
    const list = [kill(0, 'budi')]
    expect(pruneFeed(list, 10, KILL_FEED_TTL_MS)).toBe(list)
  })
})

describe('feedOpacity', () => {
  it('is fully opaque until the fade window', () => {
    expect(feedOpacity(kill(0, 'budi'), 0, KILL_FEED_TTL_MS)).toBe(1)
    expect(feedOpacity(kill(0, 'budi'), KILL_FEED_TTL_MS - FEED_FADE_MS, KILL_FEED_TTL_MS)).toBe(1)
  })

  it('fades to nothing at the end of its life', () => {
    const half = KILL_FEED_TTL_MS - FEED_FADE_MS / 2
    expect(feedOpacity(kill(0, 'budi'), half, KILL_FEED_TTL_MS)).toBeCloseTo(0.5, 5)
    expect(feedOpacity(kill(0, 'budi'), KILL_FEED_TTL_MS, KILL_FEED_TTL_MS)).toBe(0)
  })

  it('works for the shorter join window too', () => {
    expect(feedOpacity(kill(0, 'budi'), JOIN_FEED_TTL_MS, JOIN_FEED_TTL_MS)).toBe(0)
  })
})

describe('gift history entries (Req 33 AC2)', () => {
  const applied = (over: Partial<BattleAction> = {}): EngineEvent => ({
    type: 'actionApplied',
    action: {
      type: 'damage',
      target: 'side:b',
      value: 20,
      duration: 0,
      actor: { platform: 'tiktok', username: 'budi', avatarUrl: null },
      ruleId: 'gift-barrage',
      giftName: 'Rose',
      giftCoins: 0,
      ...over,
    },
  })

  it('turns a gift-driven action into an entry with icon, gift and caption', () => {
    const config = defaultConfig()
    config.sides.b = { ...config.sides.b, name: 'Team Ronaldo' }

    const entry = feedEntryFromEvent(applied(), 1000, config)

    // Huruf besar seluruhnya, sama seperti kartu action legend — entri ini adalah bukti
    // bahwa kartu itu bekerja, jadi keduanya harus terbaca sebagai satu bahasa.
    expect(entry).toMatchObject({
      kind: 'gift',
      username: 'budi',
      giftName: 'Rose',
      caption: 'BARRAGE TEAM RONALDO',
      icon: 'gift',
      atMs: 1000,
    })
  })

  it('ignores an action that no gift triggered', () => {
    expect(feedEntryFromEvent(applied({ giftName: null }), 1000, defaultConfig())).toBeNull()
  })

  it('ignores an action whose rule the creator has since deleted', () => {
    expect(feedEntryFromEvent(applied({ ruleId: 'gone' }), 1000, defaultConfig())).toBeNull()
  })

  it('ignores a gift action with nobody to credit', () => {
    expect(feedEntryFromEvent(applied({ actor: null }), 1000, defaultConfig())).toBeNull()
  })
})

describe('feedEntrance', () => {
  const entry = (atMs: number): GiftFeedEntry => ({
    id: 'g1',
    kind: 'gift',
    atMs,
    username: 'budi',
    giftName: 'Rose',
    caption: 'BARRAGE',
    icon: 'gift',
  })

  it('slides in and settles within FEED_ENTRANCE_MS', () => {
    expect(feedEntrance(entry(1000), 1000)).toEqual({
      opacity: 0,
      offsetPx: FEED_ENTRANCE_OFFSET_PX,
    })
    expect(feedEntrance(entry(1000), 1000 + FEED_ENTRANCE_MS / 2).opacity).toBeCloseTo(0.5)
    expect(feedEntrance(entry(1000), 1000 + FEED_ENTRANCE_MS)).toEqual({ opacity: 1, offsetPx: 0 })
    expect(feedEntrance(entry(1000), 5000)).toEqual({ opacity: 1, offsetPx: 0 })
  })

  it('finishes long before the entry starts fading out, so the two never fight', () => {
    expect(FEED_ENTRANCE_MS).toBeLessThan(GIFT_FEED_TTL_MS - FEED_FADE_MS)
  })
})
