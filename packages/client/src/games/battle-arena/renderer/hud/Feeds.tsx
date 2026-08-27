import { useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { initialFor } from '../avatar-cache.js'
import { scaled } from '../layout.js'
import type { StageLayout } from '../layout.js'
import {
  GIFT_FEED_TTL_MS,
  JOIN_FEED_TTL_MS,
  KILL_FEED_TTL_MS,
  feedEntrance,
  feedOpacity,
} from './feed.js'
import type { GiftFeedEntry, JoinFeedEntry, KillFeedEntry } from './feed.js'

const AVATAR_PX = 20

/**
 * Foto profil, atau lingkaran berinisial saat tidak ada.
 *
 * Hurufnya datang dari `initialFor()` yang sama dengan yang dipakai AvatarCache di canvas —
 * satu fungsi, dua permukaan, tidak mungkin berbeda huruf untuk orang yang sama.
 *
 * URL yang gagal dimuat jatuh ke inisial, bukan meninggalkan ikon gambar rusak di panggung
 * yang sedang disiarkan. CDN TikTok kadaluwarsa lebih cepat daripada satu sesi siaran.
 */
function Face({
  url,
  username,
  layout,
}: {
  url: string | null
  username: string
  layout: StageLayout
}): ReactElement {
  const [failed, setFailed] = useState(false)
  const size = scaled(layout, AVATAR_PX)
  const shared: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
  }

  if (url !== null && !failed) {
    return <img src={url} alt="" style={shared} onError={() => setFailed(true)} />
  }

  return (
    <span
      style={{
        ...shared,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.18)',
        fontSize: scaled(layout, 12),
        fontWeight: 700,
      }}
    >
      {initialFor(username)}
    </span>
  )
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 }

export function Feeds({
  kills,
  joins,
  gifts,
  nowMs,
  layout,
}: {
  kills: KillFeedEntry[]
  joins: JoinFeedEntry[]
  gifts: GiftFeedEntry[]
  nowMs: number
  layout: StageLayout
}): ReactElement {
  const base: CSSProperties = {
    position: 'absolute',
    bottom: layout.bottom.height + scaled(layout, 24),
    display: 'flex',
    flexDirection: 'column',
    gap: scaled(layout, 4),
    color: '#fff',
    fontSize: scaled(layout, 15),
  }
  const inset = layout.stage.x + scaled(layout, 24)
  const killStyle: CSSProperties = { ...base, right: inset, alignItems: 'flex-end' }
  const joinStyle: CSSProperties = { ...base, left: inset, alignItems: 'flex-start' }

  return (
    <>
      <div data-testid="kill-feed" style={killStyle}>
        {kills.map((entry) => (
          <div
            key={entry.id}
            style={{ ...row, opacity: feedOpacity(entry, nowMs, KILL_FEED_TTL_MS) }}
          >
            {entry.killer === null ? (
              <span>☠</span>
            ) : (
              <>
                <Face url={entry.killerAvatarUrl} username={entry.killer} layout={layout} />
                <span>{entry.killer}</span>
                <span>⚔</span>
              </>
            )}
            <Face url={entry.victimAvatarUrl} username={entry.victim} layout={layout} />
            <span>{entry.victim}</span>
          </div>
        ))}
      </div>
      <div style={joinStyle}>
        <div
          data-testid="gift-feed"
          style={{ display: 'flex', flexDirection: 'column', gap: scaled(layout, 4) }}
        >
          {gifts.map((entry) => {
            const entrance = feedEntrance(entry, nowMs)
            return (
              <div
                key={entry.id}
                style={{
                  ...row,
                  opacity: Math.min(entrance.opacity, feedOpacity(entry, nowMs, GIFT_FEED_TTL_MS)),
                  transform: `translateX(${scaled(layout, entrance.offsetPx)}px)`,
                }}
              >
                <span>{entry.icon}</span>
                <span style={{ fontWeight: 700 }}>{entry.username}</span>
                <span style={{ opacity: 0.85 }}>{entry.giftName}</span>
                <span>{entry.caption}</span>
              </div>
            )
          })}
        </div>
        <div
          data-testid="join-feed"
          style={{ display: 'flex', flexDirection: 'column', gap: scaled(layout, 4) }}
        >
          {joins.map((entry) => (
            <div key={entry.id} style={{ opacity: feedOpacity(entry, nowMs, JOIN_FEED_TTL_MS) }}>
              {`${entry.username} joined`}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
