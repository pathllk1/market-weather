-- ==============================================================================
-- Supabase PostgreSQL Schema: Crypto Smart-Sync & Historical Backfill Engine
-- Target Project: ekcvbhkqjnncgjkcnuhz
-- Constraint: Zero writes to Turso; dedicated PostgreSQL tables with idempotent upsert
-- ==============================================================================

-- 1. Crypto Daily OHLCV Table
CREATE TABLE IF NOT EXISTS public.crypto_daily_ohlcv (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,            -- e.g. 'BTCUSDT', 'ETHUSDT'
    candle_date DATE NOT NULL,              -- YYYY-MM-DD (UTC boundary)
    open_price NUMERIC(20, 8) NOT NULL,
    high_price NUMERIC(20, 8) NOT NULL,
    low_price NUMERIC(20, 8) NOT NULL,
    close_price NUMERIC(20, 8) NOT NULL,
    volume_base NUMERIC(24, 8) NOT NULL,    -- Coin volume (e.g., BTC)
    volume_quote NUMERIC(24, 8) NOT NULL,   -- USDT volume
    source VARCHAR(30) DEFAULT 'binance_vision',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Composite unique constraint: guarantees ZERO duplicate candles on concurrent/repeated syncs
    CONSTRAINT unique_symbol_candle_date UNIQUE (symbol, candle_date)
);

-- Fast composite index for chronological range queries (e.g. last 30/90 days of BTC)
CREATE INDEX IF NOT EXISTS idx_crypto_ohlcv_symbol_date 
ON public.crypto_daily_ohlcv (symbol, candle_date DESC);

-- 2. Crypto Sync Metadata Table
-- Keeps track of sync state per asset to compute gaps in O(1) time without scanning millions of rows
CREATE TABLE IF NOT EXISTS public.crypto_sync_metadata (
    symbol VARCHAR(20) PRIMARY KEY,
    first_candle_date DATE,
    last_candle_date DATE,
    total_candles INTEGER DEFAULT 0,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    sync_status VARCHAR(20) DEFAULT 'idle'  -- 'idle', 'in_progress', 'error'
);

-- 3. Table Permissions & Grants
-- Grant table and sequence permissions to Supabase API roles so PostgREST can interact
GRANT ALL ON TABLE public.crypto_daily_ohlcv TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.crypto_sync_metadata TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Row Level Security (RLS) Configuration
-- While table grants permit API routing, RLS strictly enforces access boundaries:
-- Public can only READ (SELECT); only service_role can WRITE (INSERT/UPDATE/DELETE)
ALTER TABLE public.crypto_daily_ohlcv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_sync_metadata ENABLE ROW LEVEL SECURITY;

-- Allow public read of historical candles
CREATE POLICY "Allow public read on crypto_daily_ohlcv" 
ON public.crypto_daily_ohlcv 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Allow public read of sync metadata
CREATE POLICY "Allow public read on crypto_sync_metadata" 
ON public.crypto_sync_metadata 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Service role has full permissions for writes/updates
CREATE POLICY "Allow service_role full access on crypto_daily_ohlcv" 
ON public.crypto_daily_ohlcv 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow service_role full access on crypto_sync_metadata" 
ON public.crypto_sync_metadata 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

