import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { MatchSummary, PlayerStats } from '@lga/shared'
import { sinceLabel } from './gifter-list.js'
import type { GifterEntry } from './gifter-list.js'
import { matchStats } from './match-stats.js'

export interface BoardsProps {
  /**
   * Panel komentar, dipasang sebagai tab pertama alih-alih kartu sendiri: banjir gift
   * memanjang tanpa batas dan menggencet komentar keluar dari kolom.
   */
  chat: ReactNode
  live: readonly GifterEntry[]
  top: readonly PlayerStats[]
  matches: readonly MatchSummary[]
  killers: readonly PlayerStats[]
  /** Nama sisi yang berlaku sekarang — riwayat tidak menyimpannya sendiri. */
  sideNames: { a: string; b: string }
  nowMs: number
  onLoadTop: () => void
  onLoadStats: () => void
}

type Tab = 'chat' | 'live' | 'top' | 'stats'

const TAB_LABEL: Record<Tab, string> = {
  chat: 'Komentar',
  live: 'Gift',
  top: 'Top',
  stats: 'Statistik',
}

const coins = (value: number): string => value.toLocaleString('id-ID')

function Avatar({ initials, synthetic }: { initials: string; synthetic: boolean }): ReactElement {
  return (
    <span
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-data text-[10px] font-bold ${
        synthetic ? 'bg-white/10 text-dim' : 'bg-[#5A8CFF]/25 text-signal'
      }`}
    >
      {initials}
    </span>
  )
}

/**
 * Tiga tab, tiga pertanyaan berbeda.
 *
 * "Live" adalah sesi dashboard ini, dihitung dari langganan chat. "Top" adalah papan gifter
 * sepanjang masa dari Neon, dan ia TIDAK memasukkan match yang sedang berjalan — koin ditulis
 * sekali saat match berakhir, menumpang MatchRecord. Itu justru gunanya tab Live berdampingan
 * dengannya. "Statistik" menjawab pertanyaan yang lain sama sekali: bagaimana match-match ini
 * berjalan (Req 34 AC6).
 *
 * Pemuatan terjadi saat tab diklik, satu panggilan per klik tanpa cache — papan ini berubah
 * sekali per match, dan match berakhir jauh lebih jarang daripada satu detik.
 */
export function Boards(props: BoardsProps): ReactElement {
  const [tab, setTab] = useState<Tab>('chat')
  const stats = matchStats(props.matches, props.sideNames)

  const show = (next: Tab): void => {
    setTab(next)
    if (next === 'top') props.onLoadTop()
    if (next === 'stats') props.onLoadStats()
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 px-3.5 pb-3 pt-3.5" role="group" aria-label="Papan yang ditampilkan">
        {(['chat', 'live', 'top', 'stats'] as const).map((value) => (
          <button
            aria-pressed={tab === value}
            className="seg-btn px-2 py-1 text-[10px]"
            key={value}
            onClick={() => show(value)}
            type="button"
          >
            {TAB_LABEL[value]}
          </button>
        ))}
      </div>

      {tab === 'chat' ? props.chat : null}

      {/* Satu wadah gulir untuk ketiga papan: isinya tidak boleh mendorong panel lain. */}
      <div
        className={`column-scroll min-h-0 flex-1 overflow-y-auto ${tab === 'chat' ? 'hidden' : ''}`}
      >
        {tab === 'live' ? (
          props.live.length === 0 ? (
            <p className="note px-3.5 py-4">Belum ada hadiah di sesi ini.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 px-3.5 py-3">
              {props.live.map((entry) => (
                <li
                  className="flex items-center gap-2.5"
                  data-synthetic={String(entry.synthetic)}
                  data-testid={`gifter-${entry.username}`}
                  key={entry.username}
                >
                  <Avatar initials={entry.initials} synthetic={entry.synthetic} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-signal">{entry.username}</span>
                    <span className="note block truncate">
                      {`${entry.lastGiftName} ×${entry.lastGiftCount}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-data text-xs font-bold text-signal">
                      {coins(entry.coins)}
                    </span>
                    <span className="note block">{sinceLabel(entry.lastGiftAtMs, props.nowMs)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'top' ? (
          props.top.length === 0 ? (
            <p className="note px-3.5 py-4">
              Belum ada papan sepanjang masa — ia terisi saat sebuah match selesai.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 px-3.5 py-3">
              {props.top.map((player) => (
                <li
                  className="flex items-center gap-2.5"
                  key={`${player.platform}:${player.username}`}
                >
                  <Avatar initials={player.username.slice(0, 2).toUpperCase()} synthetic={false} />
                  <span className="min-w-0 flex-1 truncate text-xs text-signal">
                    {player.username}
                  </span>
                  <span className="font-data text-xs font-bold text-signal">
                    {coins(player.giftCoins)}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'stats' ? (
          stats.empty && props.killers.length === 0 ? (
            <p className="note px-3.5 py-4">
              Belum ada statistik — papan ini terisi saat sebuah match selesai.
            </p>
          ) : (
            <div className="flex flex-col gap-4 px-3.5 py-3">
              {stats.winRate === null ? null : (
                <div className="flex flex-col gap-1.5">
                  <span className="note">{`Win rate · ${stats.winRate.label}`}</span>
                  <div className="flex items-center justify-between gap-2 text-xs text-signal">
                    <span className="truncate">{props.sideNames.a}</span>
                    <span className="font-data font-bold">{`${stats.winRate.a}%`}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-signal">
                    <span className="truncate">{props.sideNames.b}</span>
                    <span className="font-data font-bold">{`${stats.winRate.b}%`}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="note">Seri</span>
                    <span className="note font-data">{stats.winRate.drawCount}</span>
                  </div>
                </div>
              )}

              {stats.rows.length === 0 ? null : (
                <div className="flex flex-col gap-1.5">
                  <span className="note">Riwayat</span>
                  <ul className="flex flex-col gap-1.5">
                    {stats.rows.map((row) => (
                      <li
                        className="flex items-center gap-2"
                        data-testid={`match-${row.id}`}
                        key={row.id}
                      >
                        <span
                          className={`min-w-0 flex-1 truncate text-xs ${
                            row.winner === 'a' ? 'text-signal' : 'text-dim'
                          }`}
                        >
                          {row.nameA}
                        </span>
                        <span className="font-data text-xs font-bold text-signal">{row.score}</span>
                        <span
                          className={`min-w-0 flex-1 truncate text-right text-xs ${
                            row.winner === 'b' ? 'text-signal' : 'text-dim'
                          }`}
                        >
                          {row.nameB}
                        </span>
                        {/* Dua angka kecil dalam satu kolom: seberapa ramai, dan seberapa lama. */}
                        <span className="note w-[4.5rem] shrink-0 text-right font-data">
                          {`${row.fighters} · ${row.duration}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {props.killers.length === 0 ? null : (
                <div className="flex flex-col gap-1.5">
                  <span className="note">Pembunuh teratas</span>
                  <ul className="flex flex-col gap-1.5">
                    {props.killers.map((player, index) => (
                      <li
                        className="flex items-center gap-2.5"
                        key={`${player.platform}:${player.username}`}
                      >
                        <span className="note w-4 shrink-0 text-right font-data">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-signal">
                          {player.username}
                        </span>
                        <span className="font-data text-xs font-bold text-signal">{player.kills}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        ) : null}
      </div>
    </section>
  )
}
