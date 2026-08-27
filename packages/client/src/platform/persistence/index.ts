import { LocalStore } from './local-store.js'
import type { LocalStoreOptions } from './local-store.js'
import { ServerStore } from './server-store.js'
import type { ServerStoreOptions } from './server-store.js'

export interface PersistenceStore {
  /** Config dan preferensi: cepat, sinkron dibaca, di-debounce saat ditulis. */
  local: LocalStore
  /** Statistik lintas sesi: lambat, asinkron, dan boleh gagal tanpa akibat. */
  server: ServerStore
}

/**
 * Satu-satunya pintu penyimpanan yang boleh dipanggil sebuah game.
 *
 * Game tidak pernah memanggil `fetch` maupun menyentuh `localStorage` langsung, sehingga
 * game kedua mendapat penyimpanan tanpa satu baris kode baru (§12 spec induk).
 */
export function createPersistence(opts: {
  local?: LocalStoreOptions
  server?: ServerStoreOptions
}): PersistenceStore {
  const local =
    opts.local ??
    ({ storage: typeof localStorage === 'undefined' ? null : localStorage } as LocalStoreOptions)
  return { local: new LocalStore(local), server: new ServerStore(opts.server ?? {}) }
}

export { LocalStore } from './local-store.js'
export type { LocalStoreOptions, StorageLike } from './local-store.js'
export { ServerStore } from './server-store.js'
export type { ServerStoreOptions } from './server-store.js'
