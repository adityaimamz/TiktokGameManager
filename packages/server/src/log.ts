export type LogLevel = 'info' | 'warn' | 'error'

/** Ke mana baris log ditulis. Ada supaya test tidak perlu membajak `process.stdout`. */
export interface LogSink {
  write(line: string): void
}

const stdoutSink: LogSink = {
  write: (line) => {
    process.stdout.write(line)
  },
}

/**
 * `Error` tidak punya properti enumerable, jadi `JSON.stringify` menghasilkan `{}` —
 * persis membuang satu-satunya informasi yang dicari orang saat membaca log.
 */
function describe(value: unknown): unknown {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  return value
}

/**
 * Satu baris JSON per peristiwa.
 *
 * Tanpa dependency dan tanpa level runtime, transport, child logger, maupun sampling: satu
 * proses yang melayani satu creator tidak membutuhkan satu pun dari itu, dan menambahkannya
 * berarti berkas kedua yang harus diperbarui setiap kali ada yang ingin dicatat.
 */
export function log(
  level: LogLevel,
  msg: string,
  extra: Record<string, unknown> = {},
  sink: LogSink = stdoutSink,
): void {
  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(extra)) fields[key] = describe(value)
  sink.write(`${JSON.stringify({ t: new Date().toISOString(), lvl: level, msg, ...fields })}\n`)
}
