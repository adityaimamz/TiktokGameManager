import type { ConnectionStatus } from '@lga/shared'
import { formatCount, formatDuration } from '../format.js'

export interface StatsInput {
  status: ConnectionStatus
  /** Jumlah komentar sejak dashboard dibuka, dihitung di ChatEngine subscriber. */
  comments: number
  joinedFighters: number
  sessionMs: number
}

export interface StatsView {
  viewers: string
  comments: string
  /** Angka diredupkan selama belum ada penonton sungguhan — nol yang jujur, bukan nol yang sepi. */
  dim: boolean
  summary: string
  /** Satu kata untuk baris STATUS SESI. */
  sessionLabel: string
}

export function statsView(input: StatsInput): StatsView {
  return {
    viewers: formatCount(input.status.viewerCount),
    comments: formatCount(input.comments),
    dim: input.status.state !== 'connected',
    sessionLabel: input.status.state === 'connected' ? 'Berjalan' : 'Jeda',
    summary: `Sesi berjalan ${formatDuration(input.sessionMs)} · ${formatCount(input.joinedFighters)} fighter bergabung`,
  }
}
