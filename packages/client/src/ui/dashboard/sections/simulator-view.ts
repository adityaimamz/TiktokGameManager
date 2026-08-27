import type { ChipTone } from './connection-view.js'

export interface SimulatorView {
  chip: { label: string; tone: ChipTone }
  toggleLabel: string
  running: boolean
}

/**
 * Tidak ada lagi preset 10/50/100/500.
 *
 * Gladi berjalan looping: simulator mengisi arena sampai `gameplay.maxFightersPerSide`
 * dan match yang selesai langsung memulai match berikutnya. Yang membatasi jumlah blob
 * adalah setelan permainan yang sama dengan siaran sungguhan, bukan sebuah tombol
 * tersendiri yang bisa berbeda darinya.
 */
export function simulatorView(running: boolean): SimulatorView {
  return {
    chip: { label: running ? 'Berjalan' : 'Mati', tone: running ? 'standby' : 'neutral' },
    toggleLabel: running ? 'Hentikan gladi' : 'Mulai gladi',
    running,
  }
}
