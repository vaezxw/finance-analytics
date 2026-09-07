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

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    await seedInstruments(env.DB);
    const symbols = SEED_INSTRUMENTS.map((i) => i.symbol);
    for (const symbol of symbols) {
      const candles = await fetchYahooDaily(symbol, "6mo");
      if (candles.length) {
        await env.QUOTES.put(`ohlcv:${symbol}:6mo`, JSON.stringify(candles), {
          expirationTtl: 60 * 60 * 12,
        });
      }
      const quote = await fetchYahooQuote(symbol);
      if (quote) {
        await env.QUOTES.put(`quote:${symbol}`, JSON.stringify(quote), {
          expirationTtl: 60 * 30,
        });
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
