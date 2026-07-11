import { useEffect, useState } from 'react';
import {
  DEFAULT_PARTY_PASS_SKU,
  PARTY_PASS_PRODUCTS,
} from '@chaos-parcel/shared';
import {
  clearPartyPassToken,
  fetchBillingStatus,
  startPartyPassCheckout,
} from '../monetization/storage';

interface PartyPassUpsellProps {
  hasPass: boolean;
  /** Compact inline CTA vs card. */
  variant?: 'footer' | 'card' | 'summary';
  className?: string;
  /** Called after a successful paid unlock (Stripe redirect confirm → reload). */
  onUnlocked?: () => void;
}

export function PartyPassUpsell({
  hasPass,
  variant = 'card',
  className = '',
}: PartyPassUpsellProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const product = PARTY_PASS_PRODUCTS[DEFAULT_PARTY_PASS_SKU];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchBillingStatus();
        if (!cancelled) setStripeReady(status.stripe_configured);
      } catch {
        if (!cancelled) setStripeReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Drop legacy free unlocks that the server no longer accepts.
  useEffect(() => {
    if (hasPass) return;
    // If UI thinks we're free but a stale token remains, clear it so join stays honest.
    // (HostPage drives hasPass from ROOM_CREATED — rejected tokens already yield hasPass=false.)
    if (stripeReady === false) {
      clearPartyPassToken();
    }
  }, [hasPass, stripeReady]);

  if (hasPass) {
    return (
      <div className={`party-pass-badge ${className}`.trim()} role="status">
        Party Pass פעיל — בלי פרסומות בחדר
      </div>
    );
  }

  const handleUpgrade = async () => {
    setError(null);
    setBusy(true);
    try {
      const { url } = await startPartyPassCheckout(DEFAULT_PARTY_PASS_SKU);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בפתיחת התשלום');
      setBusy(false);
    }
  };

  return (
    <div className={`party-pass-upsell party-pass-upsell--${variant} ${className}`.trim()}>
      <div className="party-pass-upsell-copy">
        <p className="party-pass-upsell-title">{product.nameHe}</p>
        <p className="party-pass-upsell-desc">{product.descriptionHe}</p>
        <p className="party-pass-upsell-price">₪{product.priceIls}</p>
        {stripeReady === false && (
          <p className="status-text party-pass-setup-hint">
            התשלום יופעל אחרי הגדרת Stripe בשרת
          </p>
        )}
      </div>
      <button
        type="button"
        className="btn-secondary party-pass-upsell-btn"
        disabled={busy || stripeReady === false}
        onClick={() => void handleUpgrade()}
      >
        {busy ? 'פותח תשלום...' : 'לתשלום ושדרוג'}
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
