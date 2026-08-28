import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { apiFetch } from '../../platform/app-key.js'
import { GAMES } from '../../platform/registry/index.js'
import type { GameEntry, GameId } from '../../platform/registry/index.js'
import { Icon } from './icons.js'
import { Footer } from './sections/Footer.js'
import { Wordmark } from './Wordmark.js'
import './dashboard.css'

export interface LobbyProps {
  /** Membuka ruang kendali sebuah game. */
  onOpen: (id: GameId) => void
}

const DOCS = 'https://github.com/adityaimamz/TiktokGameManager/tree/main/docs'

/**
 * Slot yang belum ada penghuninya.
 *
 * Digambar, bukan disembunyikan: katalog satu kartu terbaca sebagai aplikasi satu game,
 * dan yang ingin dikatakan halaman ini justru sebaliknya. Kalimatnya menyebut apa yang
 * sebenarnya menahan game kedua, supaya slot ini tidak berubah jadi janji kosong.
 */
const SOON: readonly { title: string; note: string }[] = [
  {
    title: 'Game kedua',
    note: 'Registry platform menunggu penghuni kedua. Battle Arena adalah blueprint-nya.',
  },
  {
    title: 'Game ketiga',
    note: 'Sumber chat kedua menyusul lebih dulu: ChatSource belum diuji dengan implementasi kedua.',
  },
]

/** Warna dan kata status server. Warna saja tidak cukup untuk dibedakan. */
const SERVER: Record<'checking' | 'up' | 'down', { color: string; word: string }> = {
  checking: { color: '#787F98', word: 'Memeriksa' },
  up: { color: '#7CE0A8', word: 'Tersambung' },
  down: { color: '#FF9DB4', word: 'Terputus' },
}

/** Kotak kecil di kanan atas: angka yang sudah diketahui halaman ini, bukan yang dikarang. */
function Summary(props: { label: string; children: ReactElement | string }): ReactElement {
  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-ink/70 px-3 py-1.5">
      <span className="mb-[3px] block font-ui text-[11px] font-medium text-muted">
        {props.label}
      </span>
      <span className="font-data text-[15px] font-bold tabular-nums text-signal">
        {props.children}
      </span>
    </div>
  )
}

function GameCard(props: { game: GameEntry; onOpen: () => void }): ReactElement {
  return (
    <button
      className="stack stack-hi flex flex-col overflow-hidden text-left transition-colors hover:border-white/25"
      type="button"
      onClick={props.onOpen}
    >
      <span className="relative flex aspect-video flex-none items-end overflow-hidden border-b border-white/[0.08] bg-ink/50 p-3">
        {props.game.thumbnail === null ? (
          <span className="monitor-grid absolute inset-0" aria-hidden="true" />
        ) : (
          <img
            className="absolute inset-0 h-full w-full object-cover"
            src={props.game.thumbnail}
            alt=""
          />
        )}
        {/* Tanpa titik status: game katalog SELALU siap, jadi titiknya tidak menandai apa pun. */}
        <span className="chip relative">Siap</span>
      </span>
      <span className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-[11px]">
        <span className="font-ui text-[13px] font-semibold text-signal">{props.game.label}</span>
        <span className="font-ui text-[11px] font-medium text-muted">{props.game.tags[0]}</span>
      </span>
      <span className="border-t border-white/[0.08] px-3 py-2.5 text-[11px] leading-[1.55] text-muted">
        {props.game.tagline}
      </span>
    </button>
  )
}

/**
 * Dinding katalog — hanya digambar kalau ADA yang perlu dibandingkan.
 *
 * Dipisah dari `Lobby` supaya cabang "lebih dari satu game" bisa diuji tanpa memalsukan
 * registry: hari ini penghuninya satu, dan uji yang menunggu game kedua lahir adalah uji
 * yang tidak pernah dijalankan.
 */
export function CatalogueGrid(props: {
  games: readonly GameEntry[]
  onOpen?: (id: GameId) => void
}): ReactElement {
  return (
    <>
      <div className="relative z-10 flex items-center gap-2 px-1 pt-1.5">
        <span className="font-ui text-[12px] font-semibold text-faint">Semua game</span>
        <span className="h-px w-3.5 bg-white/[0.14]" />
        <span className="font-ui text-[12px] font-medium text-muted">
          {props.games.length} aktif, {SOON.length} menyusul
        </span>
      </div>

      <div className="relative z-10 grid grid-cols-1 content-start gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {props.games.map((game) => (
          <GameCard game={game} key={game.label} onOpen={() => props.onOpen?.(game.id)} />
        ))}

        {SOON.map((slot) => (
          <div className="stack-lo flex flex-col overflow-hidden" key={slot.title}>
            <div className="grid aspect-video flex-none place-items-center border-b border-white/[0.07] bg-ink/70">
              <span className="font-ui text-[12px] font-medium text-faint">Slot kosong</span>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-[11px]">
              <span className="font-ui text-[13px] font-semibold text-dim">{slot.title}</span>
              <span className="font-ui text-[11px] font-medium text-standby">Segera</span>
            </div>
            <p className="m-0 border-t border-white/[0.07] px-3 py-2.5 text-[11px] leading-[1.55] text-muted">
              {slot.note}
            </p>
          </div>
        ))}

        {/*
          * Kartu terakhir mengarah ke DOKUMENTASI, bukan ke sebuah wizard.
          *
          * Game baru lahir dari satu entri registry plus kodenya, bukan dari sebuah tombol
          * — dan tombol yang membuka dialog "segera hadir" lebih buruk daripada tautan yang
          * benar-benar menjawab pertanyaannya.
          */}
        <a
          className="flex flex-col items-center justify-center gap-2.5 rounded-[14px] border border-dashed border-white/[0.12] bg-white/[0.015] p-[18px] text-center no-underline transition-colors hover:border-white/25 hover:bg-white/[0.04]"
          href={DOCS}
          target="_blank"
          rel="noreferrer"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.12] bg-white/[0.04] text-dim">
            <Icon name="plus" size={17} />
          </span>
          <span className="font-ui text-[12px] font-semibold text-label">Tambah game</span>
          <span className="max-w-[24ch] text-[11px] leading-[1.5] text-muted">
            Game baru masuk lewat registry tanpa mengubah game yang sudah jalan.
          </span>
        </a>
      </div>
    </>
  )
}

/**
 * Katalog game — halaman pertama yang dilihat creator (`/`).
 *
 * Ia TIDAK memiliki engine dan tidak pernah men-tick apa pun: satu-satunya kewenangannya
 * adalah memilih game mana yang ruang kendalinya dibuka. Itulah yang membuat aturan §6.1
 * tetap utuh — match berhenti saat tab ruang kendali ditutup, dan halaman ini tidak pernah
 * jadi tab kedua yang diam-diam ikut memilikinya.
 */
export function Lobby({ onOpen }: LobbyProps): ReactElement {
  const featured = GAMES[0]

  /*
   * Satu-satunya keadaan hidup di halaman ini. Server yang mati adalah hal pertama yang
   * menjelaskan kenapa nanti tidak ada chat yang masuk; menyembunyikannya berarti creator
   * mencarinya di tempat yang salah.
   */
  const [server, setServer] = useState<'checking' | 'up' | 'down'>('checking')
  useEffect(() => {
    let alive = true
    const settle = (state: 'up' | 'down'): void => {
      if (alive) setServer(state)
    }
    void apiFetch('/api/health')
      .then((response) => settle(response.ok ? 'up' : 'down'))
      .catch(() => settle('down'))
    return () => {
      alive = false
    }
  }, [])

  const status = SERVER[server]

  return (
    <div
      className="spill relative flex min-h-[100dvh] flex-col gap-3.5 p-4 font-ui text-[13px] text-signal"
      data-testid="lobby-page"
    >
      <div className="spill-grid" aria-hidden="true" />

      <header className="stack relative z-20 flex shrink-0 items-center gap-[18px] px-4 py-3">
        <Wordmark surface="Katalog game" />
        <div className="ml-auto flex items-center gap-2">
          <Summary label="Game aktif">{String(GAMES.length)}</Summary>
          <Summary label="Server">
            <span
              className="flex items-center gap-1.5 font-ui text-[12px] font-semibold"
              style={{ color: status.color }}
            >
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: 'currentColor', boxShadow: '0 0 8px currentColor' }}
              />
              {status.word}
            </span>
          </Summary>
        </div>
      </header>

      {featured === undefined ? null : (
        <section className="stack stack-hi relative z-10 grid items-center gap-7 overflow-hidden p-[30px] lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)]">
          <div>
            {/* Dua tag, bukan semuanya: yang ketiga tidak menambah apa pun selain baris pil. */}
            <div className="mb-3.5 flex flex-wrap gap-1.5">
              {featured.tags.slice(0, 2).map((tag) => (
                <span
                  className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-[3px] font-ui text-[11px] font-semibold text-muted"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/*
              * SATU-SATUNYA huruf kapital besar di halaman ini, dan ia boleh: sebuah judul
              * display bukan eyebrow. Yang dibuang cuma jarak hurufnya — 46px berjarak lebar
              * terbaca sebagai spanduk, bukan sebagai nama.
              */}
            <h1 className="m-0 font-data text-[46px] font-bold uppercase leading-[0.98] tracking-tight text-signal">
              {featured.label}
            </h1>

            <p className="mt-3.5 max-w-[52ch] text-[13px] leading-[1.65] text-dim">
              {featured.tagline}
            </p>

            <div className="mt-[22px] flex items-center gap-3.5">
              <button
                className="btn-primary flex shrink-0 items-center gap-2 rounded-[9px] border px-5 py-[11px] text-[12.5px]"
                type="button"
                onClick={() => onOpen(featured.id)}
              >
                <Icon name="play" size={13} />
                Buka ruang kendali
              </button>
              <a
                className="font-ui text-[12px] font-semibold text-[#BFD4FF] no-underline hover:underline hover:underline-offset-[3px]"
                href={DOCS}
                target="_blank"
                rel="noreferrer"
              >
                Pelajari selengkapnya
              </a>
            </div>
          </div>

          {/*
            * Bingkai landscape menampilkan `thumbnail` registry — key art rancangan, bukan
            * tangkapan gameplay: yang terakhir akan berbohong begitu creator mengganti warna
            * sisi, dan tidak ada yang akan ingat memperbaruinya. `object-cover` di kotak
            * `aspect-video` (16:9): sumbernya HARUS digambar persis 16:9 (mis. 1920×1080)
            * atau cover akan memotong tepinya untuk mengisi kotak.
            */}
          <div className="relative hidden items-center justify-end lg:flex" aria-hidden="true">
            <div className="monitor-frame relative aspect-video w-[78%] flex-none rounded-[18px] p-1.5">
              <div className="monitor-grid relative h-full w-full overflow-hidden rounded-xl">
                {featured.thumbnail === null ? null : (
                  <img className="h-full w-full object-cover" src={featured.thumbnail} alt="" />
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/*
        * Katalog satu game TIDAK menggambar dinding kartu.
        *
        * Satu game sungguhan berdampingan dengan dua "slot kosong" dan satu kartu bergaris
        * putus-putus terbaca sebagai rak yang gagal diisi — kebalikan dari yang ingin
        * dikatakan halaman ini. Satu kalimat yang menyebut apa yang sebenarnya menahan game
        * kedua lebih jujur, dan dinding itu hidup sendiri begitu penghuninya bertambah.
        */}
      {GAMES.length > 1 ? (
        <CatalogueGrid games={GAMES} onOpen={onOpen} />
      ) : (
        <p className="relative z-10 m-0 max-w-[62ch] px-1 pt-1.5 text-[13px] leading-[1.6] text-muted">
          Game kedua menyusul. Registry platform menunggu penghuni, dan Battle Arena adalah
          blueprint-nya:{' '}
          <a
            className="text-[#BFD4FF] no-underline hover:underline hover:underline-offset-[3px]"
            href={DOCS}
            target="_blank"
            rel="noreferrer"
          >
            cara menambah game
          </a>
          .
        </p>
      )}

      <div className="relative z-10 mt-auto">
        <Footer />
      </div>
    </div>
  )
}

export default Lobby
