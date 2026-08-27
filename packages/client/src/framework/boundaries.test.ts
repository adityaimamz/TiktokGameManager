import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const FRAMEWORK_DIR = fileURLToPath(new URL('.', import.meta.url))

/**
 * Kata yang menandakan pengetahuan tentang game tertentu telah bocor ke framework.
 *
 * "side" sengaja TIDAK dilarang meski dipakai istilah domain game pertama — kata itu
 * terlalu umum dalam geometri ("inside", "left side") sehingga akan memicu false
 * positive. Batas sesungguhnya ditegakkan dependency-cruiser lewat aturan impor.
 *
 * Batas kata hanya di sisi KIRI, sengaja tanpa batas di sisi kanan:
 *   - tanpa batas kiri, kata Indonesia "karena" cocok dengan "arena" (k-arena)
 *   - dengan batas kanan (\b), identifier ARENA_WIDTH dan fighterCount justru lolos
 *     karena "_" dan huruf kapital tidak dianggap batas kata
 */
const FORBIDDEN = /(?<![A-Za-z])(battle|arena|fighter)/i

/**
 * Membuang komentar sebelum memeriksa pemanggilan terlarang.
 *
 * Tanpa ini, komentar yang justru MENJELASKAN larangan ("jangan panggil Math.random")
 * akan dilaporkan sebagai pelanggaran. Pemeriksaan kosakata di bawah sengaja tetap
 * membaca berkas utuh — istilah domain yang bocor ke komentar tetap sebuah kebocoran.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const collectSourceFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('framework module boundary', () => {
  const files = collectSourceFiles(FRAMEWORK_DIR)

  it('finds framework source files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('contains no game-specific vocabulary', () => {
    const offenders = files
      .filter((f) => !f.endsWith('boundaries.test.ts'))
      .filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(FRAMEWORK_DIR.length))
    expect(offenders).toEqual([])
  })

  it('imports nothing from platform, games or ui', () => {
    const badImport = /from\s+['"][^'"]*\/(platform|games|ui)\//
    const offenders = files
      .filter((f) => !f.endsWith('boundaries.test.ts'))
      .filter((f) => badImport.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(FRAMEWORK_DIR.length))
    expect(offenders).toEqual([])
  })

  it('never calls Math.random or Date.now directly', () => {
    const banned = /Math\.random\s*\(|Date\.now\s*\(/
    const offenders = files
      .filter((f) => !f.endsWith('boundaries.test.ts') && !f.endsWith('clock.ts'))
      .filter((f) => banned.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(FRAMEWORK_DIR.length))
    expect(offenders).toEqual([])
  })
})
