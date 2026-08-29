import type { LocalStore } from './local-store.js'
import type { ServerStore } from './server-store.js'

/** Jeda debounce untuk `createSharedConfigPusher` — sama urutan besaran dengan `LocalStore`. */
const DEFAULT_PUSH_DEBOUNCE_MS = 500

/**
 * Menarik default bersama SEKALI (dipanggil saat mount) — bagian "pull" dari sinkron
 * terus-menerus. Device manapun yang terakhir mengedit menang: kalau server sudah punya
 * default, device ini mengadopsinya APA PUN isi localStorage-nya sendiri — localStorage
 * hanyalah cache dari nilai bersama, bukan lagi nilai independen per device.
 *
 * Server yang belum punya satupun default (creator baru pertama kali) dibenihi dari config
 * device ini kalau ada; kalau device ini juga baru, tidak ada yang bisa dibenihi dan default
 * engine yang berlaku, sampai device manapun menyimpan sesuatu.
 */
export async function pullSharedDefault<T>(
  store: LocalStore,
  server: ServerStore,
  key: string,
  validate: (raw: unknown) => T,
  onChange: (value: T) => void,
): Promise<void> {
  const shared = await server.defaultConfig(key)
  if (shared !== null) {
    const value = validate(shared)
    store.write(key, value)
    onChange(value)
    return
  }

  const raw = store.read<unknown>(key, null)
  if (raw !== null) void server.saveDefaultConfig(key, raw)
}

export interface SharedConfigPusher {
  /** Menjadwalkan `value` untuk dikirim setelah debounce; nilai terbaru yang menang. */
  push(value: unknown): void
  /** Mengirim segera nilai yang masih tertunda, tanpa menunggu debounce. Diam bila tak ada. */
  flush(): Promise<void>
}

/**
 * Bagian "push" dari sinkron terus-menerus — lihat `pullSharedDefault`.
 *
 * Panel config menghasilkan puluhan perubahan per detik saat slider digeser (alasan yang sama
 * yang membuat `LocalStore` men-debounce tulisan localStorage-nya); tanpa debounce di sini,
 * tiap perubahan itu jadi satu request ke server.
 */
export function createSharedConfigPusher(
  server: ServerStore,
  key: string,
  debounceMs: number = DEFAULT_PUSH_DEBOUNCE_MS,
): SharedConfigPusher {
  let handle: ReturnType<typeof setTimeout> | null = null
  let pending: { value: unknown } | null = null

  const commit = async (): Promise<void> => {
    handle = null
    if (pending === null) return
    const value = pending.value
    pending = null
    await server.saveDefaultConfig(key, value)
  }

  return {
    push(value) {
      pending = { value }
      if (handle !== null) clearTimeout(handle)
      handle = setTimeout(() => void commit(), debounceMs)
    },
    async flush() {
      if (handle !== null) clearTimeout(handle)
      handle = null
      await commit()
    },
  }
}
