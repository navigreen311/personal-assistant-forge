/**
 * Unit tests for the VoiceForge call lifecycle hook registry.
 *
 * Covers register/unregister, dispatch order, multi-handler dispatch, and
 * the isolation guarantee that one failing handler does not abort others.
 */

import {
  onCallStart,
  onCallEnd,
  emitCallStart,
  emitCallEnd,
  __resetCallLifecycleHandlersForTesting,
} from '@/modules/voiceforge/services/call-lifecycle';

beforeEach(() => {
  __resetCallLifecycleHandlersForTesting();
});

describe('call-lifecycle registry', () => {
  it('dispatches call-start to all registered handlers', async () => {
    const a = jest.fn();
    const b = jest.fn();
    onCallStart(a);
    onCallStart(b);

    await emitCallStart({
      callId: 'c1',
      entityId: 'e1',
      personaId: 'p1',
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][0]).toMatchObject({ callId: 'c1', entityId: 'e1' });
  });

  it('dispatches call-end to all registered handlers', async () => {
    const a = jest.fn();
    const b = jest.fn();
    onCallEnd(a);
    onCallEnd(b);

    await emitCallEnd({ callId: 'c2', outcome: 'INTERESTED', duration: 30 });

    expect(a).toHaveBeenCalledWith({ callId: 'c2', outcome: 'INTERESTED', duration: 30 });
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('returns an unregister function from onCallStart', async () => {
    const handler = jest.fn();
    const unregister = onCallStart(handler);
    unregister();

    await emitCallStart({ callId: 'c3', entityId: 'e1', personaId: 'p1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('returns an unregister function from onCallEnd', async () => {
    const handler = jest.fn();
    const unregister = onCallEnd(handler);
    unregister();

    await emitCallEnd({ callId: 'c4' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates failing handlers — one throw does not block others', async () => {
    const good = jest.fn();
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    onCallStart(bad);
    onCallStart(good);

    await expect(
      emitCallStart({ callId: 'c5', entityId: 'e1', personaId: 'p1' }),
    ).resolves.toBeUndefined();

    expect(good).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it('awaits async handlers', async () => {
    const order: string[] = [];
    onCallStart(async () => {
      await new Promise((r) => setImmediate(r));
      order.push('async-handler');
    });

    await emitCallStart({ callId: 'c6', entityId: 'e1', personaId: 'p1' });
    order.push('after-emit');

    expect(order).toEqual(['async-handler', 'after-emit']);
  });
});
