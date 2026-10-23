/* Realized P/L — average-cost method (public, fake data only).
   Covered sells  -> (sell price - avg cost up to that moment) * qty
   Uncovered sells -> counted at face proceeds (degenerate case)
   net = gross - ALL fees of the ticker */
const ST = require("../js/calc.js");

let failed = 0;
const assert = (cond, msg) => {
  if (cond) console.log("ok :", msg);
  else { console.error("FAIL:", msg); failed++; }
};
const near = (a, b) => Math.abs(a - b) < 0.005;

/* 1. full round trip: buy 4 @35.99 (fee 2.00), sell 4 @64.00 (fee 2.02)
      gross = 4 * (64.00 - 35.99) = 112.04 ; net = 112.04 - 4.02 = 108.02 */
const book1 = {
  deposits: [],
  transactions: [
    { ticker: "INTC", date: "2025-10-14", qty: 4, price: 35.99, fee: 2.00, currency: "USD" },
    { ticker: "INTC", date: "2026-04-13", qty: -4, price: 64.00, fee: 2.02, currency: "USD" },
  ],
};
const r1 = ST.realized(book1).byTicker.find((t) => t.ticker === "INTC");
assert(near(r1.gross, 112.04), "round trip: gross 112.04 (got " + r1.gross + ")");
assert(near(r1.fees, 4.02), "round trip: fees 4.02");
assert(near(r1.net, 108.02), "round trip: net 108.02 (got " + r1.net + ")");
assert(near(r1.soldQty, 4), "round trip: soldQty 4");
const c1 = ST.realized(book1).byCurrency.USD;
assert(near(c1.gross, 112.04) && near(c1.fees, 4.02) && near(c1.net, 108.02), "round trip: byCurrency USD totals");
assert(ST.realized(book1).sells.length === 1 && near(ST.realized(book1).sells[0].gross, 112.04), "round trip: one sell entry, gross 112.04");

/* 2. partial sells: avg stays 100 across both exits
      5 @ (110-100) = 50 ; 5 @ (104-100) = 20 -> gross 70, fees 2, net 68 */
const book2 = {
  deposits: [],
  transactions: [
    { ticker: "AAPL", date: "2026-01-05", qty: 10, price: 100, fee: 1.0, currency: "USD" },
    { ticker: "AAPL", date: "2026-02-05", qty: -5, price: 110, fee: 0.5, currency: "USD" },
    { ticker: "AAPL", date: "2026-03-05", qty: -5, price: 104, fee: 0.5, currency: "USD" },
  ],
};
const r2 = ST.realized(book2).byTicker.find((t) => t.ticker === "AAPL");
assert(near(r2.gross, 70), "partial sells: gross 70 (got " + r2.gross + ")");
assert(near(r2.fees, 2), "partial sells: fees 2.00");
assert(near(r2.net, 68), "partial sells: net 68 (got " + r2.net + ")");
const s2 = ST.realized(book2).sells;
assert(s2.length === 2 && near(s2[0].gross, 50) && near(s2[1].gross, 20), "partial sells: per-sell gross [50, 20]");
assert(near(r2.soldQty, 10), "partial sells: soldQty 10 across both exits");
assert(near(ST.summarize(book2).positions[0].qty, 0), "partial sells: all 10 shares exited");

/* 3. uncovered sell first (sold before buying): face proceeds counted
      -2 @50 (no coverage) then 3 @40 -> gross = 2*50 = 100 */
const book3 = {
  deposits: [],
  transactions: [
    { ticker: "XYZ", date: "2026-01-01", qty: -2, price: 50, fee: 0, currency: "USD" },
    { ticker: "XYZ", date: "2026-02-01", qty: 3, price: 40, fee: 0, currency: "USD" },
  ],
};
const r3 = ST.realized(book3).byTicker.find((t) => t.ticker === "XYZ");
assert(near(r3.gross, 100), "uncovered sell: face proceeds 100 (got " + r3.gross + ")");
assert(near(r3.net, 100), "uncovered sell: net 100 (no fees)");

/* 4. re-entry blend: avg after the second batch = (5*100 + 5*120)/10 = 110
      sell1: 5*(80-100) = -100 ; sell2: 5*(150-110) = +200 -> gross 100 */
const book4 = {
  deposits: [],
  transactions: [
    { ticker: "QQQ", date: "2026-01-10", qty: 5, price: 100, fee: 0, currency: "USD" },
    { ticker: "QQQ", date: "2026-02-10", qty: -5, price: 80, fee: 0, currency: "USD" },
    { ticker: "QQQ", date: "2026-03-10", qty: 5, price: 120, fee: 0, currency: "USD" },
    { ticker: "QQQ", date: "2026-04-10", qty: -5, price: 150, fee: 0, currency: "USD" },
  ],
};
const r4 = ST.realized(book4).byTicker.find((t) => t.ticker === "QQQ");
assert(near(r4.gross, 100), "re-entry: gross 100 = -100 + 200 (got " + r4.gross + ")");
const s4 = ST.realized(book4).sells;
assert(near(s4[0].gross, -100) && near(s4[1].gross, 200), "re-entry: per-sell gross [-100, +200]");

/* 5. non-USD ticker, fees included
      HKX: 200 @95, sell 200 @110, fees 36.41 + 20 -> gross 3000, net 2943.59 */
const book5 = {
  deposits: [],
  transactions: [
    { ticker: "HKX", date: "2025-11-01", qty: 200, price: 95, fee: 36.41, currency: "HKD" },
    { ticker: "HKX", date: "2026-03-15", qty: -200, price: 110, fee: 20.0, currency: "HKD" },
  ],
};
const r5 = ST.realized(book5).byTicker.find((t) => t.ticker === "HKX");
assert(near(r5.gross, 3000), "HKD: gross 3000 (got " + r5.gross + ")");
assert(near(r5.fees, 56.41), "HKD: fees 56.41");
assert(near(r5.net, 2943.59), "HKD: net 2943.59 (got " + r5.net + ")");
const c5 = ST.realized(book5).byCurrency;
assert(c5.HKD && near(c5.HKD.net, 2943.59), "HKD: byCurrency keyed by HKD");
assert(!c5.USD, "HKD: no USD entry");

/* 6. empty book: no crash, empty results */
const r6 = ST.realized({ deposits: [], transactions: [] });
assert(r6.byTicker.length === 0 && r6.sells.length === 0, "empty book: no tickers/sells");
assert(Object.keys(r6.byCurrency).length === 0, "empty book: no currency totals");

/* 7. monthlyDeposits: groups by YYYY-MM, sums per currency, sorted ascending */
const book7 = {
  deposits: [
    { date: "2026-01-05", amount: 250, currency: "HKD" },
    { date: "2025-08-10", amount: 1000, currency: "USD" },
    { date: "2025-08-20", amount: 500, currency: "USD" },
    { date: "not-a-date", amount: 9, currency: "USD" },
  ],
  transactions: [],
};
const m7 = ST.monthlyDeposits(book7);
assert(m7.length === 2, "monthlyDeposits: 2 months (got " + m7.length + ")");
assert(m7[0][0] === "2025-08", "monthlyDeposits: first month 2025-08");
assert(near(m7[0][1].USD, 1500), "monthlyDeposits: 2025-08 sums to 1500 USD");
assert(m7[1][0] === "2026-01" && near(m7[1][1].HKD, 250), "monthlyDeposits: 2026-01 has 250 HKD");
assert(m7[0][1].HKD == null && m7[1][1].USD == null, "monthlyDeposits: currencies don't leak across months");

if (failed === 0) console.log("\nREALIZED P/L TESTS PASSED");
else console.log(`\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
