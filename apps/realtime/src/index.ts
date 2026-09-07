export class WatchlistRoom implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const text = typeof message === "string" ? message : "[binary]";
    ws.send(JSON.stringify({ type: "echo", payload: text }));
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const id = env.WATCHLIST_ROOM.idFromName("default");
      const stub = env.WATCHLIST_ROOM.get(id);
      return stub.fetch(request);
    }
    return new Response("finance-analytics-realtime", { status: 200 });
  },
};

interface Env {
  WATCHLIST_ROOM: DurableObjectNamespace;
}
