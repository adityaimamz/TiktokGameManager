import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

/**
 * Viewer lintas sesi. Hanya `platform = 'tiktok'` yang pernah sampai ke sini —
 * fighter demo, practice, dan creator disaring di client sebelum request dibentuk.
 */
export const players = pgTable(
  'players',
  {
    id: serial('id').primaryKey(),
    platform: text('platform').notNull(),
    username: text('username').notNull(),
    avatarUrl: text('avatar_url'),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    gamesPlayed: integer('games_played').notNull().default(0),
    giftCoins: integer('gift_coins').notNull().default(0),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('players_platform_username').on(table.platform, table.username),
    index('players_last_seen_idx').on(table.lastSeenAt),
    index('players_kills_idx').on(table.kills.desc()),
    index('players_gift_coins_idx').on(table.giftCoins.desc()),
  ],
)

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  gameId: text('game_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  winnerSide: text('winner_side'),
  roundsWonA: integer('rounds_won_a').notNull().default(0),
  roundsWonB: integer('rounds_won_b').notNull().default(0),
  durationMs: integer('duration_ms'),
  totalFighters: integer('total_fighters').notNull().default(0),
})

/**
 * Kedua foreign key memakai `cascade` dengan sengaja.
 *
 * Eviction 20.000 pemain (Req 21 AC3) menghapus baris `players` langsung. Tanpa cascade,
 * penghapusan itu melanggar foreign key begitu pemain yang dievict pernah ikut satu match
 * — kegagalan yang baru muncul setelah ribuan match, jauh setelah siapa pun ingat kenapa.
 */
export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: integer('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    side: text('side').notNull(),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.playerId] })],
)

export const analyticsEvents = pgTable('analytics_events', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id').references(() => matches.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Katalog gift room, supaya nama/harga/ikonnya tetap ada saat tidak tersambung.
 *
 * NAMA adalah kuncinya, bukan `tiktok_id`: rule mencocokkan nama (lihat `GiftCatalogEntry`),
 * dan entri yang dipungut dari event gift kadang datang tanpa id sama sekali.
 *
 * ponytail: yang disimpan adalah URL ikon di CDN TikTok, bukan bytenya. URL itu publik dan
 * stabil; mencerminkan gambarnya ke `uploads/` baru sepadan kalau creator melaporkan ikon
 * yang mati saat offline.
 */
export const gifts = pgTable('gifts', {
  name: text('name').primaryKey(),
  tiktokId: integer('tiktok_id'),
  coins: integer('coins').notNull().default(0),
  iconUrl: text('icon_url'),
  seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
})
