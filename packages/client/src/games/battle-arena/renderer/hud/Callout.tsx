import type { CSSProperties, ReactElement } from 'react'
import type { BattleArenaConfig } from '../../config/index.js'
import { initialFor } from '../avatar-cache.js'
import { scaled } from '../layout.js'
import type { StageLayout } from '../layout.js'
import type { CalloutModel, CalloutRow } from './view-model.js'

/**
 * Band callout: di DALAM arena, tepat di bawah scoreboard.
 *
 * Tidak menutupi HUD maupun band aksi di kaki panggung — penonton harus tetap bisa membaca
 * skor dan cara ikut bermain sementara sebuah ultimate sedang tampil.
 */
const AVATAR_PX = 26

function Row({
  row,
  config,
  layout,
}: {
  row: CalloutRow
  config: BattleArenaConfig
  layout: StageLayout
}): ReactElement {
  const accent = config.sides[row.side].color
  const size = scaled(layout, AVATAR_PX)
  const face: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    border: `${scaled(layout, 2)}px solid ${accent}`,
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: scaled(layout, 10),
        padding: `${scaled(layout, 5)}px ${scaled(layout, 14)}px`,
        borderRadius: 999,
        background: 'rgba(6,8,20,.72)',
        border: `1px solid ${accent}`,
        // Gift mahal tampil lebih tegas — pengali presentasi, bukan kekuatan (spec §7.5).
        boxShadow: `0 0 ${scaled(layout, 14) * row.intensity}px ${accent}`,
        color: '#fff',
        fontSize: scaled(layout, 16),
        whiteSpace: 'nowrap',
      }}
    >
      {row.avatarUrl === null ? (
        <span
          style={{
            ...face,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.18)',
            fontSize: scaled(layout, 13),
            fontWeight: 700,
          }}
        >
          {initialFor(row.username)}
        </span>
      ) : (
        <img src={row.avatarUrl} alt="" style={face} />
      )}
      <span style={{ fontWeight: 700 }}>{row.username}</span>
      <span style={{ color: accent, fontWeight: 800, letterSpacing: '0.12em' }}>{row.label}</span>
      {row.killCount > 0 && <span style={{ opacity: 0.9 }}>{`· ${row.killCount} KILL`}</span>}
    </div>
  )
}

export function Callout({
  model,
  config,
  layout,
}: {
  model: CalloutModel
  config: BattleArenaConfig
  layout: StageLayout
}): ReactElement | null {
  if (model.rows.length === 0) return null

  return (
    <div
      data-testid="ultimate-callout"
      style={{
        position: 'absolute',
        left: '50%',
        top: layout.arena.y + scaled(layout, 14),
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: scaled(layout, 6),
      }}
    >
      {model.rows.map((row) => (
        <Row key={row.slot} row={row} config={config} layout={layout} />
      ))}
      {model.overflow > 0 && (
        <span style={{ color: 'rgba(255,255,255,.75)', fontSize: scaled(layout, 14) }}>
          {`+${model.overflow} lagi`}
        </span>
      )}
    </div>
  )
}
