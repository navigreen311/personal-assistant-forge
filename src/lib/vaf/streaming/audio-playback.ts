// Streaming audio playback.
//
// Decodes incoming PCM/encoded chunks via Web Audio's decodeAudioData and
// schedules them back-to-back on a single AudioContext timeline so the
// listener hears one continuous stream rather than discrete clicks.
//
// Two non-obvious choices worth flagging:
//
// 1. The AudioContext is created lazily on the first `enqueue()` call, never
//    in the constructor. Constructing an AudioContext eagerly would crash
//    SSR (no `window`) and would also break Chrome's autoplay policy when
//    the player is instantiated outside a user gesture. By deferring, the
//    context is created in the same tick as the chunk arrival — typically
//    moments after a user clicked "send".
//
// 2. We chain decode promises through a single `decodeChain` so chunks
//    play in the order they arrived even if `decodeAudioData` resolves out
//    of order (it can — different chunk sizes decode at different speeds).
//    The next-start time (`nextStartTime`) walks forward by each buffer's
//    duration, giving seamless playback. If a chunk arrives late (after the
//    schedule has drifted past `currentTime`), we snap forward so we don't
//    queue audio in the past.

export interface StreamingPlayerDeps {
  /** Optional injected AudioContext constructor (used by tests). */
  audioContextCtor?: typeof AudioContext;
}

type AudioContextCtor = typeof AudioContext;

/** Player that consumes raw audio chunks and plays them gaplessly. */
export class StreamingPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private decodeChain: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly ctxCtor?: AudioContextCtor;

  constructor(deps?: StreamingPlayerDeps) {
    this.ctxCtor = deps?.audioContextCtor;
  }

  /**
   * Append an encoded audio chunk to the playback queue. The chunk is
   * decoded and scheduled to play immediately after the previous chunk.
   * Safe to call before any user gesture — context creation is deferred,
   * but actual sound only emerges once the browser permits playback.
   */
  enqueue(chunk: ArrayBuffer): void {
    if (this.closed) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    // Clone the buffer so the caller can reuse theirs and so decodeAudioData
    // can detach without blowing up the next chunk in line.
    const owned = chunk.slice(0);

    this.decodeChain = this.decodeChain.then(async () => {
      if (this.closed) return;
      try {
        const buffer = await ctx.decodeAudioData(owned);
        if (this.closed) return;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        const now = ctx.currentTime;
        // If the previous-chunk schedule has slipped behind real time
        // (slow decode, gap in incoming frames), restart at `now`.
        const startAt = Math.max(now, this.nextStartTime);
        source.start(startAt);
        this.nextStartTime = startAt + buffer.duration;
      } catch {
        // Don't kill the chain on a single bad chunk; log via console so
        // the symptom is visible without a noisy onerror callback in the
        // public API.
        if (typeof console !== 'undefined') {
          console.warn('[StreamingPlayer] failed to decode chunk');
        }
      }
    });
  }

  /**
   * Stop scheduling new chunks and tear down the AudioContext. Pending
   * decodes are drained but their scheduled sources are abandoned with
   * the context — the browser cancels them on close.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Wait for in-flight decodes to settle before tearing down.
    try {
      await this.decodeChain;
    } catch {
      // Swallow — we're shutting down.
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch {
        // Some test envs throw here — ignore.
      }
    }
    this.audioContext = null;
    this.nextStartTime = 0;
  }

  /** Visible for tests. */
  hasContext(): boolean {
    return !!this.audioContext;
  }

  private ensureContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext;
    const Ctor = this.resolveCtor();
    if (!Ctor) return null;
    this.audioContext = new Ctor();
    this.nextStartTime = this.audioContext.currentTime;
    return this.audioContext;
  }

  private resolveCtor(): AudioContextCtor | undefined {
    if (this.ctxCtor) return this.ctxCtor;
    if (typeof window === 'undefined') return undefined;
    const w = window as unknown as {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    return w.AudioContext ?? w.webkitAudioContext;
  }
}
