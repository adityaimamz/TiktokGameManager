import { useState } from 'react'
import type { ReactElement } from 'react'
import { GAMES } from '../../platform/registry/index.js'
import { BROADCAST_WORD } from './broadcast.js'
import type { BroadcastState } from './broadcast.js'
import { Icon } from './icons.js'
import { Notifications } from './Notifications.js'
import type { NotificationEntry } from './notification-list.js'

export interface TopBarProps {
  broadcast: BroadcastState
  overlayUrl: string
  /** Overlay jauh yang sedang terhubung. Nol berarti link ini belum dipakai siapa pun. */
  overlayCount: number
  muted: boolean
  onToggleMute: () => void
  onOpenSettings: () => void
  notifications: readonly NotificationEntry[]
  onReadNotifications: () => void
}

/** Pil siaran: warna DAN kata, karena warna saja tidak cukup untuk dibedakan. */
const PILL: Record<BroadcastState, { ring: string; text: string; dot: string }> = {
  idle: { ring: 'rgba(255,255,255,.14)', text: 'rgba(232,236,248,.55)', dot: '#787F98' },
  rehearsal: { ring: 'rgba(255,196,107,.32)', text: '#FFD9A0', dot: '#FFC46B' },
  live: { ring: 'rgba(255,45,120,.32)', text: '#FF89A8', dot: '#FF3D6E' },
}

export function TopBar(props: TopBarProps): ReactElement {
  // Satu game di Fase 1, dibaca dari daftar. Menyebutnya dari sebuah daftar adalah
  // satu-satunya cara membuat pernyataan ini tetap jujur saat game kedua datang.
  const game = GAMES[0]
  const pill = PILL[props.broadcast]

  // "Tersalin" hanya hidup 1,4 detik: umpan balik, bukan keadaan yang perlu diingat.
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    void navigator.clipboard?.writeText(props.overlayUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <header className="stack relative z-20 flex shrink-0 items-center gap-[18px] px-4 py-3">
      {/* Lencana heksagon: dua garis gradien yang mengunci identitas produk di pojok kiri. */}
      <div className="flex flex-none items-center gap-[11px]">
        <div className="relative grid h-[38px] w-[38px] place-items-center">
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg,#2F80FF,#B02BFF 52%,#FF2D78)',
              clipPath: 'polygon(50% 0,100% 26%,100% 74%,50% 100%,0 74%,0 26%)',
              boxShadow: '0 0 22px rgba(120,80,255,.65)',
            }}
          />
          <div
            className="absolute inset-[1.5px] bg-[#0a0b16]"
            style={{ clipPath: 'polygon(50% 0,100% 26%,100% 74%,50% 100%,0 74%,0 26%)' }}
          />
          <span
            className="relative font-data text-[17px] font-bold"
            style={{
              background: 'linear-gradient(135deg,#6FD0FF,#FF6FA8)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            i
          </span>
        </div>
        <div className="flex flex-col gap-px">
          <span className="font-data text-base font-bold uppercase leading-none tracking-[0.14em]">
            Interactify
          </span>
          <span className="font-ui text-[9.5px] font-semibold uppercase tracking-[0.34em] text-muted">
            / {game?.label ?? ''}
          </span>
        </div>
      </div>

      <span
        className="flex flex-none items-center gap-2 rounded-full border py-[6px] pl-2.5 pr-3 font-data text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ borderColor: pill.ring, background: `${pill.dot}1A`, color: pill.text }}
      >
        <span className="relative grid h-2 w-2 place-items-center">
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: pill.dot,
              boxShadow: `0 0 10px ${pill.dot}`,
              animation: props.broadcast === 'idle' ? 'none' : 'ia-pulse 1.4s ease-in-out infinite',
            }}
          />
          {props.broadcast === 'live' ? (
            <span
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: pill.dot, animation: 'ia-ring 1.8s ease-out infinite' }}
            />
          ) : null}
        </span>
        {BROADCAST_WORD[props.broadcast]}
      </span>

      {/*
        * URL dan tombolnya satu benda, bukan dua: yang disalin adalah teks yang persis
        * terlihat di sebelahnya, jadi tidak ada ruang untuk menyalin sesuatu yang lain.
        */}
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="flex w-full max-w-[560px] items-center overflow-hidden rounded-[10px] border border-white/[0.11] bg-ink/70">
          <span className="flex select-none items-center self-stretch whitespace-nowrap border-r border-white/[0.09] px-3 font-ui text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted">
            OBS URL
          </span>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent px-3 py-[9px] font-ui text-[12.5px] text-[#BFD4FF] outline-none"
            readOnly
            aria-label="URL overlay OBS"
            value={props.overlayUrl}
            title="Tambahkan ini sebagai Browser Source di OBS. Alamat ini juga berlaku dari device lain di jaringan yang sama."
          />
          {/*
            * Angka ini satu-satunya cara creator tahu link-nya benar-benar dipakai sebelum
            * siaran mulai. Nol tetap ditampilkan: itu informasi, bukan ketiadaannya.
            */}
          <span
            data-testid="overlay-count"
            className="flex flex-none select-none items-center gap-1.5 self-stretch whitespace-nowrap border-l border-white/[0.09] px-2.5 font-data text-[10.5px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: props.overlayCount > 0 ? '#7CE0A8' : 'rgba(232,236,248,.45)' }}
            title="Overlay di device lain yang sedang menerima siaran arena ini."
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: props.overlayCount > 0 ? '#4ED88A' : '#5A6079',
                boxShadow: props.overlayCount > 0 ? '0 0 8px #4ED88A' : 'none',
              }}
            />
            {props.overlayCount} jauh
          </span>
          <button
            className="btn-primary m-1 flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[7px] border px-3 py-1.5 text-[11.5px]"
            type="button"
            aria-label="Salin URL overlay"
            onClick={copy}
          >
            <Icon name="copy" size={12} />
            {copied ? 'Tersalin' : 'Salin'}
          </button>
        </div>
      </div>

      <div className="flex flex-none items-center gap-2">
        <Notifications items={props.notifications} onOpen={props.onReadNotifications} />
        <button
          className="btn-icon"
          type="button"
          aria-label={props.muted ? 'Kembalikan suara' : 'Bisukan suara'}
          onClick={props.onToggleMute}
        >
          <Icon
            name={props.muted ? 'muted' : 'sound'}
            size={16}
            strokeWidth={2}
            className={props.muted ? 'text-[#FF6E8F]' : undefined}
          />
        </button>
        <button
          className="btn-icon"
          type="button"
          aria-label="Layar penuh"
          onClick={() => void document.documentElement.requestFullscreen?.()}
        >
          <Icon name="expand" size={15} />
        </button>
        <button
          className="btn-hero flex shrink-0 items-center gap-2 rounded-[9px] border px-4 py-[9px] text-[12.5px]"
          type="button"
          aria-label="Setelan game"
          onClick={props.onOpenSettings}
        >
          <Icon name="gear" size={14} />
          Setelan game
        </button>
      </div>
    </header>
  )
}
