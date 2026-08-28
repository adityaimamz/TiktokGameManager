import { Suspense, lazy, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { gameById } from '../platform/registry/index.js'
import { ErrorBoundary, OverlayRecovery } from './ErrorBoundary.js'
import { gameFromPath, gamePath, isStageMode } from './routing.js'
import { StagePage } from './StagePage.js'

/**
 * Dashboard dimuat malas supaya CSS-nya tidak ikut terunduh halaman overlay.
 *
 * Tailwind preflight me-reset seluruh dokumen; menjatuhkannya ke halaman yang harus
 * rgba(0,0,0,0) di OBS adalah cara paling halus merusak transparansi. Chunk terpisah membuat
 * "dashboard.css tidak pernah sampai ke overlay" jadi fakta build, bukan sekadar niat —
 * dan itulah yang boundaries.test.ts jaga.
 */
const Dashboard = lazy(() => import('./dashboard/Dashboard.js'))
/** Katalog memakai chrome yang sama, jadi ia tunduk pada aturan yang sama. */
const Lobby = lazy(() => import('./dashboard/Lobby.js'))

/**
 * Panel yang menggantikan dashboard yang jatuh.
 *
 * Gaya inline, bukan kelas Tailwind: kalau yang meledak adalah chunk dashboard, CSS-nya
 * mungkin justru yang tidak pernah sampai.
 */
const DASHBOARD_FALLBACK = (
  <div
    role="alert"
    style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      background: '#140406',
      color: '#ffd9dd',
      fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
      padding: '2rem',
    }}
  >
    <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Dashboard berhenti</h1>
    <p style={{ margin: 0, maxWidth: '32rem', lineHeight: 1.5, opacity: 0.8 }}>
      Match ikut berhenti — tab ini yang menjalankannya. Muat ulang untuk memulai sesi baru.
      Rinciannya ada di console browser.
    </p>
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{
        padding: '0.6rem 1.4rem',
        borderRadius: '0.5rem',
        border: '1px solid #ff5c6c',
        background: '#ff5c6c',
        color: '#140406',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Muat ulang
    </button>
  </div>
)

/**
 * Seluruh router aplikasi ini, dalam satu hook.
 *
 * Tiga halaman dan satu tingkat kedalaman tidak cukup untuk membayar sebuah pustaka router:
 * yang dibutuhkan hanya path yang bisa berubah tanpa memuat ulang. Memuat ulang BUKAN
 * pilihan yang netral di sini — tab ruang kendali adalah pemilik match (§6.1), jadi
 * navigasi yang menyegarkan halaman akan membunuh pertandingan yang sedang berjalan tiap
 * kali creator melirik katalog.
 */
function usePath(initial: string): [string, (to: string) => void] {
  const [path, setPath] = useState(initial)

  useEffect(() => {
    const onPop = (): void => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return [
    path,
    (to: string) => {
      // `pushState`, bukan `replaceState`: tombol Back peramban adalah jalan pulang yang
      // pertama kali dicoba creator, dan di sini ia harus bekerja.
      window.history.pushState(null, '', to)
      setPath(to)
    },
  ]
}

export function App({ pathname = '', search }: { pathname?: string; search: string }): ReactElement {
  const [path, go] = usePath(pathname)

  // Boundary di SINI, bukan di dalam Dashboard: `useDashboard()` sendiri bisa melempar, dan
  // boundary yang duduk di bawahnya tidak akan pernah melihatnya.
  if (isStageMode(path, search)) {
    return (
      <ErrorBoundary fallback={<OverlayRecovery />}>
        <StagePage />
      </ErrorBoundary>
    )
  }

  /*
   * Id yang tidak dikenal jatuh ke katalog, tidak ke layar kosong: alamat ruang kendali
   * ikut tersalin dan ikut di-bookmark, dan game yang suatu hari dicabut dari registry
   * tidak boleh meninggalkan halaman putih di belakangnya.
   */
  const game = gameById(gameFromPath(path) ?? '')

  return (
    <ErrorBoundary fallback={DASHBOARD_FALLBACK}>
      <Suspense fallback={null}>
        {game === null ? (
          <Lobby onOpen={(id) => go(gamePath(id))} />
        ) : (
          <Dashboard onBack={() => go('/')} />
        )}
      </Suspense>
    </ErrorBoundary>
  )
}
