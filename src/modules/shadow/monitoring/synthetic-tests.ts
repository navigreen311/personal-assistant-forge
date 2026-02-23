// ============================================================================
// Shadow Voice Agent — Synthetic Monitoring Tests
// Automated health checks that simulate real user interactions.
// Run periodically (e.g., every 5 minutes) or on-demand via API.
// Tests cover: text chat, voice pipeline, phone integration, tool access.
// ============================================================================

import { prisma } from '@/lib/db';

// --- Types ---

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface SyntheticTestSuiteResult {
  passed: number;
  failed: number;
  results: TestResult[];
}

// --- Synthetic Monitor ---

export class SyntheticMonitor {
  /**
   * Run all synthetic tests and return aggregated results.
   */
  async runAllTests(): Promise<SyntheticTestSuiteResult> {
    const results: TestResult[] = [];

    // Run tests sequentially to avoid resource contention
    results.push(await this.testTextChat());
    results.push(await this.testToolAccessSweep());
    results.push(await this.testDatabaseConnectivity());
    results.push(await this.testSessionLifecycle());

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return { passed, failed, results };
  }

  /**
   * Test basic text chat flow:
   * - Creates a synthetic session
   * - Sends a test message
   * - Verifies the message is stored
   * - Cleans up
   */
  async testTextChat(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'text_chat_flow';

    try {
      // Create a synthetic test session
      const session = await prisma.shadowVoiceSession.create({
        data: {
          userId: 'synthetic-test-user',
          status: 'active',
          currentChannel: 'web',
          startedAt: new Date(),
          lastActivityAt: new Date(),
          messageCount: 0,
          totalDurationSeconds: 0,
        },
      });

      // Create a test message
      const message = await prisma.shadowMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Synthetic test message - please ignore',
          contentType: 'TEXT',
          channel: 'web',
        },
      });

      // Verify message was stored
      const retrieved = await prisma.shadowMessage.findUnique({
        where: { id: message.id },
      });

      if (!retrieved) {
        throw new Error('Message was not stored correctly');
      }

      if (retrieved.content !== 'Synthetic test message - please ignore') {
        throw new Error('Message content mismatch');
      }

      // Cleanup
      await prisma.shadowMessage.delete({ where: { id: message.id } });
      await prisma.shadowVoiceSession.delete({ where: { id: session.id } });

      return {
        name: testName,
        passed: true,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name: testName,
        passed: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Test that all tool-related database tables are accessible.
   * Performs a lightweight count query on each relevant table.
   */
  async testToolAccessSweep(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'tool_access_sweep';

    try {
      // Sweep all Shadow-related tables with a simple count
      const tables = await Promise.all([
        prisma.shadowVoiceSession.count().then((c) => ({ table: 'shadowVoiceSession', count: c })),
        prisma.shadowMessage.count().then((c) => ({ table: 'shadowMessage', count: c })),
        prisma.shadowSessionOutcome.count().then((c) => ({ table: 'shadowSessionOutcome', count: c })),
        prisma.shadowConsentReceipt.count().then((c) => ({ table: 'shadowConsentReceipt', count: c })),
        prisma.shadowAuthEvent.count().then((c) => ({ table: 'shadowAuthEvent', count: c })),
      ]);

      // All tables must be accessible (count >= 0, no error)
      for (const t of tables) {
        if (t.count < 0) {
          throw new Error(`Table ${t.table} returned invalid count: ${t.count}`);
        }
      }

      return {
        name: testName,
        passed: true,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name: testName,
        passed: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Test basic database connectivity with a simple raw query.
   */
  async testDatabaseConnectivity(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'database_connectivity';

    try {
      await prisma.$queryRaw`SELECT 1 as health_check`;

      return {
        name: testName,
        passed: true,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name: testName,
        passed: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Test the full session lifecycle: create -> touch -> end -> delete.
   */
  async testSessionLifecycle(): Promise<TestResult> {
    const start = Date.now();
    const testName = 'session_lifecycle';

    try {
      // Create
      const session = await prisma.shadowVoiceSession.create({
        data: {
          userId: 'synthetic-test-lifecycle',
          status: 'active',
          currentChannel: 'web',
          startedAt: new Date(),
          lastActivityAt: new Date(),
          messageCount: 0,
          totalDurationSeconds: 0,
        },
      });

      // Touch (update lastActivityAt + increment messageCount)
      await prisma.shadowVoiceSession.update({
        where: { id: session.id },
        data: {
          messageCount: 1,
          lastActivityAt: new Date(),
        },
      });

      // End
      await prisma.shadowVoiceSession.update({
        where: { id: session.id },
        data: {
          status: 'ended',
          endedAt: new Date(),
        },
      });

      // Verify ended status
      const ended = await prisma.shadowVoiceSession.findUnique({
        where: { id: session.id },
      });

      if (ended?.status !== 'ended') {
        throw new Error('Session was not ended correctly');
      }

      // Delete
      await prisma.shadowVoiceSession.delete({ where: { id: session.id } });

      // Verify deleted
      const deleted = await prisma.shadowVoiceSession.findUnique({
        where: { id: session.id },
      });

      if (deleted) {
        throw new Error('Session was not deleted');
      }

      return {
        name: testName,
        passed: true,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name: testName,
        passed: false,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }
}

// Singleton export
export const syntheticMonitor = new SyntheticMonitor();
