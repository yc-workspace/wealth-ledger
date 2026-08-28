// 交易時段設定 —— 這是唯一需要手動改的地方。
// cron 排程本身固定「每分鐘都觸發」，實際要不要抓報價，由這裡的時段表決定。
// 改時段只要改下面這個陣列，不用碰 .yml 或 cron 語法。
//
// - timeZone：用 IANA 時區名稱（例如 "Asia/Taipei"、"America/New_York"），
//   夏令/冬令時間會由 Node.js 自動判斷，不用自己算 UTC 位移。
// - days：0=週日、1=週一...6=週六
// - start / end：24 小時制 "HH:MM"，本地時間
//
// 台股常態盤中是 09:00-13:30，這裡前後各加 30 分鐘，抓到收盤前後的延遲報價。
// 美股目前（2026 年底 Nasdaq 23 小時新制上線前）常見的盤前/盤中/盤後大約是
// 美東 04:00-20:00；如果之後想涵蓋近全日交易，把 end 改成 "23:59"、
// start 改成 "00:00" 即可，不需要再處理時區或夏令時間的問題。
export const TRADING_WINDOWS = [
  {
    name: "台股",
    timeZone: "Asia/Taipei",
    days: [1, 2, 3, 4, 5],
    start: "08:30",
    end: "15:30",
  },
  {
    name: "美股",
    timeZone: "America/New_York",
    days: [1, 2, 3, 4, 5],
    start: "04:00",
    end: "20:00",
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
