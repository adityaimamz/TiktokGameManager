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
   * Lima penyumbang terbesar SESI, dari payload roster.
   *
   * Dioper, bukan dihitung di sini: snapshot fighter tidak memuatnya dan tidak bisa —
   * penyumbang terbesar belum tentu punya fighter sama sekali.
   */
  topGifters?: readonly SessionGifter[]
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

/** Pil "ZONA A" / "ZONA B" / "ZONA C" / "ZONA D" di sudut arena — penanda wilayah. */
function ZoneLabels({ layout, sideCount = 2 }: { layout: StageLayout; sideCount?: number }): ReactElement {
  const pill = (side: 'a' | 'b' | 'c' | 'd'): ReactElement => {
    const isTop = side === 'a' || side === 'b'
    const isLeft = side === 'a' || side === 'c'
    const bgColors: Record<'a' | 'b' | 'c' | 'd', string> = {
      a: 'rgba(20,60,160,.42)',
      b: 'rgba(160,20,70,.42)',
      c: 'rgba(20,130,80,.42)',
      d: 'rgba(160,100,20,.42)',
    }
    const borderColors: Record<'a' | 'b' | 'c' | 'd', string> = {
      a: 'rgba(120,190,255,.35)',
      b: 'rgba(255,140,180,.35)',
      c: 'rgba(100,240,160,.35)',
      d: 'rgba(255,200,100,.35)',
    }
    const textColors: Record<'a' | 'b' | 'c' | 'd', string> = {
      a: '#BFDDFF',
      b: '#FFD0E0',
      c: '#BFFFE0',
      d: '#FFE8BF',
    }

    return (
      <span
        key={side}
        data-testid={`zone-${side}`}
        style={{
          position: 'absolute',
          top: isTop ? layout.arena.y + scaled(layout, 10) : layout.arena.y + layout.arena.height - scaled(layout, 32),
          [isLeft ? 'left' : 'right']: scaled(layout, 10),
          padding: `${scaled(layout, 3)}px ${scaled(layout, 9)}px`,
          borderRadius: scaled(layout, 6),
          background: bgColors[side],
          border: `1px solid ${borderColors[side]}`,
          color: textColors[side],
          fontSize: scaled(layout, 12),
          fontWeight: 700,
          letterSpacing: '0.18em',
        }}
      >
        {`ZONA ${side.toUpperCase()}`}
      </span>
    )
  }

  return (
    <>
      {pill('a')}
      {pill('b')}
      {sideCount === 4 ? pill('c') : null}
      {sideCount === 4 ? pill('d') : null}
    </>
  )
}

export function Hud(props: HudProps): ReactElement {
  const { view, config, roster, layout } = props
  const sideCount = config.gameplay.sideCount ?? 2

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <ScoreBar model={scoreBarModel(view, config)} layout={layout} />
      <ZoneLabels layout={layout} sideCount={sideCount} />
      <Callout model={calloutModel(view, roster, config)} config={config} layout={layout} />
      <MatchStatus view={view} layout={layout} />
      <TopFighters rows={topFighters(view, roster, config)} layout={layout} />
      <TopGifter rows={props.topGifters ?? []} layout={layout} />
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
