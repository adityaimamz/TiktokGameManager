import type { ReactElement } from 'react'
import { scaled } from '../layout.js'
import type { StageLayout } from '../layout.js'
import { formatCoins } from './view-model.js'
import type { GifterRow } from './view-model.js'

/** Duduk di seberang TOP FIGHTERS: dua papan, dua pertanyaan, satu baris pandang. */
export function TopGifter({
  row,
  layout,
}: {
  row: GifterRow | null
  layout: StageLayout
}): ReactElement | null {
  if (row === null) return null

  return (
    <div
      data-testid="top-gifter"
      style={{
        position: 'absolute',
        right: scaled(layout, 24),
        top: layout.arena.y + scaled(layout, 24),
        padding: scaled(layout, 12),
        borderRadius: scaled(layout, 8),
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        fontSize: scaled(layout, 16),
        minWidth: scaled(layout, 180),
        textAlign: 'right',
      }}
    >
      <div style={{ opacity: 0.6, letterSpacing: 1, marginBottom: scaled(layout, 6) }}>
        TOP GIFTER
      </div>
      <div style={{ fontWeight: 700 }}>{row.username}</div>
      <div style={{ opacity: 0.85 }}>{`${formatCoins(row.coins)} coins`}</div>
    </div>
  )
}
