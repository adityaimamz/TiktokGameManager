import { useId, useState } from 'react'
import type { ReactElement } from 'react'
import {
  READER_MAX_CHARS_RANGE,
  READER_RATE_RANGE,
  READER_VOLUME_RANGE,
} from '../../../platform/speech/index.js'
import type { ReaderSettings } from '../../../platform/speech/index.js'
import type { SpeechVoiceOption } from '../../speech/voices.js'
import { Accordion } from './Accordion.js'
import { NumberField, SelectField, Toggle } from './Field.js'
import { VOICE_DEFAULT, addBlockedWord, readerStatus, voiceChoices } from './comment-reader-view.js'

export interface CommentReaderProps {
  reader: ReaderSettings
  voices: readonly SpeechVoiceOption[]
  onReader: (next: ReaderSettings) => void
}

/**
 * Comment Reader (roadmap Fase 3 §3), tetangga Alerts di STREAM SETTINGS.
 *
 * Panel ini tidak mengucapkan apa pun. Ia hanya menulis setelan; yang berbicara adalah adapter
 * di `ui/speech/voices.ts`, di tab dashboard — bukan di overlay, karena CEF milik OBS sering
 * tidak punya satu pun voice.
 */
export function CommentReader(props: CommentReaderProps): ReactElement {
  const wordId = useId()
  const [draft, setDraft] = useState('')

  const update = (patch: Partial<ReaderSettings>): void =>
    props.onReader({ ...props.reader, ...patch })

  const addWord = (): void => {
    update({ blockedWords: addBlockedWord(props.reader.blockedWords, draft) })
    setDraft('')
  }

  return (
    <Accordion
      title="COMMENT READER"
      count={readerStatus(props.reader.enabled, props.voices.length)}
    >
      <Toggle
        label="Bacakan komentar"
        hint="Dibacakan di tab ini, dan ikut tersiar lewat Desktop Audio."
        checked={props.reader.enabled}
        onChange={(enabled) => update({ enabled })}
      />

      {props.reader.enabled ? (
        <>
          {props.voices.length === 0 ? (
            <p className="note text-tally" data-testid="reader-no-voice" role="alert">
              Browser ini tidak punya satu pun voice, jadi reader tidak akan berbunyi. Pasang voice
              bahasa di setelan Windows, lalu muat ulang halaman.
            </p>
          ) : null}

          <SelectField
            label="Suara"
            value={props.reader.voiceUri ?? VOICE_DEFAULT}
            options={voiceChoices(props.voices, props.reader.voiceUri)}
            onChange={(value) => update({ voiceUri: value === VOICE_DEFAULT ? null : value })}
          />
          <NumberField
            label="Kecepatan"
            value={props.reader.rate}
            range={{ label: 'Kecepatan', range: READER_RATE_RANGE }}
            onCommit={(rate) => update({ rate })}
          />
          <NumberField
            label="Volume"
            value={props.reader.volume}
            range={{ label: 'Volume', range: READER_VOLUME_RANGE }}
            onCommit={(volume) => update({ volume })}
          />
          <NumberField
            label="Maks karakter"
            value={props.reader.maxChars}
            range={{ label: 'Maks karakter', range: READER_MAX_CHARS_RANGE }}
            onCommit={(maxChars) => update({ maxChars })}
          />

          <div className="py-1.5">
            <label className="readout-label" htmlFor={wordId}>
              Kata terlarang
            </label>
            <div className="flex items-center gap-2">
              <input
                className="input"
                id={wordId}
                placeholder="satu kata, lalu Tambah"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addWord()
                }}
              />
              <button
                aria-label="Tambah kata terlarang"
                className="btn shrink-0"
                onClick={addWord}
                type="button"
              >
                Tambah
              </button>
            </div>

            {/*
              * Satu kata cocok membuang SELURUH komentar, bukan menyensornya jadi bintang:
              * komentar bertabur bintang tetap terbaca oleh manusia yang mendengarnya.
              */}
            {props.reader.blockedWords.length === 0 ? (
              <p className="note mt-1">Belum ada. Semua komentar dibacakan apa adanya.</p>
            ) : (
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {props.reader.blockedWords.map((word) => (
                  <li
                    className="flex items-center gap-1 rounded border border-edge px-1.5 py-0.5"
                    key={word}
                  >
                    <span className="note">{word}</span>
                    <button
                      aria-label={`Hapus kata ${word}`}
                      className="panel-action"
                      onClick={() =>
                        update({
                          blockedWords: props.reader.blockedWords.filter((entry) => entry !== word),
                        })
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </Accordion>
  )
}
