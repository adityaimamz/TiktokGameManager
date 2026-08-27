import type { ConnectionStatus } from '@lga/shared'

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
