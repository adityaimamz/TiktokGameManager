import type { ReactElement, ReactNode } from 'react'

export interface AccordionProps {
  title: string
  /** Ringkasan isi yang tetap terbaca saat tertutup — "3 aktif", "7 grup". */
  count?: string
  /** Dikendalikan hanya bila diberikan; tanpa keduanya <details> mengurus dirinya sendiri. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

/**
 * Section yang bisa dilipat, di atas <details> native.
 *
 * Nol kode accordion, nol state, dan keyboard serta Ctrl+F sudah bekerja sejak baris pertama.
 * Yang ditambahkan hanya chevron dan penghitung; keduanya murni CSS di `dashboard.css`.
 */
export function Accordion(props: AccordionProps): ReactElement {
  return (
    <details
      className="acc"
      open={props.open}
      onToggle={(event) =>
        props.onOpenChange?.((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary className="panel-title panel-title-sub">
        <span className="chev" aria-hidden="true">
          ›
        </span>
        {props.title}
        {props.count === undefined ? null : <span className="acc-count">{props.count}</span>}
      </summary>
      <div className="acc-body">{props.children}</div>
    </details>
  )
}
