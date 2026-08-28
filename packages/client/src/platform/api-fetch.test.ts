// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './app-key.js'

function stubFetch(): RequestInit[] {
  const calls: RequestInit[] = []
  vi.stubGlobal('fetch', (_input: unknown, init: RequestInit) => {
    calls.push(init)
    return Promise.resolve(new Response('{}'))
  })
  return calls
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('memasang x-app-key tanpa membuang header pemanggil', async () => {
    localStorage.setItem('lga:app-key', 'rahasia')
    const calls = stubFetch()

    await apiFetch('/api/chat/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })

    const headers = new Headers(calls[0]?.headers)
    expect(headers.get('x-app-key')).toBe('rahasia')
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('tidak menambah apa pun saat server berjalan tanpa kunci', async () => {
    const calls = stubFetch()

    await apiFetch('/api/chat/disconnect', { method: 'POST' })

    expect(new Headers(calls[0]?.headers).get('x-app-key')).toBeNull()
  })
})
