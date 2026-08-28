import { describe, expect, it } from 'vitest'
import {
  defaultConfig,
  MAX_GIFT_NAMES,
  MAX_TRIGGER_RULES,
  validateConfig,
} from '../../../../src/games/battle-arena/config/index.js'
import { NUKE_TYPES } from '../../../../src/games/battle-arena/config/index.js'
import {
  ACTION_TYPE_OPTIONS,
  ambiguousSideWords,
  withLegendCaption,
  withRuleLabel,
  actionChoiceOf,
  addRule,
  captionFor,
  giftPicks,
  withActionChoice,
  removeRule,
  triggerCards,
  toggleGiftName,
  withGiftNames,
  withHpGainedPerGrow,
  withKeyword,
  withLikeThreshold,
  withMinCount,
  withRuleEnabled,
  withRuleLegendShown,
  withThen,
  withWhen,
} from '../../../../src/ui/dashboard/sections/action-triggers.js'

describe('triggerCards', () => {
  it('membuat satu kartu per rule, dengan judul dari label rule', () => {
    const cards = triggerCards(defaultConfig())
    expect(cards.map((card) => card.id)).toEqual(defaultConfig().triggers.map((r) => r.id))
    expect(cards[2]?.title).toBe('Grow my blob (HP)')
  })

  it('membawa legend.show sebagai showOnScreen', () => {
    const config = withRuleLegendShown(defaultConfig(), 'join-b', false)
    const cards = triggerCards(config)
    expect(cards.find((card) => card.id === 'join-b')?.showOnScreen).toBe(false)
    expect(cards.find((card) => card.id === 'join-a')?.showOnScreen).toBe(true)
  })

  it('mengambil warna batang dari sisi yang dicocokkan rule comment', () => {
    const config = defaultConfig()
    config.sides.b.color = '#ff0044'
    expect(triggerCards(config)[1]?.accent).toBe('#ff0044')
  })

  it('menampilkan keyword sisi pada rule comment, bukan isi rule', () => {
    const config = defaultConfig()
    config.sides.a.keyword = 'messi'
    const card = triggerCards(config)[0]

    expect(card?.keyword).toBe('messi')
    expect(card?.everyNLikes).toBeNull()
    expect(card?.whenLabel).toBe('Comment')
  })

  it('menampilkan ambang like dan nilai grow pada rule like', () => {
    const config = defaultConfig()
    config.likes.threshold = 25
    config.gameplay.hpGainedPerGrow = 7
    const card = triggerCards(config)[2]

    expect(card?.keyword).toBeNull()
    expect(card?.everyNLikes).toBe(25)
    expect(card?.growValue).toBe(7)
    expect(card?.whenLabel).toBe('Like')
  })

  it('tidak menawarkan kolom × pada rule yang bukan grow — spawn mengabaikan value', () => {
    expect(triggerCards(defaultConfig())[0]?.growValue).toBeNull()
  })
})

describe('mutator', () => {
  it('mematikan satu rule tanpa menyentuh yang lain', () => {
    const next = withRuleEnabled(defaultConfig(), 'join-b', false)
    expect(next.triggers.find((rule) => rule.id === 'join-b')?.enabled).toBe(false)
    expect(next.triggers.find((rule) => rule.id === 'join-a')?.enabled).toBe(true)
  })

  it('menyembunyikan satu rule dari layar tanpa mematikannya', () => {
    const next = withRuleLegendShown(defaultConfig(), 'join-b', false)
    const rule = next.triggers.find((r) => r.id === 'join-b')
    expect(rule?.legend.show).toBe(false)
    // Dua saklar terpisah: yang tersembunyi tetap MENANGKAP komentar penonton.
    expect(rule?.enabled).toBe(true)
    expect(next.triggers.find((r) => r.id === 'join-a')?.legend.show).toBe(true)
  })

  it('menulis keyword ke sisi, bukan ke rule', () => {
    const next = withKeyword(defaultConfig(), 'join-a', 'messi')
    expect(next.sides.a.keyword).toBe('messi')
    expect(next.sides.b.keyword).toBe(defaultConfig().sides.b.keyword)
  })

  it('mengabaikan permintaan keyword untuk rule yang bukan comment', () => {
    const config = defaultConfig()
    expect(withKeyword(config, 'grow-hp', 'apa pun')).toEqual(config)
  })

  it('menulis ambang like ke likes.threshold, satu-satunya otoritas runtime', () => {
    expect(withLikeThreshold(defaultConfig(), 25).likes.threshold).toBe(25)
  })

  it('menulis nilai grow ke gameplay.hpGainedPerGrow', () => {
    expect(withHpGainedPerGrow(defaultConfig(), 9).gameplay.hpGainedPerGrow).toBe(9)
  })

  it('tidak pernah memutasi config yang diberikan', () => {
    const config = defaultConfig()
    withKeyword(config, 'join-a', 'messi')
    withLikeThreshold(config, 99)
    expect(config.sides.a.keyword).toBe(defaultConfig().sides.a.keyword)
    expect(config.likes.threshold).toBe(defaultConfig().likes.threshold)
  })
})

describe('kartu rule gift dan follow', () => {
  const cardById = (id: string) => triggerCards(defaultConfig()).find((c) => c.id === id)

  it('menandai rule gift sebagai Gift, bukan Like', () => {
    expect(cardById('gift-heal')?.whenLabel).toBe('Gift')
    expect(cardById('gift-heal')?.whenIcon).toBe('gift')
  })

  it('tidak menawarkan ambang like pada rule gift', () => {
    expect(cardById('gift-heal')?.everyNLikes).toBeNull()
    expect(cardById('gift-barrage')?.everyNLikes).toBeNull()
  })
})

describe('addRule', () => {
  it('menambah satu rule yang non-aktif', () => {
    const before = defaultConfig()
    const after = addRule(before)
    expect(after.triggers).toHaveLength(before.triggers.length + 1)
    expect(after.triggers.at(-1)?.enabled).toBe(false)
  })

  // Yang paling penting di seluruh task ini: rule baru harus SELAMAT dari validateConfig.
  // Rule yang tidak sah akan lenyap tanpa jejak begitu config dimuat ulang.
  it('melahirkan rule yang selamat dari validateConfig', () => {
    const after = addRule(defaultConfig())
    const id = after.triggers.at(-1)?.id
    const round = validateConfig(JSON.parse(JSON.stringify(after)))
    expect(round.triggers.map((rule) => rule.id)).toContain(id)
  })

  it('memberi id unik tiap kali', () => {
    const once = addRule(defaultConfig())
    const twice = addRule(once)
    const ids = twice.triggers.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('berhenti di MAX_TRIGGER_RULES', () => {
    let config = defaultConfig()
    while (config.triggers.length < MAX_TRIGGER_RULES) config = addRule(config)
    expect(addRule(config).triggers).toHaveLength(MAX_TRIGGER_RULES)
  })
})

describe('removeRule', () => {
  it('membuang rule yang disebut', () => {
    const after = removeRule(defaultConfig(), 'join-a')
    expect(after.triggers.map((rule) => rule.id)).not.toContain('join-a')
  })

  it('mengembalikan config apa adanya untuk id yang tidak ada', () => {
    const before = defaultConfig()
    expect(removeRule(before, 'tidak-ada').triggers).toHaveLength(before.triggers.length)
  })

  // Req 29 AC7 tidak memberi batas bawah, dan "Reset ke default" adalah jalan pulangnya.
  it('mengizinkan config tanpa rule sama sekali', () => {
    let config = defaultConfig()
    for (const rule of [...config.triggers]) config = removeRule(config, rule.id)
    expect(config.triggers).toHaveLength(0)
  })
})

describe('withWhen', () => {
  it('mengganti seluruh cabang, bukan menambal field', () => {
    const after = withWhen(defaultConfig(), 'join-a', 'gift')
    expect(after.triggers.find((rule) => rule.id === 'join-a')?.when).toEqual({
      kind: 'gift',
      giftNames: [],
      minCount: 1,
    })
  })

  it('memakai ambang like config saat berpindah ke like', () => {
    const before = defaultConfig()
    before.likes.threshold = 25
    const after = withWhen(before, 'join-a', 'like')
    expect(after.triggers.find((rule) => rule.id === 'join-a')?.when).toEqual({
      kind: 'like',
      everyNLikes: 25,
    })
  })
})

describe('withThen dan caption', () => {
  it('menulis ulang caption saat aksi berubah', () => {
    const after = withThen(defaultConfig(), 'gift-heal', { actionType: 'hasten' })
    const rule = after.triggers.find((entry) => entry.id === 'gift-heal')
    expect(rule?.then.actionType).toBe('hasten')
    // Rule bawaan `gift-heal` bertarget 'sender', jadi caption-nya menyebut ME.
    expect(rule?.legend.caption).toBe('FASTER ATTACKS ME')
  })

  it('menyebut sasaran di caption', () => {
    const after = withThen(defaultConfig(), 'gift-heal', {
      actionType: 'damage',
      target: 'enemySide',
    })
    expect(after.triggers.find((rule) => rule.id === 'gift-heal')?.legend.caption).toBe(
      'DAMAGE ENEMY SIDE',
    )
  })

  it('caption tidak pernah melewati batas 40 karakter validateRule', () => {
    for (const rule of addRule(defaultConfig()).triggers) {
      expect(captionFor(rule).length).toBeLessThanOrEqual(40)
    }
  })
})

describe('withGiftNames dan withMinCount', () => {
  it('menulis daftar nama ke rule gift', () => {
    const after = withGiftNames(defaultConfig(), 'gift-heal', ['Rose', 'Galaxy'])
    const when = after.triggers.find((rule) => rule.id === 'gift-heal')?.when
    expect(when).toEqual({ kind: 'gift', giftNames: ['Rose', 'Galaxy'], minCount: 1 })
  })

  it('mengabaikan rule yang bukan gift', () => {
    const before = defaultConfig()
    const after = withGiftNames(before, 'join-a', ['Rose'])
    expect(after.triggers.find((rule) => rule.id === 'join-a')?.when).toEqual(
      before.triggers.find((rule) => rule.id === 'join-a')?.when,
    )
  })

  it('menjepit minCount ke rentangnya', () => {
    const after = withMinCount(defaultConfig(), 'gift-heal', 0)
    const when = after.triggers.find((rule) => rule.id === 'gift-heal')?.when
    expect(when && 'minCount' in when ? when.minCount : null).toBe(1)
  })
})

describe('pilihan aksi ultimate', () => {
  /*
   * Keluhan yang melahirkan ini: keenam ultimate dilebur jadi satu "Nuke", jadi creator tidak
   * punya cara memilih laser untuk satu trigger dan chain freeze untuk trigger lain.
   */
  it('menawarkan keenam ultimate sebagai pilihan tersendiri, bukan satu "Nuke"', () => {
    const values = ACTION_TYPE_OPTIONS.map((option) => option.value)

    for (const type of NUKE_TYPES) expect(values).toContain(`nuke:${type}`)
    expect(values).not.toContain('nuke')
    expect(new Set(values).size).toBe(values.length)
  })

  it('menyimpannya sebagai aksi nuke dengan jenisnya, bukan sebagai tipe aksi baru', () => {
    const after = withActionChoice(defaultConfig(), 'gift-heal', 'nuke:chainFreeze')
    const then = after.triggers.find((rule) => rule.id === 'gift-heal')?.then

    expect(then?.actionType).toBe('nuke')
    expect(then?.nukeType).toBe('chainFreeze')
  })

  /** Bentuk yang disimpan harus selamat lewat validateConfig, atau pilihannya hilang saat reload. */
  it('bertahan melewati validateConfig', () => {
    const after = validateConfig(withActionChoice(defaultConfig(), 'gift-heal', 'nuke:singularity'))
    expect(after.triggers.find((rule) => rule.id === 'gift-heal')?.then.nukeType).toBe('singularity')
  })

  it('membuang jenis ultimate saat aksinya pindah ke non-nuke', () => {
    const nuked = withActionChoice(defaultConfig(), 'gift-heal', 'nuke:laser')
    const healed = withActionChoice(nuked, 'gift-heal', 'heal')
    const then = healed.triggers.find((rule) => rule.id === 'gift-heal')?.then

    expect(then?.actionType).toBe('heal')
    expect(then?.nukeType).toBeUndefined()
  })

  /*
   * Rule nuke lama tidak menyimpan jenis apa pun dan mengikuti jenis global. Dropdown harus
   * menampilkan jenis ITU — kalau ia kosong atau menampilkan yang lain, creator membaca janji
   * yang berbeda dari yang meledak di arena.
   */
  it('menampilkan jenis global untuk rule nuke lama yang belum punya jenis sendiri', () => {
    const config = defaultConfig()
    config.gameplay.nuke.type = 'bomb'

    expect(actionChoiceOf({ actionType: 'nuke', target: 'enemySide', value: 50 }, config)).toBe(
      'nuke:bomb',
    )
  })

  it('memakai jenis rule sendiri, bukan jenis global, kalau rule punya', () => {
    const config = defaultConfig()
    config.gameplay.nuke.type = 'bomb'
    const then = { actionType: 'nuke' as const, target: 'enemySide' as const, value: 50, nukeType: 'laser' as const }

    expect(actionChoiceOf(then, config)).toBe('nuke:laser')
  })

  it('menamai ultimate di caption supaya dua rule nuke bisa dibedakan', () => {
    const after = withActionChoice(defaultConfig(), 'gift-heal', 'nuke:chainFreeze')
    const rule = after.triggers.find((entry) => entry.id === 'gift-heal')

    expect(rule?.legend.caption).toBe('CHAIN FREEZE ME')
    expect(rule?.legend.caption.length).toBeLessThanOrEqual(40)
  })
})

describe('giftPicks', () => {
  const catalog = [
    { id: 1, name: 'Rose', coins: 1, iconUrl: 'https://x/rose.png' },
    { id: 2, name: 'Lion', coins: 29999, iconUrl: 'https://x/lion.png' },
  ]

  it('menandai yang terpilih dan menaikkannya ke atas', () => {
    const picks = giftPicks(catalog, ['Lion'])
    expect(picks.map((pick) => pick.name)).toEqual(['Lion', 'Rose'])
    expect(picks.map((pick) => pick.selected)).toEqual([true, false])
    expect(picks[0]?.coins).toBe(29999)
    expect(picks[0]?.iconUrl).toBe('https://x/lion.png')
  })

  it('tetap menggambar nama terpilih yang tidak ada di katalog room', () => {
    // Kalau tidak, gift dari room lain yang tersimpan di config tidak bisa dilepas lagi.
    const picks = giftPicks(catalog, ['Doughnut'])
    expect(picks[0]).toEqual({ name: 'Doughnut', coins: 0, iconUrl: null, selected: true })
  })

  it('mengembalikan katalog apa adanya saat belum ada yang dipilih', () => {
    expect(giftPicks(catalog, []).map((pick) => pick.name)).toEqual(['Rose', 'Lion'])
  })
})

describe('toggleGiftName', () => {
  it('menambah yang belum ada dan melepas yang sudah ada', () => {
    expect(toggleGiftName([], 'Rose')).toEqual(['Rose'])
    expect(toggleGiftName(['Rose', 'Lion'], 'Rose')).toEqual(['Lion'])
  })

  it('berhenti di MAX_GIFT_NAMES', () => {
    const full = Array.from({ length: MAX_GIFT_NAMES }, (_, index) => `g${index}`)
    expect(toggleGiftName(full, 'satu lagi')).toHaveLength(MAX_GIFT_NAMES)
  })
})

describe('ambiguousSideWords', () => {
  /** Persis config yang creator pakai saat siaran: keyword kedua sisi tertukar. */
  const swapped = (): ReturnType<typeof defaultConfig> => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'MESSI', keyword: 'ronaldo' }
    config.sides.b = { ...config.sides.b, name: 'RONALDO', keyword: 'messi' }
    return config
  }

  it('menemukan kata yang cocok dengan kedua sisi', () => {
    expect(ambiguousSideWords(swapped()).sort()).toEqual(['messi', 'ronaldo'])
  })

  it('diam saat nama dan keyword tiap sisi berdiri sendiri', () => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'MESSI', keyword: 'messi' }
    config.sides.b = { ...config.sides.b, name: 'RONALDO', keyword: 'ronaldo' }
    expect(ambiguousSideWords(config)).toEqual([])
  })

  it('diam untuk config bawaan', () => {
    expect(ambiguousSideWords(defaultConfig())).toEqual([])
  })
})

describe('kartu rule comment', () => {
  it('membawa peringatan saat keyword sisi bertabrakan', () => {
    const config = defaultConfig()
    config.sides.a = { ...config.sides.a, name: 'MESSI', keyword: 'ronaldo' }
    config.sides.b = { ...config.sides.b, name: 'RONALDO', keyword: 'messi' }

    const comment = triggerCards(config).filter((card) => card.when.kind === 'comment')
    expect(comment.length).toBeGreaterThan(0)
    for (const card of comment) {
      expect(card.keywordWarning).toContain('messi')
      expect(card.keywordWarning).toContain('ronaldo')
    }
  })

  it('tidak membawa peringatan saat config sehat', () => {
    for (const card of triggerCards(defaultConfig())) {
      expect(card.keywordWarning).toBeNull()
    }
  })
})

describe('withRuleLabel / withLegendCaption', () => {
  it('mengganti judul kartu tanpa menyentuh rule lain', () => {
    const config = defaultConfig()
    const id = config.triggers[0]?.id ?? ''

    const next = withRuleLabel(config, id, 'Gabung Messi')

    expect(next.triggers[0]?.label).toBe('Gabung Messi')
    expect(next.triggers[1]?.label).toBe(config.triggers[1]?.label)
  })

  it('mengganti teks yang dibaca penonton, terpisah dari judul kartu', () => {
    const config = defaultConfig()
    const id = config.triggers[0]?.id ?? ''

    const next = withLegendCaption(config, id, 'KETIK MESSI')

    expect(next.triggers[0]?.legend.caption).toBe('KETIK MESSI')
    expect(next.triggers[0]?.label).toBe(config.triggers[0]?.label)
  })

  it('mengabaikan id yang tidak dikenal alih-alih melempar', () => {
    const config = defaultConfig()

    expect(withRuleLabel(config, 'tidak-ada', 'x').triggers).toStrictEqual(config.triggers)
    expect(withLegendCaption(config, 'tidak-ada', 'x').triggers).toStrictEqual(config.triggers)
  })
})
