// Administration DEKA, browser logic: the flat model built from /api/overview (run: node --no-warnings tests/administration.client.test.mjs)
import assert from "assert";

const root = { innerHTML: "" };
globalThis.document = { getElementById: () => root, addEventListener() {}, querySelector: () => null, activeElement: null, createTreeWalker: () => ({ nextNode: () => null }), documentElement: {} };
root.querySelectorAll = () => [];
globalThis.window = { addEventListener() {} };
globalThis.localStorage = { _v: {}, getItem(k) { return this._v[k] || null; }, setItem(k, v) { this._v[k] = v; }, removeItem(k) { delete this._v[k]; } };
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), clone() { return this; } });

const { buildOverview, forDivision, summarize, divisionsInData, NO_DIVISION } = await import("../public/js/overview.js");
const results = [];
const test = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); } };

const TODAY = "2026-10-10";
const today = () => new Date().toISOString().slice(0, 10);
// Two databases that both use bill id "b1" for a different product: they must never be mixed up.
const POOLS = () => [
  { pool: "default", divisions: ["CRISTO AL", "CRISTO COMM", "CONFIDEKA", "DEKAV"], ok: true,
    containers: [
      { id: "c1", numewo: "AAAA1", billId: "b1", division: "CRISTO AL", dateEntered: "2026-10-01", dateVerified: "2026-10-02" },
      { id: "c2", numewo: "AAAA2", billId: "b1", division: "CRISTO AL", dateEntered: "2026-09-01", dateVerified: "2026-09-02", dateEmpty: "2026-09-10", dateLeft: "2026-09-12" },
      { id: "c3", numewo: "AAAA3", billId: "b2", division: "DEKAV", dateEntered: "2026-10-03", dateVerified: "2026-10-04", dateEmpty: "2026-10-05" },
    ],
    bills: [{ id: "b1", numewo: "B-RIZ", product: "Diri" }, { id: "b2", numewo: "B-LET", product: "Lèt" }],
    stock: [{ id: "s1", billId: "b1", entryDate: "2026-10-01", description: "Diri 50lb", quantity: "1000", unit: "sak" }],
    slips: [{ id: "f1", slipNumber: "1", division: "CRISTO AL", slipDate: TODAY, items: [{ billId: "b1", description: "Diri 50lb", unit: "sak", quantity: "400" }] }],
    goods: [{ id: "g1", kind: "avarye", billId: "b1", entryDate: "2026-10-02", description: "Diri 50lb", quantity: "10", unit: "sak" }],
    invoices: [] },
  { pool: "acs", divisions: ["ACS"], ok: true,
    containers: [{ id: "c1", numewo: "ZZZZ1", billId: "b1", division: "ACS", dateEntered: "2026-10-01", dateVerified: "2026-10-02" }],
    bills: [{ id: "b1", numewo: "B-ACS", product: "Pneu" }],
    stock: [{ id: "s1", billId: "b1", entryDate: "2026-10-01", description: "Pneu 15", quantity: "50", unit: "pyès" }],
    slips: [], goods: [], invoices: [] },
  { pool: "mikado", divisions: ["MIKADO"], ok: false, error: "not_configured", containers: [], bills: [], stock: [], slips: [], goods: [], invoices: [] },
];

await test("containers of every database are put together, each keeping its own bill, product and division", () => {
  const M = buildOverview(POOLS(), TODAY);
  assert.strictEqual(M.containers.length, 4);
  const z = M.containers.find((c) => c.numewo === "ZZZZ1");
  assert.strictEqual(z.billNumewo, "B-ACS", "same bill id in another database is not mixed up");
  assert.strictEqual(z.product, "Pneu");
  assert.strictEqual(M.containers.find((c) => c.numewo === "AAAA1").billNumewo, "B-RIZ");
  assert.deepStrictEqual(M.poolStatus.filter((p) => !p.ok).map((p) => p.pool), ["mikado"]);
});

await test("stock is worked out database by database: entered − delivered − damaged", () => {
  const M = buildOverview(POOLS(), TODAY);
  const riz = M.inventory.find((r) => r.description === "Diri 50lb");
  assert.strictEqual(riz.entered, 1000);
  assert.strictEqual(riz.delivered, 400);
  assert.strictEqual(riz.damaged, 10);
  assert.strictEqual(riz.current, 590);
  assert.strictEqual(riz.division, "CRISTO AL");
  const pneu = M.inventory.find((r) => r.description === "Pneu 15");
  assert.strictEqual(pneu.current, 50, "the ACS stock is not touched by the default database's slips");
  assert.strictEqual(pneu.division, "ACS", "a database with one division gives its division to its bills");
});

await test("division filter and summary numbers", () => {
  const M = buildOverview(POOLS(), TODAY);
  assert.strictEqual(forDivision(M.containers, "CRISTO AL").length, 2);
  assert.strictEqual(forDivision(M.containers, "").length, 4);
  const all = summarize(M, "", TODAY);
  assert.strictEqual(all.containers, 4);
  assert.strictEqual(all.vid, 1);
  assert.strictEqual(all.kite, 1);
  assert.strictEqual(all.slipsToday, 1);
  assert.strictEqual(all.inStock, 2);
  const cr = summarize(M, "CRISTO AL", TODAY);
  assert.strictEqual(cr.containers, 2);
  assert.strictEqual(cr.inStock, 1);
  assert.strictEqual(summarize(M, "DEKAV", TODAY).containers, 1);
});

await test("the division list always has the whole group, in the usual order", () => {
  const M = buildOverview(POOLS(), TODAY);
  const d = divisionsInData(M);
  ["CRISTO AL", "DEKAV", "ACS", "MIKADO"].forEach((x) => assert.ok(d.includes(x), x));
});

await test("containers with no division (archived, already left) count in the total and have their own filter", () => {
  const P = POOLS();
  P[0].containers.push({ id: "old1", numewo: "OLD1", billId: "b1", division: null, dateEntered: "2026-01-01", dateLeft: "2026-02-01" });
  P[0].containers.push({ id: "old2", numewo: "OLD2", billId: "b1", division: null, dateEntered: "2026-01-02", dateLeft: "2026-02-02" });
  const M = buildOverview(P, TODAY);
  assert.strictEqual(summarize(M, "", TODAY).containers, 6, "all containers are in the total");
  assert.strictEqual(summarize(M, "", TODAY).kite, 3);
  assert.strictEqual(forDivision(M.containers, NO_DIVISION).length, 2);
  assert.strictEqual(summarize(M, NO_DIVISION, TODAY).containers, 2);
  assert.strictEqual(M.poolStatus[0].noDivision, 2);
  assert.strictEqual(M.poolStatus[0].total, 5);
});

await test("same figures as the logistic administrator's Tableau de bord (568 / 3 / 0 / 1 / 10 / 17 / 538 / 7 / 15 / 206)", () => {
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const cs = []; let n = 0;
  const add = (count, fields) => { for (let i = 0; i < count; i++) { n++; cs.push(Object.assign({ id: "k" + n, numewo: "TST" + String(n).padStart(7, "0"), billId: "bl" + ((n % 221) + 1), size: "40", division: n % 3 ? "CRISTO AL" : null }, fields)); } };
  add(3, {});                                                                        // Disponib
  add(1, { dateEntered: day(2) });                                                   // Poko Verifye
  add(9, { dateEntered: day(2), dateVerified: day(1) });                             // Full (+ the one above = the Plein card, 10)
  add(10, { dateEntered: day(30), dateVerified: day(29), dateEmpty: day(1) });       // Vid
  add(7, { dateEntered: day(30), dateVerified: day(29), dateEmpty: day(12) });       // Vid for more than 5 days = Urgent
  add(538, { dateEntered: day(300), dateVerified: day(299), dateEmpty: day(200), dateLeft: day(100) }); // Kite (many from the Achiv)
  const bills = []; for (let i = 1; i <= 221; i++) bills.push({ id: "bl" + i, numewo: "BL" + i, product: "X" });
  const P = [{ pool: "default", divisions: ["CRISTO AL", "CRISTO COMM", "CONFIDEKA", "DEKAV"], ok: true, containers: cs, bills, stock: [], slips: [], goods: [], invoices: [] }];
  const M = buildOverview(P, today());
  const S = summarize(M, "pool:default", today());
  assert.strictEqual(S.containers, 568);
  assert.strictEqual(S.disponib, 3);
  assert.strictEqual(S.pran, 0);
  assert.strictEqual(S.pokoverifye, 1);
  assert.strictEqual(S.fullAll, 10);
  assert.strictEqual(S.vid, 17);
  assert.strictEqual(S.kite, 538);
  assert.strictEqual(S.urgent, 7);
  assert.strictEqual(summarize(M, "", today()).containers, 568, "with one database, Tout = that database");
});

await test("a database can be looked at on its own, exactly like the logistic administrator does", () => {
  const M = buildOverview(POOLS(), TODAY);
  assert.strictEqual(forDivision(M.containers, "pool:default").length, 3);
  assert.strictEqual(forDivision(M.containers, "pool:acs").length, 1);
  assert.strictEqual(summarize(M, "pool:acs", TODAY).containers, 1);
});

await test("an empty or missing answer gives an empty model, not an error", () => {
  const M = buildOverview([], TODAY);
  assert.strictEqual(M.containers.length, 0);
  assert.strictEqual(summarize(M, "", TODAY).containers, 0);
  assert.strictEqual(buildOverview(undefined, TODAY).bills.length, 0);
});

const failed = results.filter((r) => !r[0]);
results.forEach((r) => console.log((r[0] ? "  ok    " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n" + (r[2] && r[2].stack ? r[2].stack.split("\n").slice(0, 4).join("\n") : r[2]))));
console.log(failed.length ? failed.length + " FAILED" : results.length + "/" + results.length + " passed");
process.exit(failed.length ? 1 : 0);
