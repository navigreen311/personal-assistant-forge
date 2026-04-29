// Streaming STT WebSocket bridge.
//
// `createStreamingSession()` on VAFSpeechToText returns a session descriptor
// (sessionId + websocketUrl), but the caller still has to open the socket,
// pump audio chunks at it, and parse the JSON transcript frames. This module
// is that "still has to" part — a thin client over the VAF streaming protocol.
//
// The wire format is:
//   client -> server : raw audio bytes (Blob/ArrayBuffer), or
//                      `{type:'close'}` to politely shut down
//   server -> client : JSON `{text, confidence, isFinal}`
//
// We dispatch to onPartial/onFinal based on the `isFinal` flag.

import { VAFSpeechToText } from '@/lib/vaf/stt-client';

export interface SttStreamHandle {
  sessionId: string;
  send: (chunk: Blob | ArrayBuffer) => void;
  close: () => void;
}

export interface SttStreamCallbacks {
  onPartial: (text: string, confidence: number) => void;
  onFinal: (text: string, confidence: number) => void;
  onError: (err: Error) => void;
  onClose: () => void;
}

export interface SttStreamOptions {
  language?: string;
  vocabulary?: string[];
  entityCompliance?: string[];
}

interface VafTranscriptFrame {
  text?: string;
  confidence?: number;
  isFinal?: boolean;
}

/**
 * Open a streaming STT session and return a handle for sending audio
 * chunks. The returned promise resolves once the underlying WebSocket
 * has reached OPEN — calling `send()` before that is fine (chunks are
 * not buffered before open in this thin wrapper, callers should await).
 */
export async function openSttStream(
  options: SttStreamOptions,
  callbacks: SttStreamCallbacks,
  deps?: { stt?: VAFSpeechToText; webSocketCtor?: typeof WebSocket },
): Promise<SttStreamHandle> {
  const stt = deps?.stt ?? new VAFSpeechToText();
  const WSCtor = deps?.webSocketCtor ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
  if (!WSCtor) {
    throw new Error('WebSocket is not available in this environment');
  }

  const session = await stt.createStreamingSession({
    language: options.language,
    vocabulary: options.vocabulary,
    entityCompliance: options.entityCompliance,
  });

  const ws = new WSCtor(session.websocketUrl);
  // Server sends JSON text frames; we want strings, not Blobs.
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
    // Transcripts come back as JSON strings. If a binary frame ever lands
    // here, ignore it — STT does not stream audio back.
    if (typeof ev.data !== 'string') return;
    try {
      const frame = JSON.parse(ev.data) as VafTranscriptFrame;
      const text = frame.text ?? '';
      const confidence = typeof frame.confidence === 'number' ? frame.confidence : 0;
      if (frame.isFinal) {
        callbacks.onFinal(text, confidence);
      } else {
        callbacks.onPartial(text, confidence);
      }
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  });

  ws.addEventListener('error', (ev: Event) => {
    callbacks.onError(new Error(`STT stream error: ${describeEvent(ev)}`));
  });

  ws.addEventListener('close', () => {
    callbacks.onClose();
  });

  const send = (chunk: Blob | ArrayBuffer) => {
    if (ws.readyState !== ws.OPEN) return;
    if (typeof Blob !== 'undefined' && chunk instanceof Blob) {
      // Blob -> ArrayBuffer hop. We unwrap because some test/runtime
      // WebSocket impls don't accept Blob directly.
      chunk
        .arrayBuffer()
        .then((buf) => {
          if (ws.readyState === ws.OPEN) ws.send(buf);
        })
        .catch((err) => {
          callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        });
      return;
    }
    ws.send(chunk as ArrayBuffer);
  };

  const close = () => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'close' }));
      } catch {
        // Ignore — we're closing anyway.
      }
    }
    try {
      ws.close();
    } catch {
      // Same.
    }
  };

  return { sessionId: session.sessionId, send, close };
}

function describeEvent(ev: Event): string {
  if (typeof ev === 'object' && ev && 'message' in ev) {
    return String((ev as { message: unknown }).message);
  }
  return ev?.type ?? 'unknown';
}
