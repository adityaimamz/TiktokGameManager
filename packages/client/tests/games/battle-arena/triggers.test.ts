import { describe, expect, it } from 'vitest'
import { createChatMessage, isSyntheticPlatform } from '@lga/shared'
import type { ChatEventKind } from '@lga/shared'
import { defaultConfig } from '../../../src/games/battle-arena/config/index.js'
import type { BattleArenaConfig, TriggerRule } from '../../../src/games/battle-arena/config/index.js'
import {
  BattleArenaTriggers,
  actionForRule,
  buildActionLegend,
  creatorActor,
  matchesSide,
  resolveCaption,
} from '../../../src/games/battle-arena/triggers.js'

const configWith = (mutate: (c: BattleArenaConfig) => void = () => {}): BattleArenaConfig => {
  const config = defaultConfig()
  config.sides.a = { ...config.sides.a, name: 'Team Messi', keyword: 'messi', aliases: ['m10', 'leo'] }
  config.sides.b = { ...config.sides.b, name: 'Team Ronaldo', keyword: 'ronaldo', aliases: ['cr7'] }
  mutate(config)
  return config
}

const triggersFor = (config: BattleArenaConfig) => new BattleArenaTriggers(() => config)

const comment = (text: string, username = 'andi') =>
  createChatMessage({ id: 'm', kind: 'textMessageEvent', platform: 'tiktok', username, text })

const like = (likeCount: number, username = 'andi') =>
  createChatMessage({ id: 'm', kind: 'likeEvent', platform: 'tiktok', username, likeCount })

describe('matchesSide', () => {
  const side = configWith().sides.a

  it('matches the keyword', () => {
    expect(matchesSide('messi', side)).toBe(true)
  })

  it('matches the side name', () => {
    expect(matchesSide('team messi', side)).toBe(true)
  })

  it('matches an alias', () => {
    expect(matchesSide('cr7 vs leo', side)).toBe(true)
  })

  it('matches a keyword surrounded by other words', () => {
    expect(matchesSide('i pick messi now', side)).toBe(true)
  })

  it('does not match a keyword glued inside another word', () => {
    expect(matchesSide('messiah', side)).toBe(false)
  })

  it('does not match an unrelated message', () => {
    expect(matchesSide('hello world', side)).toBe(false)
  })
})

describe('BattleArenaTriggers.resolve — comments', () => {
  it('turns a keyword into a spawn action for that side', () => {
    const actions = triggersFor(configWith()).resolve(comment('messi'))
    expect(actions).toHaveLength(1)
    expect(actions[0]?.type).toBe('spawn')
    expect(actions[0]?.target).toBe('side:a')
    expect(actions[0]?.actor).toEqual({ platform: 'tiktok', username: 'andi', avatarUrl: null })
  })

  it('is case-insensitive and survives punctuation', () => {
    expect(triggersFor(configWith()).resolve(comment('  MESSI!!! '))).toHaveLength(1)
  })

  it('routes the other keyword to side b', () => {
    expect(triggersFor(configWith()).resolve(comment('cr7'))[0]?.target).toBe('side:b')
  })

  it('ignores a message that matches both sides (Req 4 AC7)', () => {
    expect(triggersFor(configWith()).resolve(comment('messi vs ronaldo'))).toEqual([])
  })

  it('ignores a message that matches nothing', () => {
    expect(triggersFor(configWith()).resolve(comment('hello'))).toEqual([])
  })

  it('ignores an empty comment', () => {
    expect(triggersFor(configWith()).resolve(comment('   !!!  '))).toEqual([])
  })

  it('produces nothing while the rule is disabled', () => {
    const config = configWith((c) => {
      const rule = c.triggers.find((r) => r.id === 'join-a')
      if (rule !== undefined) rule.enabled = false
    })
    expect(triggersFor(config).resolve(comment('messi'))).toEqual([])
    expect(triggersFor(config).resolve(comment('ronaldo'))).toHaveLength(1)
  })

  it('carries the sender avatar into the action', () => {
    const message = createChatMessage({
      id: 'm',
      kind: 'textMessageEvent',
      platform: 'demo',
      username: 'bot',
      text: 'messi',
      avatarUrl: 'https://example.test/a.png',
    })
    expect(triggersFor(configWith()).resolve(message)[0]?.actor).toEqual({
      platform: 'demo',
      username: 'bot',
      avatarUrl: 'https://example.test/a.png',
    })
  })

  it('reads the config afresh on every call', () => {
    const config = configWith()
    const triggers = triggersFor(config)
    expect(triggers.resolve(comment('messi'))).toHaveLength(1)
    config.sides.a.keyword = 'maradona'
    config.sides.a.name = 'Team Maradona'
    config.sides.a.aliases = []
    expect(triggers.resolve(comment('messi'))).toEqual([])
    expect(triggers.resolve(comment('maradona'))).toHaveLength(1)
  })
})

describe('BattleArenaTriggers.resolve — likes', () => {
  it('turns a like event into a grow action carrying the like count', () => {
    const actions = triggersFor(configWith()).resolve(like(7))
    expect(actions).toHaveLength(1)
    expect(actions[0]?.type).toBe('grow')
    expect(actions[0]?.target).toBe('fighter:tiktok:andi')
    expect(actions[0]?.value).toBe(7)
  })

  it('counts a like event with no count as a single like', () => {
    expect(triggersFor(configWith()).resolve(like(0))[0]?.value).toBe(1)
  })

  it('produces nothing while the grow rule is disabled', () => {
    const config = configWith((c) => {
      const rule = c.triggers.find((r) => r.id === 'grow-hp')
      if (rule !== undefined) rule.enabled = false
    })
    expect(triggersFor(config).resolve(like(20))).toEqual([])
  })
})

describe('BattleArenaTriggers.resolve — other event kinds', () => {
  it('ignores kinds with no rule bound to them, without error', () => {
    const triggers = triggersFor(configWith())
    for (const kind of ['giftEvent', 'followEvent', 'memberEvent', 'shareEvent'] as ChatEventKind[]) {
      expect(triggers.resolve(createChatMessage({ id: 'm', kind, platform: 'tiktok', username: 'andi' }))).toEqual([])
    }
  })
})

describe('buildActionLegend', () => {
  it('builds one card per enabled rule, in config order', () => {
    const legend = buildActionLegend(configWith())
    expect(legend.map((entry) => entry.id)).toEqual(['join-a', 'join-b', 'grow-hp'])
  })

  it('quotes the keyword as the comment condition and fills in the side name', () => {
    const legend = buildActionLegend(configWith())
    expect(legend[0]).toEqual({
      id: 'join-a',
      condition: '"messi"',
      caption: 'JOIN TEAM MESSI',
      icon: 'join',
      side: 'a',
    })
  })

  it('shows the like threshold as the like condition', () => {
    const legend = buildActionLegend(configWith((c) => (c.likes.threshold = 25)))
    const grow = legend.find((entry) => entry.id === 'grow-hp')
    expect(grow?.condition).toBe('x25')
    expect(grow?.caption).toBe('GROW HP')
  })

  it('omits disabled rules', () => {
    const legend = buildActionLegend(
      configWith((c) => {
        const rule = c.triggers.find((r) => r.id === 'join-b')
        if (rule !== undefined) rule.enabled = false
      }),
    )
    expect(legend.map((entry) => entry.id)).toEqual(['join-a', 'grow-hp'])
  })

  it('omits rules the creator hid from the legend', () => {
    const legend = buildActionLegend(
      configWith((c) => {
        const rule = c.triggers.find((r) => r.id === 'grow-hp')
        if (rule !== undefined) rule.legend.show = false
      }),
    )
    expect(legend.map((entry) => entry.id)).toEqual(['join-a', 'join-b'])
  })
})

describe('actionForRule', () => {
  it('builds exactly the action a real chat message would build', () => {
    const config = defaultConfig()
    const actor = creatorActor('creator-1')
    const fromChat = new BattleArenaTriggers(() => config).resolve(
      createChatMessage({
        id: 'm1',
        kind: 'textMessageEvent',
        platform: 'creator',
        username: 'creator-1',
        text: config.sides.a.keyword,
      }),
    )

    expect(actionForRule(config, 'join-a', actor)).toEqual(fromChat[0])
  })

  it('returns null for a rule that does not exist', () => {
    expect(actionForRule(defaultConfig(), 'nope', creatorActor())).toBeNull()
  })

  it('returns null for a disabled rule, matching what chat would do', () => {
    const config = defaultConfig()
    const rule = config.triggers.find((entry) => entry.id === 'join-a')
    if (rule === undefined) throw new Error('expected the default join rule')
    rule.enabled = false

    expect(actionForRule(config, 'join-a', creatorActor())).toBeNull()
  })

  it('marks the creator as a synthetic identity so real viewer stats stay clean', () => {
    expect(creatorActor().platform).toBe('creator')
    expect(isSyntheticPlatform(creatorActor().platform)).toBe(true)
  })
})

const giftRule = (over: Partial<TriggerRule> = {}): TriggerRule => ({
  id: 'gift-heal',
  label: 'Gift heal',
  enabled: true,
  when: { kind: 'gift', giftNames: ['Rose'], minCount: 1 },
  then: { actionType: 'heal', target: 'sender', value: 50 },
  legend: { show: true, caption: 'HEAL ME', icon: 'gift' },
  ...over,
})

const gift = (name: string, count = 1, coins = 1) =>
  createChatMessage({
    id: 'g1',
    kind: 'giftEvent',
    platform: 'tiktok',
    username: 'andi',
    giftName: name,
    giftCount: count,
    giftCoins: coins,
  })

describe('kondisi gift', () => {
  it('memicu aksi saat nama gift cocok', () => {
    const config = defaultConfig()
    config.triggers = [giftRule()]
    const triggers = new BattleArenaTriggers(() => config)

    const actions = triggers.resolve(gift('Rose'))

    expect(actions).toHaveLength(1)
    expect(actions[0]?.type).toBe('heal')
    expect(actions[0]?.value).toBe(50)
  })

  it('mencocokkan tanpa peduli huruf besar-kecil dan spasi pengapit', () => {
    const config = defaultConfig()
    config.triggers = [
      giftRule({ when: { kind: 'gift', giftNames: [' finger heart '], minCount: 1 } }),
    ]
    const triggers = new BattleArenaTriggers(() => config)

    expect(triggers.resolve(gift('Finger Heart'))).toHaveLength(1)
  })

  it('mengabaikan gift yang namanya tidak ada di daftar', () => {
    const config = defaultConfig()
    config.triggers = [giftRule()]
    const triggers = new BattleArenaTriggers(() => config)

    expect(triggers.resolve(gift('Galaxy'))).toEqual([])
  })

  it('memperlakukan daftar kosong sebagai gift apa pun', () => {
    const config = defaultConfig()
    config.triggers = [giftRule({ when: { kind: 'gift', giftNames: [], minCount: 1 } })]
    const triggers = new BattleArenaTriggers(() => config)

    expect(triggers.resolve(gift('Gift Apa Saja'))).toHaveLength(1)
  })

  it('menahan aksi sampai jumlahnya mencapai minCount', () => {
    const config = defaultConfig()
    config.triggers = [giftRule({ when: { kind: 'gift', giftNames: [], minCount: 5 } })]
    const triggers = new BattleArenaTriggers(() => config)

    expect(triggers.resolve(gift('Rose', 4))).toEqual([])
    expect(triggers.resolve(gift('Rose', 5))).toHaveLength(1)
  })

  it('mengabaikan rule yang dimatikan', () => {
    const config = defaultConfig()
    config.triggers = [giftRule({ enabled: false })]
    const triggers = new BattleArenaTriggers(() => config)

    expect(triggers.resolve(gift('Rose'))).toEqual([])
  })

  it('memakai nilai koin sebagai satuan Grow', () => {
    const config = defaultConfig()
    config.gameplay.growMode = 'perCoin'
    config.triggers = [giftRule({ then: { actionType: 'grow', target: 'sender', value: 5 } })]
    const triggers = new BattleArenaTriggers(() => config)

    // Tiga kelipatan (minCount 1, count 3) berbagi 60 koin, jadi yang dikunci adalah
    // TOTAL-nya: HP yang didapat per koin tidak boleh berubah hanya karena satu event
    // gift kini pecah jadi beberapa aksi.
    const actions = triggers.resolve(gift('Rose', 3, 60))
    expect(actions.reduce((sum, a) => sum + a.value, 0)).toBeCloseTo(60, 6)
  })
})

/**
 * `minCount` adalah PEMBAGI, bukan sekadar gerbang.
 *
 * Creator membacanya begitu, dan memang begitu bunyinya di panel: "minimal 10" berarti
 * sepuluh gift menghasilkan satu trigger. Sebelum ini satu event gift selalu menghasilkan
 * TEPAT SATU aksi berapa pun banyaknya, jadi combo ×100 di atas minimal 10 memberi hasil
 * yang sama persis dengan combo ×10 — penonton membayar sepuluh kali lipat untuk hal yang
 * sama.
 */
describe('kelipatan gift', () => {
  it('memberi satu aksi per kelipatan minCount', () => {
    const config = defaultConfig()
    config.triggers = [giftRule({ when: { kind: 'gift', giftNames: [], minCount: 10 } })]
    const triggers = new BattleArenaTriggers(() => config)

    expect(triggers.resolve(gift('Rose', 100, 100))).toHaveLength(10)
  })

  it('membulatkan ke bawah — sisa yang belum genap tidak memicu apa pun', () => {
    const config = defaultConfig()
    config.triggers = [giftRule({ when: { kind: 'gift', giftNames: [], minCount: 10 } })]
    const triggers = new BattleArenaTriggers(() => config)

    expect(triggers.resolve(gift('Rose', 29, 29))).toHaveLength(2)
  })

  it('MEMBAGI koinnya, tidak menyalinnya — total yang dikirim tidak boleh menggelembung', () => {
    const config = defaultConfig()
    config.triggers = [giftRule({ when: { kind: 'gift', giftNames: [], minCount: 10 } })]
    const triggers = new BattleArenaTriggers(() => config)

    const actions = triggers.resolve(gift('Rose', 100, 500))

    // Sepuluh aksi, tapi koinnya tetap 500 — bukan 5.000. Tier ultimate dan satuan Grow
    // keduanya turun dari angka ini; menyalinnya utuh membuat tiap kelipatan berperilaku
    // seolah menerima SELURUH gift.
    expect(actions.reduce((sum, a) => sum + a.giftCoins, 0)).toBeCloseTo(500, 6)
    expect(actions[0]?.giftCoins).toBeCloseTo(50, 6)
  })

  it('menjepit di gameplay.maxTriggersPerGift, dan jepitannya MEMEKATKAN bukan membuang', () => {
    const config = defaultConfig()
    config.gameplay.maxTriggersPerGift = 4
    config.triggers = [giftRule({ when: { kind: 'gift', giftNames: [], minCount: 1 } })]
    const triggers = new BattleArenaTriggers(() => config)

    const actions = triggers.resolve(gift('Rose', 6854, 6854))

    expect(actions).toHaveLength(4)
    // Koin yang dijepit tidak hangus: ia menumpuk ke aksi yang tersisa, jadi gift raksasa
    // berujung sedikit ultimate BESAR alih-alih ribuan ultimate kecil.
    expect(actions.reduce((sum, a) => sum + a.giftCoins, 0)).toBeCloseTo(6854, 3)
  })

  it('tetap satu aksi saat minCount 1 dan gift tunggal', () => {
    const config = defaultConfig()
    config.triggers = [giftRule({ when: { kind: 'gift', giftNames: [], minCount: 1 } })]
    const triggers = new BattleArenaTriggers(() => config)

    expect(triggers.resolve(gift('Rose', 1, 1))).toHaveLength(1)
  })
})

describe('kondisi follow', () => {
  const follow = () =>
    createChatMessage({ id: 'f1', kind: 'followEvent', platform: 'tiktok', username: 'andi' })

  it('memicu Grow dengan satuan satu per event', () => {
    const config = defaultConfig()
    config.gameplay.growMode = 'perFollow'
    config.triggers = [
      giftRule({
        id: 'follow-grow',
        when: { kind: 'follow' },
        then: { actionType: 'grow', target: 'sender', value: 5 },
      }),
    ]
    const triggers = new BattleArenaTriggers(() => config)

    const actions = triggers.resolve(follow())

    expect(actions).toHaveLength(1)
    expect(actions[0]?.value).toBe(1)
  })

  it('tidak bereaksi terhadap member dan share', () => {
    const config = defaultConfig()
    config.triggers = [giftRule({ id: 'follow-grow', when: { kind: 'follow' } })]
    const triggers = new BattleArenaTriggers(() => config)

    for (const kind of ['memberEvent', 'shareEvent'] as const) {
      expect(
        triggers.resolve(
          createChatMessage({ id: 'x', kind, platform: 'tiktok', username: 'andi' }),
        ),
      ).toEqual([])
    }
  })
})

describe('legend kondisi gift dan follow', () => {
  const legendFor = (when: TriggerRule['when']): string => {
    const config = defaultConfig()
    config.triggers = [
      {
        id: 'x',
        label: 'x',
        enabled: true,
        when,
        then: { actionType: 'heal', target: 'sender', value: 10 },
        legend: { show: true, caption: 'HEAL ME', icon: 'gift' },
      },
    ]
    return buildActionLegend(config)[0]?.condition ?? ''
  }

  it('menyebut satu nama gift', () => {
    expect(legendFor({ kind: 'gift', giftNames: ['Rose'], minCount: 1 })).toBe('ROSE')
  })

  it('menggabungkan beberapa nama dengan garis miring', () => {
    expect(legendFor({ kind: 'gift', giftNames: ['Rose', 'Galaxy'], minCount: 1 })).toBe(
      'ROSE / GALAXY',
    )
  })

  it('menyebut ANY GIFT saat daftar kosong', () => {
    expect(legendFor({ kind: 'gift', giftNames: [], minCount: 1 })).toBe('ANY GIFT')
  })

  it('menambahkan jumlah minimum hanya bila lebih dari satu', () => {
    expect(legendFor({ kind: 'gift', giftNames: ['Rose'], minCount: 5 })).toBe('ROSE ×5')
  })

  it('menyebut FOLLOW untuk kondisi follow', () => {
    expect(legendFor({ kind: 'follow' })).toBe('FOLLOW')
  })

  it('tidak mengubah kondisi like', () => {
    expect(legendFor({ kind: 'like', everyNLikes: 10 })).toBe('x10')
  })
})

describe('resolveCaption', () => {
  it('names the side a comment rule matches', () => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'Team Messi' }
    const rule = config.triggers.find((entry) => entry.when.kind === 'comment')
    if (rule === undefined) throw new Error('expected a comment rule')

    expect(resolveCaption(rule, config)).toBe('JOIN Team Messi')
  })

  it('names the side a gift rule fires at, which the legend used to leak raw', () => {
    const config = defaultConfig()
    config.sides.b = { ...config.sides.b, name: 'Team Ronaldo' }
    const rule = config.triggers.find((entry) => entry.id === 'gift-barrage')
    if (rule === undefined) throw new Error('expected the barrage rule')

    expect(resolveCaption(rule, config)).toBe('BARRAGE Team Ronaldo')
  })

  it('drops the placeholder when no single side can be named', () => {
    const config = defaultConfig()
    const rule = config.triggers.find((entry) => entry.id === 'gift-heal')
    if (rule === undefined) throw new Error('expected the heal rule')
    rule.legend = { ...rule.legend, caption: 'HEAL {side}' }

    // target 'sender' tidak menunjuk satu sisi tertentu.
    expect(resolveCaption(rule, config)).toBe('HEAL')
  })
})

describe('buildActionLegend and {side}', () => {
  it('never shows the raw placeholder on a gift card', () => {
    const config = defaultConfig()
    const rule = config.triggers.find((entry) => entry.id === 'gift-barrage')
    if (rule === undefined) throw new Error('expected the barrage rule')
    rule.enabled = true

    const entry = buildActionLegend(config).find((item) => item.id === 'gift-barrage')
    expect(entry?.caption).not.toContain('{SIDE}')
    expect(entry?.caption).not.toContain('{side}')
  })
})

describe('actions remember where they came from', () => {
  const giftMessage = (giftName: string | null, giftCount = 5) =>
    createChatMessage({
      id: 'g1',
      kind: 'giftEvent',
      platform: 'tiktok',
      username: 'budi',
      giftName,
      giftCount,
      giftCoins: 100,
    })

  it('tags a gift action with its rule and gift name', () => {
    const config = defaultConfig()
    const rule = config.triggers.find((entry) => entry.id === 'gift-barrage')
    if (rule === undefined) throw new Error('expected the barrage rule')
    rule.enabled = true

    const actions = new BattleArenaTriggers(() => config).resolve(giftMessage('Rose'))

    expect(actions).toHaveLength(1)
    expect(actions[0]?.ruleId).toBe('gift-barrage')
    expect(actions[0]?.giftName).toBe('Rose')
  })

  it('never leaves a gift action without a name to show', () => {
    const config = defaultConfig()
    const rule = config.triggers.find((entry) => entry.id === 'gift-barrage')
    if (rule === undefined) throw new Error('expected the barrage rule')
    rule.enabled = true

    const actions = new BattleArenaTriggers(() => config).resolve(giftMessage(null))

    expect(actions[0]?.giftName).toBe('hadiah')
  })

  it('tags a comment action with its rule but no gift', () => {
    const config = defaultConfig()
    const actions = new BattleArenaTriggers(() => config).resolve(
      createChatMessage({
        id: 'c1',
        kind: 'textMessageEvent',
        platform: 'tiktok',
        username: 'andi',
        text: config.sides.a.keyword,
      }),
    )

    expect(actions[0]?.ruleId).not.toBeNull()
    expect(actions[0]?.giftName).toBeNull()
  })
})
