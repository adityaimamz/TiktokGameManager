import type { ReactElement } from 'react'
import { Icon } from '../icons.js'
import { statsView } from './stats-view.js'
import type { StatsInput } from './stats-view.js'

export function LiveStats(props: StatsInput): ReactElement {
  const view = statsView(props)
  const glow = view.dim ? 'none' : undefined

  return (
    <section className="panel">
      <h2 className="panel-title mb-3">
        <Icon name="chart" className="panel-icon text-[#9BFFC9]" />
        Statistik langsung
      </h2>

      {/*
       * Dua angka besar berdampingan dalam kotak berwarna kutubnya masing-masing: penonton
       * milik biru, komentar milik magenta. Itu yang membuat keduanya terbaca sekilas tanpa
       * membaca labelnya lebih dulu.
       */}
      <div className="grid grid-cols-2 gap-2">
        <div className="stat-tile border-[#5AA0FF]/20 bg-[#3C82FF]/[0.09]">
          <span className="readout-label">Penonton</span>
          <span
            className="readout-sm text-[#9CCBFF]"
            style={{ textShadow: glow ?? '0 0 18px rgba(90,160,255,.55)' }}
          >
            {view.viewers}
          </span>
        </div>
        <div className="stat-tile border-[#FF5A96]/20 bg-[#FF2D78]/[0.08]">
          <span className="readout-label">Komentar</span>
          <span
            className="readout-sm text-[#FFA6C2]"
            style={{ textShadow: glow ?? '0 0 18px rgba(255,90,150,.5)' }}
          >
            {view.comments}
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[10px] border border-white/[0.08] bg-ink/55 px-[11px] py-2">
        <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Status sesi
        </span>
        <span
          className={`flex items-center gap-1.5 font-data text-[11px] font-semibold uppercase tracking-[0.1em] ${
            view.dim ? 'text-standby' : 'text-ok'
          }`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-current"
            style={{ boxShadow: '0 0 9px currentcolor', animation: 'ia-blip 1.6s ease-in-out infinite' }}
          />
          {view.sessionLabel}
        </span>
      </div>

      <p className="mt-2 text-[11px] tabular-nums text-muted">{view.summary}</p>
    </section>
  )
}
