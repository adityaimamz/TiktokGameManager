import { useEffect, useId, useState } from 'react'
import type { ReactElement } from 'react'
import {
  validateNumericInput,
  validateNumericRange,
} from '../../../games/battle-arena/config/index.js'
import type { NumericField, NumericRange } from '../../../games/battle-arena/config/index.js'

export function Toggle(props: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}): ReactElement {
  return (
    <label className="flex items-start justify-between gap-3 py-2">
      <span className="flex-1">
        <span className="block text-xs leading-snug text-signal">{props.label}</span>
        {props.hint === undefined ? null : <span className="note block">{props.hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        onClick={() => props.onChange(!props.checked)}
        className={`mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${
          props.checked ? 'border-tally/60 bg-tally/80' : 'border-edge bg-ink'
        }`}
      >
        <span
          className={`block h-3.5 w-3.5 rounded-full bg-signal transition-transform ${
            props.checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </label>
  )
}

/**
 * Draft string dipegang sendiri, bukan diturunkan dari prop.
 *
 * Tanpa itu, mengetik "3" dalam perjalanan menuju "30" akan ditolak di karakter pertama pada
 * field yang batas bawahnya di atas 3. Validasi baru berjalan saat nilai ditinggalkan.
 */
export function NumberField(props: {
  label: string
  value: number
  /**
   * Salah satu harus ada. `field` membaca rentang dari NUMERIC_RANGES; `range` membawanya
   * sendiri, untuk angka yang hidup di dalam rule dan karena itu sengaja tidak ada di tabel
   * (lihat catatan di schema.ts).
   */
  field?: NumericField
  range?: { label: string; range: NumericRange }
  onCommit: (value: number) => void
}): ReactElement {
  const id = useId()
  const [draft, setDraft] = useState(String(props.value))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(String(props.value))
    setError(null)
  }, [props.value])

  const commit = (): void => {
    const result =
      props.range === undefined
        ? validateNumericInput(props.field as NumericField, draft)
        : validateNumericRange(props.range.label, props.range.range, draft)
    if (!result.ok) {
      // Req 16 AC6: tolak, pertahankan nilai lama, sebutkan rentangnya.
      setError(result.error)
      setDraft(String(props.value))
      return
    }
    setError(null)
    if (result.value !== props.value) props.onCommit(result.value)
  }

  return (
    <div className="py-1.5">
      <label className="readout-label" htmlFor={id}>
        {props.label}
      </label>
      <input
        className="input"
        id={id}
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      {error === null ? null : (
        <p className="note mt-1 text-tally" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextField(props: {
  label: string
  value: string
  maxLength: number
  onChange: (value: string) => void
  placeholder?: string
}): ReactElement {
  const id = useId()
  return (
    <div className="py-1.5">
      <label className="readout-label" htmlFor={id}>
        {props.label}
      </label>
      <input
        className="input"
        id={id}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  )
}

export function SelectField<T extends string | number>(props: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}): ReactElement {
  const id = useId()
  const numeric = typeof props.value === 'number'
  return (
    <div className="py-1.5">
      <label className="readout-label" htmlFor={id}>
        {props.label}
      </label>
      <select
        className="input"
        id={id}
        value={String(props.value)}
        onChange={(event) =>
          props.onChange((numeric ? Number(event.target.value) : event.target.value) as T)
        }
      >
        {props.options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ColorField(props: {
  label: string
  value: string
  onChange: (value: string) => void
}): ReactElement {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <label className="readout-label mb-0" htmlFor={id}>
        {props.label}
      </label>
      <input
        className="h-7 w-10 cursor-pointer rounded border border-edge bg-transparent"
        id={id}
        type="color"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  )
}
