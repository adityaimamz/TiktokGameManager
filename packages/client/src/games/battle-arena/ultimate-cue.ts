import type { MediaCue } from '../../platform/media/cues.js'
import type { NukeType, SoundConfig } from './config/index.js'
import { ULTIMATE_SOUND } from './effects.js'
import type { UltimateSoundPhase } from './effects.js'

/**
 * Satu fase bunyi ultimate sebagai `MediaCue`, atau null bila knopnya mati.
 *
 * Fungsi MURNI, dan itu keseluruhan alasannya ada. Plan 9b menaruh keputusan ini di dalam
 * closure di `createRig` — tidak bisa dipanggil dari node, jadi tidak ada satu test pun yang
 * bisa membuktikannya bekerja, dan kegagalannya baru ketahuan saat creator mencobanya.
 *
 * `text` kosong dengan sengaja: `bannerFromCue` mengembalikan null untuk cue bunyi tanpa
 * tulisan, jadi ini murni bunyi dan tidak menggambar apa pun di overlay.
 */
export function ultimateCue(
  nukeType: NukeType,
  phase: UltimateSoundPhase,
  setting: SoundConfig,
  id: string,
): MediaCue | null {
  if (!setting.enabled) return null
  return {
    id,
    kind: 'sound',
    url: ULTIMATE_SOUND[nukeType][phase].url,
    // Dijepit di sini, bukan dipercaya dari config: `HTMLMediaElement.volume` MELEMPAR
    // IndexSizeError di luar 0–1, dan lemparannya akan memutus handler event engine.
    volume: Math.max(0, Math.min(1, setting.volume)),
    text: '',
    avatarUrl: null,
  }
}
