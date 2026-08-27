import { Suspense, lazy } from 'react'
import type { ReactElement } from 'react'
import { ErrorBoundary, OverlayRecovery } from './ErrorBoundary.js'
import { isStageMode } from './routing.js'
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

export function App({ search }: { search: string }): ReactElement {
  // Boundary di SINI, bukan di dalam Dashboard: `useDashboard()` sendiri bisa melempar, dan
  // boundary yang duduk di bawahnya tidak akan pernah melihatnya.
  if (isStageMode(search)) {
    return (
      <ErrorBoundary fallback={<OverlayRecovery />}>
        <StagePage />
      </ErrorBoundary>
    )
  }
  return (
    <ErrorBoundary fallback={DASHBOARD_FALLBACK}>
      <Suspense fallback={null}>
        <Dashboard />
      </Suspense>
    </ErrorBoundary>
  )
}
