import { describe, expect, it } from 'vitest'
import { log } from '../src/log.js'
import type { LogSink } from '../src/log.js'

/** Sink yang mengumpulkan baris, supaya test tidak perlu membajak process.stdout. */
function collector(): { lines: string[]; sink: LogSink } {
  const lines: string[] = []
  return { lines, sink: { write: (line) => lines.push(line) } }
}

describe('log', () => {
  it('menulis satu baris JSON yang bisa diurai, berakhir newline', () => {
    const { lines, sink } = collector()

    log('info', 'listening', { port: 3001 }, sink)

    expect(lines).toHaveLength(1)
    expect(lines[0]?.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(lines[0] ?? '') as Record<string, unknown>
    expect(parsed['lvl']).toBe('info')
    expect(parsed['msg']).toBe('listening')
    expect(parsed['port']).toBe(3001)
    expect(typeof parsed['t']).toBe('string')
  })

  it('meratakan Error jadi teks — JSON.stringify sendiri menghasilkan {}', () => {
    const { lines, sink } = collector()

    log('error', 'gagal', { err: new TypeError('bukan fungsi') }, sink)

    const parsed = JSON.parse(lines[0] ?? '') as Record<string, unknown>
    expect(parsed['err']).toBe('TypeError: bukan fungsi')
  })

  it('tetap satu baris walau pesannya memuat newline', () => {
    const { lines, sink } = collector()

    log('warn', 'baris\npertama', {}, sink)

    expect(lines[0]?.slice(0, -1).includes('\n')).toBe(false)
  })

  it('menulis tanpa field tambahan sama sekali', () => {
    const { lines, sink } = collector()

    log('warn', 'sendirian', undefined, sink)

    const parsed = JSON.parse(lines[0] ?? '') as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['lvl', 'msg', 't'])
  })
})
