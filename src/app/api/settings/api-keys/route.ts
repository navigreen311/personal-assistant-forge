import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import type { AuthSession } from '@/lib/auth/types';

// --- Types ---

interface ApiKeyInfo {
  provider: string;
  maskedKey: string;
  status: 'active' | 'inactive' | 'not_configured';
}

interface IntegrationInfo {
  service: string;
  status: 'connected' | 'active' | 'not_configured';
}

interface ApiKeysResponse {
  providers: ApiKeyInfo[];
  integrations: IntegrationInfo[];
}

// --- Helpers ---

function maskKey(key: string | undefined, prefix: string): string {
  if (!key) return `${prefix}****...****`;
  if (key.length <= 8) return `${prefix}****...****`;
  return `${key.slice(0, Math.min(key.indexOf('-') + 5, 10))}****...****`;
}

function detectProviders(): ApiKeyInfo[] {
  const providers: ApiKeyInfo[] = [];

  // Anthropic Claude (primary)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  providers.push({
    provider: 'Anthropic Claude',
    maskedKey: anthropicKey ? maskKey(anthropicKey, 'sk-ant-') : 'sk-ant-****...****',
    status: anthropicKey ? 'active' : 'not_configured',
  });

  // OpenAI (backup)
  const openaiKey = process.env.OPENAI_API_KEY;
  providers.push({
    provider: 'OpenAI (backup)',
    maskedKey: openaiKey ? maskKey(openaiKey, 'sk-') : 'sk-****...****',
    status: openaiKey ? 'active' : 'not_configured',
  });

  return providers;
}

function detectIntegrations(): IntegrationInfo[] {
  const integrations: IntegrationInfo[] = [];

  // Gmail OAuth
  const gmailClientId = process.env.GOOGLE_CLIENT_ID;
  integrations.push({
    service: 'Gmail OAuth',
    status: gmailClientId ? 'connected' : 'not_configured',
  });

  // Google Calendar
  integrations.push({
    service: 'Google Calendar',
    status: gmailClientId ? 'connected' : 'not_configured',
  });

  // Twilio (VoiceForge)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  integrations.push({
    service: 'Twilio (VoiceForge)',
    status: twilioSid ? 'active' : 'not_configured',
  });

  // Stripe (Payments)
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  integrations.push({
    service: 'Stripe (Payments)',
    status: stripeKey ? 'active' : 'not_configured',
  });

  return integrations;
}

// --- Handlers ---

async function handleGet(_req: NextRequest, _session: AuthSession): Promise<Response> {
  try {
    const providers = detectProviders();
    const integrations = detectIntegrations();

    const data: ApiKeysResponse = {
      providers,
      integrations,
    };

    return success(data);
  } catch (err) {
    console.error('[settings/api-keys] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load API keys', 500);
  }
}

// --- Route Exports ---

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}
