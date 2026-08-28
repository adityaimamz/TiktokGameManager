import { describe, expect, it } from 'vitest'
import { keyMatches, requestKey, socketKey, socketRole } from '../src/app-key.js'

describe('keyMatches', () => {
  it('menerima kunci yang persis sama', () => {
    expect(keyMatches('rahasia-panjang', 'rahasia-panjang')).toBe(true)
  })

  it('menolak kunci yang salah, yang lebih pendek, dan yang tidak ada', () => {
    expect(keyMatches('rahasia-panjang', 'rahasia-panjan')).toBe(false)
    expect(keyMatches('rahasia-panjang', 'x')).toBe(false)
    expect(keyMatches('rahasia-panjang', '')).toBe(false)
    expect(keyMatches('rahasia-panjang', null)).toBe(false)
  })

  it('tidak melempar saat panjangnya berbeda jauh', () => {
    expect(() => keyMatches('a', 'b'.repeat(500))).not.toThrow()
  })
})

describe('requestKey', () => {
  const req = (header: string | undefined, query: Record<string, unknown> = {}) => ({
    header: () => header,
    query,
  })

  it('membaca header lebih dulu', () => {
    expect(requestKey(req('dari-header', { k: 'dari-query' }))).toBe('dari-header')
  })

  it('jatuh ke query saat header tidak ada', () => {
    expect(requestKey(req(undefined, { k: 'dari-query' }))).toBe('dari-query')
  })

  it('mengembalikan null saat keduanya kosong', () => {
    expect(requestKey(req(undefined))).toBeNull()
    expect(requestKey(req('', { k: '' }))).toBeNull()
  })
})

describe('socketKey', () => {
  it('membaca kunci dari query soket', () => {
    expect(socketKey('/ws?k=rahasia')).toBe('rahasia')
    expect(socketKey('/ws?role=overlay&k=rahasia')).toBe('rahasia')
  })

  it('mengembalikan null tanpa kunci, dan tanpa URL', () => {
    expect(socketKey('/ws')).toBeNull()
    expect(socketKey('/ws?k=')).toBeNull()
    expect(socketKey(undefined)).toBeNull()
  })
})

describe('socketRole', () => {
  it('membaca peran overlay dari query', () => {
    expect(socketRole('/ws?role=overlay')).toBe('overlay')
  })

  it('menganggap sisanya dashboard — termasuk peran yang tidak dikenal', () => {
    expect(socketRole('/ws')).toBe('dashboard')
    expect(socketRole('/ws?role=sesuatu')).toBe('dashboard')
    expect(socketRole(undefined)).toBe('dashboard')
  })
})
