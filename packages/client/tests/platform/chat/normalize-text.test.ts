import { describe, expect, it } from 'vitest'
import { normalizeChatText } from '../../../src/platform/chat/normalize-text.js'

describe('normalizeChatText', () => {
  it('lower-cases', () => {
    expect(normalizeChatText('MESSI')).toBe('messi')
  })

  it('trims and collapses whitespace', () => {
    expect(normalizeChatText('   join    team   a  ')).toBe('join team a')
  })

  it('strips punctuation into word separators', () => {
    expect(normalizeChatText('join, messi!!!')).toBe('join messi')
  })

  it('strips diacritics', () => {
    expect(normalizeChatText('Ménü Ápa')).toBe('menu apa')
  })

  it('drops emoji and symbols', () => {
    expect(normalizeChatText('messi 🔥🔥 <3')).toBe('messi 3')
  })

  it('keeps digits', () => {
    expect(normalizeChatText('Team-2')).toBe('team 2')
  })

  it('returns an empty string for input with nothing matchable', () => {
    expect(normalizeChatText('   !!! ')).toBe('')
    expect(normalizeChatText('')).toBe('')
  })

  it('does not glue separate words together', () => {
    expect(normalizeChatText('messi/ronaldo')).toBe('messi ronaldo')
  })
})
