-- Phase 3: predictions table

CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  as_of TEXT NOT NULL,
  horizon TEXT NOT NULL DEFAULT '5d',
  score REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'neutral')),
  confidence REAL NOT NULL,
  factors_json TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'rules-v1',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_predictions_symbol_asof
  ON predictions (symbol, as_of DESC);
