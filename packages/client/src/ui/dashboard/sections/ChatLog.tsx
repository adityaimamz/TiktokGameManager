import type { ReactElement } from 'react'
import type { ChatLogEntry } from './chat-log.js'

export interface ChatLogProps {
  entries: readonly ChatLogEntry[]
  rate: string
  /** Nilai 0–1 per ember, dari `chatRateBars`. Kosong berarti belum ada apa-apa. */
  bars: readonly number[]
  /** Pintasan "coba gladi bersih" di layar kosong; sama persis dengan tombol di Simulator. */
  onRehearse?: () => void
}

/**
 * Layar kosong: satu benda yang jelas sedang MENUNGGU, bukan tiga baris kerangka.
 *
 * Dua titik mengorbit gelembung chat. Kolom yang kosong karena belum ada yang bicara
 * terlihat berbeda dari kolom yang kosong karena rusak.
 */
function EmptyState({ onRehearse }: { onRehearse?: () => void }): ReactElement {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-3.5 py-6 text-center">
      <div
        className="relative grid h-[110px] w-[110px] flex-none place-items-center"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle,rgba(90,140,255,.22),transparent 68%)' }}
        />
        <div
          className="absolute inset-3.5 rounded-full border border-dashed border-[#96B4FF]/30"
          style={{ animation: 'ia-spin 22s linear infinite' }}
        />
        <div className="absolute inset-0" style={{ animation: 'ia-spin 9s linear infinite' }}>
          <span
            className="absolute left-1/2 top-1/2 -m-[3px] h-1.5 w-1.5 rounded-full bg-[#5FB2FF]"
            style={{ boxShadow: '0 0 12px #5FB2FF', animation: 'ia-orbit 9s linear infinite' }}
          />
        </div>
        <div
          className="absolute inset-0"
          style={{ animation: 'ia-spin 13s linear infinite reverse' }}
        >
          <span
            className="absolute left-1/2 top-1/2 -m-[2.5px] h-[5px] w-[5px] rounded-full bg-[#FF5B95]"
            style={{ boxShadow: '0 0 12px #FF5B95', animation: 'ia-orbit 13s linear infinite' }}
          />
        </div>
        <div
          className="relative grid h-11 w-14 place-items-center rounded-[13px] border border-[#B4C8FF]/30"
          style={{
            background: 'linear-gradient(160deg,rgba(90,150,255,.28),rgba(255,70,140,.24))',
            boxShadow: '0 0 26px rgba(110,120,255,.35), inset 0 1px 0 rgba(255,255,255,.2)',
          }}
        >
          <div className="flex gap-[5px]">
            {[0, 0.2, 0.4].map((delay) => (
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#DCE6FF]/85"
                key={delay}
                style={{ animation: `ia-blip 1.4s ease-in-out ${delay}s infinite` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="m-0 mb-1.5 font-data text-[13px] font-semibold uppercase tracking-[0.1em] text-label">
          Menunggu komentar
        </p>
        <p className="note m-0 mx-auto max-w-[220px]">
          Sambungkan akun TikTok, lalu komentar penonton muncul di sini secara langsung.
        </p>
      </div>

      {onRehearse === undefined ? null : (
        <button className="btn font-data uppercase tracking-[0.12em]" type="button" onClick={onRehearse}>
          Coba gladi bersih
        </button>
      )}
    </div>
  )
}

export function ChatLog(props: ChatLogProps): ReactElement {
  const receiving = props.entries.length > 0

  return (
    <>
      {/*
       * Kepala menempel saat kolom digulir: laju chat tidak boleh hilang dari pandangan.
       *
       * Judulnya sudah dibawa tab kartu ini, jadi yang tersisa satu baris: bentuk satu menit
       * terakhir, angkanya, dan status. Angka bilang seramai apa; lerengnya bilang sedang naik
       * atau sudah lewat — itu yang menentukan kapan memancing chat.
       */}
      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 backdrop-blur">
        <div className="flex h-4 flex-1 items-end gap-px" aria-hidden="true">
          {props.bars.map((value, index) => (
            <div
              className="flex-1 rounded-sm"
              // eslint-disable-next-line react/no-array-index-key -- ember adalah posisi waktu, bukan identitas
              key={index}
              style={{
                height: `${2 + value * 14}px`,
                background: value === 0 ? 'rgba(255,255,255,.09)' : '#5FB2FF',
                boxShadow: value === 0 ? 'none' : '0 0 8px rgba(95,178,255,.6)',
              }}
            />
          ))}
        </div>
        <span className="font-data text-[10px] tabular-nums tracking-[0.1em] text-muted">
          {props.rate}
        </span>
        <span className={`chip ${receiving ? 'chip-live' : ''}`.trim()}>
          <span className="chip-dot" style={{ animation: 'ia-blip 1.5s ease-in-out infinite' }} />
          {receiving ? 'Menerima' : 'Idle'}
        </span>
      </div>

      {/*
       * Kepala di atas, isinya menggulir di bawahnya — SATU wadah gulir, dipakai layar kosong
       * maupun daftar komentar. Tanpa ini panel yang diperas `flex-1` di kolom chat membuang
       * apa pun yang tidak muat: kalimat ajakannya terpotong separuh dan tombol gladi
       * bersihnya hilang sama sekali, tepat di layar yang paling membutuhkan keduanya.
       */}
      <div className="column-scroll min-h-0 flex-1 overflow-y-auto">
        {props.entries.length === 0 ? (
          <EmptyState onRehearse={props.onRehearse} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-3 pl-3">
            {props.entries.map((entry) => (
              <li
                className={
                  // Entri simulator ditandai BENTUK, bukan sekadar warna: garis tepi kiri
                  // putus-putus = bukan penonton sungguhan.
                  `chat-row flex gap-[9px] rounded-[10px] border px-[9px] py-2 ${
                    entry.synthetic
                      ? 'border-l-2 border-dashed border-standby/50 bg-standby/[0.06]'
                      : 'border-white/[0.08] bg-white/[0.03]'
                  }`
                }
                key={entry.id}
                data-testid={`chat-item-${entry.id}`}
              >
                <span
                  className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-lg font-data text-[10.5px] font-bold ${
                    entry.synthetic ? 'text-standby' : 'text-[#DCE6FF]'
                  }`}
                  style={{
                    background: entry.synthetic
                      ? 'rgba(255,196,107,.14)'
                      : 'linear-gradient(145deg,#3F7BFF,#12245C)',
                  }}
                >
                  {entry.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="truncate text-[11px] font-semibold text-[#9CCBFF]">
                    {entry.username}
                  </span>
                  {entry.text === null ? (
                    <div className="text-[11px] italic text-muted">{entry.meta}</div>
                  ) : (
                    <div className="break-words text-[11.5px] leading-[1.45] text-dim">
                      {entry.text}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
