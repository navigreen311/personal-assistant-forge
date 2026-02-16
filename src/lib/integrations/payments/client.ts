import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export function getStripe(): Stripe {
  if (!stripe) throw new Error('Stripe not configured: STRIPE_SECRET_KEY missing');
  return stripe;
}

export async function createCustomer(email: string, name: string): Promise<string> {
  const customer = await getStripe().customers.create({ email, name });
  return customer.id;
}

export async function createInvoice(
  customerId: string,
  items: Array<{ description: string; amount: number; currency?: string }>
): Promise<{ id: string; url: string | null }> {
  const s = getStripe();
  const invoice = await s.invoices.create({ customer: customerId, auto_advance: true });

  for (const item of items) {
    await s.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      description: item.description,
      amount: Math.round(item.amount * 100),
      currency: item.currency ?? 'usd',
    });
  }

  const finalized = await s.invoices.finalizeInvoice(invoice.id);
  return { id: finalized.id, url: finalized.hosted_invoice_url ?? null };
}

export async function createCheckoutSession(
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return session.url!;
}
