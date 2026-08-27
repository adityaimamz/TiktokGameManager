import { useState } from 'react'
import type { ReactElement } from 'react'
import { Icon } from './icons.js'
import { badgeLabel, timeLabel, unreadCount } from './notification-list.js'
import type { NotificationEntry } from './notification-list.js'

export interface NotificationsProps {
  items: readonly NotificationEntry[]
  /** Dipanggil saat dropdown DIBUKA — membukanya menandai semuanya terbaca. */
  onOpen: () => void
}

/**
 * Lonceng Req 38 AC2, satu-satunya bagian top bar yang belum berdiri sejak Plan 4b.
 *
 * Isinya kejadian yang sudah lewat di dashboard dan hilang begitu saja: alert yang menyala,
 * koneksi yang berubah, unggahan yang gagal, pertandingan yang usai. Semuanya di memori —
 * kejadian yang lewat lima menit lalu tidak layak dihidupkan kembali saat tab dimuat ulang.
 */
export function Notifications(props: NotificationsProps): ReactElement {
  const [open, setOpen] = useState(false)
  const badge = badgeLabel(unreadCount(props.items))

  const toggle = (): void => {
    setOpen((was) => {
      if (!was) props.onOpen()
      return !was
    })
  }

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label="Notifikasi"
        className="btn-icon relative"
        onClick={toggle}
        type="button"
      >
        <Icon name="bell" size={16} strokeWidth={2} />
        {badge === '' ? null : (
          <span
            className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-tally px-1 text-center font-data text-[9px] font-bold leading-4 text-ink"
            data-testid="notif-badge"
          >
            {badge}
          </span>
        )}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-11 z-30 max-h-[320px] w-[280px] overflow-y-auto rounded-[10px] border border-white/[0.12] bg-ink/95 p-2"
          role="status"
        >
          {props.items.length === 0 ? (
            <p className="note px-1.5 py-2" data-testid="notif-empty">
              Belum ada yang perlu diketahui.
            </p>
          ) : (
            <ul className="flex flex-col">
              {props.items.map((item) => (
                <li className="border-t border-edge/60 px-1.5 py-1.5 first:border-t-0" key={item.id}>
                  <span className="block text-xs leading-snug text-signal">{item.text}</span>
                  <span className="note">{timeLabel(item.atMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
