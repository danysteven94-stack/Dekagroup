// Logistique Deka screen (browser logic): list, filters, one or several Bills in one payment, form, errors.
//   node --no-warnings tests/payments.client.test.mjs
import assert from "assert";

const root = { innerHTML: "" };
const els = {};
const listeners = {};
globalThis.document = {
  getElementById: (id) => (id === "root" ? root : (els[id] || null)),
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  querySelector: () => null, activeElement: null,
  createTreeWalker: () => ({ nextNode: () => null }), documentElement: {},
};
root.querySelectorAll = () => [];
globalThis.window = { addEventListener() {}, confirm: () => true, scrollTo() {} };
globalThis.localStorage = { _v: { "deka-log-lang": "ht" }, getItem(k) { return this._v[k] || null; }, setItem(k, v) { this._v[k] = v; }, removeItem(k) { delete this._v[k]; } };

// a tiny server: remembers the Logistique Deka bills and checks nothing (the real rules are tested in payments.test.js)
const server = { bills: [], calls: [], fail: null };
globalThis.fetch = async (url, opts) => {
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  server.calls.push({ url, method: (opts && opts.method) || "GET", body });
  const reply = (status, data) => ({ ok: status < 400, status, json: async () => data, clone() { return this; } });
  if (String(url).indexOf("/api/payments") === 0) {
    if (!body) return reply(200, { bills: server.bills });
    if (server.fail) return reply(400, { error: server.fail, code: "invalid" });
    if (body.action === "save") {
      const out = body.items.map((it) => {
        const old = server.bills.find((b) => b.id === it.billId) || { id: it.billId };
        return Object.assign({}, old, { amount: it.amount === undefined ? (old.amount === undefined ? null : old.amount) : Number(it.amount), currency: body.currency || "HTG",
          checkDate: body.checkDate || null, paidDate: body.paidDate || null, confirmedDate: body.confirmedDate || null, broker: body.broker || null, reference: body.reference || null, notes: null, batchId: null });
      });
      server.bills = out.concat(server.bills.filter((p) => !out.some((o) => o.id === p.id)));
      return reply(200, { ok: true, bills: out });
    }
    if (body.action === "clear") {
      server.bills = server.bills.map((p) => (p.id === body.billId ? Object.assign({}, p, { confirmedDate: null }) : p));
      return reply(200, { ok: true, bills: server.bills.filter((p) => p.id === body.billId) });
    }
    if (body.action === "create") {
      const rec = { id: "n" + (server.bills.length + 1), division: body.division, numewo: String(body.numewo).toUpperCase(), product: body.product || null, amount: body.amount ? Number(body.amount) : null, currency: body.currency || "HTG",
        checkDate: null, paidDate: null, confirmedDate: null, broker: null, reference: null, notes: null, batchId: null };
      server.bills = [rec].concat(server.bills);
      return reply(200, { ok: true, bills: [rec] });
    }
    if (body.action === "delete") {
      server.bills = server.bills.filter((p) => p.id !== body.billId);
      return reply(200, { ok: true, deleted: body.billId });
    }
  }
  return reply(404, {});
};

const { state } = await import("../public/js/state.js");
const { render } = await import("../public/js/render.js");
await import("../public/js/events-logistique.js");
const P = await import("../public/js/payments.js");

const results = [];
const test = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); } };
const tick = () => new Promise((r) => setTimeout(r, 5));
const today = new Date().toISOString().slice(0, 10);

function node(action, attrs) {
  const a = Object.assign({ "data-action": action }, attrs || {});
  return { getAttribute: (k) => (k in a ? a[k] : null), checked: !!(attrs && attrs.checked), closest() { return this; } };
}
const click = (action, attrs) => (listeners.click || []).forEach((fn) => fn({ target: node(action, attrs) }));
const type = (attrs, value) => (listeners.input || []).forEach((fn) => fn({ target: Object.assign({ value, id: attrs.id || "", getAttribute: (k) => (k in attrs ? attrs[k] : null) }, {}) }));
const change = (id, value) => (listeners.change || []).forEach((fn) => fn({ target: { id, value } }));
const submit = (id) => { let stopped = false; (listeners.submit || []).forEach((fn) => fn({ target: { id: id || "pay-form" }, preventDefault() { stopped = true; } })); return stopped; };
const html = () => { render(); return root.innerHTML; };

const BASE = [
  { id: "b1", division: "CRISTO S.A", numewo: "BILL-1", product: "Diri" }, { id: "b2", division: "CRISTO S.A", numewo: "BILL-2", product: "Sik" },
  { id: "b3", division: "ACS", numewo: "BILL-3", product: "Sel" }, { id: "b4", division: "ACS", numewo: "BILL-4", product: "Lwil" },
];
const pay = (billId, o) => Object.assign({ id: billId, amount: null, currency: "HTG", checkDate: null, paidDate: null, confirmedDate: null, broker: null, reference: null, notes: null, batchId: null }, BASE.find((b) => b.id === billId), o);
const setPay = (list) => { state.lgBills = BASE.map((b) => list.find((p) => p.id === b.id) || pay(b.id)); };

function reset() {
  Object.assign(state, { authChecking: false, authRole: "logistique", logistiqueUnlocked: true, unlocked: false, depotUnlocked: false, drUnlocked: false, needs: null, acct: false, help: false,
    loadingData: false, loadError: false, modal: null, confirmModal: null, toasts: [], tour: null, tourFor: "x", personal: true, divisions: [], username: "log.paul",
    paymentsLoaded: true, paymentsLoading: false, paymentsErr: "", paymentsBusy: false });
  state.pay = { tab: "bills", sel: {}, amounts: {}, form: null, newForm: null, filterDivision: "", filterStatus: "", search: "" };
  state.containers = []; state.bills = []; // Logistique Deka does not use the data of the other interfaces
  setPay([]);
  server.bills = []; server.calls = []; server.fail = null;
  for (const k of Object.keys(els)) delete els[k];
}

await test("the screen lists the Bills with their step; confirmed ones go last", () => {
  reset();
  setPay([pay("b1", { amount: 100, checkDate: "2026-10-01", paidDate: "2026-10-02", confirmedDate: "2026-10-03" }), pay("b2", { amount: 50, checkDate: "2026-10-01" })]);
  const h = html();
  assert.ok(h.includes("Logistique Deka") && h.includes("Pèman Bill yo"));
  for (const b of ["BILL-1", "BILL-2", "BILL-3", "BILL-4"]) assert.ok(h.includes(b), b);
  assert.ok(h.indexOf("BILL-2") < h.indexOf("BILL-1") && h.indexOf("BILL-4") < h.indexOf("BILL-1"), "confirmed Bill is at the end");
  assert.ok(h.includes("Chèk resevwa") && h.includes("Peman konfime") && h.includes("Pa peye"));
  assert.ok(h.includes("03/10/2026") && h.includes("Konfimasyon"), "typed dates are shown");
  assert.ok(h.includes("Poko mete"), "a Bill without amount says so");
});

await test("filters: division, step and search", () => {
  reset();
  setPay([pay("b1", { amount: 100, checkDate: "2026-10-01" })]);
  change("pay-filter-division", "ACS");
  let h = html();
  assert.ok(h.includes("BILL-3") && h.includes("BILL-4") && !h.includes("BILL-1") && !h.includes("BILL-2"));
  change("pay-filter-division", "");
  change("pay-filter-status", "chek");
  h = html();
  assert.ok(h.includes("BILL-1") && !h.includes("BILL-2"));
  change("pay-filter-status", "");
  type({ id: "pay-search" }, "lwil");
  h = html();
  assert.ok(h.includes("BILL-4") && !h.includes("BILL-1"));
  type({ id: "pay-search" }, "zzz");
  assert.ok(html().includes("Pa gen bill ki koresponn."));
});

await test("one Bill: open the form, type the amount and the dates, confirm -> only what was typed is sent", async () => {
  reset();
  click("pay-open", { "data-id": "b1" });
  let h = html();
  assert.ok(h.includes("Peman pou yon bill") && h.includes('data-payamt="b1"'));
  els["pay-total"] = { textContent: "" };
  type({ "data-payamt": "b1" }, "1250.5");
  assert.ok(/1.?250,50 HTG|1,250.50 HTG|1\s?250,50 HTG/.test(els["pay-total"].textContent), "total follows the amount: " + els["pay-total"].textContent);
  type({ "data-payf": "currency" }, "USD");
  assert.ok(els["pay-total"].textContent.endsWith("USD"));
  click("pay-today", { "data-field": "checkDate" });
  type({ "data-payf": "paidDate" }, "2026-10-02");
  type({ "data-payf": "broker" }, "Brokè Pierre");
  h = html();
  assert.ok(h.includes('value="1250.5"') && h.includes('value="Brokè Pierre"') && h.includes('value="2026-10-02"') && h.includes('value="' + today + '"'), "typed values survive a refresh of the page");
  assert.strictEqual(submit(), true);
  await tick(); await tick();
  const sent = server.calls.find((c) => c.method === "POST").body;
  assert.deepStrictEqual(sent.items, [{ billId: "b1", amount: "1250.5" }]);
  assert.strictEqual(sent.currency, "USD");
  assert.strictEqual(sent.checkDate, today);
  assert.strictEqual(sent.paidDate, "2026-10-02");
  assert.strictEqual(sent.broker, "Brokè Pierre");
  assert.ok(!("confirmedDate" in sent) && !("reference" in sent) && !("notes" in sent), "empty fields are not sent");
  assert.deepStrictEqual(state.pay.sel, {}, "selection closes after success");
  assert.strictEqual(state.pay.form, null);
  assert.strictEqual(state.lgBills.find((p) => p.id === "b1").amount, 1250.5);
  assert.ok(state.toasts.some((t) => t.message === "Peman an anrejistre."));
  h = html();
  assert.ok(h.includes("Peye") && !h.includes("Peman pou yon bill"));
});

await test("several Bills in ONE payment: each keeps its own amount, dates are shared", async () => {
  reset();
  click("pay-toggle", { "data-id": "b1", checked: true });
  click("pay-toggle", { "data-id": "b3", checked: true });
  let h = html();
  assert.ok(h.includes("Yon sèl peman pou 2 bill") && h.includes("2 chwazi"));
  assert.ok(h.includes('data-payamt="b1"') && h.includes('data-payamt="b3"'));
  type({ "data-payamt": "b1" }, "1000");
  type({ "data-payamt": "b3" }, "2500.25");
  type({ "data-payf": "checkDate" }, "2026-10-01");
  type({ "data-payf": "paidDate" }, "2026-10-02");
  type({ "data-payf": "confirmedDate" }, "2026-10-03");
  type({ "data-payf": "reference" }, "CHK-777");
  submit();
  await tick(); await tick();
  const sent = server.calls.find((c) => c.method === "POST").body;
  assert.deepStrictEqual(sent.items, [{ billId: "b1", amount: "1000" }, { billId: "b3", amount: "2500.25" }]);
  assert.strictEqual(sent.confirmedDate, "2026-10-03");
  assert.strictEqual(sent.reference, "CHK-777");
  assert.ok(state.toasts.some((t) => t.message === "Peman an anrejistre pou 2 bill."));
  assert.strictEqual(state.lgBills.filter((p) => p.confirmedDate).length, 2);
});

await test("select all (not yet confirmed) and unselect all", () => {
  reset();
  setPay([pay("b1", { amount: 5, checkDate: "2026-10-01", paidDate: "2026-10-02", confirmedDate: "2026-10-03" })]);
  click("pay-select-all");
  assert.deepStrictEqual(Object.keys(state.pay.sel).sort(), ["b2", "b3", "b4"], "a confirmed Bill is not selected");
  assert.ok(state.pay.form, "form is open");
  click("pay-select-none");
  assert.deepStrictEqual(state.pay.sel, {});
  assert.strictEqual(state.pay.form, null);
});

await test("an error from the server stays in the form and keeps what was typed", async () => {
  reset();
  server.fail = "Bill BILL-1: mete montan bill la anvan w konfime peman an.";
  click("pay-open", { "data-id": "b1" });
  type({ "data-payf": "confirmedDate" }, "2026-10-03");
  submit();
  await tick(); await tick();
  const h = html();
  assert.ok(h.includes("mete montan bill la anvan w konfime peman an."));
  assert.deepStrictEqual(Object.keys(state.pay.sel), ["b1"], "still selected");
  assert.ok(h.includes('value="2026-10-03"'));
  assert.strictEqual(state.paymentsBusy, false, "the button works again");
});

await test("editing a Bill that already has a payment starts from its values; undo asks first and calls the server", async () => {
  reset();
  setPay([pay("b2", { amount: 300, currency: "USD", checkDate: "2026-09-01", paidDate: "2026-09-02", confirmedDate: "2026-09-03", broker: "Jan", reference: "R-9" })]);
  server.bills = state.lgBills.slice();
  click("pay-open", { "data-id": "b2" });
  const f = state.pay.form;
  assert.strictEqual(f.currency, "USD");
  assert.strictEqual(f.confirmedDate, "2026-09-03");
  assert.strictEqual(f.broker, "Jan");
  assert.ok(html().includes('value="300"'));
  click("pay-cancel");
  click("pay-undo", { "data-id": "b2", "data-stage": "confirmed" });
  await tick(); await tick();
  assert.deepStrictEqual(server.calls.find((c) => c.method === "POST").body, { action: "clear", billId: "b2", stage: "confirmed" });
  assert.strictEqual(state.lgBills.find((p) => p.id === "b2").confirmedDate, null);
  // refusing the question changes nothing
  server.calls = [];
  const keep = globalThis.window.confirm;
  globalThis.window.confirm = () => false;
  click("pay-undo", { "data-id": "b2", "data-stage": "paid" });
  await tick();
  globalThis.window.confirm = keep;
  assert.strictEqual(server.calls.length, 0);
});

await test("summary by division: counts per step and the totals per currency; clicking a division opens its Bills", () => {
  reset();
  setPay([
    pay("b1", { amount: 100, currency: "USD", checkDate: "2026-10-01", paidDate: "2026-10-02", confirmedDate: "2026-10-03" }),
    pay("b2", { amount: 40, currency: "HTG", checkDate: "2026-10-01" }),
    pay("b3", { amount: 7, currency: "USD", checkDate: "2026-10-01", paidDate: "2026-10-02" }),
  ]);
  state.pay.tab = "summary";
  const h = html();
  assert.ok(h.includes("Rezime pa Divizyon"));
  assert.ok(h.includes("100,00 USD") || h.includes("100.00 USD"), "confirmed total of DEKAV");
  assert.ok(h.includes("40,00 HTG") || h.includes("40.00 HTG"), "open total of DEKAV");
  assert.ok(h.includes("7,00 USD") || h.includes("7.00 USD"), "open total of ACS");
  click("pay-view-division", { "data-division": "ACS" });
  assert.strictEqual(state.pay.tab, "bills");
  assert.strictEqual(state.pay.filterDivision, "ACS");
  const h2 = html();
  assert.ok(h2.includes("BILL-3") && !h2.includes("BILL-1"));
});

await test("payments load on first display, and a failed load shows a retry", async () => {
  reset();
  server.bills = [pay("b1", { amount: 9 })];
  state.paymentsLoaded = false;
  render();
  await tick(); await tick(); await tick();
  assert.strictEqual(state.paymentsLoaded, true);
  assert.strictEqual(state.lgBills.length, 1);
  const keep = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("boom"); };
  state.paymentsLoaded = false; state.paymentsErr = "";
  P.loadPayments();
  await tick(); await tick();
  globalThis.fetch = keep;
  assert.ok(html().includes("pay-retry"));
});

await test("Logistique Deka has its own bills: it never uses the containers/bills of the other interfaces, and shows every division", () => {
  reset();
  state.containers = [{ id: "9", numewo: "ZZZZ0000009", billId: "bx", size: "40", division: "MIKADO" }];
  state.bills = [{ id: "bx", numewo: "OTHER-BILL", product: "Pa pou li", completedAt: null }];
  let h = html();
  assert.ok(!h.includes("OTHER-BILL"), "a Bill of the other interfaces never shows here");
  state.pay.tab = "summary";
  h = html();
  for (const d of ["ACS", "ENERSOL", "ENERSOL", "CRISTO S.A", "ACS", "MIKADO", "LA COLLECTION", "MOBILITY"]) assert.ok(h.includes(d), d + " is listed");
  setPay([]); state.lgBills = [];
  state.pay.tab = "bills";
  assert.ok(html().includes("Nouvo bill") && html().includes("Poko gen bill."), "empty state invites to add a bill");
});

await test("new bill: the form asks division + number, sends them, and the bill appears; delete asks first", async () => {
  reset();
  click("pay-new-open");
  let h = html();
  assert.ok(h.includes('id="pay-new-form"') && h.includes("Divizyon *") && h.includes("Nimewo bill *"));
  for (const d of ["ACS", "ACS", "MIKADO", "MOBILITY"]) assert.ok(h.includes('<option value="' + d + '"'), d + " can be chosen");
  submit("pay-new-form");
  await tick();
  assert.strictEqual(server.calls.length, 0, "nothing is sent without division and number");
  assert.ok(html().includes("Chwazi yon divizyon valid."));
  (listeners.change || []).forEach((fn) => fn({ target: { id: "", value: "MIKADO", getAttribute: (k) => (k === "data-newf" ? "division" : null) } }));
  type({ "data-newf": "numewo" }, "lmm-77");
  type({ "data-newf": "product" }, "Pneu");
  type({ "data-newf": "amount" }, "420.5");
  submit("pay-new-form");
  await tick(); await tick();
  const sent = server.calls.find((c) => c.method === "POST").body;
  assert.deepStrictEqual(sent, { action: "create", division: "MIKADO", numewo: "lmm-77", product: "Pneu", amount: "420.5", currency: "HTG" });
  assert.strictEqual(state.pay.newForm, null, "form closes");
  assert.ok(state.lgBills.some((b) => b.numewo === "LMM-77" && b.division === "MIKADO"));
  assert.ok(html().includes("LMM-77") && html().includes("MIKADO"));
  // delete: refusing the question changes nothing, accepting removes the bill
  server.calls = [];
  const keep = globalThis.window.confirm;
  globalThis.window.confirm = () => false;
  click("pay-delete", { "data-id": "n1" });
  await tick();
  assert.strictEqual(server.calls.length, 0);
  globalThis.window.confirm = () => true;
  click("pay-delete", { "data-id": "n1" });
  await tick(); await tick();
  globalThis.window.confirm = keep;
  assert.deepStrictEqual(server.calls.find((c) => c.method === "POST").body, { action: "delete", billId: "n1" });
  assert.ok(!state.lgBills.some((b) => b.id === "n1"));
});

await test("an error creating a bill (duplicate) stays in the form", async () => {
  reset();
  server.fail = "Bill sa a deja egziste nan divizyon sa a.";
  click("pay-new-open");
  state.pay.newForm.division = "ACS"; state.pay.newForm.numewo = "BILL-3";
  submit("pay-new-form");
  await tick(); await tick();
  assert.ok(html().includes("Bill sa a deja egziste nan divizyon sa a."));
  assert.ok(state.pay.newForm && state.pay.newForm.numewo === "BILL-3", "what was typed is kept");
  assert.strictEqual(state.paymentsBusy, false);
});

await test("PDF of the bills: a real PDF with the bill numbers, the three dates, the step and the totals; follows the filters", async () => {
  reset();
  const L = await import("../public/js/lgpdf.js");
  setPay([pay("b1", { amount: 1500.5, checkDate: "2026-10-01", paidDate: "2026-10-02", confirmedDate: "2026-10-03" }), pay("b2", { amount: 200, currency: "USD", checkDate: "2026-09-01" })]);
  const text = (u8) => Array.from(u8).map((c) => String.fromCharCode(c)).join("");
  let pdf = text(L.buildLgBillsPdf());
  assert.ok(pdf.startsWith("%PDF-1.4") && pdf.includes("%%EOF"), "it is a PDF");
  assert.ok(pdf.includes("BILL-1") && pdf.includes("BILL-2") && pdf.includes("03/10/2026"), "bills and dates");
  assert.ok(pdf.includes("1 500,50 HTG") && pdf.includes("Paiement confirm"), "amount and step");
  assert.ok(pdf.includes("200,00 USD"), "totals line");
  change("pay-filter-division", "ACS");
  pdf = text(L.buildLgBillsPdf());
  assert.ok(!pdf.includes("BILL-1"), "the filters of the screen apply");
});

let bad = 0;
results.forEach(([ok, name, e]) => { console.log((ok ? "  PASS  " : "  FAIL  ") + name); if (!ok) { bad++; console.log("        " + (e && e.stack || e)); } });
console.log("\n" + (results.length - bad) + "/" + results.length + " passed");
process.exit(bad ? 1 : 0);
