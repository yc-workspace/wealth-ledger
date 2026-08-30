// 抓取每一檔股票近十年的日K線，存成 data/history/{ticker}.json
// 給觀察清單的走勢圖、技術指標（MA/RSI 等）在瀏覽器端計算用
// 這支腳本一天跑一次就好，歷史資料不需要頻繁更新

import { writeFile, mkdir } from "node:fs/promises";
import { loadTickers, toYahooSymbol, YAHOO_HEADERS } from "./yahoo-common.mjs";

async function fetchHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=10y&interval=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo 回傳沒有資料");

  const timestamps = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const rows = timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    open: q.open?.[i] ?? null,
    high: q.high?.[i] ?? null,
    low: q.low?.[i] ?? null,
    close: q.close?.[i] ?? null,
    volume: q.volume?.[i] ?? null,
  }));
  // 濾掉停牌造成的空值列
  return rows.filter((r) => r.close != null);
}

// 檔名不能有奇怪字元，把 ticker 轉成安全檔名（. 和大部分符號其實檔名系統都能接受，
// 這裡只是保守起見換成底線，避免少數雲端同步服務對某些符號挑剔）
function safeFileName(ticker) {
  return ticker.replace(/[^A-Za-z0-9._-]/g, "_") + ".json";
}

async function main() {
  const tickers = await loadTickers();
  await mkdir("data/history", { recursive: true });

  if (!tickers.length) {
    console.log("watchlist 是空的（data/watchlist.json 還不存在，或裡面沒有任何 ticker），先放一個佔位檔案，讓這個資料夾能被 git 追蹤。");
    await writeFile(
      "data/history/.gitkeep",
      "# 這個檔案只是為了讓空資料夾能被 git 記錄，尚無 ticker 時會只有這個檔案。\n" +
        "# 之後在 wealth-ledger 裡新增觀察清單或持股交易後，重新跑一次這個 Action 就會產生真正的歷史資料。\n",
      "utf-8"
    );
    return;
  }

  for (const item of tickers) {
    const symbol = toYahooSymbol(item);
    try {
      console.log(`抓取歷史K線中：${item.ticker} → Yahoo symbol ${symbol}`);
      const rows = await fetchHistory(symbol);
      const out = {
        ticker: item.ticker,
        yahooSymbol: symbol,
        updatedAt: new Date().toISOString(),
        rows,
      };
      await writeFile(
        `data/history/${safeFileName(item.ticker)}`,
        JSON.stringify(out, null, 2),
        "utf-8"
      );
      console.log(`  → 已存檔，共 ${rows.length} 筆日K`);
    } catch (err) {
      console.error(`  ✗ 失敗：${item.ticker}：${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
