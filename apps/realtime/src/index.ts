import { DurableObject } from "cloudflare:workers";

type QuotePayload = {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
};

type ClientMsg =
  | { type: "subscribe"; symbols: string[] }
  | { type: "ping" };

const TICK_MS = 15_000;

export class WatchlistRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ symbols: [] as string[] });

    // ensure alarm loop is running
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm == null) {
      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    let parsed: ClientMsg;
    try {
      parsed = JSON.parse(message) as ClientMsg;
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "invalid_json" }));
      return;
    }

    if (parsed.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      return;
    }

    if (parsed.type === "subscribe") {
      const symbols = Array.from(
        new Set(
          (parsed.symbols ?? [])
            .map((s) => String(s).toUpperCase().trim())
            .filter(Boolean),
        ),
      ).slice(0, 30);
      ws.serializeAttachment({ symbols });
      ws.send(JSON.stringify({ type: "subscribed", symbols }));
      await this.pushQuotes([ws], symbols);
      return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }

  async alarm() {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) {
      // idle: stop alarm until a client connects again
      return;
    }

    const allSymbols = new Set<string>();
    for (const ws of sockets) {
      const att = (ws.deserializeAttachment() ?? { symbols: [] }) as {
        symbols: string[];
      };
      for (const s of att.symbols ?? []) allSymbols.add(s);
    }

    if (allSymbols.size > 0) {
      await this.pushQuotes(sockets, Array.from(allSymbols));
    }

    await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  private async pushQuotes(sockets: WebSocket[], symbols: string[]) {
    const quotes: Record<string, QuotePayload> = {};
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) quotes[symbol] = quote;
    }

    const payload = JSON.stringify({
      type: "quotes",
      ts: Date.now(),
      quotes,
    });

    for (const ws of sockets) {
      const att = (ws.deserializeAttachment() ?? { symbols: [] }) as {
        symbols: string[];
      };
      const wanted = new Set(att.symbols ?? []);
      if (wanted.size === 0) continue;
      const filtered: Record<string, QuotePayload> = {};
      for (const [sym, q] of Object.entries(quotes)) {
        if (wanted.has(sym)) filtered[sym] = q;
      }
      ws.send(
        JSON.stringify({
          type: "quotes",
          ts: Date.now(),
          quotes: filtered,
        }),
      );
    }

    // also keep a room-wide broadcast for debugging
    void payload;
  }

  private async getQuote(symbol: string): Promise<QuotePayload | null> {
    const cached = await this.env.QUOTES.get(`quote:${symbol}`, "json");
    if (cached) return cached as QuotePayload;

    const quote = await fetchYahooQuote(symbol);
    if (!quote) return null;
    await this.env.QUOTES.put(`quote:${symbol}`, JSON.stringify(quote), {
      expirationTtl: 60,
    });
    return quote;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "finance-analytics-realtime" });
    }

    if (url.pathname === "/ws") {
      const room = url.searchParams.get("room") || "default";
      const id = env.WATCHLIST_ROOM.idFromName(room);
      const stub = env.WATCHLIST_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("finance-analytics-realtime", { status: 200 });
  },
};

async function fetchYahooQuote(symbol: string): Promise<QuotePayload | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 finance-analytics" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const quotes = result?.indicators?.quote?.[0];
  const closes: Array<number | null> = quotes?.close ?? [];
  const valid = closes.filter((v: number | null): v is number => v != null);
  if (!meta && valid.length < 1) return null;

  const price = Number(meta?.regularMarketPrice ?? valid[valid.length - 1] ?? 0);
  const prev = Number(
    meta?.chartPreviousClose ??
      meta?.previousClose ??
      (valid.length > 1 ? valid[valid.length - 2] : price),
  );
  const change = price - prev;
  return {
    price,
    change,
    changePercent: prev ? (change / prev) * 100 : 0,
    currency: String(meta?.currency ?? "USD"),
    marketState: String(meta?.marketState ?? "DELAYED"),
  };
}

interface Env {
  WATCHLIST_ROOM: DurableObjectNamespace<WatchlistRoom>;
  QUOTES: KVNamespace;
}
