# Stock Tracker 📈

A **mobile-first web app** for tracking your personal investment book:
money you deposit (入金) and every trade you place — qty, price, fees —
with a clean portfolio summary of costs and fees per position.

Built to replace the busy spreadsheet: the same data, the same math,
a much nicer screen. **Static site, no server, no accounts — your data
lives in your browser (localStorage) and never leaves your device.**

![tab bar: Home · Trades · Deposits · Settings]

## Features

- **Home** — total deposited, cost basis & fees (per currency), and a
  card per position: net qty, average cost, total cost, fees.
- **Trades** — full history, sells shown as negative qty (red), tap to
  edit or delete. If you buy and later sell it all, the position shows
  as *closed* (bought/sold totals + fees, no open avg). Add new trades with a floating button.
- **Deposits** — every funding of your account with running total.
- **Settings** —
  - **Import from Excel**: reads your original `Investment.xlsx` layout
    (ticker rows like `VOO (USD)`, 4-column blocks: date/qty/price/fee).
  - **Export to Excel**: downloads a `.xlsx` with clean `Summary`,
    `Transactions`, `Deposits` sheets.
  - **Backup / restore JSON** — move your data between phones.
  - **Reset to the original snapshot / erase all** — with confirmations.
- **PWA**: add to your home screen on iPhone/Android; works offline
  after first load; portrait-first design, safe-area aware.

Multi-currency aware: USD and HKD positions are kept separate (no FX
guesswork). Add EUR/GBP/JPY/CNY whenever you like.

## Quick start (local)

```bash
python -m http.server 8080        # then open http://localhost:8080
# or: npx serve .
```

You can also just double-click `index.html` (the first load needs the
internet to fetch the Excel library from CDN; everything else works
offline).

## Deploy to GitHub Pages

1. Create a new (empty) repo on GitHub, e.g. `stock-tracker`.
2. Push this folder:

   ```bash
   cd stock-tracker
   git init
   git add .
   git commit -m "Stock Tracker v1"
   git branch -M main
   git remote add origin git@github.com:YOURNAME/stock-tracker.git
   git push -u origin main
   ```

3. On GitHub → repo **Settings → Pages** →
   *Source: Deploy from a branch* → **`main`**, folder **`/ (root)`** → Save.
4. After ~1 minute your app is live at
   `https://YOURNAME.github.io/stock-tracker/`.
5. Open it on your phone, **Share → Add to Home Screen**. Done.

> First open the app, let it load (it seeds your Investment.xlsx data),
> then **Settings → Download backup (JSON)** and keep that file safe —
> clearing browser data will wipe the app's copy.

## Data model

```
book = {
  deposits:     [ { id, date: "YYYY-MM-DD", amount, currency, note? } ],
  transactions: [ { id, ticker, date, qty, price, fee, currency, note? } ]
}
```

- `qty` > 0 = buy, `qty` < 0 = sell. A trade with blank `price` is kept
  (treated as 0 in cost math, exactly like your Excel formulas).
- **Averages mirror the workbook**: `Σ(qty×price) / Σ(qty)` per ticker;
  fees = `Σ fee`; deposits = `Σ amount` per currency.
- Stored under localStorage key `stockTracker.v1`.

## Math verification

`npm test` runs two suites:

- `test/calc.test.cjs` — the aggregation engine against a deterministic
  fixture book (merges of buys and sells, closed positions, null prices,
  multiple currencies).
- `test/smoke.test.cjs` — renders the real app in jsdom and drives it:
  import → portfolio numbers → add trade → edit → delete → deposit →
  erase. If an actual `Investment.xlsx` sits in the project root, the
  suite imports it **through the app's own importer** and asserts the
  real numbers end-to-end (the file itself is git-ignored; the test
  skips that part when it's absent).

```bash
npm install        # once (dev deps for tests only)
npm test
```

## Project layout

```
index.html            app shell (tabs, PWA meta)
manifest.webmanifest  installable-app metadata
css/style.css         mobile-first styles
js/seed.js            snapshot of Investment.xlsx (first-run data + reset)
js/calc.js            pure aggregation (node-testable)
js/store.js           state + localStorage persistence
js/xlsx.js            Excel import/export (SheetJS from CDN)
js/ui.js              views, bottom sheets, events
icons/                PWA icons (180/192/512)
test/                 node test suite
```

## Notes & limits (by design, for v1)

- No live market prices — this tracks *what you paid*, not what it's
  worth now. (Easy to add later if you want a quote source.)
- Import **replaces** current data (with a confirmation) — it's a
  sync tool, not a merge tool.
- Excel import expects your workbook layout (a `TICKER (CUR)` header
  row + date/qty/price/fee blocks). Other layouts get a clear error.
