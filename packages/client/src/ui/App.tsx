import { Suspense, lazy } from 'react'
import type { ReactElement } from 'react'
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

export function App({ search }: { search: string }): ReactElement {
  if (isStageMode(search)) return <StagePage />
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  )
}
