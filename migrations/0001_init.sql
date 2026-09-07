-- Phase 0 schema: instruments & watchlist placeholders for D1

CREATE TABLE IF NOT EXISTS instruments (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('stock', 'fund')),
  market TEXT NOT NULL,
  currency TEXT DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_symbol_market
  ON instruments (symbol, market);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL REFERENCES instruments(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items (user_id);
