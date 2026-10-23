/* Verify calc.js aggregation logic with a deterministic book. */
const ST = require("../js/calc.js");

const assert = (cond, msg) => {
  if (cond) console.log("ok:", msg);
  else { console.error("FAIL:", msg); process.exitCode = 1; }
};
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

const book = {
  deposits: [
    { date: "2025-01-01", amount: 2000, currency: "USD" },
    { date: "2025-02-01", amount: 3000, currency: "USD" },
    { date: "2025-03-01", amount: 1000, currency: "HKD" },
  ],
  transactions: [
    { ticker: "aapl", date: "2025-01-05", qty: 2, price: 100, fee: 1, currency: "USD" },
    { ticker: "AAPL", date: "2025-02-05", qty: 1, price: 103, fee: 1, currency: "USD" },
    { ticker: "TSLA", date: "2025-01-10", qty: 4, price: 50, fee: 0.5, currency: "USD" },
    { ticker: "TSLA", date: "2025-02-10", qty: -4, price: 60, fee: 0.75, currency: "USD" }, // sell-off
    { ticker: "NOPE", date: "2025-03-01", qty: 1, price: null, fee: 0, currency: "USD" },   // no price
    { ticker: "HKX", date: "2025-03-02", qty: 100, price: 10, fee: 5, currency: "HKD" },   // second currency
  ],
};

const out = ST.summarize(book);
const p = (t) => out.positions.find((x) => x.ticker === t);

/* deposits */
assert(close(out.deposits.find((d) => d.currency === "USD").total, 5000), "USD deposits total 5,000");
assert(out.deposits.find((d) => d.currency === "USD").count === 2, "USD deposit count 2");
assert(close(out.deposits.find((d) => d.currency === "HKD").total, 1000), "HKD deposits total 1,000");

/* AAPL: mixed-case tickers merge */
assert(p("AAPL") !== undefined, "AAPL position exists (case-insensitive merge)");
assert(close(p("AAPL").qty, 3), "AAPL qty 3");
assert(close(p("AAPL").cost, 303), "AAPL cost 303");
assert(close(p("AAPL").avg, 101), "AAPL avg 101");
assert(close(p("AAPL").fee, 2), "AAPL fees 2");

/* TSLA: fully sold = closed */
assert(p("TSLA").net === true, "TSLA is net-zero (closed)");
assert(p("TSLA").avg === null, "TSLA avg is null when closed");
assert(close(p("TSLA").bought, 4) && close(p("TSLA").sold, 4), "TSLA bought 4, sold 4");
assert(close(p("TSLA").cost, -40), "TSLA net cost -40 (sell proceeds offset buys)");
assert(close(p("TSLA").fee, 1.25), "TSLA fees 1.25");

/* NOPE: null price contributes 0 to cost (Excel-style) */
assert(close(p("NOPE").qty, 1) && close(p("NOPE").cost, 0), "null price => cost 0");
assert(close(p("NOPE").avg, 0), "null price => avg 0");

/* HKX: HKD stays separate */
assert(p("HKX").currency === "HKD" && close(p("HKX").cost, 1000), "HKX HKD cost 1,000");

/* currency rollups */
assert(close(out.costByCurrency.USD, 263), "USD cost basis 263 (303 - 40 + 0)");
assert(close(out.costByCurrency.HKD, 1000), "HKD cost basis 1,000");
assert(close(out.feeByCurrency.USD, 3.25), "USD fees 3.25");
assert(close(out.feeByCurrency.HKD, 5), "HKD fees 5");

/* order of positions = first appearance */
assert(out.positions.map((x) => x.ticker).join(",") === "AAPL,TSLA,NOPE,HKX", "position order preserved");

console.log(process.exitCode ? "CALC TESTS FAILED" : "ALL CALC TESTS PASSED");
