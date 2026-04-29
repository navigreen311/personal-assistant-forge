// Streaming TTS WebSocket bridge.
//
// Mirror of stt-stream.ts on the synthesis side. The VAF TTS server
// streams back PCM audio frames (binary) for every `{type:'text', text}`
// frame we send. We hand the raw ArrayBuffer up to the caller —
// audio-playback.ts is responsible for turning that into actual sound.
//
// Wire format:
//   client -> server : `{type:'text', text}` to synthesize, or
//                      `{type:'close'}` to politely shut down
//   server -> client : binary PCM chunks; an `{type:'complete'}` JSON
//                      frame when the current utterance is finished

import { VAFTextToSpeech } from '@/lib/vaf/tts-client';

export interface TtsStreamHandle {
  sessionId: string;
  speak: (text: string) => void;
  close: () => void;
}

export interface TtsStreamCallbacks {
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onComplete: () => void;
  onError: (err: Error) => void;
}

export interface TtsStreamOptions {
  voice: string;
  speed?: number;
  emotion?: string;
}

interface VafTtsControlFrame {
  type?: string;
}

/**
 * Open a streaming TTS session and return a handle. Each call to
 * `speak(text)` sends a `text` frame; the server streams PCM chunks
 * back which arrive on `onAudioChunk`. `onComplete` fires once per
 * synthesized utterance.
 */
export async function openTtsStream(
  options: TtsStreamOptions,
  callbacks: TtsStreamCallbacks,
  deps?: { tts?: VAFTextToSpeech; webSocketCtor?: typeof WebSocket },
): Promise<TtsStreamHandle> {
  const tts = deps?.tts ?? new VAFTextToSpeech();
  const WSCtor = deps?.webSocketCtor ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
  if (!WSCtor) {
    throw new Error('WebSocket is not available in this environment');
  }

  const session = await tts.createStreamingSession({
    voice: options.voice,
    speed: options.speed,
    emotion: options.emotion,
  });

  const ws = new WSCtor(session.websocketUrl);
  if ('binaryType' in ws) {
    (ws as WebSocket).binaryType = 'arraybuffer';
  }

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (ev: Event) => {
      cleanup();
      reject(new Error(`WebSocket failed to open: ${describeEvent(ev)}`));
    };
    const cleanup = () => {
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
    };
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
  });

  ws.addEventListener('message', (ev: MessageEvent) => {
    // Binary frames are PCM audio; string frames are JSON control messages
    // (`complete`, `error`, etc).
    if (typeof ev.data === 'string') {
      try {
        const frame = JSON.parse(ev.data) as VafTtsControlFrame;
        if (frame.type === 'complete') {
          callbacks.onComplete();
        } else if (frame.type === 'error') {
          const message =
            (frame as { message?: string }).message ?? 'TTS stream reported error';
          callbacks.onError(new Error(message));
        }
      } catch (err) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
      return;
    }

    const buf = toArrayBuffer(ev.data);
    if (buf) callbacks.onAudioChunk(buf);
  });

  ws.addEventListener('error', (ev: Event) => {
    callbacks.onError(new Error(`TTS stream error: ${describeEvent(ev)}`));
  });

  const speak = (text: string) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type: 'text', text }));
  };

  const close = () => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'close' }));
      } catch {
        // Ignore — closing anyway.
      }
    }
    try {
      ws.close();
    } catch {
      // Same.
    }
  };

  return { sessionId: session.sessionId, speak, close };
}

function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    // Copy the relevant slice into a fresh ArrayBuffer so the result is
    // detachable and the type is unambiguously ArrayBuffer (not the
    // SharedArrayBuffer | ArrayBuffer union TS infers from view.buffer).
    const out = new ArrayBuffer(view.byteLength);
    new Uint8Array(out).set(
      new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength),
    );
    return out;
  }
  // Blobs only show up if the runtime ignores binaryType='arraybuffer'.
  // We can't await synchronously here, so callers in that path need to
  // pre-convert. Returning null is the safe choice.
  return null;
}

function describeEvent(ev: Event): string {
  if (typeof ev === 'object' && ev && 'message' in ev) {
    return String((ev as { message: unknown }).message);
  }
  return ev?.type ?? 'unknown';
}
