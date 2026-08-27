import { useState } from 'react'
import type { ReactElement } from 'react'
import type { ConnectionStatus } from '@lga/shared'
import { Icon } from '../icons.js'
import { Chip } from './Chip.js'
import { connectionView } from './connection-view.js'

export interface ConnectionProps {
  status: ConnectionStatus
  onConnect: (username: string) => void
  onDisconnect: () => void
}

export function Connection(props: ConnectionProps): ReactElement {
  const [typed, setTyped] = useState<string | null>(null)
  const view = connectionView(props.status, typed)

  const submit = (): void => {
    if (view.connected) {
      props.onDisconnect()
      return
    }
    const trimmed = view.username.trim()
    if (trimmed !== '') props.onConnect(trimmed)
  }

  return (
    <section className="panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="panel-title">
          <Icon name="note" className="panel-icon text-[#7FD8FF]" />
          Koneksi TikTok
        </h2>
        <Chip label={view.chip.label} tone={view.chip.tone} />
      </div>

      {/* Field dan tombolnya sebaris: satu gerakan, bukan dua tempat untuk melirik. */}
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[9px] border border-white/[0.11] bg-ink/70 px-2.5">
          <span className="select-none text-[13px] text-faint">@</span>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent py-[9px] font-ui text-[13px] text-signal outline-none placeholder:text-faint"
            id="tiktok-username"
            aria-label="Username TikTok"
            placeholder="username"
            value={view.username}
            disabled={view.busy || view.connected}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
        </div>
        <button
          className={`shrink-0 rounded-[9px] border px-3.5 ${view.connected ? 'btn-danger' : 'btn-primary'}`}
          type="button"
          disabled={view.busy}
          onClick={submit}
        >
          {view.connected ? 'Putuskan' : view.connectLabel}
        </button>
      </div>

      {view.connected ? (
        <dl className="m-0 mt-2.5">
          {view.fields.map((field) => (
            <div className="field" key={field.label}>
              <dt className="text-muted">{field.label}</dt>
              <dd className="m-0 font-data tabular-nums">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : view.note === null ? null : (
        <p className="note mt-2.5">{view.note}</p>
      )}

      {view.error === null ? null : <p className="mt-2.5 text-[11px] text-tally">{view.error}</p>}
    </section>
  )
}
