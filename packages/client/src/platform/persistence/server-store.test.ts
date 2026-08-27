import { describe, expect, it } from 'vitest'
import type { MatchRecord } from '@lga/shared'
import { ServerStore } from './server-store.js'

const record = (): MatchRecord => ({
  gameId: 'battle-arena',
  startedAtMs: 1_000,
  endedAtMs: 2_000,
  winnerSide: 'a',
  roundsWonA: 3,
  roundsWonB: 1,
  totalFighters: 4,
  players: [],
})

interface FakeCall {
  url: string
  method: string
  body: unknown
}

function createRig(respond: (call: FakeCall) => Response | Promise<Response>) {
  const calls: FakeCall[] = []
  const errors: string[] = []
  const store = new ServerStore({
    fetch: async (input, init) => {
      const call: FakeCall = {
        url: String(input),
        method: init?.method ?? 'GET',
        body: init?.body === undefined ? null : JSON.parse(String(init.body)),
      }
      calls.push(call)
      return respond(call)
    },
    onError: (_error, context) => errors.push(context),
  })
  return { store, calls, errors }
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('ServerStore', () => {
  it('posts a match record and returns the new id', async () => {
    const rig = createRig(() => jsonResponse({ matchId: 77 }, 201))
    const matchId = await rig.store.recordMatch(record())

    expect(matchId).toBe(77)
    expect(rig.calls[0]?.url).toBe('/api/matches')
    expect(rig.calls[0]?.method).toBe('POST')
    expect((rig.calls[0]?.body as MatchRecord).gameId).toBe('battle-arena')
  })

  it('returns null and records the failure when the server refuses (P6)', async () => {
    const rig = createRig(() => jsonResponse({ error: 'no database' }, 503))
    expect(await rig.store.recordMatch(record())).toBeNull()
    expect(rig.errors).toHaveLength(1)
  })

  it('returns null and records the failure when the server is unreachable', async () => {
    const rig = createRig(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await rig.store.recordMatch(record())).toBeNull()
    expect(rig.errors).toHaveLength(1)
  })

  it('returns null when the response is not the shape it expects', async () => {
    const rig = createRig(() => jsonResponse({ nope: true }))
    expect(await rig.store.recordMatch(record())).toBeNull()
  })

  it('posts analytics batches and reports success', async () => {
    const rig = createRig(() => jsonResponse({ accepted: 2 }))
    const sent = await rig.store.sendAnalytics([
      { type: 'a', payload: {}, atMs: 1 },
      { type: 'b', payload: {}, atMs: 2 },
    ])

    expect(sent).toBe(true)
    expect(rig.calls[0]?.url).toBe('/api/analytics')
    expect((rig.calls[0]?.body as { events: unknown[] }).events).toHaveLength(2)
  })

  it('never sends an empty analytics batch', async () => {
    const rig = createRig(() => jsonResponse({ accepted: 0 }))
    expect(await rig.store.sendAnalytics([])).toBe(true)
    expect(rig.calls).toEqual([])
  })

  it('fetches the leaderboard with the requested limit', async () => {
    const rig = createRig(() =>
      jsonResponse({
        players: [
          { platform: 'tiktok', username: 'budi', avatarUrl: null, kills: 9, deaths: 1, gamesPlayed: 3 },
        ],
      }),
    )
    const players = await rig.store.topPlayers(5)

    expect(players).toHaveLength(1)
    expect(rig.calls[0]?.url).toBe('/api/players/top?limit=5&sort=kills')
  })

  it('returns an empty leaderboard rather than throwing when the server is down', async () => {
    const rig = createRig(() => jsonResponse({ error: 'boom' }, 500))
    expect(await rig.store.topPlayers(5)).toEqual([])
  })

  it('loads the match history', async () => {
    const rig = createRig(() =>
      jsonResponse({
        matches: [
          {
            id: 2,
            startedAtMs: 1_700_000_600_000,
            winnerSide: 'b',
            roundsWonA: 1,
            roundsWonB: 3,
            durationMs: 60_000,
            totalFighters: 12,
          },
        ],
      }),
    )

    const rows = await rig.store.recentMatches(20)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.winnerSide).toBe('b')
    expect(rig.calls[0]?.url).toBe('/api/matches?limit=20')
    expect(rig.calls[0]?.method).toBe('GET')
  })

  it('answers with an empty history when the server refuses (P6)', async () => {
    const rig = createRig(() => jsonResponse({ error: 'no database' }, 503))

    expect(await rig.store.recentMatches(20)).toEqual([])
    expect(rig.errors).toHaveLength(1)
  })

  it('answers with an empty history when the server is unreachable', async () => {
    const rig = createRig(() => {
      throw new TypeError('Failed to fetch')
    })

    expect(await rig.store.recentMatches(20)).toEqual([])
    expect(rig.errors).toHaveLength(1)
  })

  it('answers with an empty history when the body is not the shape it expects', async () => {
    const rig = createRig(() => jsonResponse({ nope: true }))

    expect(await rig.store.recentMatches(20)).toEqual([])
  })

  it('honours a custom base url', async () => {
    const calls: string[] = []
    const store = new ServerStore({
      baseUrl: 'http://localhost:3001',
      fetch: async (input) => {
        calls.push(String(input))
        return jsonResponse({ matchId: 1 }, 201)
      },
    })
    await store.recordMatch(record())
    expect(calls[0]).toBe('http://localhost:3001/api/matches')
  })

  it('memasang header kunci di setiap permintaan saat kuncinya ada', async () => {
    const headers: (HeadersInit | undefined)[] = []
    const store = new ServerStore({
      appKey: 'rahasia',
      fetch: async (_input, init) => {
        headers.push(init?.headers)
        return jsonResponse({ players: [], matches: [], matchId: 1 })
      },
    })

    await store.topPlayers(5)
    await store.recentMatches(5)
    await store.recordMatch(record())

    for (const header of headers) {
      expect((header as Record<string, string>)['x-app-key']).toBe('rahasia')
    }
    expect(headers).toHaveLength(3)
  })

  it('tidak memasang header kunci saat server tidak berkunci', async () => {
    const headers: (HeadersInit | undefined)[] = []
    const store = new ServerStore({
      fetch: async (_input, init) => {
        headers.push(init?.headers)
        return jsonResponse({ players: [] })
      },
    })

    await store.topPlayers(5)

    expect((headers[0] as Record<string, string> | undefined)?.['x-app-key']).toBeUndefined()
  })

  it('membaca alamat LAN dari health, dan menjawab kosong saat server mati', async () => {
    const ok = new ServerStore({
      fetch: async () => jsonResponse({ ok: true, lanUrls: ['http://192.168.1.5:3001'] }),
    })
    expect(await ok.health()).toEqual(['http://192.168.1.5:3001'])

    const dead = new ServerStore({
      onError: () => {},
      fetch: async () => {
        throw new Error('offline')
      },
    })
    expect(await dead.health()).toEqual([])
  })
})
