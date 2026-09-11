/**
 * P-39 — the seam meters, including the paths that are easy to leave out.
 *
 * The Anthropic SDK is mocked at the package boundary (`@anthropic-ai/sdk`),
 * NOT at `@/lib/ai`. That distinction is the point: mocking the seam would
 * replace the very code under test, which is how 121 test files in this
 * repository can pass while nothing is metered. Here the real `client.ts` runs,
 * the real `metering.ts` runs, and only the network and the database are fake.
 *
 * The durable half -- that a row exists, survives a restart, and does not
 * collide with the plan meter -- is in `tests/db/ai-metering.test.ts` against a
 * real Postgres, because a mocked Prisma cannot observe a row.
 */

const messagesCreate = jest.fn();
const messagesStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class MockAnthropic {
    messages = {
      create: (...args: unknown[]) => messagesCreate(...args),
      stream: (...args: unknown[]) => messagesStream(...args),
    };
  },
}));

jest.mock('@/lib/db', () => ({
  prisma: { usageRecord: { create: jest.fn(), findMany: jest.fn() } },
}));

import { chat, createMessage, generateJSON, generateText, streamText } from '@/lib/ai/client';
import { prisma } from '@/lib/db';

const create = prisma.usageRecord.create as jest.Mock;
const rows = () => create.mock.calls.map((call) => call[0].data);

const reply = (text: string, input = 100, output = 20) => ({
  model: 'claude-sonnet-4-6',
  content: [{ type: 'text', text }],
  usage: { input_tokens: input, output_tokens: output },
});

async function* streamEvents(input: number, output: number, chunks: string[], stop = true) {
  yield { type: 'message_start', message: { usage: { input_tokens: input, output_tokens: 0 } } };
  for (const chunk of chunks) {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } };
  }
  yield { type: 'message_delta', usage: { output_tokens: output } };
  if (stop) yield { type: 'message_stop' };
}

beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue({ id: 'row-1' });
});

describe('P-39: every seam function writes a usage row', () => {
  it('generateText', async () => {
    messagesCreate.mockResolvedValue(reply('hello', 1000, 500));
    await generateText('hi', { entityId: 'e1', userId: 'u1', module: 'inbox' });

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      entityId: 'e1',
      userId: 'u1',
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      module: 'inbox',
    });
    // 1000/1e6*3 + 500/1e6*15 = 0.0105
    expect(rows()[0].cost).toBeCloseTo(0.0105, 6);
  });

  it('chat', async () => {
    messagesCreate.mockResolvedValue(reply('ok', 7, 3));
    await chat([{ role: 'user', content: 'hi' }], { entityId: 'e1', module: 'shadow' });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ inputTokens: 7, outputTokens: 3, module: 'shadow' });
  });

  it('generateJSON writes exactly ONE row, not two', async () => {
    // It delegates to `generateText`. A second `recordAiUsage` here would
    // double every JSON call in the ledger -- and JSON is how most of this
    // platform talks to the model.
    messagesCreate.mockResolvedValue(reply('{"a":1}', 11, 4));
    await expect(generateJSON('hi', { entityId: 'e1', module: 'inbox' })).resolves.toEqual({ a: 1 });
    expect(rows()).toHaveLength(1);
  });

  it('createMessage, with the model the API says it served', async () => {
    // The request asked for one model and the response reports another; the
    // ledger records what was actually run, since that is what is billed.
    messagesCreate.mockResolvedValue({
      model: 'claude-haiku-4-5-20251001',
      content: [{ type: 'text', text: 'x' }],
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    });
    await createMessage(
      { model: 'claude-sonnet-4-6', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] },
      { entityId: 'e1', module: 'router' }
    );
    expect(rows()[0].model).toBe('claude-haiku-4-5-20251001');
    expect(rows()[0].cost).toBeCloseTo(1, 6);
  });
});

describe('P-39: the paths that are easy to leave unmetered', () => {
  it('a call that THROWS still leaves a row, and the error still propagates', async () => {
    messagesCreate.mockRejectedValue(new Error('overloaded_error'));
    await expect(
      generateText('hi', { entityId: 'e1', module: 'inbox' })
    ).rejects.toThrow('overloaded_error');

    expect(rows()).toHaveLength(1);
    expect(rows()[0].metadata.outcome).toBe('error');
    // The SDK reports no usage on a thrown request. Zero tokens with
    // `outcome: 'error'` is a record that a call was attempted, NOT a claim
    // that it was free -- which is why the outcome is on the row.
    expect(rows()[0].inputTokens).toBe(0);
  });

  it('a completed stream is metered from its own usage events', async () => {
    messagesStream.mockReturnValue(streamEvents(2000, 800, ['a', 'b', 'c']));
    const out: string[] = [];
    for await (const chunk of streamText('hi', { entityId: 'e1', module: 'voice' })) {
      out.push(chunk);
    }
    expect(out).toEqual(['a', 'b', 'c']);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ inputTokens: 2000, outputTokens: 800, module: 'voice' });
    expect(rows()[0].metadata.outcome).toBe('ok');
  });

  it('an ABANDONED stream still leaves a row, marked partial', async () => {
    // A consumer that breaks out of `for await` calls the generator's
    // `return()`, which runs the `finally`. Without that, every cancelled
    // stream -- a closed browser tab, a hung-up call -- would be spend with no
    // record, and those are exactly the calls a user complains about.
    messagesStream.mockReturnValue(streamEvents(500, 100, ['a', 'b', 'c']));
    for await (const chunk of streamText('hi', { entityId: 'e1', module: 'voice' })) {
      void chunk;
      break;
    }
    expect(rows()).toHaveLength(1);
    expect(rows()[0].metadata.outcome).toBe('partial');
    expect(rows()[0].inputTokens).toBe(500);
  });

  it('a stream that throws mid-flight leaves a row marked error', async () => {
    async function* boom() {
      yield { type: 'message_start', message: { usage: { input_tokens: 42, output_tokens: 0 } } };
      throw new Error('stream died');
    }
    messagesStream.mockReturnValue(boom());
    await expect(
      (async () => {
        for await (const chunk of streamText('hi', { entityId: 'e1', module: 'voice' })) void chunk;
      })()
    ).rejects.toThrow('stream died');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].metadata.outcome).toBe('error');
    expect(rows()[0].inputTokens).toBe(42);
  });

  it('a call with no entity writes NO row — and is not silently forgotten', async () => {
    // `UsageRecord.entityId` is a non-null FK, so there is no row to write.
    // `recordAiUsage` reports it under `ai_usage:unattributed:<module>` instead,
    // which is what makes the remaining gap countable rather than invisible.
    messagesCreate.mockResolvedValue(reply('hello'));
    await generateText('hi', { module: 'inbox' });
    expect(create).not.toHaveBeenCalled();
  });

  it('an unpriced model is recorded with its tokens and flagged unpriced', async () => {
    messagesCreate.mockResolvedValue({
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text', text: 'x' }],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });
    await generateText('hi', { entityId: 'e1', module: 'inbox' });
    expect(rows()[0].metadata.priced).toBe(false);
    expect(rows()[0].inputTokens).toBe(1_000_000);
  });

  it('a ledger outage does not break the call it was measuring', async () => {
    create.mockRejectedValue(new Error('database is down'));
    messagesCreate.mockResolvedValue(reply('still works'));
    await expect(generateText('hi', { entityId: 'e1', module: 'inbox' })).resolves.toBe(
      'still works'
    );
  });
});
