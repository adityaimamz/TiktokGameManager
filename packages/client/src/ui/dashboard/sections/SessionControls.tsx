import { useState } from 'react'
import type { ReactElement } from 'react'

export interface SessionControlsProps {
  paused: boolean
  onTogglePause: () => void
  onRestart: () => void
  /** Menyuntik komentar sintetis ke engine — konektor 4a read-only, jadi bukan ke TikTok. */
  onSend: (text: string) => void
  onEndSession: () => void
}

export function SessionControls(props: SessionControlsProps): ReactElement {
  const [text, setText] = useState('')

  const send = (): void => {
    const trimmed = text.trim()
    if (trimmed === '') return
    props.onSend(trimmed)
    setText('')
  }

  return (
    <section className="panel">
      <h2 className="panel-title panel-title-sub mb-2.5">Kendali sesi</h2>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button className="btn btn-wide" type="button" onClick={props.onTogglePause}>
            {props.paused ? 'Lanjutkan' : 'Jeda permainan'}
          </button>
          <button className="btn btn-wide" type="button" onClick={props.onRestart}>
            Mulai ulang
          </button>
        </div>
        <input
          className="input"
          aria-label="Kirim pesan uji"
          placeholder="Kirim pesan sebagai penonton uji"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send()
          }}
        />
        {/* Aksi yang mengakhiri semuanya adalah yang paling redup di kolom: ia hanya
            memerah saat jari sudah berada di atasnya. */}
        <button
          className="btn btn-wide btn-quiet btn-danger"
          type="button"
          onClick={props.onEndSession}
        >
          Akhiri sesi
        </button>
      </div>
    </section>
  )
}
