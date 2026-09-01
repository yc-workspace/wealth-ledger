// 交易時段設定 —— 這是唯一需要手動改的地方。
// cron 排程本身固定「每分鐘都觸發」，實際要不要抓報價，由這裡的時段表決定。
// 改時段只要改下面這個陣列，不用碰 .yml 或 cron 語法。
//
// - timeZone：用 IANA 時區名稱（例如 "Asia/Taipei"、"America/New_York"），
//   夏令/冬令時間會由 Node.js 自動判斷，不用自己算 UTC 位移。
// - days：0=週日、1=週一...6=週六
// - start / end：24 小時制 "HH:MM"，本地時間
//
// 2026 年調整：原本分「台股」「美股」兩個時段窗，但美股窗（週一~五 00:00-23:59
// 美東時間）本來就已經涵蓋台股窗（週一~五 08:30-15:30 台北時間）的所有時間，
// 分開列反而沒有實際意義；且觀察清單裡可能有 BTC 這類週末照樣變動的標的，
// 所以直接改成「全年無休、全天候」都算交易時段，不再區分市場、不排除假日。
// cron 依然是每分鐘觸發一次。
export const TRADING_WINDOWS = [
  {
    name: "全天候（不分市場、不分平假日）",
    timeZone: "UTC",
    days: [0, 1, 2, 3, 4, 5, 6],
    start: "00:00",
    end: "23:59",
  },
];

function localParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: weekdayMap[get("weekday")], hm: `${get("hour")}:${get("minute")}` };
}

export function isWithinWindow(date, win) {
  const { day, hm } = localParts(date, win.timeZone);
  if (!win.days.includes(day)) return false;
  return hm >= win.start && hm <= win.end;
}

export function activeWindow(date = new Date(), windows = TRADING_WINDOWS) {
  return windows.find((w) => isWithinWindow(date, w)) || null;
}

export function isTradingTime(date = new Date(), windows = TRADING_WINDOWS) {
  return activeWindow(date, windows) !== null;
}
