import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { probeUploadDir } from './uploads.js'

const made: string[] = []

afterEach(async () => {
  for (const dir of made.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('probeUploadDir', () => {
  it('mengembalikan null saat direktori bisa ditulis', async () => {
    const base = await mkdtemp(join(tmpdir(), 'lga-probe-'))
    made.push(base)

    expect(await probeUploadDir(join(base, 'uploads'))).toBeNull()
  })

  it('mengembalikan alasan saat direktori tidak bisa dibuat', async () => {
    const base = await mkdtemp(join(tmpdir(), 'lga-probe-'))
    made.push(base)
    // Sebuah BERKAS di jalur yang diminta sebagai direktori: mkdir atau writeFile pasti
    // gagal, dan gagalnya sama di Windows maupun POSIX — tidak seperti permission bit.
    const blocked = join(base, 'blocked')
    await writeFile(blocked, '')

    expect(await probeUploadDir(blocked)).not.toBeNull()
  })
})
