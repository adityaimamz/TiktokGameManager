import type { ReactElement } from 'react'
import type { SnapshotView } from '@lga/shared'
import type { BattleArenaConfig } from '../../config/index.js'
import type { RosterEntry, SessionGifter } from '../../snapshot.js'
import type { StageLayout } from '../layout.js'
import { Callout } from './Callout.js'
import { Feeds } from './Feeds.js'
import { ScoreBar } from './ScoreBar.js'
import { TopFighters } from './TopFighters.js'
import { TopGifter } from './TopGifter.js'
import { VictoryBanner } from './VictoryBanner.js'
import type { GiftFeedEntry, JoinFeedEntry, KillFeedEntry } from './feed.js'
import {
  calloutModel,
  matchStatusLabel,
  scoreBarModel,
  topFighters,
  victoryModel,
} from './view-model.js'
import { scaled } from '../layout.js'

export interface HudProps {
  view: SnapshotView
  config: BattleArenaConfig
  roster: ReadonlyMap<number, RosterEntry>
  kills: KillFeedEntry[]
  joins: JoinFeedEntry[]
  gifts: GiftFeedEntry[]
  nowMs: number
  layout: StageLayout
  /**
   * Penyumbang terbesar SESI, dari payload roster.
   *
   * Dioper, bukan dihitung di sini: snapshot fighter tidak memuatnya dan tidak bisa —
   * penyumbang terbesar belum tentu punya fighter sama sekali.
   */
  topGifter?: SessionGifter | null
}

/**
 * Lapisan DOM di atas canvas (§9.2).
 *
 * Elemen di sini jarang berubah dan butuh tata letak teks, jadi DOM lebih tepat daripada
 * canvas. Tidak ada logika: seluruh keputusan sudah diambil view-model.
 */
/**
 * Pil status di kaki arena: satu kalimat yang menjawab "kenapa tidak ada yang bergerak".
 *
 * Ia duduk tepat di atas action legend, bukan di tengah arena, supaya tidak menutupi
 * fighter saat pertandingan sedang berjalan — dan selama `battle` ia tidak digambar sama
 * sekali, karena di sana pertanyaannya tidak pernah diajukan.
 */
function MatchStatus({
  view,
  layout,
}: {
  view: SnapshotView
  layout: StageLayout
}): ReactElement | null {
  const label = matchStatusLabel(view)
  if (label === null) return null

  return (
    <div
      data-testid="match-status"
      style={{
        position: 'absolute',
        left: '50%',
        top: layout.arena.y + layout.arena.height - scaled(layout, 46),
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: scaled(layout, 13),
        padding: `${scaled(layout, 9)}px ${scaled(layout, 22)}px`,
        borderRadius: 999,
        background: 'rgba(6,8,20,.72)',
        border: '1px solid rgba(255,255,255,.12)',
        color: 'rgba(255,255,255,.78)',
        fontSize: scaled(layout, 17),
        fontWeight: 600,
        letterSpacing: '0.14em',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: scaled(layout, 9),
          height: scaled(layout, 9),
          borderRadius: '50%',
          background: '#FFD16A',
          boxShadow: '0 0 9px #FFD16A',
          animation: 'ia-blip 1.2s ease-in-out infinite',
        }}
      />
      {label}
    </div>
  )
}

/** Pil "ZONA A" / "ZONA B" di sudut atas arena — penanda wilayah, bukan nama tim. */
function ZoneLabels({ layout }: { layout: StageLayout }): ReactElement {
  const pill = (side: 'a' | 'b'): ReactElement => (
    <span
      data-testid={`zone-${side}`}
      style={{
        position: 'absolute',
        top: layout.arena.y + scaled(layout, 10),
        [side === 'a' ? 'left' : 'right']: scaled(layout, 10),
        padding: `${scaled(layout, 3)}px ${scaled(layout, 9)}px`,
        borderRadius: scaled(layout, 6),
        background: side === 'a' ? 'rgba(20,60,160,.42)' : 'rgba(160,20,70,.42)',
        border: `1px solid ${side === 'a' ? 'rgba(120,190,255,.35)' : 'rgba(255,140,180,.35)'}`,
        color: side === 'a' ? '#BFDDFF' : '#FFD0E0',
        fontSize: scaled(layout, 12),
        fontWeight: 700,
        letterSpacing: '0.18em',
      }}
    >
      {`ZONA ${side.toUpperCase()}`}
    </span>
  )

  return (
    <>
      {pill('a')}
      {pill('b')}
    </>
  )
}

export function Hud(props: HudProps): ReactElement {
  const { view, config, roster, layout } = props

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <ScoreBar model={scoreBarModel(view, config)} layout={layout} />
      <ZoneLabels layout={layout} />
      <Callout model={calloutModel(view, roster, config)} config={config} layout={layout} />
      <MatchStatus view={view} layout={layout} />
      <TopFighters rows={topFighters(view, roster, config)} layout={layout} />
      <TopGifter row={props.topGifter ?? null} layout={layout} />
      <Feeds
        kills={props.kills}
        joins={props.joins}
        gifts={props.gifts}
        nowMs={props.nowMs}
        layout={layout}
      />
      <VictoryBanner model={victoryModel(view, roster, config)} layout={layout} />
    </div>
  )
}
