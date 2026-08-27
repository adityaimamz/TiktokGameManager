import type { ConnectionState, ConnectionStatus } from '@lga/shared'

/** Warna chip status. Dipakai bersama panel Simulator, yang punya keadaan setara. */
export type ChipTone = 'neutral' | 'standby' | 'live'

export interface ConnectionView {
  chip: { label: string; tone: ChipTone }
  connected: boolean
  /** Isi field username saat panel dalam keadaan terputus. */
  username: string
  /** Baris data yang tampil saat tersambung. */
  fields: { label: string; value: string }[]
  /** Label tombol utama saat terputus. */
  connectLabel: string
  /** Server sedang menyambung: tombol dimatikan supaya tidak ada dua permintaan. */
  busy: boolean
  note: string | null
  error: string | null
}

const CHIP_LABEL: Record<Exclude<ConnectionState, 'reconnecting'>, string> = {
  idle: 'Terputus',
  connecting: 'Menyambung',
  connected: 'Tersambung',
  failed: 'Gagal',
}

export function connectionView(status: ConnectionStatus, typed: string | null): ConnectionView {
  const busy = status.state === 'connecting' || status.state === 'reconnecting'
  const connected = status.state === 'connected'

  return {
    chip: {
      label:
        status.state === 'reconnecting'
          ? `Menyambung ulang (${status.attempt})`
          : CHIP_LABEL[status.state],
      tone: connected ? 'live' : busy ? 'standby' : 'neutral',
    },
    connected,
    // Selama creator belum mengetik apa pun, field mengikuti apa yang server laporkan —
    // sehingga reload halaman saat koneksi hidup tidak menampilkan field kosong.
    username: typed ?? status.username ?? '',
    fields: [
      { label: 'Akun', value: status.username === null ? '—' : `@${status.username}` },
      { label: 'Room ID', value: status.roomId ?? '—' },
    ],
    connectLabel: status.state === 'failed' ? 'Coba lagi' : 'Sambungkan',
    busy,
    note: connected || busy ? null : 'Belum tersambung. Masukkan username untuk mulai membaca chat.',
    error: status.error,
  }
}
