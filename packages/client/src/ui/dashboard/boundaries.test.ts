import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const UI_DIR = fileURLToPath(new URL('..', import.meta.url))
const DASHBOARD_DIR = join(UI_DIR, 'dashboard')

/**
 * Komentar dibuang lebih dulu.
 *
 * Tanpa ini, komentar di `App.tsx` yang MENJELASKAN kenapa dashboard.css tidak boleh sampai
 * ke overlay dilaporkan sebagai pelanggarannya sendiri — pelajaran yang sama sudah dibayar
 * sekali di `framework/boundaries.test.ts`.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
    return [path]
  })

/**
 * Chrome dashboard tidak boleh bocor ke overlay yang harus transparan (§8.2 spec 4b).
 *
 * Tiga pemeriksaan murah yang bersama-sama memakukan sifat itu: CSS hanya diimpor dari
 * dalam dashboard, halaman overlay tidak menyentuh direktori dashboard, dan App memuat
 * dashboard SECARA MALAS sehingga bundler menaruhnya di chunk terpisah.
 */
describe('dashboard boundaries', () => {
  it('imports dashboard.css from inside the dashboard only', () => {
    const offenders = sourceFiles(UI_DIR).filter(
      (file) =>
        !file.startsWith(DASHBOARD_DIR) &&
        withoutComments(readFileSync(file, 'utf8')).includes('dashboard.css'),
    )

    expect(offenders).toEqual([])
  })

  it('keeps the overlay page clear of the dashboard directory', () => {
    const source = withoutComments(readFileSync(join(UI_DIR, 'StagePage.tsx'), 'utf8'))

    expect(source.includes('./dashboard/')).toBe(false)
  })

  it('loads the dashboard lazily, which is what puts its CSS in its own chunk', () => {
    const source = withoutComments(readFileSync(join(UI_DIR, 'App.tsx'), 'utf8'))

    expect(source).toContain("lazy(() => import('./dashboard/Dashboard.js'))")
    expect(source.includes("from './dashboard/Dashboard.js'")).toBe(false)
  })
})
