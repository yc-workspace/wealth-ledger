// 共用小工具：讀取 data/watchlist.json、把台股代碼補上 .TW 後綴給 Yahoo Finance 用

import { readFile } from "node:fs/promises";

// 讀取完整的 watchlist.json（含 updatedAt），用來判斷「清單是否有異動」
export async function loadWatchlist() {
  let raw;
  try {
    raw = await readFile("data/watchlist.json", "utf-8");
  } catch {
    console.warn("找不到 data/watchlist.json（可能你的 wealth-ledger 工具還沒同步過），略過。");
    return { updatedAt: null, tickers: [] };
  }
  const json = JSON.parse(raw);
  return { updatedAt: json.updatedAt || null, tickers: json.tickers || [] };
}

// 舊有介面：只要 tickers 陣列（保留給還在用這個介面的腳本）
export async function loadTickers() {
  const { tickers } = await loadWatchlist();
  return tickers;
}

// Yahoo Finance 需要台股代碼帶 .TW（上市）或 .TWO（上櫃）後綴，這裡先一律補 .TW，
// 如果你的股票是上櫃股（.TWO），可以直接在 wealth-ledger 的 ticker 欄位輸入時
// 就打完整代碼（例如 "6488.TWO"），這支腳本看到已經有點號就不會再加。
export function toYahooSymbol(item) {
  const t = item.ticker.trim().toUpperCase();
  if (t.includes(".")) return t; // 使用者已經自己打了完整代碼
  if (item.market === "TW" || item.currency === "TWD") return `${t}.TW`;
  return t;
}

export const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
};
