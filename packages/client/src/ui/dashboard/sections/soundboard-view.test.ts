import { describe, expect, it } from 'vitest'
import type { CatalogEntry } from '../../../platform/signals/index.js'
import { SOUNDBOARD_TABS, cuesOfKind, labelFromFilename, nextCueId } from './soundboard-view.js'

const entry = (id: string, kind: CatalogEntry['kind']): CatalogEntry => ({
  id,
  kind,
  label: id,
  url: `/${id}`,
  volume: 1,
})

describe('soundboard-view', () => {
  it('menawarkan tiga tab, satu per jenis media (Req 38 AC9)', () => {
    expect(SOUNDBOARD_TABS.map((tab) => tab.kind)).toEqual(['sound', 'gif', 'music'])
  })

  it('menyaring cue per jenis', () => {
    const cues = [entry('a', 'sound'), entry('b', 'gif'), entry('c', 'sound')]

    expect(cuesOfKind(cues, 'sound').map((cue) => cue.id)).toEqual(['a', 'c'])
    expect(cuesOfKind(cues, 'music')).toEqual([])
  })

  it('membuang ekstensi dan memangkas nama berkas yang kepanjangan', () => {
    expect(labelFromFilename('tepuk-tangan.mp3')).toBe('tepuk-tangan')
    expect(labelFromFilename('a'.repeat(40) + '.mp3')).toHaveLength(24)
    expect(labelFromFilename('')).toBe('cue')
  })

  it('memberi id yang belum dipakai, meski daftarnya bolong', () => {
    const cues = [entry('sound-1', 'sound'), entry('sound-3', 'sound')]

    expect(nextCueId(cues, 'sound')).toBe('sound-4')
    expect(nextCueId([], 'gif')).toBe('gif-1')
  })
})
