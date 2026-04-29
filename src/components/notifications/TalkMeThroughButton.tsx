'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  notificationId: string;
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | string;
  sourceType?: string;
  sourceId?: string;
  /**
   * If this notification is tied to an in-progress VoiceForge call, pass
   * the VAF call id here. When provided, clicking the button also
   * subscribes the Shadow panel to the live coaching SSE stream for that
   * call (see /api/shadow/voiceforge/calls/[callId]/coaching/stream).
   */
  callId?: string;
  /**
   * Test seam: lets unit tests inject a fake EventSource constructor.
   * Defaults to the global `EventSource`.
   */
  eventSourceFactory?: (url: string) => EventSourceLike;
}

/**
 * Minimal EventSource surface this component needs. Lets us swap in a
 * fake in tests without depending on the browser's EventSource type.
 */
export interface EventSourceLike {
  addEventListener: (
    type: string,
    listener: (event: { data: string }) => void,
  ) => void;
  close: () => void;
}

/**
 * "Talk me through this" button on a notification card.
 *
 * Only renders for P0/P1 notifications. Opens the Shadow panel via the
 * global `shadow:toggle` event and hands the agent a seed message it can
 * coach off of. The seed uses the `[TALK_ME_THROUGH]` sentinel so the
 * agent's intent classifier can route it to the walkthrough/coaching path.
 *
 * When `callId` is provided, also opens an SSE subscription to the live
 * VoiceForge call coaching stream and forwards each non-null
 * `buildSentimentCoachingMessage` result into the Shadow panel as a
 * `[COACHING]` seed message. The subscription is closed when the user
 * closes the panel (`shadow:closed` event) or this component unmounts.
 */
export function TalkMeThroughButton({
  notificationId,
  title,
  description,
  priority,
  sourceType,
  sourceId,
  callId,
  eventSourceFactory,
}: Props) {
  // Hooks must run unconditionally — track open state even when the
  // button itself is hidden so the SSE cleanup still works if priority
  // changes mid-render.
  const [isStreaming, setIsStreaming] = useState(false);
  const esRef = useRef<EventSourceLike | null>(null);

  // Close SSE when the Shadow panel closes anywhere in the app.
  useEffect(() => {
    if (!isStreaming) return;
    const stop = () => {
      esRef.current?.close();
      esRef.current = null;
      setIsStreaming(false);
    };
    window.addEventListener('shadow:closed', stop);
    return () => window.removeEventListener('shadow:closed', stop);
  }, [isStreaming]);

  // Final unmount cleanup.
  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  if (priority !== 'P0' && priority !== 'P1') return null;

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('shadow:toggle'));
    const source = sourceType && sourceId ? `${sourceType}/${sourceId}` : 'unknown';
    window.dispatchEvent(
      new CustomEvent('shadow:seed-message', {
        detail: {
          text: `[TALK_ME_THROUGH] Notification ${notificationId}: ${title}. ${description}. Source: ${source}`,
        },
      }),
    );

    // No active call → no live coaching to subscribe to. Done.
    if (!callId) return;

    // Avoid double-subscribing if user re-clicks while panel is open.
    if (esRef.current) return;

    const factory =
      eventSourceFactory ??
      ((url: string) =>
        new (
          globalThis as unknown as {
            EventSource: new (url: string) => EventSourceLike;
          }
        ).EventSource(url));

    const es = factory(`/api/shadow/voiceforge/calls/${callId}/coaching/stream`);
    esRef.current = es;
    setIsStreaming(true);

    es.addEventListener('coaching', (event: { data: string }) => {
      try {
        const parsed = JSON.parse(event.data) as { message?: string };
        if (!parsed?.message) return;
        // Forward the coaching string into the Shadow panel via the
        // existing seed-message event channel. Tag with [COACHING] so the
        // panel can render it with the orange/indigo coaching treatment
        // instead of as a normal user message.
        window.dispatchEvent(
          new CustomEvent('shadow:seed-message', {
            detail: { text: `[COACHING] ${parsed.message}` },
          }),
        );
      } catch {
        // Malformed event — ignore, VAF or proxy may emit junk frames.
      }
    });
  };

  return (
    <button
      onClick={handleClick}
      data-testid="talk-me-through-button"
      data-streaming={isStreaming ? 'true' : 'false'}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
        isStreaming
          ? // Active coaching: keep the Shadow brand (indigo) but bump the
            // border so it reads as "live" without inventing a new color.
            'text-indigo-700 bg-indigo-50 border-2 border-indigo-500 dark:text-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-400'
          : 'text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800'
      }`}
    >
      <span aria-hidden="true">📞</span>
      <span>Talk me through this</span>
    </button>
  );
}
