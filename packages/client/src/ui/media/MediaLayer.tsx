import { useState } from 'react'
import type { ReactElement } from 'react'
import { scaled } from '../../games/battle-arena/renderer/layout.js'
import type { StageLayout } from '../../games/battle-arena/renderer/layout.js'
import type { BannerItem } from './cue-queue.js'

export interface MediaLayerProps {
  banner: BannerItem | null
  layout: StageLayout
}

/**
 * Banner alert dan GIF soundboard, melayang di atas arena (§5 spec 7b).
 *
 * DOM, bukan canvas: ia teks dan gambar, ia jarang berubah, dan renderer canvas milik game
 * tidak boleh tahu apa pun tentang media non-game. Dikurung ke `layout.arena`, jadi band skor
 * dan action legend tidak pernah tertutup.
 */
export function MediaLayer(props: MediaLayerProps): ReactElement | null {
  if (props.banner === null) return null
  // key: banner berikutnya harus lahir dengan state gambar yang bersih, bukan mewarisi
  // "gambarnya rusak" dari banner sebelumnya.
  return <BannerCard banner={props.banner} key={props.banner.id} layout={props.layout} />
}

function BannerCard({ banner, layout }: { banner: BannerItem; layout: StageLayout }): ReactElement {
  const [broken, setBroken] = useState(false)
  const arena = layout.arena

  return (
    <div
      data-testid="media-banner"
      style={{
        position: 'absolute',
        left: arena.x,
        top: arena.y + arena.height * 0.1,
        width: arena.width,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: scaled(layout, 8),
          maxWidth: arena.width * 0.75,
        }}
      >
        {banner.imageUrl === null || broken ? null : (
          <img
            alt=""
            data-testid="media-banner-image"
            onError={() => setBroken(true)}
            src={banner.imageUrl}
            style={{
              maxWidth: '100%',
              maxHeight: arena.height * 0.38,
              objectFit: 'contain',
              filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.65))',
            }}
          />
        )}
        {banner.text === '' ? null : (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: scaled(layout, 8),
              padding: `${scaled(layout, 7)}px ${scaled(layout, 16)}px`,
              borderRadius: scaled(layout, 999),
              background: 'rgba(6, 8, 20, 0.82)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(8px)',
              color: '#fff',
              fontWeight: 800,
              fontSize: scaled(layout, 20),
              textAlign: 'center',
              // Banner berdiri di atas arena yang warnanya bisa apa saja; bayangan inilah
              // yang menjaganya terbaca di latar terang.
              textShadow: '0 2px 6px rgba(0,0,0,0.85)',
            }}
          >
            {banner.avatarUrl === null ? null : (
              <img
                alt=""
                data-testid="media-banner-avatar"
                src={banner.avatarUrl}
                style={{
                  width: scaled(layout, 28),
                  height: scaled(layout, 28),
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '1.5px solid rgba(255, 255, 255, 0.6)',
                }}
              />
            )}
            <span data-testid="media-banner-text">{banner.text}</span>
          </span>
        )}
      </div>
    </div>
  )
}
