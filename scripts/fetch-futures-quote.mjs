// scripts/fetch-futures-quote.mjs
//
// 抓取 Yahoo 奇摩股市「台指期貨」(WTX&，近月連續) 的即時報價、漲跌與漲跌%，
// 寫入 data/futures_quote.json，供 wealth-ledger.html 的「期貨」頁使用。
//
// 這條資料管線跟 taifex-margin.yml（抓保證金）、fetch-quotes.yml（抓一般股票報價）
// 是分開的，因為來源網站、更新頻率、資料形狀都不一樣：
//   - taifex-margin.yml  -> TAIFEX 官網 -> data/margin.json（margin/fee，變動不頻繁）
//   - fetch-quotes.yml   -> Yahoo Finance -> data/quotes.json（個股，交易時段內）
//   - fetch-futures-quote.yml（本檔）-> Yahoo 奇摩股市 -> data/futures_quote.json（台指期貨點數，全年無休、每分鐘）
//
// 輸出格式：
// {
//   "symbol": "WTX",
//   "price": 23150,          // 最新報價（點）
//   "change": 85,             // 漲跌（點數，可能為負）
//   "changePercent": 0.37,    // 漲跌 %（可能為負）
//   "updatedAt": "2026-09-02T05:29:00.000Z"   // 這次抓取時間（UTC，工具端會自行換算台北時間顯示）
// }

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const QUOTE_URL = "https://tw.stock.yahoo.com/quote/WTX&";
const OUTPUT_PATH = path.join(process.cwd(), "data", "futures_quote.json");

// 有些環境（或 Yahoo 那邊改版）可能需要備援符號，先留一個陣列方便之後擴充。
const CANDIDATE_SYMBOLS = ["WTX&", "WTX%26"];

async function fetchHtml(symbol) {
  const url = `https://tw.stock.yahoo.com/quote/${symbol}`;
  const res = await fetch(url, {
    headers: {
      // 部分反爬蟲規則會擋掉沒有 UA 的請求
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

// Yahoo 奇摩股市（tw.stock.yahoo.com）目前是用 Next.js 出的頁面，
// 報價資料會內嵌在 <script id="__NEXT_DATA__" type="application/json">...</script> 裡面。
// 這裡用寬鬆一點的方式去挖，避免頁面結構小改版就整支 script 掛掉：
// 1) 先試 __NEXT_DATA__ 這個最穩定的區塊
// 2) 抓不到的話，退而求其次直接用 regex 在整個 HTML 裡找 "regularMarketPrice" 相關欄位
function extractQuoteFromHtml(html) {
  // 方法一：__NEXT_DATA__
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const found = deepFindQuote(json);
      if (found) return found;
    } catch {
      // 掉到方法二
    }
  }

  // 方法二：直接在原始 HTML 內用 regex 抓關鍵欄位（容錯用，格式不一定跟官方 API 一致）
  const priceMatch = html.match(/"regularMarketPrice"\s*:\s*\{?\s*"?(?:raw)?"?\s*:?\s*(-?\d+(?:\.\d+)?)/);
  const changeMatch = html.match(/"regularMarketChange"\s*:\s*\{?\s*"?(?:raw)?"?\s*:?\s*(-?\d+(?:\.\d+)?)/);
  const changePctMatch = html.match(
    /"regularMarketChangePercent"\s*:\s*\{?\s*"?(?:raw)?"?\s*:?\s*(-?\d+(?:\.\d+)?)/
  );
  if (priceMatch) {
    return {
      price: Number(priceMatch[1]),
      change: changeMatch ? Number(changeMatch[1]) : null,
      changePercent: changePctMatch ? Number(changePctMatch[1]) : null,
    };
  }
  return null;
}

// 在 __NEXT_DATA__ 巨大的 JSON 樹裡遞迴找有 regularMarketPrice 的物件。
// 用遞迴而不是寫死路徑，是因為 Yahoo 改版時 JSON 結構的巢狀路徑常常會變，
// 但欄位名稱（regularMarketPrice 等）通常維持不變，這樣比較耐改版。
function deepFindQuote(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 12) return null;
  if (
    "regularMarketPrice" in node &&
    (typeof node.regularMarketPrice === "number" ||
      typeof node.regularMarketPrice?.raw === "number")
  ) {
    const pick = (v) => (typeof v === "number" ? v : v?.raw ?? null);
    return {
      price: pick(node.regularMarketPrice),
      change: pick(node.regularMarketChange),
      changePercent: pick(node.regularMarketChangePercent),
    };
  }
  for (const key of Object.keys(node)) {
    const result = deepFindQuote(node[key], depth + 1);
    if (result) return result;
  }
  return null;
}

async function main() {
  let quote = null;
  let lastErr = null;

  for (const symbol of CANDIDATE_SYMBOLS) {
    try {
      const html = await fetchHtml(symbol);
      quote = extractQuoteFromHtml(html);
      if (quote && quote.price != null) break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!quote || quote.price == null) {
    console.error(
      "抓不到台指期貨報價，可能是 Yahoo 頁面結構改版了，需要更新 extractQuoteFromHtml()。",
      lastErr ? String(lastErr) : ""
    );
    process.exit(1);
  }

  const payload = {
    symbol: "WTX",
    price: quote.price,
    change: quote.change ?? null,
    changePercent: quote.changePercent ?? null,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log("已寫入 data/futures_quote.json：", payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
