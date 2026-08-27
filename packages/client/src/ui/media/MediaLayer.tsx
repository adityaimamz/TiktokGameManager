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
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: scaled(layout, 8),
          maxWidth: arena.width * 0.7,
        }}
      >
        {banner.imageUrl === null || broken ? null : (
          <img
            alt=""
            data-testid="media-banner-image"
            onError={() => setBroken(true)}
            src={banner.imageUrl}
            style={{ maxWidth: '100%', maxHeight: arena.height * 0.34, objectFit: 'contain' }}
          />
        )}
        {banner.text === '' ? null : (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: scaled(layout, 8),
              padding: `${scaled(layout, 6)}px ${scaled(layout, 14)}px`,
              borderRadius: scaled(layout, 999),
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontWeight: 800,
              fontSize: scaled(layout, 20),
              textAlign: 'center',
              // Banner berdiri di atas arena yang warnanya bisa apa saja; bayangan inilah
              // yang menjaganya terbaca di latar terang.
              textShadow: '0 2px 6px rgba(0,0,0,0.75)',
            }}
          >
            {banner.avatarUrl === null ? null : (
              <img
                alt=""
                data-testid="media-banner-avatar"
                src={banner.avatarUrl}
                style={{
                  width: scaled(layout, 26),
                  height: scaled(layout, 26),
                  borderRadius: '50%',
                  objectFit: 'cover',
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
