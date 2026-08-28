import type { ReactElement } from 'react'
import { Icon } from '../icons.js'
import { simulatorView } from './simulator-view.js'

export interface LiveSimulatorProps {
  running: boolean
  onToggle: () => void
}

export function LiveSimulator(props: LiveSimulatorProps): ReactElement {
  const view = simulatorView(props.running)

  return (
    <section className="panel">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="panel-title">
          <Icon name="bolt" className="panel-icon text-[#FFD68A]" />
          Simulator testing
        </h2>
        {/* Satu kata mono sudah cukup — statusnya juga terbaca dari tombolnya sendiri. */}
        <span
          className={`font-ui text-[11px] font-semibold ${
            view.running ? 'text-standby' : 'text-muted'
          }`}
        >
          {view.chip.label}
        </span>
      </div>

      <button
        className="btn-rehearse flex w-full items-center justify-center gap-2 rounded-[10px] border py-2.5 text-xs"
        type="button"
        onClick={props.onToggle}
      >
        <Icon name={view.running ? 'stop' : 'play'} size={13} filled={!view.running} />
        {view.toggleLabel}
      </button>

      <p className="note mt-2.5">
        Penonton sintetis, mengisi arena sampai batas fighter per sisi dan berjalan looping.
        Tidak masuk statistik penonton asli.
      </p>
    </section>
  )
}
