// ============================================================================
// Shadow Voice Agent — Monitoring Module Unit Tests
// Tests: telemetry tracking, failover chain, timeout handling
// ============================================================================

import { TelemetryTracker } from '@/modules/shadow/monitoring/telemetry';
import { FailoverManager } from '@/modules/shadow/monitoring/failover';

// ============================================================================
// Telemetry Tracker Tests
// ============================================================================

describe('TelemetryTracker', () => {
  let tracker: TelemetryTracker;

  beforeEach(() => {
    tracker = new TelemetryTracker();
  });

  describe('stage tracking', () => {
    it('should track start and end of a stage', async () => {
      tracker.startStage('stt');

      // Simulate some processing time
      await sleep(10);

      tracker.endStage('stt');

      const telemetry = tracker.getTelemetry();
      expect(telemetry.sttMs).toBeDefined();
      expect(telemetry.sttMs!).toBeGreaterThanOrEqual(5); // Allow some tolerance
    });

    it('should track multiple stages independently', async () => {
      tracker.startStage('stt');
      await sleep(10);
      tracker.endStage('stt');

      tracker.startStage('intent_classification');
      await sleep(10);
      tracker.endStage('intent_classification');

      tracker.startStage('response_generation');
      await sleep(10);
      tracker.endStage('response_generation');

      const telemetry = tracker.getTelemetry();
      expect(telemetry.sttMs).toBeDefined();
      expect(telemetry.intentClassificationMs).toBeDefined();
      expect(telemetry.responseGenerationMs).toBeDefined();
    });

    it('should not report unfinished stages', () => {
      tracker.startStage('stt');
      // Don't end it

      const telemetry = tracker.getTelemetry();
      expect(telemetry.sttMs).toBeUndefined();
    });

    it('should calculate totalMs from request start', async () => {
      await sleep(20);

      const telemetry = tracker.getTelemetry();
      expect(telemetry.totalMs).toBeGreaterThanOrEqual(15);
    });
  });

  describe('tool call tracking', () => {
    it('should record tool calls with duration and status', () => {
      tracker.addToolCall('search_knowledge', 150, 'success');
      tracker.addToolCall('create_task', 200, 'success');
      tracker.addToolCall('send_email', 0, 'error');

      const telemetry = tracker.getTelemetry();
      expect(telemetry.toolCalls).toHaveLength(3);
      expect(telemetry.toolCalls[0]).toEqual({
        tool: 'search_knowledge',
        durationMs: 150,
        status: 'success',
      });
      expect(telemetry.toolCalls[2]).toEqual({
        tool: 'send_email',
        durationMs: 0,
        status: 'error',
      });
    });

    it('should return empty tool calls array when none recorded', () => {
      const telemetry = tracker.getTelemetry();
      expect(telemetry.toolCalls).toHaveLength(0);
    });
  });

  describe('model metadata', () => {
    it('should include model metadata when set', () => {
      tracker.setModelMetadata({
        model: 'claude-sonnet-4-20250514',
        tokensIn: 1500,
        tokensOut: 300,
        cost: 0.0042,
      });

      const telemetry = tracker.getTelemetry();
      expect(telemetry.model).toBe('claude-sonnet-4-20250514');
      expect(telemetry.tokensIn).toBe(1500);
      expect(telemetry.tokensOut).toBe(300);
      expect(telemetry.cost).toBe(0.0042);
    });

    it('should not include metadata fields when not set', () => {
      const telemetry = tracker.getTelemetry();
      expect(telemetry.model).toBeUndefined();
      expect(telemetry.tokensIn).toBeUndefined();
      expect(telemetry.tokensOut).toBeUndefined();
      expect(telemetry.cost).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('should clear all state on reset', () => {
      tracker.startStage('stt');
      tracker.endStage('stt');
      tracker.addToolCall('test', 100, 'ok');
      tracker.setModelMetadata({ model: 'test' });

      tracker.reset();

      const telemetry = tracker.getTelemetry();
      expect(telemetry.sttMs).toBeUndefined();
      expect(telemetry.toolCalls).toHaveLength(0);
      expect(telemetry.model).toBeUndefined();
    });
  });
});

// ============================================================================
// Failover Manager Tests
// ============================================================================

describe('FailoverManager', () => {
  let manager: FailoverManager;

  beforeEach(() => {
    manager = new FailoverManager();
  });

  describe('executeWithFailover', () => {
    it('should return primary result when primary succeeds', async () => {
      const result = await manager.executeWithFailover({
        service: 'test-stt',
        primary: async () => 'primary-result',
        fallback: async () => 'fallback-result',
        emergency: async () => 'emergency-result',
        timeoutMs: 5000,
      });

      expect(result.result).toBe('primary-result');
      expect(result.provider).toBe('primary');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should fall back when primary fails', async () => {
      const result = await manager.executeWithFailover({
        service: 'test-stt',
        primary: async () => {
          throw new Error('Primary failed');
        },
        fallback: async () => 'fallback-result',
        emergency: async () => 'emergency-result',
        timeoutMs: 5000,
      });

      expect(result.result).toBe('fallback-result');
      expect(result.provider).toBe('fallback');
    });

    it('should use emergency when both primary and fallback fail', async () => {
      const result = await manager.executeWithFailover({
        service: 'test-stt',
        primary: async () => {
          throw new Error('Primary failed');
        },
        fallback: async () => {
          throw new Error('Fallback failed');
        },
        emergency: async () => 'emergency-result',
        timeoutMs: 5000,
      });

      expect(result.result).toBe('emergency-result');
      expect(result.provider).toBe('emergency');
    });

    it('should throw when all providers fail', async () => {
      await expect(
        manager.executeWithFailover({
          service: 'test-stt',
          primary: async () => {
            throw new Error('Primary failed');
          },
          fallback: async () => {
            throw new Error('Fallback failed');
          },
          emergency: async () => {
            throw new Error('Emergency failed');
          },
          timeoutMs: 5000,
        }),
      ).rejects.toThrow('All providers failed');
    });

    it('should include service name in the error message when all fail', async () => {
      await expect(
        manager.executeWithFailover({
          service: 'my-critical-service',
          primary: async () => {
            throw new Error('nope');
          },
          fallback: async () => {
            throw new Error('nope');
          },
          emergency: async () => {
            throw new Error('nope');
          },
          timeoutMs: 5000,
        }),
      ).rejects.toThrow('my-critical-service');
    });

    it('should timeout primary and try fallback', async () => {
      const result = await manager.executeWithFailover({
        service: 'test-stt',
        primary: async () => {
          // Simulate a slow primary that takes longer than timeout
          await sleep(200);
          return 'slow-primary';
        },
        fallback: async () => 'fast-fallback',
        emergency: async () => 'emergency-result',
        timeoutMs: 50,
      });

      expect(result.result).toBe('fast-fallback');
      expect(result.provider).toBe('fallback');
    });

    it('should timeout both primary and fallback, then try emergency', async () => {
      const result = await manager.executeWithFailover({
        service: 'test-stt',
        primary: async () => {
          await sleep(200);
          return 'slow-primary';
        },
        fallback: async () => {
          await sleep(200);
          return 'slow-fallback';
        },
        emergency: async () => 'emergency-result',
        timeoutMs: 50,
      });

      expect(result.result).toBe('emergency-result');
      expect(result.provider).toBe('emergency');
    });

    it('should track total latency across failover chain', async () => {
      const result = await manager.executeWithFailover({
        service: 'test-stt',
        primary: async () => {
          throw new Error('fail');
        },
        fallback: async () => {
          await sleep(20);
          return 'fallback-result';
        },
        emergency: async () => 'emergency-result',
        timeoutMs: 5000,
      });

      expect(result.latencyMs).toBeGreaterThanOrEqual(15);
      expect(result.provider).toBe('fallback');
    });

    it('should handle non-Error throws from providers', async () => {
      await expect(
        manager.executeWithFailover({
          service: 'test',
          primary: async () => {
            throw 'string error';
          },
          fallback: async () => {
            throw 42;
          },
          emergency: async () => {
            throw null;
          },
          timeoutMs: 5000,
        }),
      ).rejects.toThrow('All providers failed');
    });

    it('should give emergency 2x timeout', async () => {
      // Primary and fallback timeout quickly, emergency needs more time
      // but should succeed within 2x timeout
      const result = await manager.executeWithFailover({
        service: 'test-stt',
        primary: async () => {
          await sleep(200);
          return 'slow';
        },
        fallback: async () => {
          await sleep(200);
          return 'slow';
        },
        emergency: async () => {
          // This takes 80ms, timeout is 50ms, but emergency gets 100ms (2x)
          await sleep(80);
          return 'emergency-ok';
        },
        timeoutMs: 50,
      });

      expect(result.result).toBe('emergency-ok');
      expect(result.provider).toBe('emergency');
    });
  });
});

// ============================================================================
// Helper
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
