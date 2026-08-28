// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import type { ReactElement } from 'react'
import { useDashboard } from '../../../src/ui/dashboard/useDashboard.js'
import { uploadFile } from '../../../src/ui/dashboard/upload.js'
import type { SpeechAdapter, SpeechVoiceOption } from '../../../src/ui/speech/voices.js'

afterEach(cleanup)

/** Adapter palsu: mencatat ucapan dan pembatalan, dan bisa memunculkan voice belakangan. */
const fakeSpeech = () => {
  const spoken: string[] = []
  const state = {
    cancels: 0,
    listener: null as (() => void) | null,
    voices: [] as SpeechVoiceOption[],
  }

  const adapter: SpeechAdapter = {
    voices: () => state.voices,
    onVoicesChanged: (fn) => {
      state.listener = fn
      return () => {
        state.listener = null
      }
    },
    speak: (request) => void spoken.push(request.text),
    cancel: () => {
      state.cancels += 1
    },
  }

  return { adapter, spoken, state }
}

function SpeechProbe(props: { speech: SpeechAdapter }): ReactElement {
  const model = useDashboard({ speech: props.speech })
  return (
    <div>
      <span data-testid="voices">{model.voices.length}</span>
      <span data-testid="notifs">{model.notifications.length}</span>
      <span data-testid="unread">{model.notifications.filter((item) => !item.read).length}</span>
      <button type="button" onClick={model.actions.toggleMute}>
        mute
      </button>
      <button type="button" onClick={model.actions.readNotifications}>
        read
      </button>
    </div>
  )
}

const failedUpload = async (): Promise<void> => {
  await uploadFile(
    new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }),
    (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch,
  )
}

/** Cangkang seadanya: hook ini hanya bisa diuji lewat sebuah komponen. */
function Probe(): ReactElement {
  const model = useDashboard()
  return (
    <div>
      <span data-testid="paused">{String(model.paused)}</span>
      <span data-testid="simulator">{String(model.simulatorOn)}</span>
      <span data-testid="state">{model.matchState}</span>
      <span data-testid="comments">{model.comments}</span>
      <span data-testid="banner">{model.banner?.text ?? '-'}</span>
      <span data-testid="alerts">{model.media.alerts.length}</span>
      <button type="button" onClick={model.actions.togglePause}>
        pause
      </button>
      <button type="button" onClick={() => model.actions.sendMessage('a')}>
        send
      </button>
      <button
        type="button"
        onClick={() =>
          model.actions.fireCue({
            id: 'gif-1',
            kind: 'gif',
            label: 'tepuk',
            url: '/api/uploads/a.gif',
            volume: 1,
          })
        }
      >
        fire cue
      </button>
      <button
        type="button"
        onClick={() =>
          model.actions.fireCue({
            id: 'music-1',
            kind: 'music',
            label: 'lagu',
            url: '/api/uploads/a.mp3',
            volume: 0.5,
          })
        }
      >
        fire music
      </button>
      <button type="button" onClick={model.actions.toggleMute}>
        mute
      </button>
      <button type="button" onClick={model.actions.toggleSimulator}>
        rehearse
      </button>
      <button type="button" onClick={() => model.actions.connect('creator')}>
        connect
      </button>
    </div>
  )
}

/**
 * `Audio` palsu yang mencatat tiap elemen yang dibuat.
 *
 * Dicari LEWAT URL, bukan lewat indeks: rig sudah menghangatkan dua belas berkas ultimate
 * sebelum satu cue pun dilepas.
 */
const fakeAudio = () => {
  const made: { url: string; plays: number; pauses: number; loop: boolean }[] = []
  class FakeAudio {
    volume = 1
    loop = false
    currentTime = 0
    private readonly record: (typeof made)[number]
    constructor(url: string) {
      this.record = { url, plays: 0, pauses: 0, loop: false }
      made.push(this.record)
    }
    play(): Promise<void> {
      this.record.plays += 1
      this.record.loop = this.loop
      return Promise.resolve()
    }
    pause(): void {
      this.record.pauses += 1
    }
    load(): void {}
  }
  return { made, FakeAudio, of: (url: string) => made.filter((item) => item.url === url) }
}

describe('useDashboard', () => {
  it('membunyikan cue musik di tab ini juga, bukan hanya menyiarkannya ke overlay', () => {
    const audio = fakeAudio()
    vi.stubGlobal('Audio', audio.FakeAudio)
    try {
      render(<Probe />)
      act(() => screen.getByText('fire music').click())

      const played = audio.of('/api/uploads/a.mp3')
      expect(played).toHaveLength(1)
      expect(played[0]?.plays).toBe(1)
      expect(played[0]?.loop).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('diam saat dashboard di-mute, dan musik yang sedang berputar ikut berhenti', () => {
    const audio = fakeAudio()
    vi.stubGlobal('Audio', audio.FakeAudio)
    try {
      render(<Probe />)
      act(() => screen.getByText('fire music').click())
      act(() => screen.getByText('mute').click())
      act(() => screen.getByText('fire music').click())

      const played = audio.of('/api/uploads/a.mp3')
      expect(played.reduce((sum, item) => sum + item.plays, 0)).toBe(1)
      expect(played.reduce((sum, item) => sum + item.pauses, 0)).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('starts unpaused, without the simulator, in waitingFighters', () => {
    render(<Probe />)

    expect(screen.getByTestId('paused').textContent).toBe('false')
    expect(screen.getByTestId('simulator').textContent).toBe('false')
    expect(screen.getByTestId('state').textContent).toBe('waitingFighters')
  })

  it('ends the rehearsal when the creator connects to a real room', async () => {
    // Simulator yang masih hidup mengisi ulang fighter demo dalam hitungan detik, jadi
    // sapuan Req 18 AC8 milik engine tidak pernah bertahan tanpa ini.
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } }))
    try {
      render(<Probe />)

      act(() => screen.getByRole('button', { name: 'rehearse' }).click())
      expect(screen.getByTestId('simulator').textContent).toBe('true')

      await act(async () => {
        screen.getByRole('button', { name: 'connect' }).click()
      })

      expect(screen.getByTestId('simulator').textContent).toBe('false')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('survives the StrictMode mount/unmount/mount cycle main.tsx puts it through', () => {
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    )

    expect(screen.getByTestId('state').textContent).toBe('waitingFighters')
  })

  it('toggles pause without touching the state machine', () => {
    render(<Probe />)

    act(() => screen.getByRole('button', { name: 'pause' }).click())

    expect(screen.getByTestId('paused').textContent).toBe('true')
    expect(screen.getByTestId('state').textContent).toBe('waitingFighters')
  })

  it('counts a creator message as a comment, the same as a real one', () => {
    render(<Probe />)

    act(() => screen.getByRole('button', { name: 'send' }).click())

    expect(screen.getByTestId('comments').textContent).toBe('1')
  })

  it('memperlihatkan cue yang ditembakkan creator di preview-nya sendiri', () => {
    render(<Probe />)

    act(() => screen.getByRole('button', { name: 'fire cue' }).click())

    // BroadcastChannel tidak mengirim balik ke pengirimnya, jadi dashboard menyuapi
    // antreannya sendiri — kalau tidak, preview-nya diam sementara overlay bergerak.
    // Cue GIF tanpa teks berarti banner ber-text kosong: '-' berarti TIDAK ada banner.
    expect(screen.getByTestId('banner').textContent).toBe('')
  })

  it('memulai dengan keempat rule alert bawaan', () => {
    render(<Probe />)

    expect(screen.getByTestId('alerts').textContent).toBe('4')
  })

  it('membisukan reader lewat tombol mute yang sama dengan bunyi game', () => {
    const speech = fakeSpeech()
    render(<SpeechProbe speech={speech.adapter} />)

    act(() => screen.getByRole('button', { name: 'mute' }).click())

    expect(speech.state.cancels).toBe(1)
  })

  it('mengambil daftar voice dari adapter, termasuk yang datang belakangan', () => {
    const speech = fakeSpeech()
    render(<SpeechProbe speech={speech.adapter} />)
    expect(screen.getByTestId('voices').textContent).toBe('0')

    act(() => {
      speech.state.voices = [{ uri: 'id-1', label: 'Andika · id-ID' }]
      speech.state.listener?.()
    })

    expect(screen.getByTestId('voices').textContent).toBe('1')
  })

  it('mencatat unggahan yang gagal sebagai notifikasi', async () => {
    const speech = fakeSpeech()
    render(<SpeechProbe speech={speech.adapter} />)

    await act(failedUpload)

    expect(screen.getByTestId('notifs').textContent).toBe('1')
  })

  it('menolkan badge saat daftar notifikasi dibuka', async () => {
    const speech = fakeSpeech()
    render(<SpeechProbe speech={speech.adapter} />)
    await act(failedUpload)
    expect(screen.getByTestId('unread').textContent).toBe('1')

    act(() => screen.getByRole('button', { name: 'read' }).click())

    expect(screen.getByTestId('unread').textContent).toBe('0')
  })
})

/*
 * Yang diuji di sini adalah JADWALNYA, bukan muatannya.
 *
 * Muatan flush tidak bisa dibangkitkan lewat permukaan publik hook ini: satu-satunya sumber
 * chat yang bisa dinyalakan dari test adalah simulator, dan seluruh pesannya berplatform
 * `demo` — yang justru disaring ledger. Isi ledger dibuktikan `ledger.test.ts`; kabel dari
 * ujung ke ujung dibuktikan uji terima manual.
 */
describe('flush statistik siaran', () => {
  it('menjadwalkan flush tiap 30 detik', () => {
    const spy = vi.spyOn(globalThis, 'setInterval')

    const view = render(<Probe />)
    const scheduled = spy.mock.calls.some(([, ms]) => ms === 30_000)
    view.unmount()
    spy.mockRestore()

    expect(scheduled).toBe(true)
  })

  it('membersihkan jadwalnya saat dashboard dibongkar', () => {
    const spy = vi.spyOn(globalThis, 'clearInterval')

    render(<Probe />).unmount()
    const cleared = spy.mock.calls.length

    spy.mockRestore()
    expect(cleared).toBeGreaterThan(0)
  })
})
