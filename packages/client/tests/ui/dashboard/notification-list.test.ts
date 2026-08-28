import { describe, expect, it } from 'vitest'
import { idleStatus } from '@lga/shared'
import type { ConnectionStatus } from '@lga/shared'
import {
  NOTIFICATION_MAX,
  badgeLabel,
  connectionNotice,
  markAllRead,
  matchNotice,
  pushNotification,
  timeLabel,
  unreadCount,
} from '../../../src/ui/dashboard/notification-list.js'
import type { NotificationEntry } from '../../../src/ui/dashboard/notification-list.js'

const entry = (id: string, read = false): NotificationEntry => ({
  id,
  kind: 'alert',
  text: `pesan ${id}`,
  atMs: 1000,
  read,
})

const status = (patch: Partial<ConnectionStatus> = {}): ConnectionStatus => ({
  ...idleStatus(),
  ...patch,
})

describe('pushNotification', () => {
  it('menaruh yang terbaru di depan', () => {
    const list = pushNotification(pushNotification([], entry('a')), entry('b'))

    expect(list.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('membuang yang tertua di entri ke-31', () => {
    let list: NotificationEntry[] = []
    for (let index = 0; index <= NOTIFICATION_MAX; index += 1) {
      list = pushNotification(list, entry(`n${index}`))
    }

    expect(list).toHaveLength(NOTIFICATION_MAX)
    expect(list.some((item) => item.id === 'n0')).toBe(false)
  })
})

describe('unreadCount dan markAllRead', () => {
  it('menghitung yang belum dibaca saja', () => {
    expect(unreadCount([entry('a'), entry('b', true)])).toBe(1)
  })

  it('menandai semuanya terbaca', () => {
    expect(markAllRead([entry('a'), entry('b')]).every((item) => item.read)).toBe(true)
  })

  it('mengembalikan daftar YANG SAMA saat tidak ada yang belum dibaca', () => {
    // Membuka dropdown dua kali tidak boleh membuat React merender ulang seluruh top bar.
    const list = [entry('a', true)]

    expect(markAllRead(list)).toBe(list)
  })
})

describe('badgeLabel', () => {
  it('diam di nol, menghitung sampai sembilan, lalu berhenti di 9+', () => {
    expect(badgeLabel(0)).toBe('')
    expect(badgeLabel(3)).toBe('3')
    expect(badgeLabel(47)).toBe('9+')
  })
})

describe('timeLabel', () => {
  it('mencetak jam dan menit lokal berimbuhan nol', () => {
    expect(timeLabel(new Date(2026, 7, 20, 9, 5).getTime())).toBe('09:05')
  })
})

describe('connectionNotice', () => {
  it('menyebut akun yang tersambung', () => {
    expect(connectionNotice('connecting', status({ state: 'connected', username: 'kreator' }))).toBe(
      'Terhubung ke @kreator',
    )
  })

  it('meneruskan alasan kegagalan apa adanya', () => {
    expect(
      connectionNotice('connecting', status({ state: 'failed', error: 'room tidak ada' })),
    ).toBe('room tidak ada')
  })

  it('menyebut percobaan sambung ulang', () => {
    expect(connectionNotice('connected', status({ state: 'reconnecting', attempt: 2 }))).toBe(
      'Menyambung ulang (percobaan 2)',
    )
  })

  it('diam saat state tidak berubah, dan saat baru mulai menyambung', () => {
    expect(connectionNotice('connected', status({ state: 'connected' }))).toBeNull()
    expect(connectionNotice('idle', status({ state: 'connecting' }))).toBeNull()
  })

  it('menyebut putusnya sambungan hanya bila tadinya memang tersambung', () => {
    expect(connectionNotice('connected', status({ state: 'idle' }))).toBe('Koneksi diputus')
    expect(connectionNotice('connecting', status({ state: 'idle' }))).toBeNull()
  })
})

describe('matchNotice', () => {
  it('menyebut ronde dan match yang usai, dan diam untuk sisanya', () => {
    expect(matchNotice('victory')).toBe('Ronde selesai')
    expect(matchNotice('result')).toBe('Match selesai')
    expect(matchNotice('battle')).toBeNull()
  })
})
