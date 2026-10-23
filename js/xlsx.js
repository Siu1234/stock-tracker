/* ============================================================
   xlsx.js — import/export .xlsx (SheetJS global `XLSX` from CDN).

   IMPORT understands the original Investment.xlsx layout:
     - a "ticker row" whose cells look like  VOO (USD)  /  1234 (HKD)
       each of those cells starts a 4-column block:
       [date, qty, price, fee]
     - below it: data rows; first two columns are
       [deposit date, deposit amount]
   Export produces a clean 3-sheet workbook (Summary /
   Transactions / Deposits).
   ============================================================ */
(function () {
  "use strict";

  const guard = () => {
    if (typeof XLSX === "undefined") {
      throw new Error("Excel library not loaded — check your internet connection and retry.");
    }
  };

  const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const isNum = (v) => typeof v === "number" && isFinite(v);

  /** Accept Excel serial dates, JS Dates, and ISO-ish strings. */
  const toDateISO = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === "string") {
      const s = v.trim();
      const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (m) {
        const yyyy = +m[1], mm = +m[2], dd = +m[3];
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        }
      }
      const d = new Date(s);
      if (!isNaN(d)) {
        // Only treat as date if it looks like a whole day in local time
        const iso = d.toISOString().slice(0, 10);
        const back = new Date(iso + "T12:00:00");
        if (Math.abs(back - d) < 12 * 3600 * 1000) return iso;
      }
      return null;
    }
    if (isNum(v) && v > 25000 && v < 80000) { // Excel serial
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
    return null;
  };

  /** Parse a workbook into { deposits, transactions } or throw. */
  function parseWorkbook(wb) {
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) throw new Error("Couldn't find any data in the Excel file.");
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

    // 1) find the ticker row (first of the first 10 rows with "NAME (CUR)" cells)
    let tickerIdx = -1;
    let blocks = [];
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const found = [];
      (rows[i] || []).forEach((c, j) => {
        if (typeof c !== "string") return;
        // e.g. "VOO (USD)", "1234 (HKD)", tolerant of full-width CJK parentheses
        const m = c.trim().match(/^([A-Za-z0-9][A-Za-z0-9.\-]{0,5})\s*[（(]([A-Za-z]{2,4})[)）]\s*$/);
        if (m) found.push({ col: j, ticker: m[1].toUpperCase(), cur: m[2].toUpperCase() });
      });
      if (found.length >= 1) { tickerIdx = i; blocks = found; break; }
    }
    if (tickerIdx === -1) {
      throw new Error("Couldn't recognize this Excel file. Expected ticker cells like “VOO (USD)” in one of the top rows.");
    }

    // 2) data = every row after the ticker row
    const deposits = [];
    const transactions = [];
    for (let i = tickerIdx + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const depDate = toDateISO(r[0]);
      const depAmt = toNum(r[1]);
      if (depDate && isNum(depAmt) && depAmt !== 0) {
        deposits.push({ date: depDate, amount: depAmt, currency: "USD" });
      }
      for (const b of blocks) {
        const tDate = toDateISO(r[b.col]);
        const qty = toNum(r[b.col + 1]);
        if (!isNum(qty) || qty === 0) continue;
        if (!tDate && !depDate) continue; // unplaceable
        transactions.push({
          ticker: b.ticker,
          date: tDate || depDate,
          qty,
          price: isNum(r[b.col + 2]) ? r[b.col + 2] : null,
          fee: isNum(r[b.col + 3]) ? r[b.col + 3] : 0,
          currency: b.cur,
        });
      }
    }
    if (deposits.length === 0 && transactions.length === 0) {
      throw new Error("Found the layout but no data rows below it.");
    }
    return { deposits, transactions };
  }

  async function importFile(file) {
    guard();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    return parseWorkbook(wb);
  }

  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  function exportWorkbook(book) {
    guard();
    const s = (window.ST ? ST.summarize(book) : null);
    const wb = XLSX.utils.book_new();
    const today = new Date().toISOString().slice(0, 10);

    if (s) {
      const rows = [
        ["Stock Tracker — export", today],
        [],
        ["Deposits"],
        ["Currency", "Total", "Count"],
        ...s.deposits.map((d) => [d.currency, round6(d.total), d.count]),
        [],
        ["Positions"],
        ["Ticker", "Currency", "Net Qty", "Avg Cost", "Total Cost", "Fees", "Trades"],
        ...s.positions.map((p) => [
          p.ticker, p.currency, round6(p.qty),
          p.avg === null ? "" : round6(p.avg),
          round6(p.cost), round6(p.fee), p.trades,
        ]),
        [],
        ["Totals"],
        ["Currency", "Cost Basis", "Fees"],
        ...Object.keys(s.costByCurrency).map((c) => [c, round6(s.costByCurrency[c]), round6(s.feeByCurrency[c] || 0)]),
        [],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Summary");
    }

    const tx = (book.transactions || []).slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.ticker.localeCompare(b.ticker));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Ticker", "Date", "Qty", "Price", "Fee", "Currency", "Note"],
      ...tx.map((t) => [t.ticker, t.date, t.qty, t.price === null ? "" : t.price, t.fee, t.currency, t.note || ""]),
    ]), "Transactions");

    const dp = (book.deposits || []).slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Date", "Amount", "Currency", "Note"],
      ...dp.map((d) => [d.date, d.amount, d.currency, d.note || ""]),
    ]), "Deposits");

    XLSX.writeFile(wb, `stock-tracker-export-${today}.xlsx`);
  }

  window.xlsxio = { importFile, exportWorkbook, parseWorkbook };
})();
