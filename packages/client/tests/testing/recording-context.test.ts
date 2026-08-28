import { describe, expect, it } from 'vitest'
import { createRecordingContext } from './recording-context.js'

describe('createRecordingContext', () => {
  it('records every drawing call in order', () => {
    const ctx = createRecordingContext()
    ctx.fillRect(1, 2, 3, 4)
    ctx.beginPath()
    ctx.arc(5, 5, 2, 0, Math.PI)

    expect(ctx.ops()).toEqual(['fillRect', 'beginPath', 'arc'])
    expect(ctx.callsOf('fillRect')[0]?.args).toEqual([1, 2, 3, 4])
  })

  it('records property assignments too', () => {
    const ctx = createRecordingContext()
    ctx.fillStyle = '#123456'

    expect(ctx.callsOf('set:fillStyle')[0]?.args).toEqual(['#123456'])
    expect(ctx.fillStyle).toBe('#123456')
  })

  it('measures text without a real canvas', () => {
    const ctx = createRecordingContext()
    expect(ctx.measureText('abcd').width).toBeGreaterThan(0)
  })

  it('reports where an operation first appeared, or -1', () => {
    const ctx = createRecordingContext()
    ctx.save()
    ctx.fillRect(0, 0, 1, 1)

    expect(ctx.firstIndexOf('fillRect')).toBe(1)
    expect(ctx.firstIndexOf('drawImage')).toBe(-1)
  })
})
