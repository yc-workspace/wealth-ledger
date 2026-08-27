// 抓取 data/watchlist.json 裡每一檔股票的最新報價，寫成 data/quotes.json
// 給 wealth-ledger 網頁工具的「投資總覽」「觀察清單」讀取

import { writeFile, mkdir } from "node:fs/promises";
import { loadTickers, toYahooSymbol, YAHOO_HEADERS } from "./yahoo-common.mjs";

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=5d&interval=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo 回傳沒有資料（代碼可能打錯或已下市）");

  const meta = result.meta || {};
  const price = meta.regularMarketPrice ?? null;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
  const volumes = result.indicators?.quote?.[0]?.volume || [];
  const lastVolume = [...volumes].reverse().find((v) => v != null) ?? null;

  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct =
    change != null && prevClose ? (change / prevClose) * 100 : null;

  return {
    price,
    prevClose,
    change,
    changePct,
    volume: lastVolume,
    currency: meta.currency || null,
    exchangeName: meta.exchangeName || null,
    asOf: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : null,
  };
}

async function main() {
  const tickers = await loadTickers();
  await mkdir("data", { recursive: true });

  if (!tickers.length) {
    console.log("watchlist 是空的（data/watchlist.json 還不存在，或裡面沒有任何 ticker），先寫一個空的 data/quotes.json 佔位。");
    await writeFile(
      "data/quotes.json",
      JSON.stringify(
        { updatedAt: new Date().toISOString(), quotes: {}, note: "尚無 ticker，請先在 wealth-ledger 裡新增觀察清單或持股交易" },
        null,
        2
      ),
      "utf-8"
    );
    return;
  }

  const quotes = {};
  const errors = {};

  for (const item of tickers) {
    const symbol = toYahooSymbol(item);
    try {
      console.log(`抓取報價中：${item.ticker} → Yahoo symbol ${symbol}`);
      quotes[item.ticker] = { ...(await fetchQuote(symbol)), yahooSymbol: symbol };
    } catch (err) {
      console.error(`  ✗ 失敗：${item.ticker}：${err.message}`);
      errors[item.ticker] = String(err.message || err);
    }
    // 稍微間隔一下，避免短時間內對 Yahoo 打太多請求被限流
    await new Promise((r) => setTimeout(r, 300));
  }

  await mkdir("data", { recursive: true });
  const out = {
    updatedAt: new Date().toISOString(),
    quotes,
    fetchErrors: Object.keys(errors).length ? errors : undefined,
  };
  await writeFile("data/quotes.json", JSON.stringify(out, null, 2), "utf-8");
  console.log(`已寫入 data/quotes.json，共 ${Object.keys(quotes).length} 檔成功。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
