/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { useStreamingVoice } from '../useStreamingVoice';
import { ShadowVoicePipeline } from '@/lib/shadow/voice/pipeline';

// ---- Fake MediaRecorder + getUserMedia plumbing ---------------------------

interface FakeRecorderEvents {
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
}

class FakeMediaRecorder implements FakeRecorderEvents {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = jest.fn().mockReturnValue(true);

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(public stream: MediaStream, public options?: MediaRecorderOptions) {
    FakeMediaRecorder.instances.push(this);
  }
  start(_timeslice?: number) {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
  emitData(blob: Blob) {
    this.ondataavailable?.({ data: blob });
  }
}

function installMediaShims() {
  (global as unknown as { MediaRecorder: unknown }).MediaRecorder =
    FakeMediaRecorder as unknown as typeof MediaRecorder;

  const getUserMedia = jest.fn(async () => {
    return {
      getTracks: () => [{ stop: jest.fn() }],
      getAudioTracks: () => [{ enabled: true }],
    } as unknown as MediaStream;
  });
  Object.defineProperty(global.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  return { getUserMedia };
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  FakeMediaRecorder.instances = [];
});

afterEach(() => {
  delete (global as unknown as { MediaRecorder?: unknown }).MediaRecorder;
});

describe('useStreamingVoice', () => {
  it('start() opens an STT stream and pumps recorder chunks via send()', async () => {
    installMediaShims();

    const send = jest.fn();
    const close = jest.fn();
    const pipeline = new ShadowVoicePipeline();
    jest.spyOn(pipeline, 'startStreamingTranscribe').mockImplementation(async (cb) => {
      // Simulate a partial then a final, on the next tick.
      setTimeout(() => cb.onPartial('hel', 0.4), 0);
      setTimeout(() => cb.onFinal('hello', 0.95), 1);
      return { sessionId: 'sess-1', send, close };
    });

    const { result } = renderHook(() => useStreamingVoice({ pipeline }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isRecording).toBe(true);

    // Push a chunk through the recorder.
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    await act(async () => {
      FakeMediaRecorder.instances[0].emitData(blob);
    });
    expect(send).toHaveBeenCalledWith(blob);

    // Let partial+final fire.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(result.current.finalTranscript).toContain('hello');
    expect(result.current.partialTranscript).toBe('');

    await act(async () => {
      result.current.stop();
    });
    expect(result.current.isRecording).toBe(false);
    expect(close).toHaveBeenCalled();
  });

  it('reports an error when streaming STT is unavailable', async () => {
    installMediaShims();
    const pipeline = new ShadowVoicePipeline();
    jest.spyOn(pipeline, 'startStreamingTranscribe').mockResolvedValue(null);

    const { result } = renderHook(() => useStreamingVoice({ pipeline }));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toMatch(/unavailable/i);
    expect(result.current.isRecording).toBe(false);
  });

  it('reports an error when MediaRecorder is unsupported', async () => {
    // Don't install MediaRecorder shim.
    const getUserMedia = jest.fn();
    Object.defineProperty(global.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const pipeline = new ShadowVoicePipeline();
    jest.spyOn(pipeline, 'startStreamingTranscribe');

    const { result } = renderHook(() => useStreamingVoice({ pipeline }));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toMatch(/MediaRecorder/);
  });
});
