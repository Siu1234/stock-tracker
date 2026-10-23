/* ============================================================
   store.js — state + localStorage persistence.
   First launch seeds from window.SEED_DATA (snapshot of
   Investment.xlsx). Every change is saved synchronously.
   ============================================================ */
(function () {
  "use strict";
  const KEY = "stockTracker.v1";

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function seedCopy() {
    const s = window.SEED_DATA;
    return s ? JSON.parse(JSON.stringify(s)) : { deposits: [], transactions: [] };
  }

  function isValid(b) {
    return b && Array.isArray(b.deposits) && Array.isArray(b.transactions);
  }

  /** Make sure every record has a stable id (seed data comes without ids). */
  function ensureIds(b) {
    for (const d of b.deposits) if (!d.id) d.id = uid();
    for (const t of b.transactions) if (!t.id) t.id = uid();
    return b;
  }

  /** Normalize an imported/seeded record; returns clean object. */
  function cleanDeposit(d) {
    return {
      id: d.id || uid(),
      date: String(d.date || "").slice(0, 10),
      amount: Number(d.amount) || 0,
      currency: String(d.currency || "USD").toUpperCase(),
      note: d.note ? String(d.note) : "",
    };
  }
  function cleanTx(t) {
    const qty = Number(t.qty) || 0;
    return {
      id: t.id || uid(),
      ticker: String(t.ticker || "").toUpperCase().trim(),
      date: String(t.date || "").slice(0, 10),
      qty,
      price: t.price === null || t.price === undefined || t.price === "" ? null : Number(t.price),
      fee: Number(t.fee) || 0,
      currency: String(t.currency || "USD").toUpperCase(),
      note: t.note ? String(t.note) : "",
    };
  }

  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (isValid(p)) return ensureIds(p);
      }
    } catch (e) { /* corrupted -> fall through to seed */ }
    const s = ensureIds(seedCopy());
    persist(s);
    return s;
  }

  function persist(s) {
    if (!s) return; // never persist a missing state
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {
      console.warn("stock-tracker: failed to save", e);
    }
  }

  const api = {
    get state() { if (!state) state = load(); return state; },
    save() { persist(state); },

    addDeposit(rec) { const d = cleanDeposit(rec); d.id = uid(); this.state.deposits.push(d); this.save(); return d; },
    updateDeposit(id, patch) {
      const d = this.state.deposits.find((x) => x.id === id);
      if (d) { Object.assign(d, cleanDeposit({ ...d, ...patch })); this.save(); }
      return d;
    },
    removeDeposit(id) {
      const s = this.state;
      s.deposits = s.deposits.filter((x) => x.id !== id);
      this.save();
    },

    addTransaction(rec) { const t = cleanTx(rec); t.id = uid(); this.state.transactions.push(t); this.save(); return t; },
    updateTransaction(id, patch) {
      const t = this.state.transactions.find((x) => x.id === id);
      if (t) { Object.assign(t, cleanTx({ ...t, ...patch })); this.save(); }
      return t;
    },
    removeTransaction(id) {
      const s = this.state;
      s.transactions = s.transactions.filter((x) => x.id !== id);
      this.save();
    },

    /** Replace the whole book (used by import / reset / clear). */
    replaceData(book) {
      state = {
        deposits: (book.deposits || []).map(cleanDeposit),
        transactions: (book.transactions || []).map(cleanTx),
      };
      this.save();
      return state;
    },

    resetToSeed() { return this.replaceData(seedCopy()); },
    clearAll() { return this.replaceData({ deposits: [], transactions: [] }); },
  };

  window.store = api;
})();
