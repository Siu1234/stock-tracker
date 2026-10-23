/* ============================================================
   ui.js — views, bottom sheets, events.
   Tabs: Home (portfolio) · Transactions · Deposits · Settings
   ============================================================ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  const money = (v, cur = "USD") => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(v);
    } catch (e) {
      return `${cur} ${v.toFixed(2)}`;
    }
  };
  const signQty = (v) => {
    const r = Math.round(v * 10000) / 10000;
    const s = Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 4 });
    return (r >= 0 ? "+" : "−") + s;
  };
  const qty = (v) => (Math.round(v * 10000) / 10000)
    .toLocaleString("en-US", { maximumFractionDigits: 4 });
  const dateLong = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  /* ---------------- icons ---------------- */
  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 4h14M7 10h14M7 16h14"/><circle cx="3.2" cy="4" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.2" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.2" cy="16" r="1.3" fill="currentColor" stroke="none"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="14" rx="2.5"/><path d="M17 12.5h4.5V9.5H5.5"/><path d="M2.5 9.5 8 6h12v3.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4L9.9 5.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.1 2.5h4l.1-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5A7 7 0 0 0 19 12Z"/></svg>',
    chev: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  };

  /* ---------------- screens ---------------- */
  let current = "portfolio";

  function depositKpis() {
    const s = ST.summarize(store.state);
    // hero: largest deposit currency first
    const hero = s.deposits.slice().sort((a, b) => b.total - a.total)[0];
    const others = s.deposits.filter((d) => d !== hero);
    let meta = `${s.deposits.reduce((n, d) => n + d.count, 0)} deposits`;
    return { s, hero, others, meta };
  }

  /* ---------------- charts ---------------- */
  const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#14b8a6", "#64748b", "#eab308"];
  const liveCharts = {};

  const centerTextPlugin = {
    id: "centerText",
    afterDraw(chart) {
      const cfg = chart.options && chart.options.plugins && chart.options.plugins.centerText;
      if (!cfg || !cfg.lines || !cfg.lines[0]) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data.length) return;
      const { x, y } = meta.data[0];
      const { ctx } = chart;
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "600 10px -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.textBaseline = "bottom";
      ctx.fillText(cfg.lines[0].label, x, y - 3);
      ctx.font = "700 15px -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.textBaseline = "top";
      ctx.fillText(cfg.lines[0].value, x, y + 5);
      ctx.restore();
    },
  };

  function destroyCharts() {
    for (const k of Object.keys(liveCharts)) {
      try { liveCharts[k].destroy(); } catch (e) { /* noop */ }
      delete liveCharts[k];
    }
  }

  function bootCharts(openByCur) {
    if (typeof Chart === "undefined") {
      chartCardsUnavailable();
      return;
    }
    destroyCharts();
    Chart.defaults.font.family = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    Chart.defaults.color = "#64748b";

    // allocation donuts, one per currency (open positions by cost)
    for (const [cur, list] of Object.entries(openByCur || {})) {
      const cv = document.getElementById("don-" + cur);
      if (!cv) continue;
      const total = list.reduce((n, p) => n + p.cost, 0);
      const ch = makeChart(cv, {
        type: "doughnut",
        data: {
          labels: list.map((p) => p.ticker),
          datasets: [{
            data: list.map((p) => Math.round(p.cost * 100) / 100),
            backgroundColor: list.map((_, i) => PALETTE[i % PALETTE.length]),
            borderColor: "#ffffff",
            borderWidth: 2,
            hoverOffset: 6,
          }],
        },
        options: {
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
            centerText: { lines: [{ label: "open cost", value: money(Math.round(total * 100) / 100, cur) }] },
            tooltip: {
              callbacks: {
                label: (c) => {
                  const pct = total > 0 ? " (" + ((c.parsed / total) * 100).toFixed(1) + "%)" : "";
                  return " " + c.label + ": " + money(c.parsed, cur) + pct;
                },
              },
            },
          },
        },
        plugins: [centerTextPlugin],
      });
      if (ch) liveCharts["don-" + cur] = ch;
    }

    // monthly deposits bar
    const bar = document.getElementById("dep-bar");
    if (bar) {
      const months = ST.monthlyDeposits(store.state);
      const labelOf = (ym) => {
        const d = new Date(ym + "-15T12:00:00");
        return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      };
      const curs = [];
      for (const [, e] of months) for (const c of Object.keys(e)) if (!curs.includes(c)) curs.push(c);
      const ch = makeChart(bar, {
        type: "bar",
        data: {
          labels: months.map(([ym]) => labelOf(ym)),
          datasets: curs.map((c, i) => ({
            label: c,
            data: months.map(([, e]) => Math.round((e[c] || 0) * 100) / 100),
            backgroundColor: PALETTE[i % PALETTE.length],
            borderRadius: 4,
            maxBarThickness: 34,
          })),
        },
        options: {
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: "#eef2f7" } },
          },
          plugins: {
            legend: { display: curs.length > 1, labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (c) => " " + c.dataset.label + ": " + money(c.parsed.y, c.dataset.label) } },
          },
        },
      });
      if (ch) liveCharts["dep-bar"] = ch;
    }
  }

  function chartCardsUnavailable() {
    document.querySelectorAll(".chart-card").forEach((c) => {
      c.innerHTML = '<div class="chart-note">Charts unavailable — the chart library didn\'t load. Reload the page when you\'re connected.</div>';
    });
  }

  // never let a canvas problem take the whole screen down
  function makeChart(cv, cfg) {
    try {
      return new Chart(cv, cfg);
    } catch (e) {
      const card = cv && cv.closest ? cv.closest(".chart-card") : null;
      if (card) chartCardsUnavailable();
      return null;
    }
  }

  function renderPortfolio() {
    const { s, hero, others, meta } = depositKpis();
    const otherLines = others.map((d) => `${d.currency} ${money(d.total, d.currency)}`).join(" · ");
    const R = ST.realized(store.state);

    let kpiRows = "";
    for (const d of s.deposits) {
      kpiRows += `<div class="kpi"><span class="k">Deposited</span><span class="v">${money(d.total, d.currency)} <span class="chip gray">${d.currency}</span></span></div>`;
    }
    let costRows = "";
    for (const [cur, v] of Object.entries(s.costByCurrency)) {
      costRows += `<div class="kpi"><span class="k">Cost basis</span><span class="v">${money(v, cur)}</span></div>`;
    }
    let feeRows = "";
    for (const [cur, v] of Object.entries(s.feeByCurrency)) {
      if (!v) continue;
      feeRows += `<div class="kpi"><span class="k">Fees paid</span><span class="v">${money(v, cur)}</span></div>`;
    }
    let realRows = "";
    for (const [cur, v] of Object.entries(R.byCurrency)) {
      if (v.gross === 0 && v.fees === 0) continue;
      const cls = v.net >= 0 ? "buy" : "sell";
      realRows += `<div class="kpi"><span class="k">Realized P/L (net of fees)</span><span class="v ${cls}">${v.net >= 0 ? "+" : "−"}${money(Math.abs(v.net), cur)}</span></div>`;
    }

    /* ---- charts (allocation donuts + monthly deposits) ---- */
    const openByCur = {};
    for (const p of s.positions) if (!p.net && p.cost > 0) (openByCur[p.currency] = openByCur[p.currency] || []).push(p);
    const hasOpen = Object.values(openByCur).length > 0;
    const hasDep = store.state.deposits.length > 0;
    let chartSection = "";
    if (hasOpen || hasDep) {
      let donuts = "";
      for (const [cur, list] of Object.entries(openByCur)) {
        const total = list.reduce((n, p) => n + p.cost, 0);
        donuts += `
          <div class="donut-cell">
            <h4>${esc(cur)} · open cost</h4>
            <div class="canvas-wrap sm"><canvas id="don-${esc(cur)}"></canvas></div>
            <div class="donut-total">${money(total, cur)}</div>
          </div>`;
      }
      chartSection = `
        <div class="section-title">Charts</div>
        ${hasOpen ? `<div class="chart-card"><div class="donut-row">${donuts}</div></div>` : ""}
        ${hasDep ? `<div class="chart-card"><div class="chart-label">Monthly deposits</div><div class="canvas-wrap"><canvas id="dep-bar"></canvas></div></div>` : ""}
      `;
    }

    const groups = {};
    for (const p of s.positions) (groups[p.currency] = groups[p.currency] || []).push(p);
    let groupsHtml = "";
    for (const [cur, list] of Object.entries(groups)) {
      groupsHtml += `<div class="section-title">${esc(cur)} positions</div>`;
      for (const p of list) {
        const stateChip = p.net ? '<span class="chip gray">closed</span>' : "";
        const detail = p.net
          ? `<span>bought ${qty(p.bought)} · sold ${qty(p.sold)}</span>`
          : `<span>avg ${money(p.avg, cur)}/unit</span>`;
        const costLine = p.net ? "" : `<span>cost ${money(p.cost, cur)}</span>`;
        const r = R.byTicker.find((x) => x.ticker === p.ticker && x.currency === cur);
        const realLine = r && r.soldQty > 0
          ? `<div class="row-bottom realized-line">
               <span>realized ${r.gross >= 0 ? "+" : "−"}${money(Math.abs(r.gross), cur)} · fees ${money(r.fees, cur)} → net
               <b class="${r.net >= 0 ? "buy" : "sell"}">${r.net >= 0 ? "+" : "−"}${money(Math.abs(r.net), cur)}</b></span>
             </div>`
          : "";
        groupsHtml += `
        <div class="card">
          <div class="row-top">
            <span class="ticker">${esc(p.ticker)}</span>
            <span>${qty(p.qty)} sh ${stateChip}</span>
          </div>
          <div class="row-bottom">
            ${detail} ${costLine} ${p.fee ? `<span>fees ${money(p.fee, cur)}</span>` : ""}
          </div>
          ${realLine}
        </div>`;
      }
    }

    $("#view").innerHTML = `
      <h1 class="screen-title">Portfolio</h1>
      <p class="screen-sub">Costs, fees & realized, per your records</p>

      <div class="hero">
        <div class="label">Total deposited</div>
        <div class="big">${hero ? money(hero.total, hero.currency) : "0"}</div>
        <div class="meta">${meta}${otherLines ? " · " + otherLines : ""}</div>
      </div>

      <div class="card" style="margin-bottom:0">
        ${kpiRows || `<div class="kpi"><span class="k">Deposits</span><span class="v muted">none yet</span></div>`}
        ${costRows}
        ${feeRows}
        ${realRows}
      </div>

      ${chartSection}

      ${groupsHtml || `<div class="empty" style="margin-top:14px"><span class="emoji">📊</span>No positions yet — add a transaction from the Transactions tab.</div>`}
    `;

    if (chartSection) bootCharts(openByCur);
  }

  function renderTransactions() {
    const txs = store.state.transactions.slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
    const R = ST.realized(store.state);

    let rows = "";
    for (const t of txs) {
      const side = t.qty >= 0 ? "buy" : "sell";
      const price = t.price === null || t.price === undefined ? "no price" : ` @ ${money(t.price, t.currency)}`;
      const sale = t.qty < 0
        ? R.sells.find((x) => x.ticker === String(t.ticker).toUpperCase() && x.currency === (t.currency || "USD")
          && x.date === String(t.date) && x.qty === Math.abs(t.qty))
        : null;
      const realChip = sale
        ? ` <span class="chip ${sale.gross >= 0 ? "green" : "red"}">${sale.gross >= 0 ? "+" : "−"}${money(Math.abs(sale.gross), t.currency)}</span>`
        : "";
      rows += `
      <div class="card row-link" data-action="edit-tx" data-id="${t.id}">
        <div class="row-top">
          <span><span class="ticker">${esc(t.ticker)}</span> <span class="chip gray">${esc(t.currency)}</span></span>
          <span class="muted">${dateLong(t.date)}</span>
        </div>
        <div class="row-bottom" style="margin-top:4px">
          <span class="${side}">${signQty(t.qty)} sh</span>
          <span>${price}${t.fee ? ` · fee ${money(t.fee, t.currency)}` : ""}${realChip}</span>
        </div>
      </div>`;
    }

    $("#view").innerHTML = `
      <h1 class="screen-title">Transactions</h1>
      <p class="screen-sub">${txs.length} trade${txs.length === 1 ? "" : "s"} · negative qty = sell · tap to edit</p>
      ${rows || `<div class="empty"><span class="emoji">✍️</span>No transactions yet.<br>Press + to record your first trade.</div>`}
      <button class="fab" data-action="add-tx" aria-label="Add transaction">+</button>
    `;
  }

  function renderDeposits() {
    const dps = store.state.deposits.slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
    const { s } = depositKpis();
    const total = s.deposits;

    let rows = "";
    for (const d of dps) {
      rows += `
      <div class="card row-link" data-action="edit-dep" data-id="${d.id}">
        <div class="row-top">
          <span class="muted">${dateLong(d.date)}</span>
          <span class="amount">${money(d.amount, d.currency)}</span>
        </div>
        ${d.note ? `<div class="row-bottom" style="margin-top:4px"><span class="muted">${esc(d.note)}</span></div>` : ""}
      </div>`;
    }

    const tot = total.map((t) => money(t.total, t.currency)).join(" + ");
    $("#view").innerHTML = `
      <h1 class="screen-title">Deposits</h1>
      <p class="screen-sub">${dps.length} deposits · total ${tot || "—"}</p>
      ${rows || `<div class="empty"><span class="emoji">🏦</span>No deposits recorded yet.<br>Press + when you fund your account.</div>`}
      <button class="fab" data-action="add-dep" aria-label="Add deposit">+</button>
    `;
  }

  function renderSettings() {
    const n = {
      d: store.state.deposits.length,
      t: store.state.transactions.length,
    };
    const hasSeed = !!(window.SEED_DATA && ((window.SEED_DATA.deposits && window.SEED_DATA.deposits.length) ||
      (window.SEED_DATA.transactions && window.SEED_DATA.transactions.length)));
    $("#view").innerHTML = `
      <h1 class="screen-title">Settings</h1>
      <p class="screen-sub">${n.d} deposits · ${n.t} transactions stored on this device</p>

      <div class="setting-group">
        <div class="group-label">Excel (Investment.xlsx)</div>
        <div class="setting" data-action="import-xlsx">
          <span class="s-label">Import from Excel<span class="s-desc">Replaces current data with the contents of an .xlsx file in your original layout</span></span>
          ${ICONS.chev}
        </div>
        <div class="setting" data-action="export-xlsx">
          <span class="s-label">Export to Excel<span class="s-desc">Downloads .xlsx with Summary, Transactions and Deposits sheets</span></span>
          ${ICONS.chev}
        </div>
      </div>

      <div class="setting-group">
        <div class="group-label">Backup</div>
        <div class="setting" data-action="export-json">
          <span class="s-label">Download backup (JSON)<span class="s-desc">Full data snapshot — keep it safe</span></span>
          ${ICONS.chev}
        </div>
        <div class="setting" data-action="import-json">
          <span class="s-label">Restore backup (JSON)<span class="s-desc">Restores a backup file from another device</span></span>
          ${ICONS.chev}
        </div>
      </div>

      <div class="setting-group">
        <div class="group-label">Danger zone</div>
        ${hasSeed ? `
        <div class="setting danger" data-action="reset-seed">
          <span class="s-label">Reset to original snapshot</span>${ICONS.chev}
        </div>` : ""}
        <div class="setting danger" data-action="clear-all">
          <span class="s-label">Erase all data</span>${ICONS.chev}
        </div>
      </div>

      <p class="screen-sub" style="margin-top:22px">
        Stock Tracker v1 · data stays in this browser (localStorage) ·
        no server, no accounts.
      </p>
    `;
  }

  const SCREENS = {
    portfolio: renderPortfolio,
    transactions: renderTransactions,
    deposits: renderDeposits,
    settings: renderSettings,
  };

  function show(name) {
    if (!SCREENS[name]) name = "portfolio";
    current = name;
    try { history.replaceState(null, "", "#" + name); } catch (e) {}
    SCREENS[name]();
    window.scrollTo(0, 0);
    document.querySelectorAll(".tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === name));
  }

  /* ---------------- bottom sheet ---------------- */
  let sheetWrap = null;

  function knownTickers() {
    const seen = new Set();
    for (const t of store.state.transactions) seen.add(String(t.ticker).toUpperCase());
    return [...seen];
  }
  const CURRENCIES = ["USD", "HKD", "EUR", "GBP", "JPY", "CNY"];

  function openTxSheet(rec) {
    const t = rec || {};
    const list = knownTickers().map((x) => `<option value="${esc(x)}">`).join("");
    openSheet(`
      <h3>${rec ? "Edit trade" : "New trade"}</h3>
      <p class="hint">Negative quantity = a sell. Price can stay blank.</p>
      <form id="tx-form" data-id="${rec ? esc(t.id) : ""}">
        <div class="field-row">
          <div class="field"><label>Ticker</label><input name="ticker" list="tickers" autocomplete="off" placeholder="VOO" value="${esc(t.ticker || "")}"></div>
          <div class="field"><label>Currency</label><select name="currency">${CURRENCIES.map((c) => `<option ${c === (t.currency || "USD") ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        </div>
        <datalist id="tickers">${list}</datalist>
        <div class="field-row">
          <div class="field"><label>Date</label><input type="date" name="date" value="${esc(t.date || "")}"></div>
          <div class="field"><label>Quantity ${"<span class='opt'>+ buy / − sell</span>"}</label><input type="number" name="qty" step="any" inputmode="decimal" placeholder="1.25" value="${t.qty ?? ""}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Price <span class="opt">(per unit)</span></label><input type="number" name="price" step="any" inputmode="decimal" placeholder="blank if n/a" value="${t.price ?? ""}"></div>
          <div class="field"><label>Fee</label><input type="number" name="fee" step="any" inputmode="decimal" placeholder="0" value="${t.fee === 0 ? "0" : (t.fee ?? "0")}"></div>
        </div>
        <div class="field"><label>Note <span class="opt">(optional)</span></label><input name="note" autocomplete="off" value="${esc(t.note || "")}"></div>
        <div class="sheet-actions">
          <button type="button" class="btn ghost" data-action="close-sheet">Cancel</button>
          <button type="submit" class="btn">Save</button>
        </div>
        ${rec ? `<div class="delete-line"><button type="button" data-action="delete-tx" data-id="${esc(t.id)}">Delete this trade</button></div>` : ""}
      </form>
    `);
  }

  function openDepSheet(rec) {
    const d = rec || {};
    openSheet(`
      <h3>${rec ? "Edit deposit" : "New deposit"}</h3>
      <p class="hint">Money you move into your brokerage account.</p>
      <form id="dep-form" data-id="${rec ? esc(d.id) : ""}">
        <div class="field-row">
          <div class="field"><label>Date</label><input type="date" name="date" value="${esc(d.date || "")}"></div>
          <div class="field"><label>Amount</label><input type="number" name="amount" step="any" inputmode="decimal" placeholder="10000" value="${d.amount ?? ""}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Currency</label><select name="currency">${CURRENCIES.map((c) => `<option ${c === (d.currency || "USD") ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>Note <span class="opt">(optional)</span></label><input name="note" autocomplete="off" value="${esc(d.note || "")}"></div>
        <div class="sheet-actions">
          <button type="button" class="btn ghost" data-action="close-sheet">Cancel</button>
          <button type="submit" class="btn">Save</button>
        </div>
        ${rec ? `<div class="delete-line"><button type="button" data-action="delete-dep" data-id="${esc(d.id)}">Delete this deposit</button></div>` : ""}
      </form>
    `);
  }

  function openSheet(innerHtml) {
    closeSheet(true);
    sheetWrap = document.createElement("div");
    sheetWrap.className = "sheet-wrap";
    sheetWrap.innerHTML = `<div class="sheet-overlay" data-action="close-sheet"></div>
      <div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${innerHtml}</div>`;
    document.body.appendChild(sheetWrap);
    requestAnimationFrame(() => sheetWrap && sheetWrap.classList.add("open"));
    const first = sheetWrap.querySelector("input, select");
    if (first) setTimeout(() => first && first.focus(), 280);
  }

  function closeSheet(instant) {
    if (!sheetWrap) return;
    const w = sheetWrap;
    sheetWrap = null;
    if (instant) { w.remove(); return; }
    w.classList.remove("open");
    setTimeout(() => w.remove(), 260);
  }

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------------- forms ---------------- */
  function validate(fields, spec) {
    let ok = true;
    for (const [name, fn] of Object.entries(spec)) {
      const el = fields.querySelector(`[name="${name}"]`);
      if (!el) continue;
      const bad = !fn(el.value.trim(), el);
      el.classList.toggle("invalid", bad);
      if (bad) ok = false;
    }
    return ok;
  }

  function onSubmit(ev) {
    const form = ev.target;
    if (form.id === "tx-form") {
      ev.preventDefault();
      const f = new FormData(form);
      const ok = validate(form, {
        ticker: (v) => v.length > 0,
        date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
        qty: (v) => v !== "" && isFinite(Number(v)) && Number(v) !== 0,
        price: (v) => v === "" || (isFinite(Number(v)) && Number(v) >= 0),
        fee: (v) => v === "" || (isFinite(Number(v)) && Number(v) >= 0),
      });
      if (!ok) { toast("Please check the highlighted fields"); return; }
      const rec = {
        ticker: f.get("ticker").trim().toUpperCase(),
        date: f.get("date"),
        qty: Number(f.get("qty")),
        price: f.get("price") === "" ? null : Number(f.get("price")),
        fee: f.get("fee") === "" ? 0 : Number(f.get("fee")),
        currency: f.get("currency"),
        note: (f.get("note") || "").trim(),
      };
      const id = form.dataset.id;
      if (id) { store.updateTransaction(id, rec); flash("Trade updated"); }
      else { store.addTransaction(rec); flash("Trade added"); }
    } else if (form.id === "dep-form") {
      ev.preventDefault();
      const f = new FormData(form);
      const ok = validate(form, {
        date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
        amount: (v) => v !== "" && isFinite(Number(v)) && Number(v) > 0,
      });
      if (!ok) { toast("Please check the highlighted fields"); return; }
      const rec = {
        date: f.get("date"),
        amount: Number(f.get("amount")),
        currency: f.get("currency"),
        note: (f.get("note") || "").trim(),
      };
      const id = form.dataset.id;
      if (id) { store.updateDeposit(id, rec); flash("Deposit updated"); }
      else { store.addDeposit(rec); flash("Deposit added"); }
    }
  }

  function flash(msg) {
    closeSheet();
    show(current);
    toast(msg);
  }

  /* ---------------- events ---------------- */
  async function onAction(ev) {
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    const id = el.dataset.id;

    switch (a) {
      case "close-sheet": closeSheet(); break;

      case "add-tx": openTxSheet(null); break;
      case "add-dep": openDepSheet(null); break;

      case "edit-tx": {
        const t = store.state.transactions.find((x) => x.id === id);
        if (t) openTxSheet(t);
        break;
      }
      case "edit-dep": {
        const d = store.state.deposits.find((x) => x.id === id);
        if (d) openDepSheet(d);
        break;
      }
      case "delete-tx":
        if (confirm("Delete this trade? This can't be undone.")) {
          store.removeTransaction(id); flash("Trade deleted");
        }
        break;
      case "delete-dep":
        if (confirm("Delete this deposit? This can't be undone.")) {
          store.removeDeposit(id); flash("Deposit deleted");
        }
        break;

      case "import-xlsx": $("#file-xlsx").click(); break;
      case "import-json": $("#file-json").click(); break;
      case "export-xlsx":
        try { await xlsxio.exportWorkbook(store.state); toast("Excel file downloaded"); }
        catch (e) { toast(e.message || "Export failed"); }
        break;
      case "export-json": {
        const date = new Date().toISOString().slice(0, 10);
        const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: "application/json" });
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = `stock-tracker-backup-${date}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 4000);
        toast("Backup downloaded");
        break;
      }
      case "reset-seed": {
        const ok = confirm("Reset everything to the original Investment.xlsx snapshot? Your current data will be replaced.");
        if (ok) { store.resetToSeed(); show(current); toast("Reset to original data"); }
        break;
      }
      case "clear-all": {
        if (confirm("Erase ALL data (deposits + transactions)?") &&
            confirm("Really sure? Download a JSON backup first unless you don't need this data anywhere.")) {
          store.clearAll(); show(current); toast("All data erased");
        }
        break;
      }
    }
  }

  /* ---------------- file inputs ---------------- */
  function onFileXlsx(ev) {
    const file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    xlsxio.importFile(file)
      .then((book) => {
        const cur = store.state;
        const warn = cur.deposits.length || cur.transactions.length;
        if (warn !== 0 && !confirm(
          `Replace current data (${cur.deposits.length} deposits, ${cur.transactions.length} trades)\nwith the file (${book.deposits.length} deposits, ${book.transactions.length} trades)?`)) {
          toast("Import cancelled");
          return;
        }
        store.replaceData(book);
        show(current);
        toast(`Imported ${book.deposits.length} deposits, ${book.transactions.length} trades`);
      })
      .catch((e) => toast(e.message || "Import failed"));
  }

  function onFileJson(ev) {
    const file = ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    file.text().then((text) => {
      let book;
      try { book = JSON.parse(text); } catch { throw new Error("Not a valid JSON backup file."); }
      if (!book || !Array.isArray(book.deposits) || !Array.isArray(book.transactions)) {
        throw new Error("This JSON file doesn't look like a Stock Tracker backup.");
      }
      const cur = store.state;
      if ((cur.deposits.length || cur.transactions.length) && !confirm(
        `Replace current data with this backup (${book.deposits.length} deposits, ${book.transactions.length} trades)?`)) {
        toast("Restore cancelled");
        return;
      }
      store.replaceData(book);
      show(current);
      toast("Backup restored");
    }).catch((e) => toast(e.message || "Restore failed"));
  }

  /* ---------------- init ---------------- */
  function init() {
    document.querySelectorAll(".tab").forEach((b) =>
      b.addEventListener("click", () => show(b.dataset.tab)));
    document.addEventListener("click", onAction);
    document.addEventListener("submit", onSubmit);
    $("#file-xlsx").addEventListener("change", onFileXlsx);
    $("#file-json").addEventListener("change", onFileJson);
    // close sheet on Escape
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

    let start = "portfolio";
    const h = (location.hash || "").replace("#", "");
    if (SCREENS[h]) start = h;
    show(start);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
