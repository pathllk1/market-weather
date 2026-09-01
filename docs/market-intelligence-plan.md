# Market Intelligence & Stock Analytics Plan

**Status**: Active / Implemented  
**Target Module**: `/market` and `/analytics/stocks`  
**Data Sources**: Turso LibSQL (`historical_candles`, `technical_analysis`)

---

## 1. Executive Summary

This document details the architectural and product design for an **Enterprise Market Intelligence & Technical Stock Analytics** module integrated into the Enterprise ERP application. 

The feature leverages two high-volume datasets already residing in the database:
- **`technical_analysis` (494 NSE symbols)**: Current price, price change, percentage change, and comprehensive indicator metrics (RSI-14, MACD, Bollinger Bands, ATR, ADX, Supertrend, Stochastics, Williams %R, MFI, VWAP, OBV, Moving Averages SMA/EMA 10–200, and a composite `overall_score` 0–100).
- **`historical_candles` (361,239 records)**: Daily OHLCV series spanning from `July 2023` through `August 2026`.

---

## 2. Target Features & User Experience

### A. Enterprise Stock Screener & Indicator Heatmap (`/market`)
- **Search & Filter**: Real-time filtering across all 494 Indian NSE stocks by symbol or company name.
- **Categorized Presets**:
  - **Top Bullish**: `overall_score >= 75`
  - **Oversold Bounce Candidates**: `rsi_14 <= 35`
  - **Overbought / Risk Warning**: `rsi_14 >= 70`
  - **MACD Bullish Crossover**: `macd_hist > 0` and `macd_line > macd_signal`
  - **Top Gainers & Losers**: Sorted by `percentage_change`
- **Nuxt UI Grid**: Built with `UTable`, `UBadge` status chips (Bullish / Neutral / Bearish), and sorting.

### B. Interactive Candlestick & Volume Chart
- **Timeframes**: Range selector (`1M`, `3M`, `6M`, `1Y`, `ALL`) querying daily OHLCV rows.
- **Chart Component**: Lightweight SVG / Canvas interactive candlestick chart with volume sub-chart and crosshair hover details.
- **Moving Average Overlays**: Checkbox toggles for 20-day and 50-day Simple Moving Averages.

### C. Deep-Dive Indicator Radar
- **Momentum Panel**: RSI(14), Stochastic %K/%D, Money Flow Index (MFI), Williams %R.
- **Trend Panel**: Supertrend (Bullish/Bearish tag + trailing stop value), ADX(14) with +DI / -DI directional bias.
- **Moving Average Stack**: Relative price position across EMA 20, 50, 100, and 200.
- **Volatility Band**: Bollinger Bands (Upper, Middle, Lower spread) and ATR(14).

### D. User Dashboard Widget (`/dashboard`)
- A compact **Market Watch** card on the main ERP dashboard highlighting top daily movers and pinned watchlist symbols.

---

## 3. Database Schema & Query Optimization

### Index Optimization Required
To achieve sub-50ms query times over 361,239 historical candle rows:
```sql
CREATE INDEX IF NOT EXISTS idx_candles_symbol_date ON historical_candles(symbol, date);
CREATE INDEX IF NOT EXISTS idx_technical_score ON technical_analysis(overall_score);
```

### Table References
- `historical_candles`:
  `id (INTEGER), symbol (TEXT), date (TEXT), open (REAL), high (REAL), low (REAL), close (REAL), volume (INTEGER), created_at (DATETIME)`
- `technical_analysis`:
  `symbol (TEXT), company_name (TEXT), current_price (REAL), price_change (REAL), percentage_change (REAL), sma_10..200, ema_10..200, rsi_14, macd_line, macd_signal, macd_hist, bb_upper, bb_middle, bb_lower, atr_14, adx_14, supertrend_trend, supertrend_value, overall_score, last_updated`

---

## 4. Backend APIs to Implement

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/market/screener` | `GET` | Paginated, filtered stock list with technical indicators |
| `/api/market/candles` | `GET` | Time-series OHLCV data by `symbol` and `range` |
| `/api/market/stock` | `GET` | Detailed single-stock indicator breakdown |

---

## 5. UI Compliance & Standards

- **Full-Width Viewport**: Content spans full screen width, respecting the fixed minimal header (`h-12`) and footer (`h-8`).
- **100% Nuxt UI v4**: Strictly built with Nuxt UI components (`UCard`, `UTable`, `UBadge`, `USelect`, `UInput`, `UModal`, `UProgress`, `UTabs`, `UButton`, `UIcon`).
- **0 Custom CSS**: Strictly no ad-hoc CSS rules or `<style>` blocks (100% Tailwind CSS v4 utility tokens).
- **Terminology**: Clean Enterprise ERP financial metrics without buzzwords.
