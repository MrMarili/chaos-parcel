-- Party Pass entitlements + cosmetic ownership (service-role writes)

CREATE TABLE party_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Device/host key when no auth profile exists yet (LAN parties).
    host_key TEXT,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    sku VARCHAR(64) NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'stripe',
    stripe_session_id TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT party_passes_source_check CHECK (source IN ('stripe', 'dev', 'promo')),
    CONSTRAINT party_passes_owner_check CHECK (host_key IS NOT NULL OR profile_id IS NOT NULL)
);

CREATE INDEX idx_party_passes_host_key ON party_passes(host_key);
CREATE INDEX idx_party_passes_profile ON party_passes(profile_id);
CREATE INDEX idx_party_passes_expires ON party_passes(expires_at);

CREATE TABLE cosmetic_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_key TEXT NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    cosmetic_id VARCHAR(64) NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'purchase',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cosmetic_entitlements_source_check
      CHECK (source IN ('purchase', 'player_pack', 'dev', 'promo')),
    CONSTRAINT cosmetic_entitlements_unique UNIQUE (player_key, cosmetic_id)
);

CREATE INDEX idx_cosmetic_entitlements_player ON cosmetic_entitlements(player_key);

ALTER TABLE party_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetic_entitlements ENABLE ROW LEVEL SECURITY;

-- Clients cannot read/write directly — Edge Functions / server use service role.
CREATE POLICY party_passes_no_client ON party_passes FOR ALL USING (false);
CREATE POLICY cosmetic_entitlements_no_client ON cosmetic_entitlements FOR ALL USING (false);
