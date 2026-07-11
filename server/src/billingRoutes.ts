import { Router, type Request, type Response } from 'express';
import {
  DEFAULT_PARTY_PASS_SKU,
  PARTY_PASS_PRODUCTS,
  PLAYER_PACK,
  type PartyPassSku,
} from '@chaos-parcel/shared';
import {
  allowDevUnlock,
  isPartyPassSku,
  isStripeConfigured,
  issuePartyPassToken,
  type BillableSku,
} from './partyPass.js';

function publicBaseUrl(req: Request): string {
  const env = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (env) return env;
  const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  return `${proto}://${host}`;
}

function stripePriceIlsToAgorot(ils: number): number {
  return Math.round(ils * 100);
}

export function createBillingRouter(): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({
      stripe_configured: isStripeConfigured(),
      allow_dev_unlock: allowDevUnlock(),
      default_party_pass_sku: DEFAULT_PARTY_PASS_SKU,
      products: {
        party_pass: PARTY_PASS_PRODUCTS,
        player_pack: PLAYER_PACK,
      },
    });
  });

  /** Create a Stripe Checkout session — only path that grants a paid Party Pass. */
  router.post('/checkout', async (req, res) => {
    if (!isStripeConfigured()) {
      res.status(503).json({
        error: 'STRIPE_NOT_CONFIGURED',
        message:
          'תשלום לא מוגדר. הוסיפו STRIPE_SECRET_KEY ב־server/.env והפעילו מחדש את השרת.',
        allow_dev_unlock: allowDevUnlock(),
      });
      return;
    }

    const sku = String(req.body?.sku ?? DEFAULT_PARTY_PASS_SKU) as BillableSku;
    const successPath = String(req.body?.success_path ?? '/host?pass=success');
    const cancelPath = String(req.body?.cancel_path ?? '/host?pass=cancel');
    const base = publicBaseUrl(req);

    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

      let name: string;
      let amount: number;
      let description: string;

      if (isPartyPassSku(sku)) {
        const product = PARTY_PASS_PRODUCTS[sku];
        name = product.nameHe;
        amount = stripePriceIlsToAgorot(product.priceIls);
        description = product.descriptionHe;
      } else if (sku === PLAYER_PACK.sku) {
        name = PLAYER_PACK.nameHe;
        amount = stripePriceIlsToAgorot(PLAYER_PACK.priceIls);
        description = PLAYER_PACK.descriptionHe;
      } else {
        res.status(400).json({ error: 'UNKNOWN_SKU', message: `Unknown sku: ${sku}` });
        return;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'ils',
              unit_amount: amount,
              product_data: { name, description },
            },
          },
        ],
        success_url: `${base}${successPath.startsWith('/') ? successPath : `/${successPath}`}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}${cancelPath.startsWith('/') ? cancelPath : `/${cancelPath}`}`,
        metadata: { sku },
      });

      res.json({ url: session.url, session_id: session.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      res.status(500).json({
        error: 'CHECKOUT_FAILED',
        message: `שגיאה בפתיחת תשלום: ${message}`,
      });
    }
  });

  /** After Stripe redirect — issue pass token only when payment_status === paid. */
  router.get('/confirm', async (req, res) => {
    const sessionId = String(req.query.session_id ?? '');
    if (!sessionId) {
      res.status(400).json({ error: 'MISSING_SESSION', message: 'session_id required' });
      return;
    }
    if (!isStripeConfigured()) {
      res.status(503).json({
        error: 'STRIPE_NOT_CONFIGURED',
        message: 'תשלום לא מוגדר בשרת.',
      });
      return;
    }

    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== 'paid') {
        res.status(402).json({
          error: 'NOT_PAID',
          message: 'התשלום לא הושלם — Party Pass לא הופעל.',
        });
        return;
      }

      const sku = session.metadata?.sku ?? DEFAULT_PARTY_PASS_SKU;
      if (!isPartyPassSku(sku)) {
        if (sku === PLAYER_PACK.sku) {
          res.json({
            type: 'player_pack',
            sku: PLAYER_PACK.sku,
            cosmetics: PLAYER_PACK.includes,
          });
          return;
        }
        res.status(400).json({ error: 'UNKNOWN_SKU' });
        return;
      }

      const token = issuePartyPassToken(sku, 'paid');
      res.json({ type: 'party_pass', sku, token, source: 'paid' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Confirm failed';
      res.status(500).json({ error: 'CONFIRM_FAILED', message });
    }
  });

  /**
   * Explicit local unlock for developers only.
   * Requires ALLOW_DEV_PARTY_PASS=true — never used by the host UI by default.
   */
  router.post('/dev-unlock', (req, res) => {
    if (!allowDevUnlock()) {
      res.status(403).json({
        error: 'DEV_UNLOCK_DISABLED',
        message:
          'שדרוג בלי תשלום כבוי. הגדירו Stripe, או ALLOW_DEV_PARTY_PASS=true לפיתוח בלבד.',
      });
      return;
    }

    const kind = String(req.body?.kind ?? 'party_pass');
    if (kind === 'player_pack') {
      res.json({
        type: 'player_pack',
        sku: PLAYER_PACK.sku,
        cosmetics: PLAYER_PACK.includes,
      });
      return;
    }

    const sku = String(req.body?.sku ?? DEFAULT_PARTY_PASS_SKU) as PartyPassSku;
    if (!isPartyPassSku(sku)) {
      res.status(400).json({ error: 'UNKNOWN_SKU' });
      return;
    }

    const token = issuePartyPassToken(sku, 'dev');
    res.json({ type: 'party_pass', sku, token, source: 'dev' });
  });

  return router;
}

/** Stripe webhook — optional; confirm endpoint covers the host success redirect. */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED' });
    return;
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
      res.status(400).send('Missing signature');
      return;
    }

    const event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    if (event.type === 'checkout.session.completed') {
      console.log('[billing] checkout.session.completed', event.id);
    }

    res.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    res.status(400).send(`Webhook Error: ${message}`);
  }
}
