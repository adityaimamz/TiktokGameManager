import { getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { analyticsEvents, matchPlayers, matches, players } from './schema.js'

const columnNames = (table: Parameters<typeof getTableConfig>[0]): string[] =>
  getTableConfig(table).columns.map((column) => column.name).sort()

describe('schema', () => {
  it('names the tables as the spec does', () => {
    expect(getTableName(players)).toBe('players')
    expect(getTableName(matches)).toBe('matches')
    expect(getTableName(matchPlayers)).toBe('match_players')
    expect(getTableName(analyticsEvents)).toBe('analytics_events')
  })

  it('gives players every column the leaderboard and eviction need', () => {
    expect(columnNames(players)).toEqual([
      'avatar_url',
      'created_at',
      'deaths',
      'games_played',
      'gift_coins',
      'id',
      'kills',
      'last_seen_at',
      'platform',
      'username',
    ])
  })

  it('makes platform and username unique together', () => {
    const unique = getTableConfig(players).uniqueConstraints
    expect(unique).toHaveLength(1)
    expect(unique[0]?.columns.map((column) => column.name).sort()).toEqual(['platform', 'username'])
  })

  it('indexes last_seen_at for eviction and kills for the leaderboard', () => {
    const indexed = getTableConfig(players).indexes.flatMap((index) =>
      index.config.columns.map((column) => ('name' in column ? column.name : '')),
    )
    expect(indexed).toContain('last_seen_at')
    expect(indexed).toContain('kills')
  })

  it('keys match_players by the pair, so one player appears once per match', () => {
    const primary = getTableConfig(matchPlayers).primaryKeys
    expect(primary[0]?.columns.map((column) => column.name).sort()).toEqual([
      'match_id',
      'player_id',
    ])
  })

  it('cascades match_players away when its player is evicted', () => {
    const columns = getTableConfig(matchPlayers).foreignKeys.map((key) => key.onDelete)
    expect(columns).toEqual(['cascade', 'cascade'])
  })
})
