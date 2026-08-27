import type { ChatMessage } from '@lga/shared'
import type { ChatSource } from './source.js'

export interface ChatEngineOptions {
  /** Dipanggil saat sebuah subscriber melempar. Default: console.error. */
  onError?: (error: unknown, message: ChatMessage) => void
}

/**
 * Mengelola seluruh sumber chat dan menyebarkan pesannya.
 *
 * Kegagalan satu subscriber tidak boleh menjatuhkan yang lain — dicatat dengan
 * konteks lalu event itu dibuang, sesuai Req 36 AC4.
 */
export class ChatEngine {
  private readonly sources = new Map<string, ChatSource>()
  private handlers: ((message: ChatMessage) => void)[] = []
  private readonly onError: (error: unknown, message: ChatMessage) => void
  private running = false
  private _messageCount = 0

  constructor(opts: ChatEngineOptions = {}) {
    this.onError =
      opts.onError ??
      ((error, message) => {
        console.error(`[ChatEngine] subscriber failed on message ${message.id}`, error)
      })
  }

  get sourceIds(): readonly string[] {
    return [...this.sources.keys()]
  }

  get isRunning(): boolean {
    return this.running
  }

  get messageCount(): number {
    return this._messageCount
  }

  addSource(source: ChatSource): void {
    if (this.sources.has(source.id)) {
      throw new Error(`ChatEngine already has a source with id "${source.id}"`)
    }
    this.sources.set(source.id, source)
    if (this.running) source.connect((m) => this.dispatch(m))
  }

  removeSource(id: string): void {
    const source = this.sources.get(id)
    if (source === undefined) return
    source.disconnect()
    this.sources.delete(id)
  }

  start(): void {
    if (this.running) return
    this.running = true
    for (const source of this.sources.values()) source.connect((m) => this.dispatch(m))
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    for (const source of this.sources.values()) source.disconnect()
  }

  /** Mengembalikan fungsi untuk berhenti berlangganan. */
  subscribe(handler: (message: ChatMessage) => void): () => void {
    this.handlers = [...this.handlers, handler]
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }

  private dispatch(message: ChatMessage): void {
    if (!this.running) return
    this._messageCount++
    for (const handler of this.handlers) {
      try {
        handler(message)
      } catch (error) {
        this.onError(error, message)
      }
    }
  }
}
