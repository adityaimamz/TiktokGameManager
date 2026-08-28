import { describe, expect, it } from 'vitest'
import { BOLT_POINTS, boltPath } from '../../../../src/games/battle-arena/renderer/bolt.js'

const path = (seed: number, amplitude = 20): number[] =>
  boltPath(0, 0, 100, 0, amplitude, seed, [])

describe('boltPath', () => {
  it('mengisi tepat BOLT_POINTS pasang koordinat', () => {
    expect(path(0)).toHaveLength(BOLT_POINTS * 2)
  })

  it('kedua ujungnya persis di tempat yang diminta', () => {
    const p = path(3)
    expect([p[0], p[1]]).toEqual([0, 0])
    expect([p[p.length - 2], p[p.length - 1]]).toEqual([100, 0])
  })

  /* Renderer ada di bawah games/: masukan yang sama WAJIB menghasilkan bentuk yang sama. */
  it('deterministik untuk seed yang sama', () => {
    expect(path(7)).toEqual(path(7))
  })

  /* Petir yang diam adalah petir yang mati — jendela reshape berikutnya harus lain bentuk. */
  it('seed berbeda menghasilkan bentuk berbeda', () => {
    expect(path(7)).not.toEqual(path(8))
  })

  it('titik dalamnya benar-benar menyimpang dari garis lurus', () => {
    const p = path(2, 20)
    let maxOff = 0
    for (let i = 1; i < BOLT_POINTS - 1; i++) {
      maxOff = Math.max(maxOff, Math.abs(p[i * 2 + 1] as number))
    }
    expect(maxOff).toBeGreaterThan(2)
    /*
     * Tetap terkurung: tiap tingkat menyumbang paling banyak separuh tingkat sebelumnya, jadi
     * simpangan totalnya di bawah dua kali amplitudo. Tanpa batas ini bentuknya bisa berjalan
     * keluar arena pada tier tinggi.
     */
    expect(maxOff).toBeLessThan(40)
  })

  it('amplitudo nol menghasilkan garis lurus', () => {
    const p = path(5, 0)
    for (let i = 0; i < BOLT_POINTS; i++) expect(p[i * 2 + 1]).toBeCloseTo(0, 9)
  })

  it('menyimpang TEGAK LURUS terhadap arah sambarannya', () => {
    // Sambaran tegak: simpangannya harus di sumbu X, bukan Y.
    const p = boltPath(0, 0, 0, 100, 20, 1, [])
    let maxX = 0
    for (let i = 1; i < BOLT_POINTS - 1; i++) maxX = Math.max(maxX, Math.abs(p[i * 2] as number))
    expect(maxX).toBeGreaterThan(2)
  })

  it('memakai ulang array yang diberikan, tanpa menumbuhkannya', () => {
    const out: number[] = []
    boltPath(0, 0, 100, 0, 20, 1, out)
    const first = out.length
    boltPath(0, 0, 100, 0, 20, 2, out)
    expect(out).toHaveLength(first)
  })

  it('tidak pecah saat kedua ujungnya berimpit', () => {
    const p = boltPath(50, 50, 50, 50, 20, 1, [])
    for (const value of p) expect(Number.isFinite(value)).toBe(true)
  })
})
