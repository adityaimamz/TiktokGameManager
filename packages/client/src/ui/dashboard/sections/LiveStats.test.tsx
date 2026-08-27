// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { idleStatus } from '@lga/shared'
import { LiveStats } from './LiveStats.js'

afterEach(cleanup)

describe('LiveStats', () => {
  it('puts the two numbers the creator glances at in the biggest type on the panel', () => {
    render(
      <LiveStats
        status={{ ...idleStatus(), state: 'connected', viewerCount: 2481 }}
        comments={9317}
        joinedFighters={604}
        sessionMs={41 * 60_000}
      />,
    )

    expect(screen.getByText('2.481')).toBeTruthy()
    expect(screen.getByText('9.317')).toBeTruthy()
    expect(screen.getByText('Sesi berjalan 41 menit · 604 fighter bergabung')).toBeTruthy()
  })
})
