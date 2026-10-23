/* Headless UI smoke test (jsdom) — generic, ships in the public repo.
   Exercises every user flow WITHOUT asserting any real portfolio numbers:
   import (when a local workbook is present), portfolio render, add trade,
   edit, delete, deposit, erase.
   Real-number assertions live in test/real.data.test.cjs (git-ignored,
   runs automatically here because the xlsx sits on disk). */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const XLSX = require("xlsx");

const ROOT = path.resolve(__dirname, "..");
const XLSX_PATH = path.join(ROOT, "Investment.xlsx");
const haveBook = fs.existsSync(XLSX_PATH);

let failed = 0;
const assert = (cond, msg) => {
  if (cond) console.log("ok :", msg);
  else { console.error("FAIL:", msg); failed++; }
};

(async () => {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  html = html.replace(/<script src="https:\/\/[^"]+"><\/script>/, "");
  for (const f of ["js/seed.js", "js/calc.js", "js/store.js", "js/xlsx.js", "js/ui.js"]) {
    html = html.replace(new RegExp(`<script src="${f.replace("/", "\\/")}"></script>`),
      () => "<script>" + fs.readFileSync(path.join(ROOT, f), "utf8").replace(/<\/script>/g, "<\\/script>") + "</script>");
  }

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://stocks.example.app/index.html#portfolio",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  window.confirm = () => true;
  window.scrollTo = () => {};
  window.XLSX = XLSX; // so xlsxio's guard sees the library
  const toastMsg = () => document.querySelector("#toast").textContent;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const readState = () => {
    const raw = window.localStorage.getItem("stockTracker.v1");
    if (raw === null) throw new Error("localStorage is empty");
    const s = JSON.parse(raw); // throws loudly if someone stored "undefined" etc.
    if (!Array.isArray(s.deposits) || !Array.isArray(s.transactions)) throw new Error("bad state shape");
    return s;
  };
  const tab = (t) => { document.querySelector(`.tab[data-tab="${t}"]`).click(); return sleep(30); };
  const submit = (form) => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    return sleep(30);
  };
  const fillTx = (form, o) => {
    for (const [name, value] of Object.entries(o)) form.querySelector(`[name="${name}"]`).value = value;
  };

  await sleep(120); // let init + rAF run

  /* ---- 1. First run: public build ships empty ---- */
  readState(); // persisted valid JSON from first load
  assert(document.querySelector(".hero .big").textContent.trim() === "0", "hero empty on first run (no seeded data)");

  if (haveBook) {
    console.log("\n--- importing local workbook through the app's parser (counts only) ---");
    const wb = XLSX.read(new Uint8Array(fs.readFileSync(XLSX_PATH)), { type: "array" });
    const book = window.xlsxio.parseWorkbook(wb);
    assert(book.deposits.length > 0, "import: parsed deposits");
    assert(book.transactions.length > 0, "import: parsed transactions");
    window.store.replaceData(book);
    await tab("portfolio");
    const body = document.body.textContent;
    assert(/\$[0-9]/.test(document.querySelector(".hero .big").textContent), "hero shows a non-zero total");
    assert(typeof body === "string" && body.length > 0, "portfolio rendered");
    const nTx = readState().transactions.length;

    /* ---- 2. Add a trade via the sheet form (fake ticker) ---- */
    await tab("transactions");
    document.querySelector('.fab[data-action="add-tx"]').click();
    await sleep(30);
    const form = document.querySelector("#tx-form");
    assert(!!form, "trade sheet opened");
    fillTx(form, { ticker: "ZZZZ", date: "2026-10-21", qty: "10", price: "1.25", fee: "0.5" });
    await submit(form);
    let state = readState();
    assert(state.transactions.length === nTx + 1, "persisted: trade added");
    const zz = state.transactions.find((t) => t.ticker === "ZZZZ");
    assert(!!zz && zz.qty === 10 && zz.price === 1.25 && zz.fee === 0.5, "trade persisted correctly");
    assert(/Trade added/.test(toastMsg()), "toast 'Trade added'");

    /* ---- 3. Edit + delete it ---- */
    const zzRow = [...document.querySelectorAll('[data-action="edit-tx"]')].find((r) => r.textContent.includes("ZZZZ"));
    assert(!!zzRow, "new trade row rendered");
    zzRow.click();
    await sleep(30);
    const delBtn = document.querySelector('[data-action="delete-tx"][data-id]');
    assert(!!delBtn, "delete button in edit sheet");
    delBtn.click();
    await sleep(30);
    state = readState();
    assert(state.transactions.length === nTx, "persisted: back to original count after delete");

    /* ---- 4. Add a deposit ---- */
    await tab("deposits");
    const nDep = readState().deposits.length;
    document.querySelector('.fab[data-action="add-dep"]').click();
    await sleep(30);
    const dform = document.querySelector("#dep-form");
    dform.querySelector('[name="date"]').value = "2026-10-22";
    dform.querySelector('[name="amount"]').value = "1000";
    await submit(dform);
    state = readState();
    assert(state.deposits.length === nDep + 1, "persisted: deposit added");
  } else {
    console.log("\n--- workbook absent: exercising empty-book flows ---");
    await tab("transactions");
    assert(document.body.textContent.includes("No transactions yet"), "empty state shown");
    document.querySelector('.fab[data-action="add-tx"]').click();
    await sleep(30);
    const form = document.querySelector("#tx-form");
    fillTx(form, { ticker: "MSFT", date: "2026-10-21", qty: "3", price: "400", fee: "0.99" });
    await submit(form);
    let state = readState();
    assert(state.transactions.length === 1, "persisted: 1 trade after add");
    const row = document.querySelector('[data-action="edit-tx"]');
    assert(!!row && row.textContent.includes("MSFT"), "trade row rendered");
    row.click();
    await sleep(30);
    document.querySelector('[data-action="delete-tx"]').click();
    await sleep(30);
    state = readState();
    assert(state.transactions.length === 0, "persisted: empty after delete");
  }

  /* ---- 5. Settings: public build hides seed-reset, erase works ---- */
  await tab("settings");
  assert(document.querySelector('[data-action="reset-seed"]') === null, "reset-to-seed hidden (empty public seed)");
  assert(document.querySelector('[data-action="import-xlsx"]') !== null, "import action present");
  assert(document.querySelector('[data-action="export-xlsx"]') !== null, "export action present");
  assert(document.querySelector('[data-action="clear-all"]') !== null, "clear-all present");
  document.querySelector('[data-action="clear-all"]').click();
  await sleep(30);
  const finalState = readState();
  assert(finalState.deposits.length === 0 && finalState.transactions.length === 0, "clear-all persisted empty book");

  if (failed === 0) console.log("\nALL SMOKE TESTS PASSED");
  else console.log(`\n${failed} SMOKE TEST(S) FAILED`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e); process.exit(1); });
