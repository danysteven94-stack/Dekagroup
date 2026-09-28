"use strict";
// Server side of offline work: a request kept on a device and sent again (network dropped after the save) must never create
// a second record. Run with:  node tests/offline.server.test.js   (or TEST_BACKEND=pg node tests/offline.server.test.js)
const assert = require("assert");
const H = require("./helpers");

const results = [];
async function test(name, fn) {
  try { H.reset(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); }
}
const PW = { admin: "Adm1n-Strong-Pass", depot: "Dep0t-Strong-Pass", daily: "Da1ly-Strong-Pass" };
const bills = { bills: [{ id: "b1", numewo: "B-1", product: "Diri", completedAt: null }], containers: [], notifications: [], inventoryChecks: {} };

async function login(user, role) {
  const b = H.browser();
  const r = await b.call(H.api("auth/login"), { method: "POST", body: { username: user, password: PW[role] } });
  assert.strictEqual(r.statusCode, 200, "login " + role + ": " + JSON.stringify(r.body));
  return b;
}
async function seed(admin) {
  const r = await admin.call(H.api("data"), { method: "POST", body: Object.assign({}, bills, { rev: await H.rev() }) });
  assert.strictEqual(r.statusCode, 200, "seed: " + JSON.stringify(r.body));
}

(async () => {
  const A = H.api("_lib/auth");
  process.env.AUTH_ADMIN_HASH = await A.hashPassword(PW.admin);
  process.env.AUTH_DEPOT_PASS = PW.depot;
  process.env.AUTH_DAILY_PASS = PW.daily;
  delete process.env.AUTH_SESSION_EPOCH;

  const stock = { action: "create", clientId: "abcdef123456", billId: "b1", description: "Diri", quantity: "10", unit: "sak" };
  const goods = { action: "create", clientId: "goods12345678", kind: "avarye", billId: "b1", description: "Sik", quantity: "2", unit: "sak", reason: "mouye" };
  const invoice = { action: "create", clientId: "inv123456789", billId: "b1", clientName: "Kliyan A", items: [{ description: "Diri", qty: 2, unitPrice: 5 }] };

  await test("stock: the same request sent twice creates one record", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const a = await admin.call(H.api("stock"), { method: "POST", body: stock });
    const b = await admin.call(H.api("stock"), { method: "POST", body: stock });
    assert.strictEqual(a.statusCode, 200, JSON.stringify(a.body));
    assert.strictEqual(b.statusCode, 200, JSON.stringify(b.body));
    assert.strictEqual(a.body.entry.id, "abcdef123456");
    assert.strictEqual(b.body.entry.id, "abcdef123456");
    assert.strictEqual(b.body.duplicate, true);
    const list = await admin.call(H.api("stock"), { method: "GET" });
    assert.strictEqual(list.body.entries.length, 1);
  });

  await test("goods: the same request sent twice creates one record", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    await admin.call(H.api("goods"), { method: "POST", body: goods });
    const b = await admin.call(H.api("goods"), { method: "POST", body: goods });
    assert.strictEqual(b.statusCode, 200, JSON.stringify(b.body));
    assert.strictEqual(b.body.duplicate, true);
    const list = await admin.call(H.api("goods"), { method: "GET" });
    assert.strictEqual(list.body.incidents.length, 1);
  });

  await test("invoices: the same request sent twice creates one record", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    await admin.call(H.api("invoices"), { method: "POST", body: invoice });
    const b = await admin.call(H.api("invoices"), { method: "POST", body: invoice });
    assert.strictEqual(b.statusCode, 200, JSON.stringify(b.body));
    assert.strictEqual(b.body.duplicate, true);
    const list = await admin.call(H.api("invoices"), { method: "GET" });
    assert.strictEqual(list.body.invoices.length, 1);
  });

  await test("another person cannot take over an id already used", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const depot = await login("depotnord", "depot");
    await admin.call(H.api("stock"), { method: "POST", body: stock });
    const r = await depot.call(H.api("stock"), { method: "POST", body: stock });
    assert.strictEqual(r.statusCode, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.code, "id_taken");
  });

  await test("without a client id the server still creates a new record each time", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const plain = Object.assign({}, stock); delete plain.clientId;
    await admin.call(H.api("stock"), { method: "POST", body: plain });
    await admin.call(H.api("stock"), { method: "POST", body: plain });
    const list = await admin.call(H.api("stock"), { method: "GET" });
    assert.strictEqual(list.body.entries.length, 2);
  });

  await test("a bad client id is ignored (the server picks its own)", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const r = await admin.call(H.api("stock"), { method: "POST", body: Object.assign({}, stock, { clientId: "x'; DROP--" }) });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.notStrictEqual(r.body.entry.id, "x'; DROP--");
  });

  await test("leave: the same request sent twice does not error, and only affects a Vid container", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const daily = await login("logisticdepot", "daily");
    // not empty yet: refused
    const r0 = await daily.call(H.api("leave"), { method: "POST", body: { id: "c1" } });
    // seed() below adds a plain container fixture; make sure one exists and is Vid first
    const bill = { id: "b1", numewo: "B-1", product: "Diri", completedAt: null };
    const vid = { id: "cvid", numewo: "MSKU1", billId: "b1", dateEntered: "2026-01-01", dateVerified: "2026-01-01", dateEmpty: "2026-01-02", dateLeft: null };
    await admin.call(H.api("data"), { method: "POST", body: { bills: [bill], containers: [vid], notifications: [], inventoryChecks: {}, rev: await H.rev() } });
    const a = await daily.call(H.api("leave"), { method: "POST", body: { id: "cvid" } });
    assert.strictEqual(a.statusCode, 200, JSON.stringify(a.body));
    assert.strictEqual(a.body.container.dateLeft, await (async () => { const d = require("./helpers").api("_lib/store"); return d.today(); })());
    const b = await daily.call(H.api("leave"), { method: "POST", body: { id: "cvid" } });
    assert.strictEqual(b.statusCode, 200, JSON.stringify(b.body));
    assert.strictEqual(b.body.already, true);
  });

  await test("leave: refused on a container that is not Vid, and for roles other than daily/admin", async () => {
    const admin = await login("logistic", "admin"); await seed(admin);
    const daily = await login("logisticdepot", "daily");
    const depot = await login("depotnord", "depot");
    const full = { id: "b1", numewo: "B-1", product: "Diri", completedAt: null };
    const c = { id: "cfull", numewo: "MSKU2", billId: "b1", dateEntered: "2026-01-01", dateVerified: "2026-01-01", dateEmpty: null, dateLeft: null };
    await admin.call(H.api("data"), { method: "POST", body: { bills: [full], containers: [c], notifications: [], inventoryChecks: {}, rev: await H.rev() } });
    const r1 = await daily.call(H.api("leave"), { method: "POST", body: { id: "cfull" } });
    assert.strictEqual(r1.statusCode, 409, JSON.stringify(r1.body));
    assert.strictEqual(r1.body.code, "wrong_status");
    const r2 = await depot.call(H.api("leave"), { method: "POST", body: { id: "cfull" } });
    assert.strictEqual(r2.statusCode, 403, JSON.stringify(r2.body));
  });

  let fail = 0;
  results.forEach(function (r) { if (r[0]) console.log("  ok    " + r[1]); else { fail++; console.log("  FAIL  " + r[1] + "\n        " + (r[2] && r[2].stack || r[2])); } });
  console.log(results.length - fail + "/" + results.length + " passed");
  process.exit(fail ? 1 : 0);
})();
