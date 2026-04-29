/**
 * @jest-environment jsdom
 */

// ============================================================================
// Tests — TalkMeThroughButton coaching subscription
// Verifies that:
//   - the button only renders for P0/P1
//   - clicking dispatches shadow:toggle + the [TALK_ME_THROUGH] seed
//   - when callId is supplied, an EventSource is opened against the
//     coaching SSE route and incoming `coaching` events are forwarded as
//     [COACHING]-prefixed shadow:seed-message dispatches
//   - the EventSource is closed on shadow:closed and on unmount
// ============================================================================

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  TalkMeThroughButton,
  type EventSourceLike,
} from '@/components/notifications/TalkMeThroughButton';

class FakeEventSource implements EventSourceLike {
  url: string;
  closed = false;
  private listeners = new Map<string, Array<(event: { data: string }) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(
    type: string,
    listener: (event: { data: string }) => void,
  ): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emit(type: string, data: string): void {
    const list = this.listeners.get(type) ?? [];
    for (const fn of list) fn({ data });
  }

  close(): void {
    this.closed = true;
  }
}

describe('TalkMeThroughButton — coaching subscription', () => {
  let lastES: FakeEventSource | null = null;
  const factory = (url: string) => {
    lastES = new FakeEventSource(url);
    return lastES;
  };

  beforeEach(() => {
    lastES = null;
  });

  it('does not render for P2 priority', () => {
    const { container } = render(
      <TalkMeThroughButton
        notificationId="n1"
        title="t"
        description="d"
        priority="P2"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('dispatches shadow:toggle and [TALK_ME_THROUGH] seed on click', () => {
    const events: Array<{ type: string; detail?: unknown }> = [];
    const handlerToggle = () => events.push({ type: 'shadow:toggle' });
    const handlerSeed = (e: Event) =>
      events.push({
        type: 'shadow:seed-message',
        detail: (e as CustomEvent).detail,
      });
    window.addEventListener('shadow:toggle', handlerToggle);
    window.addEventListener('shadow:seed-message', handlerSeed);

    render(
      <TalkMeThroughButton
        notificationId="n1"
        title="Invoice 42"
        description="AP overdue"
        priority="P1"
      />,
    );

    fireEvent.click(screen.getByTestId('talk-me-through-button'));

    expect(events.find((e) => e.type === 'shadow:toggle')).toBeDefined();
    const seed = events.find((e) => e.type === 'shadow:seed-message');
    expect(seed).toBeDefined();
    expect((seed!.detail as { text: string }).text).toMatch(/\[TALK_ME_THROUGH\]/);
    expect((seed!.detail as { text: string }).text).toMatch(/Invoice 42/);

    window.removeEventListener('shadow:toggle', handlerToggle);
    window.removeEventListener('shadow:seed-message', handlerSeed);
  });

  it('does NOT open EventSource when callId is absent', () => {
    render(
      <TalkMeThroughButton
        notificationId="n1"
        title="t"
        description="d"
        priority="P0"
        eventSourceFactory={factory}
      />,
    );
    fireEvent.click(screen.getByTestId('talk-me-through-button'));
    expect(lastES).toBeNull();
  });

  it('opens EventSource and forwards coaching frames as [COACHING] seed messages', () => {
    const seeds: string[] = [];
    const handler = (e: Event) => {
      seeds.push((e as CustomEvent<{ text: string }>).detail.text);
    };
    window.addEventListener('shadow:seed-message', handler);

    render(
      <TalkMeThroughButton
        notificationId="n1"
        title="Live call"
        description="AP on the line"
        priority="P0"
        callId="call-abc"
        eventSourceFactory={factory}
      />,
    );

    fireEvent.click(screen.getByTestId('talk-me-through-button'));
    expect(lastES).not.toBeNull();
    expect(lastES!.url).toBe('/api/shadow/voiceforge/calls/call-abc/coaching/stream');

    // Simulate the SSE route emitting a coaching frame.
    act(() => {
      lastES!.emit(
        'coaching',
        JSON.stringify({
          id: 'sess-1',
          callId: 'call-abc',
          message: 'The call is going well — caller sounds receptive.',
        }),
      );
    });

    const coachingSeed = seeds.find((t) => t.startsWith('[COACHING]'));
    expect(coachingSeed).toBeDefined();
    expect(coachingSeed).toMatch(/going well/);

    // Button reflects streaming state visually.
    expect(
      screen.getByTestId('talk-me-through-button').getAttribute('data-streaming'),
    ).toBe('true');

    window.removeEventListener('shadow:seed-message', handler);
  });

  it('ignores malformed coaching events without dispatching seeds', () => {
    const seeds: string[] = [];
    const handler = (e: Event) => {
      seeds.push((e as CustomEvent<{ text: string }>).detail.text);
    };
    window.addEventListener('shadow:seed-message', handler);

    render(
      <TalkMeThroughButton
        notificationId="n1"
        title="t"
        description="d"
        priority="P0"
        callId="call-abc"
        eventSourceFactory={factory}
      />,
    );

    fireEvent.click(screen.getByTestId('talk-me-through-button'));
    // Drop the [TALK_ME_THROUGH] seed so we only watch for [COACHING].
    seeds.length = 0;

    act(() => {
      lastES!.emit('coaching', 'not json');
    });

    expect(seeds.find((t) => t.startsWith('[COACHING]'))).toBeUndefined();

    window.removeEventListener('shadow:seed-message', handler);
  });

  it('does not double-subscribe when clicked twice while streaming', () => {
    render(
      <TalkMeThroughButton
        notificationId="n1"
        title="t"
        description="d"
        priority="P0"
        callId="call-abc"
        eventSourceFactory={factory}
      />,
    );

    fireEvent.click(screen.getByTestId('talk-me-through-button'));
    const firstES = lastES;
    fireEvent.click(screen.getByTestId('talk-me-through-button'));
    expect(lastES).toBe(firstES);
    expect(firstES!.closed).toBe(false);
  });

  it('closes the EventSource when shadow:closed fires', () => {
    render(
      <TalkMeThroughButton
        notificationId="n1"
        title="t"
        description="d"
        priority="P0"
        callId="call-abc"
        eventSourceFactory={factory}
      />,
    );
    fireEvent.click(screen.getByTestId('talk-me-through-button'));
    expect(lastES!.closed).toBe(false);

    act(() => {
      window.dispatchEvent(new CustomEvent('shadow:closed'));
    });

    expect(lastES!.closed).toBe(true);
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = render(
      <TalkMeThroughButton
        notificationId="n1"
        title="t"
        description="d"
        priority="P0"
        callId="call-abc"
        eventSourceFactory={factory}
      />,
    );
    fireEvent.click(screen.getByTestId('talk-me-through-button'));
    expect(lastES!.closed).toBe(false);

    unmount();
    expect(lastES!.closed).toBe(true);
  });
});
