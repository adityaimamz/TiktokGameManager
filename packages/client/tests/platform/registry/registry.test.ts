import { describe, expect, it } from 'vitest'
import { GAMES, gameLabel } from '../../../src/platform/registry/registry.js'

describe('game registry', () => {
  it('holds exactly the one game Fase 1 ships', () => {
    expect(GAMES.map((entry) => entry.id)).toEqual(['battle-arena'])
  })

  it('names the active game so the top bar does not hardcode it', () => {
    expect(gameLabel('battle-arena')).toBe('Battle Arena')
  })
})
