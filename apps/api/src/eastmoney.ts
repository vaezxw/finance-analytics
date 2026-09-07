const EM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://quote.eastmoney.com/",
  Accept: "*/*",
};

export const INDEX_DEFS = [
  { secid: "1.000001", code: "000001", name: "上证指数", market: "SH" },
  { secid: "0.399001", code: "399001", name: "深证成指", market: "SZ" },
  { secid: "0.399006", code: "399006", name: "创业板指", market: "SZ" },
  { secid: "1.000688", code: "000688", name: "科创50", market: "SH" },
] as const;

async function emGet(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), 8000);
  try {
    const res = await fetch(url, { headers: EM_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`eastmoney_http_${res.status}`);
    const text = await res.text();
    if (!text) throw new Error("eastmoney_empty");
    return JSON.parse(text) as any;
  } finally {
    clearTimeout(timer);
  }
}

export type IndexQuote = {
  secid: string;
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
};

export async function fetchIndexQuotes(): Promise<IndexQuote[]> {
  try {
    const secids = INDEX_DEFS.map((i) => i.secid).join(",");
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f4,f12,f14&secids=${secids}`;
    const data = await emGet(url);
    const diffs: any[] = data?.data?.diff ?? [];
    if (diffs.length) {
      return INDEX_DEFS.map((def) => {
        const row =
          diffs.find((d) => String(d.f12) === def.code) ??
          diffs[INDEX_DEFS.findIndex((x) => x.secid === def.secid)];
        return {
          secid: def.secid,
          code: def.code,
          name: def.name,
          price: num(row?.f2),
          change: num(row?.f4),
          changePercent: num(row?.f3),
        };
      });
    }
  } catch {
    // fall through to tencent
  }
  return fetchIndexQuotesFromTencent();
}

async function fetchIndexQuotesFromTencent(): Promise<IndexQuote[]> {
  const map = [
    { q: "s_sh000001", ...INDEX_DEFS[0] },
    { q: "s_sz399001", ...INDEX_DEFS[1] },
    { q: "s_sz399006", ...INDEX_DEFS[2] },
    { q: "s_sh000688", ...INDEX_DEFS[3] },
  ];
  const url = `https://qt.gtimg.cn/q=${map.map((m) => m.q).join(",")}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 finance-analytics" },
  });
  const text = await res.text();
  return map.map((m) => {
    const re = new RegExp(`${m.q}="([^"]*)"`);
    const matched = text.match(re)?.[1]?.split("~") ?? [];
    // 1~name~code~price~change~percent~...
    return {
      secid: m.secid,
      code: m.code,
      name: m.name,
      price: num(matched[3]),
      change: num(matched[4]),
      changePercent: num(matched[5]),
    };
  });
}

export async function fetchIndexIntraday(secid: string) {
  const url = `https://push2.eastmoney.com/api/qt/stock/trends2/get?secid=${encodeURIComponent(
    secid,
  )}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&ndays=1&iscca=0`;
  const data = await emGet(url);
  const trends: string[] = data?.data?.trends ?? [];
  const preClose = num(data?.data?.preClose);
  const points = trends.map((line) => {
    const [time, , price, , , volume] = line.split(",");
    return {
      time: String(time).slice(11, 16) || String(time),
      price: num(price),
      volume: num(volume),
    };
  });
  return { secid, preClose, points };
}

export type BreadthBucket = { label: string; count: number; tone: "up" | "down" | "flat" };

export async function fetchMarketBreadth() {
  // 涨跌分布（题材/全市场常用接口）
  const url =
    "https://push2ex.eastmoney.com/getTopicZDFenBu?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt";
  try {
    const data = await emGet(url);
    const fenbu = data?.data?.fenbu ?? data?.data ?? {};
    // fenbu keys often like: "5": n, "4": n ... "-5": n or array form
    const buckets: BreadthBucket[] = [];
    const map: Array<[string, string, "up" | "down" | "flat"]> = [
      ["5", "涨停", "up"],
      ["4", ">7%", "up"],
      ["3", "5~7%", "up"],
      ["2", "3~5%", "up"],
      ["1", "0~3%", "up"],
      ["0", "平盘", "flat"],
      ["-1", "0~-3%", "down"],
      ["-2", "-3~-5%", "down"],
      ["-3", "-5~-7%", "down"],
      ["-4", "<-7%", "down"],
      ["-5", "跌停", "down"],
    ];
    for (const [key, label, tone] of map) {
      const count = num(fenbu?.[key] ?? fenbu?.[Number(key)]);
      buckets.push({ label, count, tone });
    }
    const up = buckets.filter((b) => b.tone === "up").reduce((s, b) => s + b.count, 0);
    const down = buckets.filter((b) => b.tone === "down").reduce((s, b) => s + b.count, 0);
    const flat = buckets.filter((b) => b.tone === "flat").reduce((s, b) => s + b.count, 0);
    return { buckets, up, down, flat, raw: fenbu };
  } catch {
    // fallback approximate via list stats if fenbu fails
    return {
      buckets: [] as BreadthBucket[],
      up: 0,
      down: 0,
      flat: 0,
      raw: {},
    };
  }
}

export type BoardItem = {
  code: string;
  name: string;
  changePercent: number;
  price: number;
  netInflow: number;
  leadingStocks: Array<{ code: string; name: string; changePercent: number }>;
};

export async function fetchHotBoards(limit = 5): Promise<BoardItem[]> {
  // 概念板块按涨幅
  const url =
    "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=12&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3+f:!50&fields=f2,f3,f12,f14,f62";
  const data = await emGet(url);
  const diffs: any[] = data?.data?.diff ?? [];
  const top = diffs.slice(0, limit);

  const boards = await Promise.all(
    top.map(async (row) => {
      const code = String(row.f12 ?? "");
      const leading = await fetchBoardLeaders(code, 5);
      return {
        code,
        name: String(row.f14 ?? code),
        changePercent: num(row.f3),
        price: num(row.f2),
        netInflow: num(row.f62),
        leadingStocks: leading,
      } satisfies BoardItem;
    }),
  );
  return boards;
}

async function fetchBoardLeaders(boardCode: string, limit: number) {
  if (!boardCode) return [];
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${limit}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${boardCode}+f:!50&fields=f2,f3,f12,f14`;
  try {
    const data = await emGet(url);
    const diffs: any[] = data?.data?.diff ?? [];
    return diffs.map((d) => ({
      code: String(d.f12 ?? ""),
      name: String(d.f14 ?? ""),
      changePercent: num(d.f3),
    }));
  } catch {
    return [];
  }
}

export async function fetchSectorFlowSeries() {
  // 用热门概念的主力净流入近似“资金流向”卡片；取涨幅前列板块的 f62
  const url =
    "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=8&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3+f:!50&fields=f3,f12,f14,f62";
  const data = await emGet(url);
  const diffs: any[] = data?.data?.diff ?? [];
  return diffs.map((d) => ({
    code: String(d.f12 ?? ""),
    name: String(d.f14 ?? ""),
    changePercent: num(d.f3),
    netInflow: num(d.f62),
  }));
}

export type NewsItem = {
  id: string;
  title: string;
  time: string;
  summary?: string;
  important?: boolean;
  url?: string;
};

export async function fetchFlashNews(limit = 20): Promise<NewsItem[]> {
  // 财经快讯
  const url = `https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web_news_col&biz=web_news_col&column=350&order=1&needInteractData=0&page_index=1&page_size=${limit}&req_trace=finance-analytics`;
  try {
    const data = await emGet(url);
    const list: any[] = data?.data?.list ?? data?.data?.data ?? [];
    return list.slice(0, limit).map((n, idx) => ({
      id: String(n.code ?? n.art_code ?? idx),
      title: String(n.title ?? n.Art_Title ?? ""),
      time: String(n.showTime ?? n.Art_ShowTime ?? n.datetime ?? ""),
      summary: String(n.digest ?? n.Art_Digest ?? ""),
      important: Boolean(n.is_important ?? n.Art_IsImportant),
      url: n.url_unique || n.url || undefined,
    }));
  } catch {
    // fallback alternate endpoint
    const alt =
      "https://finance.eastmoney.com/a/cywjh.html";
    void alt;
    return [];
  }
}

export function buildSentimentSummary(input: {
  indices: IndexQuote[];
  breadth: { up: number; down: number; flat: number };
  boards: BoardItem[];
}) {
  const sh = input.indices.find((i) => i.code === "000001");
  const cyb = input.indices.find((i) => i.code === "399006");
  const leaders = input.boards
    .slice(0, 3)
    .map((b) => `${b.name}(${fmtPct(b.changePercent)})`)
    .join("、");
  const bias =
    input.breadth.up === input.breadth.down
      ? "多空相对均衡"
      : input.breadth.up > input.breadth.down
        ? "赚钱效应占优"
        : "亏钱效应升温";

  return [
    `截至最新延迟行情，上证指数报 ${sh?.price?.toFixed(2) ?? "--"}（${fmtPct(sh?.changePercent)}），创业板指 ${cyb?.price?.toFixed(2) ?? "--"}（${fmtPct(cyb?.changePercent)}）。`,
    `全市场上涨 ${input.breadth.up} 家、下跌 ${input.breadth.down} 家、平盘 ${input.breadth.flat} 家，${bias}。`,
    leaders
      ? `当日领涨方向集中在：${leaders}。注意公开接口为延迟数据，仅供研究，不构成投资建议。`
      : `板块联动数据暂不可用。注意公开接口为延迟数据，仅供研究，不构成投资建议。`,
  ].join("");
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtPct(v?: number) {
  if (v == null || !Number.isFinite(v)) return "--";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}
