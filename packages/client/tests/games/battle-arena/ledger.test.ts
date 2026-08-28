import { describe, expect, it } from 'vitest'
import { createChatMessage } from '@lga/shared'
import type { ChatPlatform, PlayerProgress } from '@lga/shared'
import type { EngineEvent } from '../../../src/games/battle-arena/events.js'
import { LiveLedger } from '../../../src/games/battle-arena/ledger.js'
import type { Fighter } from '../../../src/games/battle-arena/types.js'

/** Fighter secukupnya: ledger hanya membaca platform, username, dan avatar. */
const fighter = (username: string, platform: ChatPlatform = 'tiktok'): Fighter =>
  ({ platform, username, avatarUrl: `https://x/${username}.jpg` }) as Fighter

const died = (victim: Fighter, killer: Fighter | null): EngineEvent => ({
  type: 'fighterDied',
  fighter: victim,
  killer,
})

const gift = (username: string, coins: number, platform: ChatPlatform = 'tiktok') =>
  createChatMessage({
    id: `g-${username}-${coins}`,
    kind: 'giftEvent',
    platform,
    username,
    giftCoins: coins,
  })

function ledgerWith(replies: boolean[] = []) {
  const sent: PlayerProgress[][] = []
  let call = 0
  const ledger = new LiveLedger({
    send: async (entries) => {
      sent.push(entries.map((entry) => ({ ...entry })))
      return replies[call++] ?? true
    },
  })
  return { ledger, sent }
}

describe('LiveLedger', () => {
  it('mencatat kill untuk pembunuh dan death untuk korban', () => {
    const { ledger } = ledgerWith()
    ledger.onEvent(died(fighter('budi'), fighter('siti')))

    expect(ledger.pending()).toEqual([
      {
        platform: 'tiktok',
        username: 'budi',
        avatarUrl: 'https://x/budi.jpg',
        kills: 0,
        deaths: 1,
        giftCoins: 0,
      },
      {
        platform: 'tiktok',
        username: 'siti',
        avatarUrl: 'https://x/siti.jpg',
        kills: 1,
        deaths: 0,
        giftCoins: 0,
      },
    ])
  })

  it('mencatat death tanpa pembunuh', () => {
    const { ledger } = ledgerWith()
    ledger.onEvent(died(fighter('budi'), null))

    expect(ledger.pending()).toHaveLength(1)
    expect(ledger.pending()[0]).toMatchObject({ username: 'budi', deaths: 1, kills: 0 })
  })

  it('menghitung koin gift dari pengirim yang tidak pernah jadi fighter', () => {
    const { ledger } = ledgerWith()
    ledger.onMessage(gift('tono', 500))
    ledger.onMessage(gift('tono', 250))

    expect(ledger.pending()).toEqual([
      {
        platform: 'tiktok',
        username: 'tono',
        avatarUrl: null,
        kills: 0,
        deaths: 0,
        giftCoins: 750,
      },
    ])
  })

  it('mengabaikan platform sintetis di kedua aliran', () => {
    const { ledger } = ledgerWith()
    ledger.onEvent(died(fighter('bot', 'demo'), fighter('latih', 'practice')))
    ledger.onMessage(gift('bot', 900, 'demo'))

    expect(ledger.pending()).toEqual([])
  })

  it('mengabaikan event selain kematian dan pesan selain gift', () => {
    const { ledger } = ledgerWith()
    ledger.onEvent({ type: 'attacksFired' })
    ledger.onMessage(createChatMessage({ id: 'c1', kind: 'textMessageEvent', platform: 'tiktok', username: 'tono' }))
    ledger.onMessage(gift('tono', 0))

    expect(ledger.pending()).toEqual([])
  })

  it('tidak mengirim apa pun saat tidak ada delta', async () => {
    const { ledger, sent } = ledgerWith()
    await ledger.flush()

    expect(sent).toEqual([])
  })

  it('mengosongkan pembukuan setelah server menjawab OK', async () => {
    const { ledger, sent } = ledgerWith()
    ledger.onMessage(gift('tono', 500))
    await ledger.flush()

    expect(sent).toHaveLength(1)
    expect(ledger.pending()).toEqual([])
  })

  it('menahan delta yang gagal terkirim sampai kiriman berikutnya', async () => {
    const { ledger, sent } = ledgerWith([false])
    ledger.onMessage(gift('tono', 500))
    await ledger.flush()

    ledger.onMessage(gift('tono', 100))
    await ledger.flush()

    expect(sent[1]).toEqual([
      {
        platform: 'tiktok',
        username: 'tono',
        avatarUrl: null,
        kills: 0,
        deaths: 0,
        giftCoins: 600,
      },
    ])
  })

  it('tidak ikut membuang gift yang datang selama pengiriman berlangsung', async () => {
    const sent: PlayerProgress[][] = []
    let release = (): void => {}
    const ledger = new LiveLedger({
      send: async (entries) => {
        sent.push(entries.map((entry) => ({ ...entry })))
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return true
      },
    })

    ledger.onMessage(gift('tono', 500))
    const flushing = ledger.flush()
    ledger.onMessage(gift('tono', 70))
    release()
    await flushing

    expect(sent[0]?.[0]?.giftCoins).toBe(500)
    expect(ledger.pending()[0]?.giftCoins).toBe(70)
  })

  it('take() menyerahkan delta dan langsung membuangnya', () => {
    const { ledger } = ledgerWith()
    ledger.onMessage(gift('tono', 500))

    expect(ledger.take()).toHaveLength(1)
    expect(ledger.pending()).toEqual([])
  })

  it('mengisi avatar yang tadinya kosong tanpa pernah menimpanya dengan null', () => {
    const { ledger } = ledgerWith()
    ledger.onMessage(gift('siti', 100))
    ledger.onEvent(died(fighter('budi'), fighter('siti')))
    ledger.onMessage(gift('siti', 100))

    expect(ledger.pending()[0]).toMatchObject({
      username: 'siti',
      avatarUrl: 'https://x/siti.jpg',
      giftCoins: 200,
      kills: 1,
    })
  })
})
