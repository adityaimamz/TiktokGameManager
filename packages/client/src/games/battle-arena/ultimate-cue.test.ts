import { describe, expect, it } from 'vitest'
import { IMPACT_AT } from '@lga/shared'
import { NUKE_TYPES, defaultConfig } from './config/index.js'
import { ULTIMATE_SOUND } from './effects.js'
import { NUKE_TYPE_DURATION_SCALE } from './ultimate.js'
import { ultimateCue } from './ultimate-cue.js'

describe('ULTIMATE_SOUND', () => {
  it('memberi dua fase berkas untuk tiap varian, dan berkasnya tidak dipakai dua kali', () => {
    const urls = new Set<string>()
    for (const type of NUKE_TYPES) {
      for (const phase of ['launch', 'impact'] as const) {
        const sound = ULTIMATE_SOUND[type][phase]
        expect(sound.url).toMatch(/^\/sfx\/ultimate-[a-z-]+-(launch|impact)\.ogg$/)
        expect(sound.durationMs).toBeGreaterThan(0)
        urls.add(sound.url)
      }
    }
    expect(urls.size).toBe(NUKE_TYPES.length * 2)
  })

  /**
   * Berkas yang melampaui jendelanya menumpuk ke fase berikutnya — persis kegagalan
   * chainFreeze yang memicu plan ini: `coldsnap.wav` 2,65 detik berhenti tepat saat
   * kristalnya pecah, jadi momen paling keras di animasinya justru sunyi.
   *
   * Jendelanya DIHITUNG dari konstanta, bukan ditulis ulang sebagai angka, supaya menyetel
   * `durationMs` atau `NUKE_TYPE_DURATION_SCALE` ikut menggeser batas ini.
   */
  it('menjaga tiap bunyi launch muat di dalam fase launch varian itu', () => {
    const nuke = defaultConfig().gameplay.nuke
    for (const type of NUKE_TYPES) {
      const totalMs = nuke.durationMs * NUKE_TYPE_DURATION_SCALE[type]
      expect(ULTIMATE_SOUND[type].launch.durationMs).toBeLessThanOrEqual(totalMs * IMPACT_AT)
    }
  })
})

describe('ultimateCue', () => {
  const on = { enabled: true, volume: 0.8 }

  it('membuat cue bunyi tanpa tulisan, supaya tidak ada banner yang ikut tergambar', () => {
    const cue = ultimateCue('bomb', 'impact', on, 'nuke-7')

    expect(cue).toEqual({
      id: 'nuke-7',
      kind: 'sound',
      url: '/sfx/ultimate-bomb-impact.ogg',
      volume: 0.8,
      text: '',
      avatarUrl: null,
    })
  })

  it('memilih berkas menurut fasenya', () => {
    expect(ultimateCue('bomb', 'launch', on, 'a')?.url).toBe('/sfx/ultimate-bomb-launch.ogg')
    expect(ultimateCue('bomb', 'impact', on, 'b')?.url).toBe('/sfx/ultimate-bomb-impact.ogg')
  })

  it('mengembalikan null saat knop Ultimate dimatikan', () => {
    expect(ultimateCue('laser', 'launch', { enabled: false, volume: 0.8 }, 'a')).toBeNull()
  })

  it('menjepit volume ke 0–1 supaya config yang rusak tidak melempar elemen Audio', () => {
    expect(ultimateCue('laser', 'launch', { enabled: true, volume: 4 }, 'a')?.volume).toBe(1)
    expect(ultimateCue('laser', 'launch', { enabled: true, volume: -1 }, 'a')?.volume).toBe(0)
  })
})
