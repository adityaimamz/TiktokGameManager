import type { ConnectionStatus } from '@lga/shared'
import { formatClock } from './format.js'

/**
 * Tiga kenyataan yang dibedakan tally rail di tepi atas layar.
 *
 * Dipisahkan dari `ConnectionStatus` karena "sedang siaran" bukan properti koneksi: gladi
 * dengan simulator adalah keadaan ketiga yang creator harus bisa bedakan dari sekilas.
 */
export type BroadcastState = 'idle' | 'rehearsal' | 'live'

export function broadcastState(
  connection: ConnectionStatus,
  simulatorRunning: boolean,
): BroadcastState {
  // Penonton sungguhan menang atas simulator: begitu ada yang menonton, ini siaran.
  if (connection.state === 'connected') return 'live'
  return simulatorRunning ? 'rehearsal' : 'idle'
}

export const BROADCAST_WORD: Record<BroadcastState, string> = {
  idle: 'Diam',
  rehearsal: 'Gladi',
  live: 'Siaran',
}

/**
 * Sudah berapa lama siaran ini berjalan, atau `null` bila belum pernah tersambung.
 *
 * `formatClock` yang SAMA dengan yang melayani baris riwayat match — durasi hanya boleh punya
 * satu bentuk cetak. Dijepit di nol karena `connectedAtMs` datang dari jam SERVER sementara
 * `nowMs` dari jam browser: keduanya bisa selisih beberapa detik, dan "-0:03" adalah
 * satu-satunya hal yang lebih buruk daripada tidak menampilkan apa-apa.
 */
export function liveDuration(connection: ConnectionStatus, nowMs: number): string | null {
  if (connection.connectedAtMs === null) return null
  return formatClock(Math.max(0, nowMs - connection.connectedAtMs))
}
