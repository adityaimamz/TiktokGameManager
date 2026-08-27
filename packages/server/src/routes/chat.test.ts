import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { idleStatus } from '@lga/shared'
import type { ConnectionStatus } from '@lga/shared'
import { createApp } from '../app.js'
import type { ChatConnection } from './chat.js'

/** Koneksi palsu: mencatat apa yang diminta, tanpa menyentuh jaringan. */
function createFakeConnection() {
  const calls: string[] = []
  let current: ConnectionStatus = idleStatus()
  let failWith: string | null = null

  const connection: ChatConnection = {
    get status() {
      return current
    },
    async connect(username: string) {
      calls.push(`connect:${username}`)
      if (failWith !== null) {
        current = { ...idleStatus(), state: 'failed', username, error: failWith }
      } else {
        current = { ...idleStatus(), state: 'connected', username, roomId: 'room-1' }
      }
      return current
    },
    disconnect() {
      calls.push('disconnect')
      current = idleStatus()
    },
  }

  return {
    connection,
    calls,
    rejectWith: (reason: string) => {
      failWith = reason
    },
  }
}

const appWith = (connection: ChatConnection) => createApp({ connection, gifts: { giftCatalog: [] }, repos: null })

describe('chat routes', () => {
  it('reports the current status', async () => {
    const fake = createFakeConnection()
    const response = await request(appWith(fake.connection)).get('/api/chat/status')

    expect(response.status).toBe(200)
    expect(response.body).toEqual(idleStatus())
  })

  it('connects and answers with the resulting status', async () => {
    const fake = createFakeConnection()
    const response = await request(appWith(fake.connection))
      .post('/api/chat/connect')
      .send({ username: 'budi' })

    expect(response.status).toBe(200)
    expect(response.body.state).toBe('connected')
    expect(response.body.roomId).toBe('room-1')
    expect(fake.calls).toEqual(['connect:budi'])
  })

  it('answers 400 without touching the connection when username is missing', async () => {
    const fake = createFakeConnection()
    const response = await request(appWith(fake.connection)).post('/api/chat/connect').send({})

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'username is required' })
    expect(fake.calls).toEqual([])
  })

  it('answers 400 for a username that is only whitespace', async () => {
    const fake = createFakeConnection()
    const response = await request(appWith(fake.connection))
      .post('/api/chat/connect')
      .send({ username: '   ' })

    expect(response.status).toBe(400)
    expect(fake.calls).toEqual([])
  })

  it('trims the username and strips a leading @', async () => {
    const fake = createFakeConnection()
    await request(appWith(fake.connection))
      .post('/api/chat/connect')
      .send({ username: '  @budi ' })

    expect(fake.calls).toEqual(['connect:budi'])
  })

  it('still answers 200 when the connection fails, carrying the reason (Req 2 AC4)', async () => {
    const fake = createFakeConnection()
    fake.rejectWith('user is not live')
    const response = await request(appWith(fake.connection))
      .post('/api/chat/connect')
      .send({ username: 'budi' })

    expect(response.status).toBe(200)
    expect(response.body.state).toBe('failed')
    expect(response.body.error).toBe('user is not live')
  })

  it('disconnects and answers with the idle status', async () => {
    const fake = createFakeConnection()
    await request(appWith(fake.connection)).post('/api/chat/connect').send({ username: 'budi' })
    const response = await request(appWith(fake.connection)).post('/api/chat/disconnect')

    expect(response.status).toBe(200)
    expect(response.body).toEqual(idleStatus())
    expect(fake.calls).toEqual(['connect:budi', 'disconnect'])
  })
})
