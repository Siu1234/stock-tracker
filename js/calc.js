/* ============================================================
   calc.js — pure aggregation. No DOM. Works in node (for tests)
   and in the browser (window.ST).
   Numbers mirror the Excel workbook's own formulas:
     total qty   = SUM(qty)            (sells are negative)
     avg cost    = SUM(qty*price)/SUM(qty)   (blank price = 0, like Excel)
     fees        = SUM(fee)
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) { root.ST = Object.assign(root.ST || {}, api); }
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

  /** Aggregate the whole book.
   *  shape: { deposits:[{date,amount,currency,note?}],
   *           transactions:[{ticker,date,qty,price?,fee?,currency,note?}] } */
  function summarize(book) {
    const deposits = []; // per currency
    const addCur = (list, c) => {
      let e = list.find((x) => x.currency === c);
      if (!e) { e = { currency: c, total: 0, count: 0 }; list.push(e); }
      return e;
    };
    for (const d of book.deposits || []) {
      const e = addCur(deposits, d.currency || "USD");
      e.total += num(d.amount);
      e.count += 1;
    }

    // positions, first-appearance order (same order as the Excel columns)
    const order = new Map();
    for (const t of book.transactions || []) {
      const cur = t.currency || "USD";
      const key = t.ticker.toUpperCase() + "|" + cur;
      let p = order.get(key);
      if (!p) {
        p = {
          ticker: t.ticker.toUpperCase(), currency: cur,
          qty: 0, cost: 0, fee: 0, bought: 0, sold: 0, trades: 0,
        };
        order.set(key, p);
      }
      p.qty += num(t.qty);
      p.cost += num(t.qty) * num(t.price);
      p.fee += num(t.fee);
      if (num(t.qty) >= 0) p.bought += num(t.qty);
      else p.sold += Math.abs(num(t.qty));
      p.trades += 1;
    }
    const positions = [...order.values()].map((p) => ({
      ...p,
      net: Math.abs(p.qty) < 1e-9,
      avg: Math.abs(p.qty) > 1e-9 ? p.cost / p.qty : null,
    }));

    const costByCurrency = {};
    const feeByCurrency = {};
    for (const p of positions) {
      costByCurrency[p.currency] = (costByCurrency[p.currency] || 0) + p.cost;
      feeByCurrency[p.currency] = (feeByCurrency[p.currency] || 0) + p.fee;
    }

    return { deposits, positions, costByCurrency, feeByCurrency };
  }

  /** Realized P/L — average-cost method, one entry per currency.
   *  avg cost at a sell = (Σ buy qty×price before it) / (Σ buy qty before it)
   *  covered sells  → (sell price − that avg) × qty
   *  uncovered sells (sold before/without a buy) → counted at face proceeds
   *  net = gross − ALL fees of the ticker */
  function realized(book) {
    const order = new Map();
    const groups = new Map();
    for (const t of book.transactions || []) {
      const cur = t.currency || "USD";
      const key = t.ticker.toUpperCase() + "|" + cur;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.set(key, { ticker: t.ticker.toUpperCase(), currency: cur, gross: 0, fees: 0, net: 0, soldQty: 0 });
      }
      groups.get(key).push(t);
      order.get(key).fees += num(t.fee);
    }

    const sells = [];
    for (const [key, list] of groups) {
      const o = order.get(key);
      // date order, stable for same-date (original entry order)
      const seq = list
        .map((t, i) => [String(t.date || ""), i, t])
        .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
      let bought = 0;
      let basis = 0;
      for (const [, , t] of seq) {
        const q = num(t.qty);
        const p = num(t.price);
        if (q >= 0) {
          bought += q;
          basis += q * p;
        } else {
          const sell = Math.abs(q);
          const covered = Math.min(sell, bought);
          const uncovered = sell - covered;
          const avg = bought > 0 ? basis / bought : 0;
          const gross = covered * (p - avg) + uncovered * p;
          o.gross += gross;
          o.soldQty += sell;
          sells.push({ ticker: o.ticker, currency: o.currency, date: String(t.date || ""), qty: sell, gross });
        }
      }
      o.net = o.gross - o.fees;
    }

    const byCurrency = {};
    for (const o of order.values()) {
      const c = (byCurrency[o.currency] = byCurrency[o.currency] || { gross: 0, fees: 0, net: 0 });
      c.gross += o.gross;
      c.fees += o.fees;
      c.net += o.net;
    }
    return { byTicker: [...order.values()], sells, byCurrency };
  }

  // ---- monthly deposits for charts ----
  function monthlyDeposits(book) {
    const months = new Map(); // "YYYY-MM" -> {currency: amount}
    for (const d of book.deposits || []) {
      const m = String(d.date || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) continue; // skip empty / malformed dates
      const cur = d.currency || "USD";
      const e = months.get(m) || {};
      e[cur] = (e[cur] || 0) + num(d.amount);
      months.set(m, e);
    }
    return [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  return { summarize, realized, monthlyDeposits, num };
});
