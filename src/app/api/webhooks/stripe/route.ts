import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, processWebhookEvent } from '@/lib/integrations/payments/webhooks';
import type { WebhookEvent } from '@/lib/integrations/payments/webhooks';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { received: false, error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { received: false, error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    // Verify signature
    const verification = verifyWebhookSignature({
      payload: rawBody,
      signature,
      secret,
    });

    if (!verification.valid || !verification.event) {
      console.error('[stripe-webhook] Signature verification failed:', verification.error);
      return NextResponse.json(
        { received: false, error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Build webhook event
    const stripeEvent = verification.event;
    const webhookEvent: WebhookEvent = {
      id: stripeEvent.id as string,
      type: stripeEvent.type as string,
      data: (stripeEvent.data as Record<string, unknown>)?.object as Record<string, unknown> ?? {},
      status: 'received',
    };

    // Process event (route to handler)
    const result = await processWebhookEvent(webhookEvent);

    if (result.status === 'failed') {
      // Log error but still return 200 to Stripe
      console.error(`[stripe-webhook] Handler failed for ${webhookEvent.type}:`, result.error);
    }

    // Always return 200 to Stripe so it doesn't retry
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe-webhook] Unexpected error:', (err as Error).message);
    // Still return 200 to prevent Stripe retries for unexpected errors
    return NextResponse.json({ received: true });
  }
}
