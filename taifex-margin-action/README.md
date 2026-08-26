# TAIFEX 保證金自動抓取（給 wealth-ledger 期貨分頁用）

不需要裝 Python、不需要自己的電腦一直開著。全部跑在 GitHub 免費的 Actions 上。

## 這是什麼

一支排程腳本，每個交易日跑兩次，去 TAIFEX 官方 OpenAPI 抓 5 張保證金一覽表，
把「股價指數類」（大台 TX / 小台 MTX / 微台 TMF）整理成你的 wealth-ledger 網頁
工具看得懂的 `data/margin.json`，其餘 4 張（利率類、商品類、股票類、股票類 ETF）
原始存檔在 `data/raw/`，之後想用再說。

跑完會自動 commit 回這個 repo。你的網頁工具直接讀這個 repo 的 raw 檔案網址，
不需要你手動下載、也不需要本機電腦開著排程。

## 設定步驟（10 分鐘，一次性）

1. 到 github.com 開一個新的 **public** repo（要 public，才能免費用 raw.githubusercontent.com
   直接被瀏覽器讀取；private repo 的 raw 連結需要驗證，網頁沒辦法直接抓）。
   例如取名 `taifex-margin-feed`。

2. 把這個資料夾裡的東西上傳上去，維持這個結構：
   ```
   .github/workflows/taifex-margin.yml
   scripts/fetch-margin.mjs
   ```
   最簡單的做法：在 GitHub 網頁上用「Add file → Upload files」直接拖上去即可，
   不需要裝 git。

3. 上傳完，到 repo 的 **Actions** 分頁，找到「更新 TAIFEX 保證金資料」這個
   workflow，點 **Run workflow** 手動跑一次，測試看看會不會成功。

4. 跑完後，檢查 repo 裡有沒有出現 `data/margin.json`。點開來看內容：
   - 如果 `margin` 欄位底下有 `TX`、`MTX`、`TMF` 三個數字，代表成功了，直接跳到步驟 5。
   - 如果 `margin` 是空的 `{}`，代表 TAIFEX 實際欄位名稱跟腳本猜的不一樣。
     打開 Actions 的執行紀錄（log），找到「範例第一筆資料」那幾行，
     把完整內容複製貼給 Claude，就能把 `scripts/fetch-margin.mjs` 裡的
     欄位對應一次改到正確為止，之後就不用再管了。

5. 複製 `data/margin.json` 的 **raw** 網址。在 GitHub 檔案頁面點 `margin.json`，
   再點 "Raw" 按鈕，網址列那個就是，長得像：
   ```
   https://raw.githubusercontent.com/你的帳號/taifex-margin-feed/main/data/margin.json
   ```

6. 打開 wealth-ledger 網頁工具 → 系統 → 系統設定 → API／資料來源，
   貼到「期貨保證金資料來源」那一欄，按儲存。

7. 回到「期貨」分頁，按「重新讀取」，應該就能看到保證金資料了。之後排程會自動更新，
   你完全不用管，網頁每次打開也會自動去讀最新的。

## 手續費要自己填

TAIFEX 的公開資料只有交易所規定的「保證金」，不會有你券商實際收的手續費
（那是你跟券商談的價錢）。打開 `scripts/fetch-margin.mjs`，最上面有一段
`MANUAL_FEE`，改成你實際的手續費金額，存檔、commit 上去，下次跑完
`margin.json` 就會帶上你自己的數字。

## 之後想加更多商品或抓即時報價

抓即時報價（給投資總覽、觀察清單用）跟這個是完全一樣的架構，只是換一個
Action 排程更頻繁一點、資料來源换成別的公開行情 API。等這個裝好順利跑通後，
可以直接請 Claude 依樣照做第二個。
