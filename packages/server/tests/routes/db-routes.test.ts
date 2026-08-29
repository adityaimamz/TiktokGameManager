import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { idleStatus } from '@lga/shared'
import type {
  AnalyticsEvent,
  MatchRecord,
  MatchSummary,
  PlayerProgress,
  PlayerStats,
} from '@lga/shared'
import { createApp } from '../../src/app.js'
import type { ChatConnection } from '../../src/routes/chat.js'
import type { Repos } from '../../src/repo/types.js'
import { parseMatchRecord } from '../../src/routes/matches.js'
import { parseEvents } from '../../src/routes/analytics.js'

const silentConnection: ChatConnection = {
  status: idleStatus(),
  connect: async () => idleStatus(),
  disconnect: () => {},
}

function createFakeRepos() {
  const matchesSeen: MatchRecord[] = []
  const progressSeen: PlayerProgress[][] = []
  const analyticsSeen: AnalyticsEvent[][] = []
  const limitsSeen: number[] = []
  const history: MatchSummary[] = [
    {
      id: 2,
      startedAtMs: 1_700_000_600_000,
      winnerSide: 'b',
      roundsWonA: 1,
      roundsWonB: 3,
      durationMs: 60_000,
      totalFighters: 12,
    },
    {
      id: 1,
      startedAtMs: 1_700_000_000_000,
      winnerSide: null,
      roundsWonA: 2,
      roundsWonB: 2,
      durationMs: 42_000,
      totalFighters: 8,
    },
  ]
  const leaderboard: PlayerStats[] = [
    {
      platform: 'tiktok',
      username: 'budi',
      avatarUrl: null,
      kills: 9,
      deaths: 1,
      gamesPlayed: 3,
      giftCoins: 400,
    },
  ]
  const repos: Repos = {
    recordMatch: async (record) => {
      matchesSeen.push(record)
      return { matchId: 77 }
    },
    recentMatches: async (limit) => {
      limitsSeen.push(limit)
      return history.slice(0, limit)
    },
    topPlayers: async (limit) => leaderboard.slice(0, limit),
    recordAnalytics: async (events) => {
      analyticsSeen.push([...events])
      return events.length
    },
    saveGifts: async (entries) => entries.length,
    allGifts: async () => [],
    recordProgress: async (entries) => {
      progressSeen.push([...entries])
      return entries.length
    },
    getDefaultConfig: async () => null,
    setDefaultConfig: async () => {},
  }
  return { repos, matchesSeen, progressSeen, analyticsSeen, limitsSeen }
}

const appWith = (repos: Repos | null) => createApp({ connection: silentConnection, gifts: { giftCatalog: [] }, repos })

/** Repo palsu yang hanya merekam argumen `sort` yang diterimanya. */
const spyingRepos = (seen: string[]): Repos => ({
  recordMatch: async () => ({ matchId: 1 }),
  recordProgress: async () => 0,
  recentMatches: async () => [],
  recordAnalytics: async () => 0,
  saveGifts: async () => 0,
  allGifts: async () => [],
  getDefaultConfig: async () => null,
  setDefaultConfig: async () => {},
  topPlayers: async (_limit, sort) => {
    seen.push(sort)
    return []
  },
})

const validMatch = (): MatchRecord => ({
  gameId: 'battle-arena',
  startedAtMs: 1_000,
  endedAtMs: 2_000,
  winnerSide: 'a',
  roundsWonA: 3,
  roundsWonB: 1,
  totalFighters: 4,
  players: [],
})

describe('database routes', () => {
  it('records a match and answers with its id', async () => {
    const fake = createFakeRepos()
    const response = await request(appWith(fake.repos)).post('/api/matches').send(validMatch())

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ matchId: 77 })
    expect(fake.matchesSeen).toHaveLength(1)
    expect(fake.matchesSeen[0]?.gameId).toBe('battle-arena')
  })

  it('answers the match history as the repo ordered it', async () => {
    const fake = createFakeRepos()
    const response = await request(appWith(fake.repos)).get('/api/matches?limit=2')

    expect(response.status).toBe(200)
    expect(response.body.matches).toHaveLength(2)
    expect(response.body.matches[0].id).toBe(2)
    expect(response.body.matches[0].winnerSide).toBe('b')
    expect(response.body.matches[1].winnerSide).toBeNull()
  })

  it('clamps a nonsense history limit instead of refusing it', async () => {
    const fake = createFakeRepos()

    await request(appWith(fake.repos)).get('/api/matches?limit=abc')
    await request(appWith(fake.repos)).get('/api/matches?limit=0')
    await request(appWith(fake.repos)).get('/api/matches?limit=9999')

    expect(fake.limitsSeen).toEqual([20, 20, 100])
  })

  it('rejects a match body that is not a match record', async () => {
    const fake = createFakeRepos()
    const response = await request(appWith(fake.repos)).post('/api/matches').send({ gameId: 5 })

    expect(response.status).toBe(400)
    expect(fake.matchesSeen).toEqual([])
  })

  it('menerima pemain tanpa giftCoins — koin bukan lagi urusan jalur match', async () => {
    const fake = createFakeRepos()
    const response = await request(appWith(fake.repos))
      .post('/api/matches')
      .send({
        ...validMatch(),
        players: [
          { platform: 'tiktok', username: 'budi', avatarUrl: null, side: 'a', kills: 3, deaths: 1 },
        ],
      })

    expect(response.status).toBe(201)
  })

  it('meneruskan delta progres ke repo dan menjawab berapa baris tersentuh', async () => {
    const fake = createFakeRepos()
    const budi = {
      platform: 'tiktok' as const,
      username: 'budi',
      avatarUrl: null,
      kills: 2,
      deaths: 0,
      giftCoins: 500,
    }

    const response = await request(appWith(fake.repos))
      .post('/api/players/progress')
      .send({ players: [budi] })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ written: 1 })
    expect(fake.progressSeen).toEqual([[budi]])
  })

  it('menolak progres yang bentuknya salah dengan 400', async () => {
    const fake = createFakeRepos()

    const response = await request(appWith(fake.repos))
      .post('/api/players/progress')
      .send({ players: [{ platform: 'demo', username: 'bot', kills: 1, deaths: 0, giftCoins: 0 }] })

    expect(response.status).toBe(400)
    expect(fake.progressSeen).toEqual([])
  })

  it('menerima daftar progres kosong tanpa menyentuh database', async () => {
    const fake = createFakeRepos()

    const response = await request(appWith(fake.repos))
      .post('/api/players/progress')
      .send({ players: [] })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ written: 0 })
    expect(fake.progressSeen).toEqual([])
  })

  it('menjawab 503 untuk progres saat tidak ada database', async () => {
    const response = await request(appWith(null))
      .post('/api/players/progress')
      .send({ players: [] })

    expect(response.status).toBe(503)
  })

  it('returns the leaderboard, honouring the limit', async () => {
    const fake = createFakeRepos()
    const response = await request(appWith(fake.repos)).get('/api/players/top?limit=1')

    expect(response.status).toBe(200)
    expect(response.body.players).toHaveLength(1)
    expect(response.body.players[0].username).toBe('budi')
  })

  it('clamps an absurd or missing limit instead of refusing', async () => {
    const fake = createFakeRepos()
    expect((await request(appWith(fake.repos)).get('/api/players/top')).status).toBe(200)
    expect((await request(appWith(fake.repos)).get('/api/players/top?limit=99999')).status).toBe(200)
    expect((await request(appWith(fake.repos)).get('/api/players/top?limit=x')).status).toBe(200)
  })

  it('meneruskan sort=coins ke repo', async () => {
    const seen: string[] = []
    await request(appWith(spyingRepos(seen))).get('/api/players/top?sort=coins').expect(200)
    expect(seen).toEqual(['coins'])
  })

  it('jatuh ke kills untuk sort yang tidak dikenal — papan peringkat tidak layak 400', async () => {
    const seen: string[] = []
    await request(appWith(spyingRepos(seen))).get('/api/players/top?sort=bintang').expect(200)
    expect(seen).toEqual(['kills'])
  })

  it('accepts a batch of analytics events', async () => {
    const fake = createFakeRepos()
    const response = await request(appWith(fake.repos))
      .post('/api/analytics')
      .send({ events: [{ type: 'matchStarted', payload: { seed: 1 }, atMs: 10 }] })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ accepted: 1 })
    expect(fake.analyticsSeen[0]).toHaveLength(1)
  })

  it('rejects an analytics body without an events array', async () => {
    const fake = createFakeRepos()
    const response = await request(appWith(fake.repos)).post('/api/analytics').send({ events: 'no' })
    expect(response.status).toBe(400)
  })

  it('rejects a player whose kills or deaths is not a finite number', async () => {
    const fake = createFakeRepos()
    const app = appWith(fake.repos)
    const withPlayer = (kills: unknown, deaths: unknown) => ({
      ...validMatch(),
      players: [{ platform: 'tiktok', username: 'budi', avatarUrl: null, side: 'a', kills, deaths }],
    })

    expect((await request(app).post('/api/matches').send(withPlayer(Number.NaN, 0))).status).toBe(400)
    expect((await request(app).post('/api/matches').send(withPlayer(0, Number.POSITIVE_INFINITY))).status).toBe(400)
    expect(fake.matchesSeen).toEqual([])
  })

  it('rejects an analytics event whose atMs is not a finite number', async () => {
    const fake = createFakeRepos()
    const response = await request(appWith(fake.repos))
      .post('/api/analytics')
      .send({ events: [{ type: 'matchStarted', payload: {}, atMs: Number.NaN }] })

    expect(response.status).toBe(400)
    expect(fake.analyticsSeen).toEqual([])
  })

  // JSON has no NaN/Infinity literal — supertest's .send() serialises both to `null` before
  // they ever reach the validator, so the two HTTP-level tests above are only proving that a
  // non-number is rejected (which the pre-existing `typeof` check already did). To prove the
  // `Number.isFinite` guard itself, call the parser directly with a real NaN/Infinity in-process.
  it('parseMatchRecord rejects a true NaN/Infinity kills or deaths in-process', () => {
    const withPlayer = (kills: unknown, deaths: unknown) => ({
      ...validMatch(),
      players: [{ platform: 'tiktok', username: 'budi', avatarUrl: null, side: 'a', kills, deaths }],
    })

    expect(parseMatchRecord(withPlayer(Number.NaN, 0))).toBeNull()
    expect(parseMatchRecord(withPlayer(0, Number.POSITIVE_INFINITY))).toBeNull()
  })

  it('parseEvents rejects a true NaN atMs in-process', () => {
    expect(
      parseEvents({ events: [{ type: 'matchStarted', payload: {}, atMs: Number.NaN }] }),
    ).toBeNull()
  })

  it('answers 503 with a usable reason when there is no database (P9)', async () => {
    const app = appWith(null)

    const match = await request(app).post('/api/matches').send(validMatch())
    expect(match.status).toBe(503)
    expect(match.body.error).toContain('DATABASE_URL')

    expect((await request(app).get('/api/players/top')).status).toBe(503)
    expect((await request(app).post('/api/analytics').send({ events: [] })).status).toBe(503)
  })

  it('still serves chat routes when there is no database', async () => {
    const response = await request(appWith(null)).get('/api/chat/status')
    expect(response.status).toBe(200)
  })

  it('turns a missing table into a message that names the fix', async () => {
    const repos: Repos = {
      recordMatch: async () => {
        throw Object.assign(new Error('relation "matches" does not exist'), { code: '42P01' })
      },
      recordProgress: async () => 0,
      recentMatches: async () => [],
      topPlayers: async () => [],
      recordAnalytics: async () => 0,
      saveGifts: async () => 0,
      allGifts: async () => [],
      getDefaultConfig: async () => null,
      setDefaultConfig: async () => {},
    }
    const response = await request(appWith(repos)).post('/api/matches').send(validMatch())

    expect(response.status).toBe(500)
    expect(response.body.error).toContain('npm run db:migrate')
  })

  it('does not leak the details of an ordinary failure', async () => {
    const repos: Repos = {
      recordMatch: async () => {
        throw new Error('connection terminated unexpectedly')
      },
      recordProgress: async () => 0,
      recentMatches: async () => [],
      topPlayers: async () => [],
      recordAnalytics: async () => 0,
      saveGifts: async () => 0,
      allGifts: async () => [],
      getDefaultConfig: async () => null,
      setDefaultConfig: async () => {},
    }
    const response = await request(appWith(repos)).post('/api/matches').send(validMatch())

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'database request failed' })
  })
})
