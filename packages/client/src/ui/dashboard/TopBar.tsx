import { useState } from 'react'
import type { ReactElement } from 'react'
import { GAMES } from '../../platform/registry/index.js'
import { BROADCAST_WORD } from './broadcast.js'
import type { BroadcastState } from './broadcast.js'
import { Icon } from './icons.js'
import { Notifications } from './Notifications.js'
import type { NotificationEntry } from './notification-list.js'
import { Wordmark } from './Wordmark.js'

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
  /** Kembali ke katalog game. Tanpa ini tombolnya tidak digambar sama sekali. */
  onBack?: () => void
  /** Durasi siaran yang sudah diformat, atau `null` saat belum pernah tersambung. */
  liveFor?: string | null
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
      {/*
        * Jalan pulang ke katalog. Hanya digambar kalau ada tempat untuk pulang — dashboard
        * yang berdiri sendiri (uji, embed) tidak boleh menumbuhkan tombol yang tidak bisa
        * ditekan.
        */}
      {props.onBack === undefined ? null : (
        <button
          className="btn-icon flex-none font-data text-[19px] leading-none"
          type="button"
          aria-label="Semua game"
          title="Kembali ke katalog game"
          onClick={props.onBack}
        >
          ‹
        </button>
      )}

      <Wordmark surface={game?.label ?? ''} />

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
        {props.liveFor === null || props.liveFor === undefined ? null : (
          <span className="font-data tracking-normal opacity-80" data-testid="live-for">
            {`· ${props.liveFor}`}
          </span>
        )}
      </span>

      {/*
        * URL dan tombolnya satu benda, bukan dua: yang disalin adalah teks yang persis
        * terlihat di sebelahnya, jadi tidak ada ruang untuk menyalin sesuatu yang lain.
        */}
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="flex w-full max-w-[560px] items-center overflow-hidden rounded-[10px] border border-white/[0.11] bg-ink/70">
          <span className="flex select-none items-center self-stretch whitespace-nowrap border-r border-white/[0.09] px-3 font-ui text-[11px] font-semibold text-muted">
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
            className="flex flex-none select-none items-center gap-1.5 self-stretch whitespace-nowrap border-l border-white/[0.09] px-2.5 font-ui text-[11px] font-semibold"
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
          className="btn-primary flex shrink-0 items-center gap-2 rounded-[9px] border px-4 py-[9px] text-[12.5px]"
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
