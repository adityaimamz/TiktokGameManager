import { describe, expect, it } from 'vitest'
import { ActionQueue } from '../../../src/framework/actions/queue.js'
import type { Action } from '../../../src/framework/actions/action.js'

const action = (target: string): Action => ({ type: 'damage', target, value: 1, duration: 0 })
const neverEvictAction = (target: string): Action => ({
  type: 'damage',
  target,
  value: 1,
  duration: 0,
  neverEvict: true,
})

describe('ActionQueue', () => {
  it('starts empty', () => {
    const q = new ActionQueue()
    expect(q.size).toBe(0)
    expect(q.dequeue()).toBeUndefined()
  })

  it('dequeues in first-in-first-out order', () => {
    const q = new ActionQueue()
    q.enqueue(action('a'))
    q.enqueue(action('b'))
    q.enqueue(action('c'))
    expect(q.dequeue()?.target).toBe('a')
    expect(q.dequeue()?.target).toBe('b')
    expect(q.dequeue()?.target).toBe('c')
  })

  it('defaults to a capacity of 500', () => {
    const q = new ActionQueue()
    for (let i = 0; i < 500; i++) q.enqueue(action(String(i)))
    expect(q.size).toBe(500)
    expect(q.droppedCount).toBe(0)
  })

  it('drops the oldest action when full', () => {
    const q = new ActionQueue(3)
    q.enqueue(action('a'))
    q.enqueue(action('b'))
    q.enqueue(action('c'))
    q.enqueue(action('d'))
    expect(q.size).toBe(3)
    expect(q.droppedCount).toBe(1)
    expect(q.dequeue()?.target).toBe('b')
    expect(q.dequeue()?.target).toBe('c')
    expect(q.dequeue()?.target).toBe('d')
  })

  it('drain empties the queue and returns how many were handled', () => {
    const q = new ActionQueue()
    q.enqueue(action('a'))
    q.enqueue(action('b'))
    const seen: string[] = []
    const handled = q.drain((a) => seen.push(a.target))
    expect(handled).toBe(2)
    expect(seen).toEqual(['a', 'b'])
    expect(q.size).toBe(0)
  })

  it('defers actions enqueued during drain to the next drain', () => {
    const q = new ActionQueue()
    q.enqueue(action('a'))
    const seen: string[] = []
    q.drain((a) => {
      seen.push(a.target)
      if (a.target === 'a') q.enqueue(action('b'))
    })
    expect(seen).toEqual(['a'])
    expect(q.size).toBe(1)
  })

  it('keeps working after wrapping around the ring buffer', () => {
    const q = new ActionQueue(2)
    q.enqueue(action('a'))
    q.enqueue(action('b'))
    q.dequeue()
    q.enqueue(action('c'))
    q.dequeue()
    q.enqueue(action('d'))
    expect(q.dequeue()?.target).toBe('c')
    expect(q.dequeue()?.target).toBe('d')
    expect(q.size).toBe(0)
  })

  it('clear empties the queue without counting drops', () => {
    const q = new ActionQueue()
    q.enqueue(action('a'))
    q.clear()
    expect(q.size).toBe(0)
    expect(q.droppedCount).toBe(0)
  })
})

describe('ActionQueue neverEvict', () => {
  it('never drops neverEvict actions regardless of batch size', () => {
    const q = new ActionQueue(500)
    const count = 600
    for (let i = 0; i < count; i++) q.enqueue(neverEvictAction(String(i)))
    expect(q.size).toBe(count)
    expect(q.droppedCount).toBe(0)
    expect(q.neverEvictSize).toBe(count)

    const seen: string[] = []
    const handled = q.drain((a) => seen.push(a.target))
    expect(handled).toBe(count)
    expect(seen.length).toBe(count)
    // Urutan FIFO dipertahankan.
    for (let i = 0; i < count; i++) expect(seen[i]).toBe(String(i))
  })

  it('evicts only non-neverEvict actions when mixed and over capacity', () => {
    const q = new ActionQueue(5)
    // 3 neverEvict, lalu 6 biasa (kapasitas ring 5, jadi 1 biasa terbuang).
    q.enqueue(neverEvictAction('p0'))
    q.enqueue(action('n0'))
    q.enqueue(neverEvictAction('p1'))
    q.enqueue(action('n1'))
    q.enqueue(action('n2'))
    q.enqueue(action('n3'))
    q.enqueue(action('n4'))
    q.enqueue(neverEvictAction('p2'))
    q.enqueue(action('n5'))  // ring penuh (5), n0 terbuang

    expect(q.droppedCount).toBe(1)
    expect(q.neverEvictSize).toBe(3)

    const seen: string[] = []
    q.drain((a) => seen.push(a.target))

    // Semua 3 neverEvict harus ada.
    expect(seen.filter((t) => t.startsWith('p'))).toEqual(['p0', 'p1', 'p2'])
    // n0 terbuang, n1-n5 selamat.
    expect(seen.filter((t) => t.startsWith('n'))).toEqual(['n1', 'n2', 'n3', 'n4', 'n5'])
  })

  it('drain processes in global insertion order (FIFO)', () => {
    const q = new ActionQueue(10)
    // Campuran yang saling selang-seling.
    q.enqueue(action('a'))          // seq 0
    q.enqueue(neverEvictAction('B'))  // seq 1
    q.enqueue(action('c'))          // seq 2
    q.enqueue(action('d'))          // seq 3
    q.enqueue(neverEvictAction('E'))  // seq 4
    q.enqueue(action('f'))          // seq 5

    const seen: string[] = []
    q.drain((a) => seen.push(a.target))
    expect(seen).toEqual(['a', 'B', 'c', 'd', 'E', 'f'])
  })

  it('fires onHighWaterMark when neverEvict count reaches threshold', () => {
    let callCount = 0
    let lastValue = 0
    const q = new ActionQueue({
      capacity: 10,
      highWaterMark: 3,
      onHighWaterMark: (n) => { callCount++; lastValue = n },
    })

    q.enqueue(neverEvictAction('a'))
    q.enqueue(neverEvictAction('b'))
    expect(callCount).toBe(0)
    q.enqueue(neverEvictAction('c'))  // hits threshold 3
    expect(callCount).toBe(1)
    expect(lastValue).toBe(3)

    // Tambah lagi, tapi callback tidak terpicu ulang sebelum drain.
    q.enqueue(neverEvictAction('d'))
    expect(callCount).toBe(1)
  })

  it('high water mark can re-trigger after drain', () => {
    let callCount = 0
    const q = new ActionQueue({
      capacity: 10,
      highWaterMark: 3,
      onHighWaterMark: () => { callCount++ },
    })

    // Spike pertama.
    for (let i = 0; i < 5; i++) q.enqueue(neverEvictAction(String(i)))
    expect(callCount).toBe(1)

    q.drain(() => {})
    // drain() mereset flag.

    // Spike kedua.
    for (let i = 0; i < 4; i++) q.enqueue(neverEvictAction(String(i)))
    expect(callCount).toBe(2)

    q.drain(() => {})

    // Spike ketiga, di bawah threshold: tidak trigger.
    q.enqueue(neverEvictAction('x'))
    q.enqueue(neverEvictAction('y'))
    expect(callCount).toBe(2)
  })

  it('drain empties both containers completely', () => {
    const q = new ActionQueue(5)
    for (let i = 0; i < 10; i++) q.enqueue(action(String(i)))
    for (let i = 0; i < 8; i++) q.enqueue(neverEvictAction(`p${i}`))

    const handled = q.drain(() => {})
    expect(handled).toBe(5 + 8) // 5 ring (10 enqueued, 5 dropped) + 8 neverEvict
    expect(q.size).toBe(0)
    expect(q.neverEvictSize).toBe(0)
  })

  it('neverEvictQueue does not retain entries across ticks', () => {
    const q = new ActionQueue(5)

    // Simulasi 100 tick: enqueue lalu drain tiap kali.
    for (let tick = 0; tick < 100; tick++) {
      const batchSize = tick % 10 // 0..9 neverEvict per tick
      for (let i = 0; i < batchSize; i++) q.enqueue(neverEvictAction(`t${tick}-${i}`))
      for (let i = 0; i < 3; i++) q.enqueue(action(`r${tick}-${i}`))
      q.drain(() => {})
      expect(q.neverEvictSize).toBe(0)
      expect(q.size).toBe(0)
    }
  })

  it('defers neverEvict actions enqueued during drain', () => {
    const q = new ActionQueue()
    q.enqueue(neverEvictAction('a'))
    const seen: string[] = []
    q.drain((a) => {
      seen.push(a.target)
      if (a.target === 'a') q.enqueue(neverEvictAction('b'))
    })
    expect(seen).toEqual(['a'])
    expect(q.size).toBe(1)
    expect(q.neverEvictSize).toBe(1)
  })
})
