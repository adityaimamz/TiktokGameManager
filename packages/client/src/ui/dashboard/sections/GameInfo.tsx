import type { ReactElement } from 'react'
import type { SnapshotView } from '@lga/shared'
import type { BattleArenaConfig } from '../../../games/battle-arena/config/index.js'
import { Icon } from '../icons.js'
import { gameInfoView } from './game-info-view.js'
import type { SideReadout } from './game-info-view.js'

export interface GameInfoProps {
  view: SnapshotView | null
  config: BattleArenaConfig
  onReset: () => void
}

/** Warna sisi datang dari config creator, jadi ia inline style dan bukan kelas Tailwind. */
function Readout({ side, align }: { side: SideReadout; align: 'left' | 'right' }): ReactElement {
  return (
    <div className={align === 'right' ? 'min-w-0 text-right' : 'min-w-0'}>
      <span
        className="mb-px block truncate font-ui text-[11px] font-semibold"
        style={{ color: side.color }}
      >
        {side.name}
      </span>
      <span
        className="readout-value block"
        style={{ color: '#EAF4FF', textShadow: `0 0 26px ${side.color}` }}
      >
        {side.score}
      </span>
    </div>
  )
}

export function GameInfo(props: GameInfoProps): ReactElement {
  const view = gameInfoView(props.view, props.config)

  return (
    <section className="panel relative overflow-hidden">
      {/* Dua kabut kutub di sudut atas kartu: sumber cahaya yang membuat skor bersinar. */}
      <div
        className="pointer-events-none absolute -left-8 -top-10 h-[150px] w-[150px]"
        style={{ background: `radial-gradient(circle, ${props.config.sides.a.color}38, transparent 70%)` }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-[150px] w-[150px]"
        style={{ background: `radial-gradient(circle, ${props.config.sides.b.color}33, transparent 70%)` }}
        aria-hidden="true"
      />

      <div className="relative mb-3 flex items-center justify-between gap-2">
        <h2 className="panel-title">
          <Icon name="trophy" className="panel-icon text-[#C9A6FF]" />
          Skor battle
        </h2>
        <span className="chip">Ronde {view.roundLabel}</span>
      </div>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <Readout side={view.a} align="left" />
        <span className="pb-1 font-data text-xs font-bold tracking-[0.1em] text-faint">VS</span>
        <Readout side={view.b} align="right" />
      </div>

      {/*
        * Bar DOMINASI, bukan bar skor: lebarnya pangsa total HP yang masih berdiri, jadi ia
        * bergerak setiap tick dan menjawab "siapa yang sedang menguasai lapangan".
        */}
      <div className="relative mt-3 flex h-[9px] overflow-hidden rounded-full border border-white/[0.09] bg-ink/80">
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{
            width: `${view.dominanceA}%`,
            background: view.a.color,
            boxShadow: `0 0 16px ${view.a.color}`,
          }}
        />
        <div
          className="h-full flex-1"
          style={{ background: view.b.color, boxShadow: `0 0 16px ${view.b.color}` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-ui text-[9.5px] font-semibold tracking-[0.1em] text-muted">
        <span>{view.dominanceA}% dominasi</span>
        <span>{100 - view.dominanceA}%</span>
      </div>

      <div className="relative mt-3 flex items-center gap-2">
        <div className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-white/[0.08] bg-ink/55 py-2">
          <Icon name="users" size={12} className="text-muted" />
          <span className="font-data text-[12.5px] font-bold text-signal">{view.fighterTotal}</span>
          <span className="font-ui text-[11px] font-semibold text-muted">Fighter</span>
        </div>
        <button
          className="btn-danger flex flex-none items-center gap-1.5 rounded-[9px] border px-3 py-[9px] text-[11px]"
          type="button"
          onClick={props.onReset}
        >
          <Icon name="reset" size={12} strokeWidth={2.3} />
          Reset
        </button>
      </div>

      <dl className="relative m-0 mt-2.5">
        {view.fields.map((field) => (
          <div className="field" key={field.label}>
            <dt className="text-muted">{field.label}</dt>
            <dd className="m-0 font-data tabular-nums">{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
