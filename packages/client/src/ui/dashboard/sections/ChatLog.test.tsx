// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createChatMessage } from '@lga/shared'
import { chatLogEntry } from './chat-log.js'
import { ChatLog } from './ChatLog.js'

afterEach(cleanup)

const entry = (id: string, patch: { platform?: 'tiktok' | 'demo'; text?: string }) =>
  chatLogEntry(
    createChatMessage({
      id,
      kind: 'textMessageEvent',
      platform: patch.platform ?? 'tiktok',
      username: 'dwiiap',
      text: patch.text ?? 'a',
    }),
  )

describe('ChatLog', () => {
  it('shows the rate alongside the status, without repeating the tab label', () => {
    render(<ChatLog entries={[]} rate="31 / menit" bars={[]} />)

    expect(screen.getByText('31 / menit')).toBeTruthy()
    expect(screen.getByText('Idle')).toBeTruthy()
    expect(screen.queryByText('Komentar live')).toBeNull()
  })

  it('marks synthetic viewers with a shape, not only a colour', () => {
    render(<ChatLog entries={[entry('m1', { platform: 'demo' })]} rate="diam" bars={[]} />)

    expect(screen.getByTestId('chat-item-m1').className).toContain('border-dashed')
  })

  it('leaves real viewers unmarked', () => {
    render(<ChatLog entries={[entry('m2', {})]} rate="diam" bars={[]} />)

    expect(screen.getByTestId('chat-item-m2').className).not.toContain('border-dashed')
  })
})
