-- ==============================================================================
-- Supabase Schema: Crypto User Data (Watchlist, Paper Trading & Price Alerts)
-- Target Project: ekcvbhkqjnncgjkcnuhz
-- Constraint: Zero writes to Turso; dedicated PostgreSQL tables with RLS
-- ==============================================================================

-- 1. Watchlists Table
CREATE TABLE IF NOT EXISTS public.crypto_user_watchlists (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_symbol UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_crypto_watchlist_user 
ON public.crypto_user_watchlists (user_id);

-- 2. Paper Trading Wallet (Balance State)
CREATE TABLE IF NOT EXISTS public.crypto_paper_wallets (
    user_id VARCHAR(64) PRIMARY KEY,
    cash_inr NUMERIC(20, 2) NOT NULL DEFAULT 1000000.00, -- ₹10 Lakh starting capital
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Paper Trading Transaction History
CREATE TABLE IF NOT EXISTS public.crypto_paper_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(64) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    base_asset VARCHAR(10) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    qty NUMERIC(24, 8) NOT NULL,
    price_inr NUMERIC(20, 2) NOT NULL,
    gross_inr NUMERIC(20, 2) NOT NULL,
    tds_inr NUMERIC(20, 2) NOT NULL DEFAULT 0.00,
    net_inr NUMERIC(20, 2) NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crypto_trades_user_date 
ON public.crypto_paper_trades (user_id, executed_at DESC);

-- 4. Price Alerts Table
CREATE TABLE IF NOT EXISTS public.crypto_price_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(64) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    target_price_inr NUMERIC(20, 2) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('above', 'below')),
    is_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    triggered_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_crypto_alerts_user_active 
ON public.crypto_price_alerts (user_id, is_triggered);

-- 5. Table Permissions & Grants
GRANT ALL ON TABLE public.crypto_user_watchlists TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.crypto_paper_wallets TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.crypto_paper_trades TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.crypto_price_alerts TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 6. Row Level Security (RLS) Configuration
ALTER TABLE public.crypto_user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_paper_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_price_alerts ENABLE ROW LEVEL SECURITY;

-- Allow public read & write through backend service role
CREATE POLICY "Allow service_role full access on crypto_user_watchlists" 
ON public.crypto_user_watchlists FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on crypto_paper_wallets" 
ON public.crypto_paper_wallets FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on crypto_paper_trades" 
ON public.crypto_paper_trades FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service_role full access on crypto_price_alerts" 
ON public.crypto_price_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

