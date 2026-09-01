import type { ReactElement } from 'react'
import { scaled } from '../layout.js'
import type { StageLayout } from '../layout.js'
import { formatCoins } from './view-model.js'
import type { SessionGifter } from './view-model.js'

/** Duduk di seberang TOP FIGHTERS: dua papan, dua pertanyaan, satu baris pandang. */
export function TopGifter({
  rows,
  layout,
}: {
  rows: readonly SessionGifter[]
  layout: StageLayout
}): ReactElement | null {
  if (rows.length === 0) return null

  return (
    <div
      data-testid="top-gifter"
      style={{
        position: 'absolute',
        right: layout.arena.x + scaled(layout, 16),
        top: layout.arena.y + scaled(layout, 44),
        padding: `${scaled(layout, 8)}px ${scaled(layout, 12)}px`,
        borderRadius: scaled(layout, 8),
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        color: '#fff',
        fontSize: scaled(layout, 13),
        minWidth: scaled(layout, 180),
        zIndex: 5,
      }}
    >
      <div
        style={{
          opacity: 0.7,
          letterSpacing: '0.08em',
          fontSize: scaled(layout, 11),
          fontWeight: 700,
          marginBottom: scaled(layout, 4),
          textAlign: 'right',
        }}
      >
        TOP GIFTERS
      </div>
      {rows.map((row, index) => (
        <div
          key={`${row.username}:${index}`}
          data-testid={'top-gifter-row'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: scaled(layout, 12),
            padding: `${scaled(layout, 2)}px 0`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: scaled(layout, 6) }}>
            <span style={{ opacity: 0.6, fontSize: scaled(layout, 11) }}>{`${index + 1}.`}</span>
            <span style={{ maxWidth: scaled(layout, 95), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.username}
            </span>
          </span>
          <span style={{ fontWeight: 700, color: '#FFD68A', fontSize: scaled(layout, 12) }}>
            {`${formatCoins(row.coins)}`}
          </span>
        </div>
      ))}
    </div>
  )
}
