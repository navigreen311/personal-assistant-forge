import Anthropic from '@anthropic-ai/sdk';

const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic };

export const anthropic =
  globalForAnthropic.anthropic ??
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  });

if (process.env.NODE_ENV !== 'production') globalForAnthropic.anthropic = anthropic;

export type AIMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AIOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
};

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export async function generateText(
  prompt: string,
  options: AIOptions = {}
): Promise<string> {
  const response = await anthropic.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
    system: options.system,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

export async function generateJSON<T>(
  prompt: string,
  options: AIOptions = {}
): Promise<T> {
  const text = await generateText(prompt, {
    ...options,
    system: (options.system ?? '') + '\n\nRespond with valid JSON only. No markdown, no code fences.',
  });

  return JSON.parse(text) as T;
}

export async function chat(
  messages: AIMessage[],
  options: AIOptions = {}
): Promise<string> {
  const response = await anthropic.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
    system: options.system,
    messages,
  });

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

export async function* streamText(
  prompt: string,
  options: AIOptions = {}
): AsyncGenerator<string> {
  const stream = anthropic.messages.stream({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
    system: options.system,
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

export default anthropic;
