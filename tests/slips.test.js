"use strict";
// Delivery slips ("Fich Livrezon") and the expiry date of stock entries.
//   node tests/slips.test.js            (Redis)      TEST_BACKEND=pg node tests/slips.test.js   (SQL)
const assert = require("assert");
const H = require("./helpers");

const results = [];
async function test(name, fn) {
  try { H.reset(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); }
}
const PW = { admin: "Adm1n-Strong-Pass", depot: "Dep0t-Strong-Pass", daily: "Da1ly-Strong-Pass" };
const data = { bills: [{ id: "b1", numewo: "B-1", product: "Diri", completedAt: null }, { id: "b2", numewo: "B-2", product: "Sik", completedAt: null }], containers: [], notifications: [], inventoryChecks: {} };

async function login(user, role) {
  const b = H.browser();
  const r = await b.call(H.api("auth/login"), { method: "POST", body: { username: user, password: PW[role] } });
  assert.strictEqual(r.statusCode, 200, "login " + role + ": " + JSON.stringify(r.body));
  return b;
}
async function seed(admin) {
  const r = await admin.call(H.api("data"), { method: "POST", body: Object.assign({}, data, { rev: await H.rev() }) });
  assert.strictEqual(r.statusCode, 200, "seed: " + JSON.stringify(r.body));
}
const slipsApi = () => H.api("slips");
const line = (o) => Object.assign({ billId: "b1", description: "Diri 50lb", unit: "sak", quantity: "100" }, o || {});
const slip = (o) => Object.assign({ action: "create", clientId: "slipclient0001", slipNumber: "296001", division: "CRISTO AL", slipDate: "2026-10-05", clientName: "La Voma Louis", invoiceNumber: "120661C", items: [line()], storekeeper: "Robenson", driver: "Lucson", deliveredOn: "2026-10-05" }, o || {});

(async () => {
  const A = H.api("_lib/auth");
  process.env.AUTH_ADMIN_HASH = await A.hashPassword(PW.admin);
  process.env.AUTH_DEPOT_PASS = PW.depot;
  process.env.AUTH_DAILY_PASS = PW.daily;
  delete process.env.AUTH_SESSION_EPOCH;

  await test("slip: depot creates it, and it is listed with all its lines and signatures", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const depot = await login("depotnord", "depot");
    const r = await depot.call(slipsApi(), { method: "POST", body: slip({ items: [line(), line({ billId: "b2", description: "Sik", quantity: "5.5" })] }) });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.slip.slipNumber, "296001");
    const list = await depot.call(slipsApi(), { method: "GET" });
    assert.strictEqual(list.statusCode, 200);
    assert.strictEqual(list.body.slips.length, 1);
    const s = list.body.slips[0];
    assert.strictEqual(s.clientName, "La Voma Louis"); assert.strictEqual(s.division, "CRISTO AL"); assert.strictEqual(s.invoiceNumber, "120661C");
    assert.strictEqual(s.driver, "Lucson"); assert.strictEqual(s.storekeeper, "Robenson"); assert.strictEqual(s.deliveredOn, "2026-10-05");
    assert.deepStrictEqual(s.items.map((i) => [i.billId, i.description, i.unit, i.quantity]), [["b1", "Diri 50lb", "sak", "100"], ["b2", "Sik", "sak", "5.5"]]);
  });

  await test("slip: the same request sent twice creates one slip; another user cannot reuse the id", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const depot = await login("depotnord", "depot");
    const a = await depot.call(slipsApi(), { method: "POST", body: slip() });
    const b = await depot.call(slipsApi(), { method: "POST", body: slip() });
    assert.strictEqual(a.statusCode, 200); assert.strictEqual(b.statusCode, 200); assert.strictEqual(b.body.duplicate, true);
    const list = await depot.call(slipsApi(), { method: "GET" });
    assert.strictEqual(list.body.slips.length, 1);
    const c = await admin.call(slipsApi(), { method: "POST", body: slip() });
    assert.strictEqual(c.statusCode, 409, JSON.stringify(c.body));
  });

  await test("slip: rejects a missing client, no lines, bad quantity, unknown Bill, unknown company", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const depot = await login("depotnord", "depot");
    const bad = async (o, code) => { const r = await depot.call(slipsApi(), { method: "POST", body: slip(Object.assign({ clientId: undefined }, o)) }); assert.strictEqual(r.statusCode, code, JSON.stringify(o) + " -> " + JSON.stringify(r.body)); };
    await bad({ clientName: "  " }, 400);
    await bad({ items: [] }, 400);
    await bad({ items: [line({ quantity: "0" })] }, 400);
    await bad({ items: [line({ quantity: "-3" })] }, 400);
    await bad({ items: [line({ quantity: "abc" })] }, 400);
    await bad({ items: [line({ unit: "" })] }, 400);
    await bad({ items: [line({ description: "" })] }, 400);
    await bad({ items: [line({ billId: "nope" })] }, 404);
    await bad({ division: "NOT A COMPANY" }, 400);
    await bad({ items: [line({ billId: "nope" })], division: "ACS" }, 404);
    await bad({ items: Array.from({ length: 31 }, () => line()) }, 400);
    const list = await depot.call(slipsApi(), { method: "GET" });
    assert.strictEqual(list.body.slips.length, 0);
  });

  await test("slip: daily can read but not create; no login is refused", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const depot = await login("depotnord", "depot");
    const daily = await login("logisticdepot", "daily");
    await depot.call(slipsApi(), { method: "POST", body: slip() });
    const read = await daily.call(slipsApi(), { method: "GET" });
    assert.strictEqual(read.statusCode, 200); assert.strictEqual(read.body.slips.length, 1);
    const w = await daily.call(slipsApi(), { method: "POST", body: slip({ clientId: "otherclient001" }) });
    assert.strictEqual(w.statusCode, 403, JSON.stringify(w.body));
    const anon = await H.browser().call(slipsApi(), { method: "GET" });
    assert.strictEqual(anon.statusCode, 401);
  });

  await test("slip: newest date first; optional fields may be empty; delivery date defaults to the slip date", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const depot = await login("depotnord", "depot");
    await depot.call(slipsApi(), { method: "POST", body: slip({ clientId: "slipclient0001", slipDate: "2026-10-01" }) });
    const r = await depot.call(slipsApi(), { method: "POST", body: { action: "create", clientId: "slipclient0002", slipDate: "2026-10-07", clientName: "Kliyan B", items: [line()] } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.slip.deliveredOn, "2026-10-07"); assert.strictEqual(r.body.slip.division, null); assert.strictEqual(r.body.slip.slipNumber, null);
    const list = await depot.call(slipsApi(), { method: "GET" });
    assert.deepStrictEqual(list.body.slips.map((s) => s.slipDate), ["2026-10-07", "2026-10-01"]);
  });

  await test("stock entry: expiry date is saved and listed; empty is fine; a wrong date is refused", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const depot = await login("depotnord", "depot");
    const base = { action: "create", billId: "b1", description: "Diri", quantity: "10", unit: "sak" };
    const a = await depot.call(H.api("stock"), { method: "POST", body: Object.assign({ clientId: "stockexp00001", expiresOn: "2027-03-15" }, base) });
    assert.strictEqual(a.statusCode, 200, JSON.stringify(a.body)); assert.strictEqual(a.body.entry.expiresOn, "2027-03-15");
    const b = await depot.call(H.api("stock"), { method: "POST", body: Object.assign({ clientId: "stockexp00002" }, base) });
    assert.strictEqual(b.statusCode, 200); assert.strictEqual(b.body.entry.expiresOn, null);
    for (const bad of ["15/03/2027", "2027-13-01", "2027-02-31", "demain"]) {
      const r = await depot.call(H.api("stock"), { method: "POST", body: Object.assign({ clientId: "stockexp0000" + Math.floor(Math.random() * 90 + 10), expiresOn: bad }, base) });
      assert.strictEqual(r.statusCode, 400, bad + " -> " + JSON.stringify(r.body));
    }
    const list = await depot.call(H.api("stock"), { method: "GET" });
    assert.strictEqual(list.body.entries.length, 2);
    assert.deepStrictEqual(list.body.entries.map((e) => e.expiresOn).sort((x, y) => String(x).localeCompare(String(y))), ["2027-03-15", null]);
  });

  let fail = 0;
  results.forEach(function (r) { if (r[0]) console.log("  ok    " + r[1]); else { fail++; console.log("  FAIL  " + r[1] + "\n        " + (r[2] && r[2].stack || r[2])); } });
  console.log(results.length - fail + "/" + results.length + " passed");
  process.exit(fail ? 1 : 0);
})();
