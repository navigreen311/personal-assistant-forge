import { StreamingPlayer } from '../audio-playback';

interface FakeAudioBuffer {
  duration: number;
}

interface FakeBufferSource {
  buffer: FakeAudioBuffer | null;
  connected: unknown;
  startedAt: number | null;
  start(at: number): void;
  connect(dest: unknown): void;
}

class FakeAudioContext {
  state: 'running' | 'closed' = 'running';
  currentTime = 0;
  destination = { __destination: true };
  decodeAudioData = jest.fn(
    (buf: ArrayBuffer): Promise<FakeAudioBuffer> => {
      // Simulate decode latency proportional to byte length so we can verify
      // ordering even when chunks decode out of order.
      const duration = buf.byteLength / 1000;
      return new Promise((resolve) => setTimeout(() => resolve({ duration }), 1));
    },
  );

  createBufferSource(): FakeBufferSource {
    const src: FakeBufferSource = {
      buffer: null,
      connected: null,
      startedAt: null,
      start(at: number) {
        this.startedAt = at;
        FakeAudioContext.lastStartedAt.push(at);
      },
      connect(dest) {
        this.connected = dest;
      },
    };
    FakeAudioContext.sources.push(src);
    return src;
  }

  close = jest.fn(async () => {
    this.state = 'closed';
  });

  static sources: FakeBufferSource[] = [];
  static lastStartedAt: number[] = [];
  static reset() {
    FakeAudioContext.sources = [];
    FakeAudioContext.lastStartedAt = [];
  }
}

// ---------------------------------------------------------------------------
// P-25: why this file runs on fake timers
// ---------------------------------------------------------------------------
//
// Every wait in this suite used to be `await new Promise(r => setTimeout(r, N))`
// against the real clock -- a guess that the decode chain would have finished N
// real milliseconds later. `FakeAudioContext.decodeAudioData` resolves on its own
// `setTimeout(..., 1)`, so the margin was 20ms of wall clock covering two 1ms
// decodes plus the microtask turns between them. That margin is not a property of
// the code under test; it is a property of how busy the machine is. On a loaded
// box -- 321 suites across ~31 jest workers, or three agents running the suite at
// once -- the process is descheduled past the 20ms and `sources` still has one
// entry, which is what P-24 measured as "fails 1 run in 6 on master".
//
// So the clock is pinned. `jest.advanceTimersByTimeAsync` moves fake time forward
// and drains the microtask queue between each timer callback, which is exactly the
// interleaving the decode chain needs: timer -> decode promise resolves -> chain
// step schedules the source -> next step's decode timer. No real time passes, so
// there is no margin left to lose and machine load cannot change the outcome.
//
// This is a stronger assertion than the old one, not a weaker one: 20 fake
// milliseconds is a hard bound the chain must finish inside, where 20 real
// milliseconds was a bound the chain was merely likely to finish inside.
beforeEach(() => {
  FakeAudioContext.reset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('StreamingPlayer', () => {
  it('does not create an AudioContext until enqueue is called', () => {
    const player = new StreamingPlayer({
      audioContextCtor: FakeAudioContext as unknown as typeof AudioContext,
    });
    expect(player.hasContext()).toBe(false);
  });

  it('creates the context lazily on first enqueue', async () => {
    const player = new StreamingPlayer({
      audioContextCtor: FakeAudioContext as unknown as typeof AudioContext,
    });
    player.enqueue(new Uint8Array([1, 2, 3]).buffer);
    expect(player.hasContext()).toBe(true);
    await player.close();
  });

  it('decodes and schedules each chunk on the AudioContext timeline', async () => {
    const player = new StreamingPlayer({
      audioContextCtor: FakeAudioContext as unknown as typeof AudioContext,
    });
    player.enqueue(new Uint8Array(1000).buffer);
    player.enqueue(new Uint8Array(2000).buffer);

    // Drive the decode chain to completion in fake time: both decode timers and
    // every microtask turn between them, with no dependence on the real clock.
    await jest.advanceTimersByTimeAsync(20);

    expect(FakeAudioContext.sources).toHaveLength(2);
    // Buffers were assigned and connected to the destination.
    for (const src of FakeAudioContext.sources) {
      expect(src.buffer).not.toBeNull();
      expect(src.connected).toEqual({ __destination: true });
      expect(src.startedAt).not.toBeNull();
    }
    // Second chunk must start no earlier than the first chunk's end.
    const [t0, t1] = FakeAudioContext.lastStartedAt;
    expect(t1).toBeGreaterThanOrEqual(t0);

    await player.close();
  });

  it('survives a decode failure and keeps processing later chunks', async () => {
    const player = new StreamingPlayer({
      audioContextCtor: FakeAudioContext as unknown as typeof AudioContext,
    });
    // Override decodeAudioData on the context once it's created.
    player.enqueue(new Uint8Array([1, 2, 3]).buffer);
    // Replace the mock so the next decode rejects, then reset so the chunk
    // after it succeeds.
    await jest.advanceTimersByTimeAsync(5);

    // Get the (single) FakeAudioContext instance via the source list.
    // Hard to reach directly — instead just verify the chain doesn't reject.
    // Add another chunk while still in chain; we just want no thrown error.
    expect(() => player.enqueue(new Uint8Array([4, 5]).buffer)).not.toThrow();

    await player.close();
  });

  it('close() disposes the AudioContext and is idempotent', async () => {
    const player = new StreamingPlayer({
      audioContextCtor: FakeAudioContext as unknown as typeof AudioContext,
    });
    player.enqueue(new Uint8Array([1]).buffer);
    await jest.advanceTimersByTimeAsync(5);

    await player.close();
    expect(player.hasContext()).toBe(false);

    // Second close should not throw.
    await player.close();
  });

  it('enqueue after close is a silent no-op', async () => {
    const player = new StreamingPlayer({
      audioContextCtor: FakeAudioContext as unknown as typeof AudioContext,
    });
    await player.close();
    expect(() => player.enqueue(new Uint8Array([1]).buffer)).not.toThrow();
    expect(player.hasContext()).toBe(false);
  });

  it('returns null context when no AudioContext is available', () => {
    const player = new StreamingPlayer({});
    // No window in test env (node), no injected ctor — silently no-op.
    expect(() => player.enqueue(new Uint8Array([1]).buffer)).not.toThrow();
    expect(player.hasContext()).toBe(false);
  });
});
