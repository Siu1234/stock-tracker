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

  return { summarize, num };
});
