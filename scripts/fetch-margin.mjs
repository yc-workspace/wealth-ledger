// 抓取 TAIFEX OpenAPI 的保證金資料，存成 raw 備份 + 給網頁工具用的 data/margin.json
// 執行環境：GitHub Actions 的 ubuntu-latest + Node 20（內建 fetch，不需要額外安裝套件）

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://openapi.taifex.com.tw/v1";

// 使用者要求的 5 個保證金端點
const ENDPOINTS = {
  IndexFuturesAndOptionsMargining: "保證金一覽表-股價指數類",
  InterestRateFuturesMargining: "保證金一覽表-利率類",
  GoldFuturesAndOptionsMargining: "保證金一覽表-商品類",
  SingleStockFuturesMargining: "保證金一覽表-股票類",
  SingleStockFuturesETFMargining: "保證金一覽表-股票類(ETF)",
};

// -----------------------------------------------------------------------
// 這裡是「手續費」設定 —— TAIFEX 的公開 API 只會告訴我們交易所規定的保證金，
// 不會有你券商實際收的手續費（那是你跟券商談的價錢，每個人不一樣）。
// 所以這一段先用你 App 截圖裡對得上的預設值，你可以直接改這裡的數字，
// 改完 commit 上去，下次 Action 跑完 margin.json 就會帶上你自己的手續費。
// -----------------------------------------------------------------------
const MANUAL_FEE = {
  TX: 45,
  MTX: 30,
  TMF: 20,
};

// 我們的 App 只認得這三個臺股指數期貨代碼
const WANTED_PRODUCTS = ["TX", "MTX", "TMF"];

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// 在一列資料的所有欄位名稱裡，找出「同時包含這些關鍵字」的欄位名稱
// 例如 findKeyContaining(row, ['代號']) 可能會抓到 "商品代號" 或 "契約代號"，
// 不管 TAIFEX 實際上是用哪個字。這是為了在還沒看過真實資料格式前，
// 用比較有彈性的方式去猜欄位，避免死板地寫死一個名字結果完全抓不到。
function findKeyContaining(row, mustContainAll) {
  for (const k of Object.keys(row)) {
    if (mustContainAll.every((sub) => k.includes(sub))) return k;
  }
  return null;
}

function toNumber(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function extractMarginForProduct(rows, productCode) {
  if (!Array.isArray(rows)) return { original: null, maintenance: null, matchedRow: null };
  const codeKeyCandidates = ["商品代號", "契約代號", "商品代碼", "契約代碼"];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    let codeKey = codeKeyCandidates.find((k) => k in row);
    if (!codeKey) codeKey = Object.keys(row).find((k) => k.includes("代號") || k.includes("代碼"));
    if (!codeKey) continue;
    const val = String(row[codeKey]).trim().toUpperCase();
    if (val !== productCode) continue;
    const originalKey =
      findKeyContaining(row, ["原始", "保證金"]) || findKeyContaining(row, ["原始"]);
    const maintenanceKey =
      findKeyContaining(row, ["維持", "保證金"]) || findKeyContaining(row, ["維持"]);
    return {
      original: originalKey ? toNumber(row[originalKey]) : null,
      maintenance: maintenanceKey ? toNumber(row[maintenanceKey]) : null,
      matchedRow: row,
    };
  }
  return { original: null, maintenance: null, matchedRow: null };
}

async function main() {
  const outDir = path.resolve("data");
  const rawDir = path.join(outDir, "raw");
  await mkdir(rawDir, { recursive: true });

  const results = {};
  const errors = {};

  for (const [name] of Object.entries(ENDPOINTS)) {
    const url = `${BASE}/${name}`;
    try {
      console.log(`抓取中：${name} (${url})`);
      const json = await fetchJson(url);
      results[name] = json;
      await writeFile(
        path.join(rawDir, `${name}.json`),
        JSON.stringify(json, null, 2),
        "utf-8"
      );
      // 印出第一筆資料方便之後對欄位名稱（可在 Actions 的 log 裡看到）
      const sample = Array.isArray(json) ? json[0] : json;
      console.log(`  → 已存檔，範例第一筆資料：`, JSON.stringify(sample));
    } catch (err) {
      console.error(`  ✗ 抓取失敗：${name}：${err.message}`);
      errors[name] = String(err.message || err);
    }
  }

  // 只有股價指數類（TX / MTX / TMF）需要餵給網頁工具用
  const margin = {};
  const maintenanceMargin = {};
  const indexRows = results.IndexFuturesAndOptionsMargining;

  for (const code of WANTED_PRODUCTS) {
    const { original, maintenance } = extractMarginForProduct(indexRows, code);
    if (original != null) margin[code] = original;
    if (maintenance != null) maintenanceMargin[code] = maintenance;
  }

  const marginJson = {
    updatedAt: new Date().toISOString(),
    source: "TAIFEX OpenAPI /v1/IndexFuturesAndOptionsMargining",
    margin,
    maintenanceMargin,
    fee: MANUAL_FEE,
    fetchErrors: Object.keys(errors).length ? errors : undefined,
  };

  await writeFile(
    path.join(outDir, "margin.json"),
    JSON.stringify(marginJson, null, 2),
    "utf-8"
  );

  console.log("---");
  console.log("已產生 data/margin.json：", JSON.stringify(marginJson, null, 2));

  if (Object.keys(margin).length === 0) {
    console.warn(
      "⚠️ 沒有成功比對到任何 TX / MTX / TMF 的保證金數字。" +
        "這通常代表 TAIFEX 實際回傳的欄位名稱跟這支腳本猜的不一樣。" +
        "請打開上面印出的「範例第一筆資料」，把完整內容貼給 Claude，就能一次把欄位對應改到正確為止。"
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
