import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RENDERER_DIR = fileURLToPath(
  new URL('../../../../src/games/battle-arena/renderer/', import.meta.url),
)

/** Modul yang membawa state atau menjalankan simulasi — terlarang bagi renderer. */
const FORBIDDEN_IMPORTS = [
  '../state.js',
  '../engine.js',
  '../simulation.js',
  '../combat.js',
  '../host.js',
  '../../../platform/signals',
]

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
    return [path]
  })

const files = sourceFiles(RENDERER_DIR)

/** Komentar dibuang dulu, atau komentar yang MENJELASKAN larangan melaporkan dirinya sendiri. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('renderer boundaries', () => {
  it('finds the renderer sources it is supposed to guard', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('never reaches for game state or the simulation', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return FORBIDDEN_IMPORTS.some((forbidden) => source.includes(`from '${forbidden}`))
    })

    expect(offenders).toEqual([])
  })

  it('never reads the clock or the dice directly', () => {
    const offenders = files.filter((file) => {
      const source = stripComments(readFileSync(file, 'utf8'))
      return source.includes('Math.random(') || source.includes('Date.now(')
    })

    expect(offenders).toEqual([])
  })

  /*
   * Renderer tidak boleh menghitung sendiri berapa milidetik satu ultimate berlangsung.
   *
   * `durationMs` di config adalah durasi NOMINAL: pengali tier,
   * `effects.nuke.durationMultiplier`, dan `NUKE_TYPE_DURATION_SCALE` semuanya berlaku di
   * atasnya, dan ketiganya hanya diketahui engine. Renderer yang memakai angka config akan
   * salah untuk setiap gift yang bukan tier terendah. Engine mengirim `staggerProgress` dan
   * `msPerProgress`; renderer membacanya apa adanya (spec D3b).
   *
   * `TICK_MS` sengaja TIDAK ikut dilarang: `interpolate.ts` memakainya untuk
   * `alphaFromElapsed`, yang soal kadensi snapshot dan tidak ada hubungannya dengan durasi
   * ultimate. Melarangnya akan memaksa daftar pengecualian, dan daftar pengecualian selalu
   * membusuk sampai larangannya tidak berarti apa-apa.
   */
  it('never derives ultimate duration from config', () => {
    const offenders = files.filter((file) =>
      /\bdurationMs\b/.test(stripComments(readFileSync(file, 'utf8'))),
    )

    expect(offenders).toEqual([])
  })

  /*
   * Arena berbahasa Inggris; dashboard berbahasa Indonesia (spec Plan 13 §9).
   *
   * Komentar dibuang lebih dulu — SELURUH komentar di repo ini Indonesia, jadi tanpa
   * `stripComments` komentar yang menjelaskan larangan ini akan melaporkan dirinya sendiri.
   * Aturan yang sama sudah dipegang larangan Math.random/Date.now di framework.
   *
   * Daftarnya pendek dan akan membusuk: kata yang tidak ada di dalamnya akan lolos. Itu
   * diterima — yang dijaga di sini adalah penambahan yang TIDAK SENGAJA, satu-satunya cara
   * bahasa campuran kembali masuk ke berkas yang seluruh komentarnya Indonesia. Tambahkan
   * kata saat ada yang lolos; jangan mengubahnya jadi deteksi bahasa.
   */
  it('never speaks Indonesian where the audience can read it', () => {
    const words = [
      'menunggu', 'ronde', 'pertandingan', 'koin', 'siap', 'bersiap', 'mengatur',
      'tercapai', 'membagikan', 'mengirim', 'kirim', 'ketik', 'lagi', 'dimenangkan',
      'pemenang', 'belum', 'sudah', 'tidak', 'dengan', 'untuk', 'yang', 'dari',
    ]
    const pattern = new RegExp(`\\b(${words.join('|')})\\b`, 'i')

    const offenders = files.filter((file) =>
      pattern.test(stripComments(readFileSync(file, 'utf8'))),
    )

    expect(offenders).toEqual([])
  })
})
