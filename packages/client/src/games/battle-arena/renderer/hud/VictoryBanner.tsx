import type { ReactElement } from 'react'
import { scaled } from '../layout.js'
import type { StageLayout } from '../layout.js'
import type { VictoryModel } from './view-model.js'

export function VictoryBanner({
  model,
  layout,
}: {
  model: VictoryModel | null
  layout: StageLayout
}): ReactElement | null {
  if (model === null) return null

  return (
    <div
      data-testid="victory-banner"
      style={{
        position: 'absolute',
        left: layout.arena.x,
        top: layout.arena.y,
        width: layout.arena.width,
        height: layout.arena.height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: scaled(layout, 12),
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
      }}
    >
      <div style={{ fontSize: scaled(layout, 24), opacity: 0.75 }}>
        {model.kind === 'match' ? 'MATCH WINNER' : 'ROUND WINNER'}
      </div>
      <div style={{ fontSize: scaled(layout, 64), fontWeight: 800, color: model.color }}>
        {model.name}
      </div>
      {model.mvp === null ? null : (
        <div
          style={{ fontSize: scaled(layout, 20) }}
        >{`MVP ${model.mvp.username} · ${model.mvp.kills} kills`}</div>
      )}
      <div style={{ fontSize: scaled(layout, 18), opacity: 0.75 }}>
        {`${model.totalKills.a} - ${model.totalKills.b} · ${model.fighterCount} fighters`}
      </div>
    </div>
  )
}
