import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/**
 * Tanda-tanda AI-slop yang sudah dibuang di Plan 14.
 *
 * Semuanya murah dan berbasis berkas, karena yang dijaga memang bukan perilaku melainkan
 * KEBIASAAN: tombol pelangi, huruf kapital di tiap label, dan path ikon rakitan tangan
 * adalah hal-hal yang paling mungkin diam-diam kembali lewat satu copy-paste, dan tidak
 * ada satu pun uji perilaku yang akan menangkapnya.
 */
describe('anti-slop guards', () => {
  it('does not pull fonts from the Google CDN', () => {
    expect(read('../../../index.html')).not.toContain('fonts.googleapis.com')
  })

  it('bundles the fonts instead', () => {
    const css = read('../../../src/ui/dashboard/dashboard.css')
    expect(css).toContain('@fontsource/saira')
    expect(css).toContain('@fontsource/chakra-petch')
  })

  /*
   * Gradien tiga warna beranimasi adalah sidik jari desain-AI paling klasik, dan ia satu
   * dari sedikit hal yang paling menggoda untuk dipasang kembali "cuma untuk tombol utama".
   */
  it('has no animated rainbow button', () => {
    const css = read('../../../src/ui/dashboard/dashboard.css')
    expect(css).not.toContain('btn-hero')
    expect(css).not.toContain('ia-shift')
    const src = ['Lobby', 'TopBar'].map((file) => read(`../../../src/ui/dashboard/${file}.tsx`))
    expect(src.some((source) => source.includes('btn-hero'))).toBe(false)
  })

  it('draws icons from a library, not hand-rolled paths', () => {
    const src = read('../../../src/ui/dashboard/icons.tsx')
    expect(src).toContain('@phosphor-icons/react')
    expect(src).not.toContain('const PATHS')
  })

  /*
   * `TopBar` dan `Wordmark` SENGAJA tidak ada di daftar ini.
   *
   * Yang pertama memakainya untuk pil siaran — tier yang sama dengan judul panel, dan
   * memang harus menonjol. Yang kedua adalah logo, dan logo boleh berhuruf kapital.
   */
  it('keeps uppercase-tracking labels out of the rest of the dashboard', () => {
    const files = [
      'Dashboard',
      'Lobby',
      'ultimate',
      'sections/ChatLog',
      'sections/GameInfo',
      'sections/LiveSimulator',
      'sections/LiveStats',
    ]
    for (const file of files) {
      expect(read(`../../../src/ui/dashboard/${file}.tsx`)).not.toMatch(
        /uppercase[^"'`]*tracking-\[/,
      )
    }
  })

  /*
   * `min-h-screen` memakai `100vh`, dan di Safari iOS itu termasuk bilah alamat yang nanti
   * menghilang — jadi tata letaknya melompat saat digulir. `lg:h-screen` di `Dashboard`
   * SENGAJA dibiarkan: di sana halaman memang tidak menggulir, hanya kolomnya.
   */
  it('uses dvh, not vh, for mobile full-height', () => {
    for (const file of ['Dashboard', 'Lobby']) {
      expect(read(`../../../src/ui/dashboard/${file}.tsx`)).not.toContain('min-h-screen')
    }
  })
})
