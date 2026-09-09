import { NextRequest } from 'next/server';
import { withEntityScope } from '@/shared/middleware/auth';
import { error } from '@/shared/utils/api-response';
import { createSSEStream, encodeSSEMessage } from '@/lib/realtime/sse';
import { getRecentEvents } from '@/lib/realtime/events';

// GET /api/events/stream?entityId=xxx
// Returns: SSE stream (Content-Type: text/event-stream)
//
// P-23 tenancy: this route took `?entityId=` on trust. `createSSEStream`
// subscribes the client to that entity's event bus and `getRecentEvents`
// replays its buffer, so an authenticated user could name any tenant's entity
// and receive a live feed of their events plus everything already buffered --
// a long-lived read of another tenant, not a single response.
//
// Single-entity, deliberately (tenancy-pattern.md §5b): a stream is one
// subscription to one entity, so `withEntityScope` matches the shape exactly.
// The only behaviour change is the refusal code -- a missing entity is now
// ENTITY_REQUIRED rather than MISSING_ENTITY, both 400.
export async function GET(req: NextRequest) {
  return withEntityScope(req, async (scopedReq, session, entityId) => {
    try {
      // Check for Last-Event-ID header (reconnection support)
      const lastEventId = scopedReq.headers.get('Last-Event-ID') ?? undefined;

      // Create SSE stream
      const { stream, clientId } = createSSEStream({
        userId: session.userId,
        entityId,
        lastEventId,
      });

      // If client is reconnecting, replay missed events
      if (lastEventId) {
        const recentEvents = getRecentEvents(entityId);
        const missedIndex = recentEvents.findIndex((e) => e.id === lastEventId);

        if (missedIndex > -1) {
          const missedEvents = recentEvents.slice(missedIndex + 1);

          // Wrap the original stream with a transform that prepends missed events
          const encoder = new TextEncoder();
          const transformStream = new TransformStream({
            start(controller) {
              // Replay missed events first
              for (const event of missedEvents) {
                const message = encodeSSEMessage({
                  id: event.id,
                  event: event.type,
                  data: JSON.stringify({
                    id: event.id,
                    type: event.type,
                    entityId: event.entityId,
                    userId: event.userId,
                    payload: event.payload,
                    timestamp: event.timestamp.toISOString(),
                    source: event.source,
                  }),
                });
                controller.enqueue(encoder.encode(message));
              }
            },
            transform(chunk, controller) {
              controller.enqueue(chunk);
            },
          });

          const replayStream = stream.pipeThrough(transformStream);

          return new Response(replayStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Client-Id': clientId,
            },
          });
        }
      }

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Client-Id': clientId,
        },
      });
    } catch (err) {
      console.error('[SSE] Stream error:', err);
      return error('SSE_ERROR', 'Failed to establish event stream', 500);
    }
  });
}
