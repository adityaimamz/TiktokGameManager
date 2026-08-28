import type { CSSProperties, ReactElement } from 'react'
import type { StageLayout } from '../layout.js'
import { scaled } from '../layout.js'
import type { RoundDot, ScoreBarModel, ScoreSideModel } from './view-model.js'

/**
 * Papan skor di zona atas panggung (§9.0).
 *
 * Nama sisi di tepi, dua angka besar di tengah. Semua ukuran lewat `scaled()` supaya papan
 * ini menyusut bersama panggung, bukan patah saat kecil.
 *
 * Lencana huruf A/B dan jumlah fighter pernah menemani nama, keduanya dibuang atas keputusan
 * creator: zona atas cuma 14% tinggi panggung dan sudah dipakai skor, dots, dan caption ronde,
 * sementara warna sisi sudah menjawab pertanyaan yang sama dengan lencana. Jumlah fighter tetap
 * terbaca di dashboard.
 */
function SideBlock({
  model,
  layout,
  align,
}: {
  model: ScoreSideModel
  layout: StageLayout
  align: 'left' | 'right'
}): ReactElement {
  return (
    <div
      style={{
        minWidth: 0,
        textAlign: align === 'right' ? 'right' : 'left',
        justifySelf: align === 'right' ? 'end' : 'start',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: scaled(layout, 10),
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
          color: model.color,
          fontSize: scaled(layout, 21),
          fontWeight: 700,
          letterSpacing: '0.12em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          // Kapital lewat CSS, bukan lewat .toUpperCase(): nama yang creator ketik tetap
          // utuh di DOM, jadi pembaca layar dan pencarian teks masih menemukannya.
          textTransform: 'uppercase',
        }}
      >
        {model.leading ? (
          <span data-testid={`crown-${model.side}`} aria-label="leading">
            👑
          </span>
        ) : null}
        {model.name}
      </div>
    </div>
  )
}

const DOT_COLOR: Record<RoundDot, (a: string, b: string) => string> = {
  a: (a) => a,
  b: (_, b) => b,
  current: () => 'rgba(255,255,255,.85)',
  empty: () => 'rgba(255,255,255,.18)',
}

export function ScoreBar({
  model,
  layout,
}: {
  model: ScoreBarModel
  layout: StageLayout
}): ReactElement {
  const score = (side: ScoreSideModel): CSSProperties => ({
    fontSize: scaled(layout, 62),
    fontWeight: 700,
    lineHeight: 1,
    color: '#fff',
    textShadow: `0 0 ${scaled(layout, 44)}px ${side.color}`,
  })
  const caption: CSSProperties = {
    fontSize: scaled(layout, 15),
    fontWeight: 700,
    letterSpacing: '0.2em',
    color: 'rgba(232,236,248,.42)',
  }

  return (
    <div
      data-testid="score-bar"
      style={{
        position: 'absolute',
        left: layout.top.x,
        top: layout.top.y,
        width: layout.top.width,
        height: layout.top.height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: scaled(layout, 12),
        padding: `0 ${scaled(layout, 22)}px`,
        boxSizing: 'border-box',
        color: '#fff',
        background: 'linear-gradient(180deg,rgba(6,8,20,.94),rgba(6,8,20,.30))',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: scaled(layout, 14),
        }}
      >
        <SideBlock model={model.a} layout={layout} align="left" />
        <div style={{ display: 'flex', alignItems: 'center', gap: scaled(layout, 18) }}>
          <span data-testid="score-a" style={score(model.a)}>
            {model.a.score}
          </span>
          <span style={{ fontSize: scaled(layout, 24), color: 'rgba(232,236,248,.30)' }}>:</span>
          <span data-testid="score-b" style={score(model.b)}>
            {model.b.score}
          </span>
        </div>
        <SideBlock model={model.b} layout={layout} align="right" />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: scaled(layout, 18),
        }}
      >
        <span style={caption}>{`BEST OF ${model.bestOf}`}</span>
        <div style={{ display: 'flex', gap: scaled(layout, 9) }}>
          {model.dots.map((dot, index) => {
            const colour = DOT_COLOR[dot](model.a.color, model.b.color)
            return (
              <span
                // eslint-disable-next-line react/no-array-index-key -- titik adalah nomor ronde, bukan identitas
                key={index}
                data-testid="round-dot"
                data-dot={dot}
                style={{
                  width: scaled(layout, dot === 'current' ? 29 : 11),
                  height: scaled(layout, 11),
                  borderRadius: 999,
                  background: colour,
                  boxShadow: dot === 'empty' ? 'none' : `0 0 ${scaled(layout, 18)}px ${colour}`,
                  transition: 'all .3s',
                }}
              />
            )
          })}
        </div>
        <span style={caption}>{`ROUND ${model.roundNumber} · FIRST TO ${model.killsToWin} KILLS`}</span>
      </div>
    </div>
  )
}
