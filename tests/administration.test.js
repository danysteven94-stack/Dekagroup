"use strict";
// Administration DEKA: a read-only window on every division (containers, products, stock, slips, goods, invoices).
//   node tests/administration.test.js            (Redis)      TEST_BACKEND=pg node tests/administration.test.js   (SQL)
const assert = require("assert");
const H = require("./helpers");

const results = [];
async function test(name, fn) {
  try { H.reset(); H.env(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); }
}
const LEGACY = { admin: "Adm1n-Strong-Pass" };
H.env = () => {
  process.env.AUTH_ADMIN_PASS = LEGACY.admin;
  process.env.APP_SECRET = "unit-test-app-secret-0123456789abcdef";
  delete process.env.AUTH_DEPOT_PASS; delete process.env.AUTH_DAILY_PASS; delete process.env.AUTH_CHOFE_PASS;
  delete process.env.AUTH_LEGACY_DISABLED; delete process.env.AUTH_SESSION_EPOCH; delete process.env.PRINCIPAL_USERNAME;
};
const A = () => ({ login: H.api("auth/login"), password: H.api("auth/password"), users: H.api("users"), data: H.api("data"), overview: H.api("overview"), stock: H.api("stock"), slips: H.api("slips"), goods: H.api("goods"), invoices: H.api("invoices"), pay: H.api("payments") });
const post = (b, h, body) => b.call(h, { method: "POST", body });

async function legacyAdmin() {
  const b = H.browser();
  const r = await post(b, A().login, { username: "logistic", password: LEGACY.admin });
  assert.strictEqual(r.statusCode, 200);
  return b;
}
async function onboard(admin, body, ip) {
  const created = await post(admin, A().users, Object.assign({ action: "create" }, body));
  assert.strictEqual(created.statusCode, 200, JSON.stringify(created.body));
  const b = H.browser(ip);
  let r = await post(b, A().login, { username: body.username, password: created.body.tempPassword });
  assert.strictEqual(r.statusCode, 200);
  r = await post(b, A().password, { current: created.body.tempPassword, next: "Administration-Strong-Pass-9" });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return b;
}
const seed = () => H.setData({
  containers: [
    { id: "c1", numewo: "AAAA0000001", billId: "b1", size: "40", division: "CRISTO AL", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "D", trucking: "CFC", dateEmpty: null, dateLeft: null, dateExpected: null },
    { id: "c2", numewo: "AAAA0000002", billId: "b1", size: "20", division: "CRISTO AL", dateEntered: "2026-08-01", dateVerified: "2026-08-02", depo: "D", trucking: "CTSA", dateEmpty: "2026-08-10", dateLeft: "2026-08-12", dateExpected: null },
  ],
  bills: [{ id: "b1", numewo: "B-1", product: "Diri", completedAt: null }],
  notifications: [], inventoryChecks: {},
});

(async () => {
  await test("only the administration role reads /api/overview; it reads the data of every interface", async () => {
    const admin = await legacyAdmin();
    await seed();
    assert.strictEqual((await H.browser().call(A().overview)).statusCode, 401, "anonymous visitors are refused");
    assert.strictEqual((await admin.call(A().overview)).statusCode, 403, "the logistic administrator uses his own interface");
    await onboard(admin, { username: "depo.marie", role: "depot", name: "Marie", divisions: ["CRISTO AL"] }, "198.51.100.60");
    const depo = H.browser("198.51.100.60");
    await post(depo, A().login, { username: "depo.marie", password: "Administration-Strong-Pass-9" });
    assert.strictEqual((await depo.call(A().overview)).statusCode, 403, "a depot account is refused");
    const ad = await onboard(admin, { username: "adm.paul", role: "administration", name: "Paul Administration" }, "198.51.100.61");
    const r = await ad.call(A().overview);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const def = r.body.pools.find((p) => p.pool === "default");
    assert.ok(def && def.ok, "the shared database is read");
    assert.deepStrictEqual(def.containers.map((c) => c.id).sort(), ["c1", "c2"]);
    assert.deepStrictEqual(def.bills.map((b) => b.id), ["b1"]);
    assert.deepStrictEqual(def.divisions, ["CRISTO AL", "CRISTO COMM", "CONFIDEKA", "DEKAV"]);
    assert.strictEqual(r.body.pools.length, 6, "one entry per database (shared + five divisions)");
  });

  await test("stock entries, delivery slips, goods and invoices of the depot appear in the overview", async () => {
    const admin = await legacyAdmin();
    await seed();
    const ent = await post(admin, A().stock, { action: "create", clientId: "stockadm00001", billId: "b1", entryDate: "2026-09-03", description: "Diri 50lb", quantity: "1000", unit: "sak", expiresOn: "2027-01-01" });
    assert.strictEqual(ent.statusCode, 200, JSON.stringify(ent.body));
    const sl = await post(admin, A().slips, { action: "create", clientId: "slipadm000001", slipNumber: "296001", division: "CRISTO AL", slipDate: "2026-10-05", clientName: "La Voma Louis", invoiceNumber: "120661C", items: [{ billId: "b1", description: "Diri 50lb", unit: "sak", quantity: "400" }], storekeeper: "Robenson", driver: "Lucson", deliveredOn: "2026-10-05" });
    assert.strictEqual(sl.statusCode, 200, JSON.stringify(sl.body));
    const gd = await post(admin, A().goods, { action: "create", kind: "avarye", billId: "b1", entryDate: "2026-10-06", description: "Diri 50lb", quantity: "10", unit: "sak", reason: "Mouye" });
    assert.strictEqual(gd.statusCode, 200, JSON.stringify(gd.body));
    const ad = await onboard(admin, { username: "adm.paul", role: "administration", name: "Paul" }, "198.51.100.62");
    const def = (await ad.call(A().overview)).body.pools.find((p) => p.pool === "default");
    assert.strictEqual(def.stock.length, 1);
    assert.strictEqual(def.stock[0].description, "Diri 50lb");
    assert.strictEqual(def.slips.length, 1);
    assert.strictEqual(def.slips[0].slipNumber, "296001");
    assert.strictEqual(def.slips[0].items[0].quantity, "400");
    assert.strictEqual(def.goods.length, 1);
    assert.strictEqual(def.goods[0].kind, "avarye");
    assert.ok(Array.isArray(def.invoices));
  });

  await test("figures are exactly what the admin and the depot hold: archived containers with no division are counted, nothing is dropped", async () => {
    const admin = await legacyAdmin();
    const c = (id, n, division, extra) => Object.assign({ id: id, numewo: n, billId: "b1", size: "40", division: division, dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "D", trucking: "CFC", dateEmpty: null, dateLeft: null, dateExpected: null }, extra || {});
    await H.setData({
      containers: [
        c("c1", "AAAA0000001", "CRISTO AL"),
        c("c2", "AAAA0000002", "DEKAV"),
        c("c3", "OLD00000001", null, { billId: "b2", dateLeft: "2026-05-01", dateVerified: null, depo: null, trucking: null }), // from the Achiv: already left, no division
        c("c4", "OLD00000002", null, { billId: "b2", dateLeft: "2026-05-02", dateVerified: null, depo: null, trucking: null }),
      ],
      bills: [{ id: "b1", numewo: "B-1", product: "Diri" }, { id: "b2", numewo: "B-OLD", product: "Ansyen", completedAt: "2026-05-02" }],
      notifications: [], inventoryChecks: {},
    });
    const ad = await onboard(admin, { username: "adm.paul", role: "administration", name: "Paul" }, "198.51.100.65");
    const def = (await ad.call(A().overview)).body.pools.find((p) => p.pool === "default");
    const mine = (await admin.call(A().data)).body;
    assert.strictEqual(def.containers.length, mine.containers.length, "same number of containers as the logistic admin sees");
    assert.deepStrictEqual(def.containers.map((x) => x.id).sort(), mine.containers.map((x) => x.id).sort());
    assert.deepStrictEqual(def.bills.map((b) => b.id).sort(), mine.bills.map((b) => b.id).sort());
    assert.strictEqual(def.total, 4);
    assert.strictEqual(def.noDivision, 2);
  });

  await test("no duplicates: the most reliable record of a container or a bill is kept, a container that left never stays Full", async () => {
    const { dedupe } = require("../api/_lib/dedupe");
    const mk = (pool, o) => Object.assign({ pool: pool, ok: true, divisions: [], containers: [], bills: [], stock: [], goods: [], invoices: [], slips: [] }, o);
    const c = (id, n, o) => Object.assign({ id: id, numewo: n, billId: "b1", size: "40", division: null, dateEntered: null, dateVerified: null, dateEmpty: null, dateLeft: null, depo: null, trucking: null }, o || {});
    const bill = (id, n, o) => Object.assign({ id: id, numewo: n, product: "Diri", completedAt: null }, o || {});

    // 1) entered by the depot (still Full), then added again from the Achiv once it left, with no empty date
    let r = dedupe([mk("default", {
      containers: [
        c("c1", "TEMU5858003", { division: "CRISTO AL", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "Depo A", trucking: "CFC" }),
        c("c2", "TEMU5858003", { dateEntered: "2026-09-01", dateLeft: "2026-09-20", plak: "AA 1" }),
      ], bills: [bill("b1", "B-1")],
    })])[0];
    assert.strictEqual(r.containers.length, 1, "one record");
    assert.ok(r.containers[0].dateLeft, "the one that left wins, it does not stay Full");
    assert.strictEqual(r.containers[0].division, "CRISTO AL", "the gaps are filled from the other record");
    assert.strictEqual(r.containers[0].depo, "Depo A");
    assert.strictEqual(r.dupContainers, 1);

    // 2) the same container coming back later on another trip is NOT a duplicate
    r = dedupe([mk("default", {
      containers: [
        c("c1", "TEMU5858003", { division: "CRISTO AL", dateEntered: "2026-05-01", dateVerified: "2026-05-02", dateEmpty: "2026-05-10", dateLeft: "2026-05-12" }),
        c("c2", "TEMU5858003", { billId: "b2", division: "CRISTO AL", dateEntered: "2026-10-01", dateVerified: "2026-10-02" }),
      ], bills: [bill("b1", "B-1"), bill("b2", "B-2")],
    })])[0];
    assert.strictEqual(r.containers.length, 2, "two real trips are both kept");

    // 3) two different bills are two different trips, even with no dates
    r = dedupe([mk("default", { containers: [c("c1", "AAAA1", { billId: "b1" }), c("c2", "AAAA1", { billId: "b2" })], bills: [bill("b1", "B-1"), bill("b2", "B-2")] })])[0];
    assert.strictEqual(r.containers.length, 2);

    // 4) the same container in two databases is counted once, the most advanced record wins
    const two = dedupe([
      mk("default", { containers: [c("c1", "ZZZZ1", { division: "CRISTO AL", dateEntered: "2026-09-01", dateVerified: "2026-09-02" })], bills: [bill("b1", "B-1")] }),
      mk("acs", { containers: [c("x9", "ZZZZ1", { dateEntered: "2026-09-01", dateLeft: "2026-09-15" })], bills: [bill("b9", "B-1")] }),
    ]);
    assert.strictEqual(two[0].containers.length + two[1].containers.length, 1);
    assert.ok([].concat(two[0].containers, two[1].containers)[0].dateLeft);

    // 5) a bill recorded twice in one database: kept once, its containers and stock follow it
    r = dedupe([mk("default", {
      containers: [c("c1", "AAAA1", { billId: "b1" }), c("c2", "AAAA2", { billId: "b1" }), c("c3", "AAAA3", { billId: "b1dup" })],
      bills: [bill("b1", "B-1"), bill("b1dup", " b-1 ", { product: "" })],
      stock: [{ id: "s1", billId: "b1dup", entryDate: "2026-09-03", description: "Diri", quantity: "10", unit: "sak" }],
    })])[0];
    assert.strictEqual(r.bills.length, 1);
    assert.strictEqual(r.bills[0].id, "b1", "the bill with most containers is kept");
    assert.ok(r.containers.every((x) => x.billId === "b1"), "containers follow the kept bill");
    assert.strictEqual(r.stock[0].billId, "b1", "stock follows the kept bill");
    assert.strictEqual(r.dupBills, 1);

    // 6) the same stock entry twice is one stock entry
    r = dedupe([mk("default", { bills: [bill("b1", "B-1")], stock: [
      { id: "s1", billId: "b1", entryDate: "2026-09-03", description: "Diri", quantity: "10", unit: "sak" },
      { id: "s2", billId: "b1", entryDate: "2026-09-03", description: "diri ", quantity: "10", unit: "sak" },
    ] })])[0];
    assert.strictEqual(r.stock.length, 1);
  });

  await test("a division whose database is not configured is reported, it does not break the others", async () => {
    const admin = await legacyAdmin();
    await seed();
    const ad = await onboard(admin, { username: "adm.paul", role: "administration", name: "Paul" }, "198.51.100.63");
    const r = await ad.call(A().overview);
    assert.strictEqual(r.statusCode, 200);
    r.body.pools.forEach((p) => {
      if (p.pool === "default") return;
      assert.strictEqual(typeof p.ok, "boolean");
      if (!p.ok) { assert.deepStrictEqual(p.containers, []); assert.ok(p.error); }
    });
    assert.ok(r.body.pools.find((p) => p.pool === "default").ok);
  });

  await test("read-only: the administration role cannot write anywhere and cannot reach the other interfaces' tools", async () => {
    const admin = await legacyAdmin();
    await seed();
    const ad = await onboard(admin, { username: "adm.paul", role: "administration", name: "Paul" }, "198.51.100.64");
    const rev = (await admin.call(A().data)).body.rev;
    assert.strictEqual((await post(ad, A().data, { containers: [], bills: [], notifications: [], inventoryChecks: {}, rev })).statusCode, 403, "cannot save the data set");
    assert.strictEqual((await ad.call(A().data)).statusCode, 403, "does not read /api/data (it uses /api/overview)");
    assert.strictEqual((await post(ad, A().stock, { action: "create", billId: "b1", description: "X", quantity: "1", unit: "sak" })).statusCode, 403, "cannot add stock");
    assert.strictEqual((await post(ad, A().slips, { action: "create", slipNumber: "1", division: "CRISTO AL", items: [] })).statusCode, 403, "cannot create a slip");
    assert.strictEqual((await post(ad, A().goods, { action: "create", kind: "avarye", billId: "b1", description: "X", quantity: "1", unit: "sak" })).statusCode, 403, "cannot register goods");
    assert.strictEqual((await ad.call(A().pay)).statusCode, 403, "cannot read Logistique Deka payments");
    assert.strictEqual((await ad.call(A().users)).statusCode, 403, "cannot manage users");
    assert.strictEqual((await post(ad, A().overview, {})).statusCode, 405, "overview only answers GET");
  });

  await test("an administration account sees every division: no division can be assigned to it", async () => {
    const admin = await legacyAdmin();
    await seed();
    const made = (await post(admin, A().users, { action: "create", username: "adm.zero", role: "administration", name: "Zero Div", divisions: ["DEKAV"] })).body;
    assert.deepStrictEqual(made.user.divisions, []);
    assert.strictEqual((await post(admin, A().users, { action: "set_divisions", username: "adm.zero", divisions: ["ACS"] })).statusCode, 400);
    // changing a depot account into an administration one clears its divisions
    await post(admin, A().users, { action: "create", username: "depo.x", role: "depot", name: "Depo X", divisions: ["ACS"] });
    assert.strictEqual((await post(admin, A().users, { action: "set_role", username: "depo.x", role: "administration" })).statusCode, 200);
    const list = (await admin.call(A().users)).body.users;
    assert.deepStrictEqual(list.find((u) => u.username === "depo.x").divisions, []);
  });

  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  ok    " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n" + (r[2] && r[2].stack ? r[2].stack.split("\n").slice(0, 4).join("\n") : r[2]))));
  console.log(failed.length ? failed.length + " FAILED" : results.length + "/" + results.length + " passed");
  process.exit(failed.length ? 1 : 0);
})();
