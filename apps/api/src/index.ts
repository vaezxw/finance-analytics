import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";

type Env = {
  DB: D1Database;
  QUOTES: KVNamespace;
  MARKET_DATA: R2Bucket;
};

type Instrument = {
  id: string;
  symbol: string;
  name: string;
  asset_class: "stock" | "fund";
  market: string;
  currency: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/health", (c) =>
  c.json({ ok: true, service: "finance-analytics-api" }),
);

app.get("/api/v1/instruments", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, symbol, name, asset_class, market, currency
     FROM instruments
     ORDER BY symbol ASC
     LIMIT 200`,
  ).all<Instrument>();

  if (!rows.results?.length) {
    return c.json({ items: SEED_INSTRUMENTS });
  }
  return c.json({ items: rows.results });
});

app.get("/api/v1/instruments/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const row = await c.env.DB.prepare(
    `SELECT id, symbol, name, asset_class, market, currency
     FROM instruments WHERE symbol = ? LIMIT 1`,
  )
    .bind(symbol)
    .first<Instrument>();

  const item =
    row ?? SEED_INSTRUMENTS.find((i) => i.symbol === symbol) ?? null;
  if (!item) return c.json({ error: "not_found" }, 404);
  return c.json({ item });
});

app.get("/api/v1/ohlcv/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const range = c.req.query("range") ?? "6mo";
  const cached = await c.env.QUOTES.get(`ohlcv:${symbol}:${range}`, "json");
  if (cached) {
    return c.json({ symbol, range, source: "kv", candles: cached });
  }

  const candles = await fetchYahooDaily(symbol, range);
  if (!candles.length) {
    return c.json({ error: "no_data", symbol }, 404);
  }

  await c.env.QUOTES.put(`ohlcv:${symbol}:${range}`, JSON.stringify(candles), {
    expirationTtl: 60 * 60 * 6,
  });

  // best-effort R2 archive
  try {
    await c.env.MARKET_DATA.put(
      `ohlcv/${symbol}/${range}.json`,
      JSON.stringify({ symbol, range, candles, updatedAt: new Date().toISOString() }),
      { httpMetadata: { contentType: "application/json" } },
    );
  } catch {
    // ignore if bucket not ready
  }

  return c.json({ symbol, range, source: "yahoo", candles });
});

app.get("/api/v1/quote/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const cached = await c.env.QUOTES.get(`quote:${symbol}`, "json");
  if (cached) return c.json({ symbol, source: "kv", quote: cached });

  const quote = await fetchYahooQuote(symbol);
  if (!quote) return c.json({ error: "no_data", symbol }, 404);

  await c.env.QUOTES.put(`quote:${symbol}`, JSON.stringify(quote), {
    expirationTtl: 60,
  });
  return c.json({ symbol, source: "yahoo", quote });
});

app.get("/api/v1/sectors/snapshot", async (c) => {
  const symbols = ["XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLB", "XLU", "XLRE"];
  const items = [];
  for (const symbol of symbols) {
    const quote = await getQuoteCached(c, symbol);
    if (quote) {
      items.push({
        symbol,
        name: SECTOR_NAMES[symbol] ?? symbol,
        price: quote.price,
        changePercent: quote.changePercent,
      });
    }
  }
  items.sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  return c.json({ items });
});

app.post("/api/v1/admin/seed", async (c) => {
  await seedInstruments(c.env.DB);
  return c.json({ ok: true, seeded: SEED_INSTRUMENTS.length });
});

app.get("/api/v1/watchlist", async (c) => {
  const userId = c.req.query("user_id") || "demo";
  await seedInstruments(c.env.DB);

  let rows = await c.env.DB.prepare(
    `SELECT w.id as watchlist_id, i.id, i.symbol, i.name, i.asset_class, i.market, i.currency
     FROM watchlist_items w
     JOIN instruments i ON i.id = w.instrument_id
     WHERE w.user_id = ?
     ORDER BY w.created_at ASC`,
  )
    .bind(userId)
    .all();

  if (!rows.results?.length) {
    for (const symbol of ["SPY", "QQQ", "AAPL"]) {
      const instrument = SEED_INSTRUMENTS.find((i) => i.symbol === symbol)!;
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO watchlist_items (id, user_id, instrument_id) VALUES (?, ?, ?)`,
      )
        .bind(`${userId}:${instrument.id}`, userId, instrument.id)
        .run();
    }
    rows = await c.env.DB.prepare(
      `SELECT w.id as watchlist_id, i.id, i.symbol, i.name, i.asset_class, i.market, i.currency
       FROM watchlist_items w
       JOIN instruments i ON i.id = w.instrument_id
       WHERE w.user_id = ?
       ORDER BY w.created_at ASC`,
    )
      .bind(userId)
      .all();
  }

  const items = [];
  for (const row of rows.results ?? []) {
    const symbol = String((row as any).symbol);
    const quote = await getQuoteCached(c, symbol);
    items.push({ ...row, quote });
  }
  return c.json({ user_id: userId, items });
});

app.post("/api/v1/watchlist", async (c) => {
  const userId = c.req.query("user_id") || "demo";
  const body = await c.req.json<{ symbol?: string }>().catch(() => ({}));
  const symbol = String(body.symbol || "").toUpperCase().trim();
  if (!symbol) return c.json({ error: "symbol_required" }, 400);

  await seedInstruments(c.env.DB);
  let instrument = await c.env.DB.prepare(
    `SELECT id, symbol, name, asset_class, market, currency FROM instruments WHERE symbol = ? LIMIT 1`,
  )
    .bind(symbol)
    .first<Instrument>();

  if (!instrument) {
    const seed = SEED_INSTRUMENTS.find((i) => i.symbol === symbol);
    const id = seed?.id ?? `dyn-${symbol.toLowerCase()}`;
    const name = seed?.name ?? symbol;
    const assetClass = seed?.asset_class ?? "stock";
    const market = seed?.market ?? "US";
    const currency = seed?.currency ?? "USD";
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO instruments (id, symbol, name, asset_class, market, currency)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, symbol, name, assetClass, market, currency)
      .run();
    instrument = {
      id,
      symbol,
      name,
      asset_class: assetClass,
      market,
      currency,
    };
  }

  const watchId = `${userId}:${instrument.id}`;
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO watchlist_items (id, user_id, instrument_id) VALUES (?, ?, ?)`,
  )
    .bind(watchId, userId, instrument.id)
    .run();

  const quote = await getQuoteCached(c, symbol);
  return c.json({ ok: true, item: { ...instrument, quote } });
});

app.delete("/api/v1/watchlist/:symbol", async (c) => {
  const userId = c.req.query("user_id") || "demo";
  const symbol = c.req.param("symbol").toUpperCase();
  const instrument = await c.env.DB.prepare(
    `SELECT id FROM instruments WHERE symbol = ? LIMIT 1`,
  )
    .bind(symbol)
    .first<{ id: string }>();
  if (!instrument) return c.json({ ok: true });

  await c.env.DB.prepare(
    `DELETE FROM watchlist_items WHERE user_id = ? AND instrument_id = ?`,
  )
    .bind(userId, instrument.id)
    .run();
  return c.json({ ok: true });
});

app.get("/api/v1/quotes", async (c) => {
  const raw = c.req.query("symbols") || "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30);
  const quotes: Record<string, YahooQuote> = {};
  for (const symbol of symbols) {
    const q = await getQuoteCached(c, symbol);
    if (q) quotes[symbol] = q;
  }
  return c.json({ quotes });
});

app.get("/api/v1/predictions", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, symbol, as_of, horizon, score, direction, confidence, factors_json, model_version, created_at
     FROM predictions
     WHERE as_of = (SELECT MAX(as_of) FROM predictions)
     ORDER BY score DESC
     LIMIT 50`,
  ).all();

  const items = (rows.results ?? []).map((row: any) => ({
    ...row,
    factors: safeJson(row.factors_json),
  }));
  return c.json({
    items,
    disclaimer: "规则因子打分仅供研究，不构成投资建议。",
  });
});

app.get("/api/v1/predictions/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const row = await c.env.DB.prepare(
    `SELECT id, symbol, as_of, horizon, score, direction, confidence, factors_json, model_version, created_at
     FROM predictions
     WHERE symbol = ?
     ORDER BY as_of DESC
     LIMIT 1`,
  )
    .bind(symbol)
    .first<any>();

  if (!row) {
    const generated = await runPredictionForSymbol(c.env, symbol);
    if (!generated) return c.json({ error: "no_data", symbol }, 404);
    return c.json({
      item: generated,
      disclaimer: "规则因子打分仅供研究，不构成投资建议。",
    });
  }

  return c.json({
    item: { ...row, factors: safeJson(row.factors_json) },
    disclaimer: "规则因子打分仅供研究，不构成投资建议。",
  });
});

app.post("/api/v1/predictions/run", async (c) => {
  const body = await c.req.json<{ symbols?: string[] }>().catch(() => ({}));
  const symbols =
    body.symbols?.map((s) => s.toUpperCase()) ??
    SEED_INSTRUMENTS.map((i) => i.symbol);
  const items = [];
  for (const symbol of symbols.slice(0, 20)) {
    const item = await runPredictionForSymbol(c.env, symbol);
    if (item) items.push(item);
  }
  return c.json({
    ok: true,
    count: items.length,
    items,
    disclaimer: "规则因子打分仅供研究，不构成投资建议。",
  });
});

export default {
  fetch: app.fetch,
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    await seedInstruments(env.DB);
    const cron = controller.cron;
    const watchRows = await env.DB.prepare(
      `SELECT DISTINCT i.symbol
       FROM watchlist_items w
       JOIN instruments i ON i.id = w.instrument_id`,
    ).all<{ symbol: string }>();
    const symbols = Array.from(
      new Set([
        ...SEED_INSTRUMENTS.map((i) => i.symbol),
        ...((watchRows.results ?? []).map((r) => r.symbol) as string[]),
      ]),
    );

    for (const symbol of symbols) {
      const quote = await fetchYahooQuote(symbol);
      if (quote) {
        await env.QUOTES.put(`quote:${symbol}`, JSON.stringify(quote), {
          expirationTtl: 60 * 10,
        });
      }
    }

    // nightly deeper refresh for OHLCV + predictions
    if (cron === "0 2 * * *") {
      for (const symbol of symbols) {
        const candles = await fetchYahooDaily(symbol, "6mo");
        if (candles.length) {
          await env.QUOTES.put(`ohlcv:${symbol}:6mo`, JSON.stringify(candles), {
            expirationTtl: 60 * 60 * 12,
          });
        }
        await runPredictionForSymbol(env, symbol);
      }
    }
  },
};

async function getQuoteCached(c: Context<{ Bindings: Env }>, symbol: string) {
  const cached = await c.env.QUOTES.get(`quote:${symbol}`, "json");
  if (cached) return cached as YahooQuote;
  const quote = await fetchYahooQuote(symbol);
  if (quote) {
    await c.env.QUOTES.put(`quote:${symbol}`, JSON.stringify(quote), {
      expirationTtl: 60,
    });
  }
  return quote;
}

async function seedInstruments(db: D1Database) {
  for (const item of SEED_INSTRUMENTS) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO instruments (id, symbol, name, asset_class, market, currency)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(item.id, item.symbol, item.name, item.asset_class, item.market, item.currency)
      .run();
  }
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function getCandlesCached(env: Env, symbol: string, range = "6mo") {
  const cached = await env.QUOTES.get(`ohlcv:${symbol}:${range}`, "json");
  if (Array.isArray(cached) && cached.length) return cached as Candle[];
  const candles = await fetchYahooDaily(symbol, range);
  if (candles.length) {
    await env.QUOTES.put(`ohlcv:${symbol}:${range}`, JSON.stringify(candles), {
      expirationTtl: 60 * 60 * 6,
    });
  }
  return candles;
}

function computeFactors(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  if (n < 25) return null;

  const last = closes[n - 1];
  const ret5 = (last - closes[n - 6]) / closes[n - 6];
  const ret20 = (last - closes[n - 21]) / closes[n - 21];
  const window = closes.slice(-21);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance =
    window.reduce((a, b) => a + (b - mean) * (b - mean), 0) / window.length;
  const vol20 = Math.sqrt(variance) / mean;
  const ma20 = mean;
  const distMa20 = (last - ma20) / ma20;

  // simple RSI(14)
  let gains = 0;
  let losses = 0;
  for (let i = n - 14; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  const rsi14 = 100 - 100 / (1 + rs);

  const momentumScore = clamp(ret5 * 8 + ret20 * 4, -1, 1);
  const trendScore = clamp(distMa20 * 10, -1, 1);
  const rsiScore = clamp((rsi14 - 50) / 50, -1, 1);
  const volPenalty = clamp(vol20 * 8, 0, 0.4);

  const score = clamp(
    0.45 * momentumScore + 0.35 * trendScore + 0.2 * rsiScore - volPenalty * 0.5,
    -1,
    1,
  );

  let direction: "up" | "down" | "neutral" = "neutral";
  if (score >= 0.15) direction = "up";
  else if (score <= -0.15) direction = "down";

  const confidence = clamp(Math.abs(score) * 0.85 + (1 - volPenalty) * 0.15, 0, 1);

  return {
    score: Number(score.toFixed(4)),
    direction,
    confidence: Number(confidence.toFixed(4)),
    factors: {
      ret5: Number(ret5.toFixed(4)),
      ret20: Number(ret20.toFixed(4)),
      vol20: Number(vol20.toFixed(4)),
      distMa20: Number(distMa20.toFixed(4)),
      rsi14: Number(rsi14.toFixed(2)),
      lastClose: Number(last.toFixed(4)),
    },
  };
}

async function runPredictionForSymbol(env: Env, symbol: string) {
  const candles = await getCandlesCached(env, symbol, "6mo");
  const computed = computeFactors(candles);
  if (!computed) return null;

  const asOf = candles[candles.length - 1]?.date ?? new Date().toISOString().slice(0, 10);
  const id = `${symbol}:${asOf}:5d:rules-v1`;
  const factorsJson = JSON.stringify(computed.factors);

  await env.DB.prepare(
    `INSERT OR REPLACE INTO predictions
      (id, symbol, as_of, horizon, score, direction, confidence, factors_json, model_version)
     VALUES (?, ?, ?, '5d', ?, ?, ?, ?, 'rules-v1')`,
  )
    .bind(
      id,
      symbol,
      asOf,
      computed.score,
      computed.direction,
      computed.confidence,
      factorsJson,
    )
    .run();

  return {
    id,
    symbol,
    as_of: asOf,
    horizon: "5d",
    score: computed.score,
    direction: computed.direction,
    confidence: computed.confidence,
    factors: computed.factors,
    model_version: "rules-v1",
  };
}

type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type YahooQuote = {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
};

async function fetchYahooDaily(symbol: string, range: string): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 finance-analytics" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null) continue;
    candles.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      open: Number(quote.open?.[i] ?? close),
      high: Number(quote.high?.[i] ?? close),
      low: Number(quote.low?.[i] ?? close),
      close: Number(close),
      volume: Number(quote.volume?.[i] ?? 0),
    });
  }
  return candles;
}

async function fetchYahooQuote(symbol: string): Promise<YahooQuote | null> {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 finance-analytics" },
  });
  if (!res.ok) {
    // fallback: derive from daily chart
    const candles = await fetchYahooDaily(symbol, "5d");
    if (candles.length < 2) return null;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const change = last.close - prev.close;
    return {
      price: last.close,
      change,
      changePercent: prev.close ? (change / prev.close) * 100 : 0,
      currency: "USD",
      marketState: "DELAYED",
    };
  }
  const data = (await res.json()) as any;
  const q = data?.quoteResponse?.result?.[0];
  if (!q) return null;
  return {
    price: Number(q.regularMarketPrice ?? 0),
    change: Number(q.regularMarketChange ?? 0),
    changePercent: Number(q.regularMarketChangePercent ?? 0),
    currency: String(q.currency ?? "USD"),
    marketState: String(q.marketState ?? "UNKNOWN"),
  };
}

const SECTOR_NAMES: Record<string, string> = {
  XLK: "Technology",
  XLF: "Financials",
  XLE: "Energy",
  XLV: "Health Care",
  XLY: "Consumer Discretionary",
  XLP: "Consumer Staples",
  XLI: "Industrials",
  XLB: "Materials",
  XLU: "Utilities",
  XLRE: "Real Estate",
};

const SEED_INSTRUMENTS: Instrument[] = [
  { id: "us-aapl", symbol: "AAPL", name: "Apple Inc.", asset_class: "stock", market: "US", currency: "USD" },
  { id: "us-msft", symbol: "MSFT", name: "Microsoft Corporation", asset_class: "stock", market: "US", currency: "USD" },
  { id: "us-nvda", symbol: "NVDA", name: "NVIDIA Corporation", asset_class: "stock", market: "US", currency: "USD" },
  { id: "us-spy", symbol: "SPY", name: "SPDR S&P 500 ETF Trust", asset_class: "fund", market: "US", currency: "USD" },
  { id: "us-qqq", symbol: "QQQ", name: "Invesco QQQ Trust", asset_class: "fund", market: "US", currency: "USD" },
  { id: "us-vti", symbol: "VTI", name: "Vanguard Total Stock Market ETF", asset_class: "fund", market: "US", currency: "USD" },
  { id: "us-iwm", symbol: "IWM", name: "iShares Russell 2000 ETF", asset_class: "fund", market: "US", currency: "USD" },
  { id: "us-xlk", symbol: "XLK", name: "Technology Select Sector SPDR", asset_class: "fund", market: "US", currency: "USD" },
  { id: "us-xlf", symbol: "XLF", name: "Financial Select Sector SPDR", asset_class: "fund", market: "US", currency: "USD" },
  { id: "us-xle", symbol: "XLE", name: "Energy Select Sector SPDR", asset_class: "fund", market: "US", currency: "USD" },
];
