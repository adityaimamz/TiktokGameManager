import { describe, expect, it } from 'vitest'
import { ActionQueue } from './queue.js'
import type { Action } from './action.js'

const action = (target: string): Action => ({ type: 'damage', target, value: 1, duration: 0 })

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
