import type { ReactElement } from 'react'
import { scaled } from '../layout.js'
import type { StageLayout } from '../layout.js'
import type { FighterRow } from './view-model.js'

export function TopFighters({
  rows,
  layout,
}: {
  rows: FighterRow[]
  layout: StageLayout
}): ReactElement | null {
  if (rows.length === 0) return null

  return (
    <div
      data-testid="top-fighters"
      style={{
        position: 'absolute',
        left: layout.arena.x + scaled(layout, 24),
        top: layout.arena.y + scaled(layout, 24),
        padding: scaled(layout, 12),
        borderRadius: scaled(layout, 8),
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        fontSize: scaled(layout, 16),
        minWidth: scaled(layout, 220),
      }}
    >
      <div style={{ opacity: 0.6, letterSpacing: 1, marginBottom: scaled(layout, 6) }}>
        TOP FIGHTERS
      </div>
      {rows.map((row) => (
        <div
          key={row.slotIndex}
          style={{ display: 'flex', justifyContent: 'space-between', gap: scaled(layout, 16) }}
        >
          <span>{row.username}</span>
          <span style={{ fontWeight: 700 }}>{row.kills}</span>
        </div>
      ))}
    </div>
  )
}
