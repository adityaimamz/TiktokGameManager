import { describe, expect, it } from 'vitest'
import { isRemoteOverlay, isStageMode, overlayOrigin, stageUrl } from './routing.js'

describe('isStageMode', () => {
  it('recognises the OBS overlay query', () => {
    expect(isStageMode('?stage=1')).toBe(true)
    expect(isStageMode('stage=1')).toBe(true)
    expect(isStageMode('?debug=1&stage=1')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isStageMode('')).toBe(false)
    expect(isStageMode('?stage=0')).toBe(false)
    expect(isStageMode('?stage')).toBe(false)
    expect(isStageMode('?stages=1')).toBe(false)
  })
})

describe('stageUrl', () => {
  it('membangun URL overlay dari sebuah origin', () => {
    expect(stageUrl('http://localhost:3001')).toBe('http://localhost:3001/?stage=1')
    expect(stageUrl('http://localhost:3001/')).toBe('http://localhost:3001/?stage=1')
  })

  it('menempelkan kunci saat ada, karena OBS tidak punya tempat mengetik', () => {
    expect(stageUrl('https://arena.app', 'rahasia')).toBe('https://arena.app/?stage=1&k=rahasia')
    expect(stageUrl('https://arena.app', null)).toBe('https://arena.app/?stage=1')
    expect(stageUrl('https://arena.app', '')).toBe('https://arena.app/?stage=1')
  })
})

describe('isRemoteOverlay', () => {
  it('menganggap halaman di localhost sebagai overlay satu PC', () => {
    expect(isRemoteOverlay('localhost', '?stage=1')).toBe(false)
    expect(isRemoteOverlay('127.0.0.1', '?stage=1')).toBe(false)
  })

  it('menganggap host lain sebagai device lain, meski tanpa kunci', () => {
    // Justru kasus ini yang mati kalau `k` jadi satu-satunya penanda: link LAN yang
    // dicetak top bar tidak membawa `k` saat APP_KEY kosong.
    expect(isRemoteOverlay('192.168.1.5', '?stage=1')).toBe(true)
    expect(isRemoteOverlay('arena.fly.dev', '?stage=1')).toBe(true)
  })

  it('kunci di URL selalu berarti jauh, apa pun hostname-nya', () => {
    expect(isRemoteOverlay('localhost', '?stage=1&k=rahasia')).toBe(true)
  })
})

describe('overlayOrigin', () => {
  it('memakai alamat LAN saat dashboard dibuka di localhost', () => {
    expect(overlayOrigin('localhost', 'http://localhost:3001', ['http://192.168.1.5:3001'])).toBe(
      'http://192.168.1.5:3001',
    )
  })

  it('jatuh ke origin sendiri saat tidak ada alamat LAN', () => {
    expect(overlayOrigin('localhost', 'http://localhost:3001', [])).toBe('http://localhost:3001')
  })

  it('membiarkan origin apa adanya saat halaman memang sudah bukan localhost', () => {
    expect(overlayOrigin('arena.fly.dev', 'https://arena.fly.dev', ['http://10.0.0.1:3001'])).toBe(
      'https://arena.fly.dev',
    )
  })
})
