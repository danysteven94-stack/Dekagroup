"use strict";
// Logistique Deka: its own bills and their payment confirmation (check received -> paid by the broker -> confirmed).
//   node tests/payments.test.js            (Redis)      TEST_BACKEND=pg node tests/payments.test.js   (SQL)
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
const A = () => ({ login: H.api("auth/login"), password: H.api("auth/password"), users: H.api("users"), data: H.api("data"), pay: H.api("payments") });
const post = (b, h, body) => b.call(h, { method: "POST", body });
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

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
  r = await post(b, A().password, { current: created.body.tempPassword, next: "Logistique-Strong-Pass-9" });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return b;
}
const seed = () => H.setData({
  containers: [{ id: "c1", numewo: "AAAA0000001", billId: "b1", size: "40", division: "DEKAV", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "D", trucking: "CFC", dateEmpty: null, dateLeft: null }],
  bills: [{ id: "b1", numewo: "B-1", product: "Diri", completedAt: null }],
  notifications: [], inventoryChecks: {},
});
const save = (b, body) => post(b, A().pay, Object.assign({ action: "save" }, body));
const create = (b, body) => post(b, A().pay, Object.assign({ action: "create" }, body));
// creates a bill for the logistique account and returns its id
async function mk(lg, division, numewo, product) {
  const r = await create(lg, { division, numewo, product });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.bills[0].id;
}
const list = async (b) => (await b.call(A().pay)).body.bills;

(async () => {
  await test("only the logistique role reaches /api/payments (not even the administrator), and it cannot read the other interfaces' data", async () => {
    const admin = await legacyAdmin();
    await seed();
    const anon = H.browser();
    assert.strictEqual((await anon.call(A().pay)).statusCode, 401);
    await onboard(admin, { username: "depo.marie", role: "depot", name: "Marie", divisions: ["DEKAV"] }, "198.51.100.40");
    const depo = H.browser("198.51.100.40");
    await post(depo, A().login, { username: "depo.marie", password: "Logistique-Strong-Pass-9" });
    assert.strictEqual((await depo.call(A().pay)).statusCode, 403, "a depot account must not see Logistique Deka data");
    assert.strictEqual((await create(depo, { division: "DEKAV", numewo: "X-1" })).statusCode, 403);
    assert.strictEqual((await admin.call(A().pay)).statusCode, 403, "the administrator does not see Logistique Deka data either");
    assert.strictEqual((await create(admin, { division: "DEKAV", numewo: "X-1" })).statusCode, 403);
    const lg = await onboard(admin, { username: "log.paul", role: "logistique", name: "Paul Logistique", divisions: ["DEKAV"] }, "198.51.100.41");
    assert.strictEqual((await lg.call(A().pay)).statusCode, 200);
    assert.strictEqual((await lg.call(A().data)).statusCode, 403, "Logistique Deka never reads the containers of the other interfaces");
  });

  await test("a logistique account works on EVERY division, whatever divisions its account lists", async () => {
    const admin = await legacyAdmin();
    await seed();
    const users = (await post(admin, A().users, { action: "create", username: "log.zero", role: "logistique", name: "Zero Div", divisions: ["DEKAV"] })).body;
    assert.deepStrictEqual(users.user.divisions, [], "no division is assigned to a Logistique Deka account");
    const lg = await onboard(admin, { username: "log.paul", role: "logistique", name: "Paul" }, "198.51.100.42");
    for (const [dv, n] of [["DEKAV", "B-A"], ["ACS", "B-B"], ["MIKADO", "B-C"], ["MOBILITY", "B-D"], ["ENERSOL", "B-G"], ["LA COLLECTION", "B-E"], ["CRISTO AL", "B-F"]]) await mk(lg, dv, n, "Pwodwi");
    assert.strictEqual((await list(lg)).length, 7, "all divisions visible");
    // a second logistique account sees the same data (the data belongs to Logistique Deka, not to one person)
    const lg2 = await onboard(admin, { username: "log.marc", role: "logistique", name: "Marc" }, "198.51.100.46");
    assert.strictEqual((await list(lg2)).length, 7);
    // changing the divisions of such an account is refused (it sees everything)
    assert.strictEqual((await post(admin, A().users, { action: "set_divisions", username: "log.paul", divisions: ["ACS"] })).statusCode, 400);
  });

  await test("Logistique Deka data is separate from the other interfaces: nothing flows either way", async () => {
    const admin = await legacyAdmin();
    await seed();
    const lg = await onboard(admin, { username: "log.paul", role: "logistique", name: "Paul" }, "198.51.100.47");
    const id = await mk(lg, "DEKAV", "B-1", "Diri"); // same number as a container Bill of the depot data: still independent
    assert.strictEqual((await list(lg)).length, 1, "the container Bill B-1 of the other interfaces is not listed here");
    assert.strictEqual((await list(lg))[0].id, id);
    const d = (await admin.call(A().data)).body;
    assert.deepStrictEqual(d.bills.map((b) => b.id), ["b1"], "the other interfaces do not see Logistique Deka bills");
    assert.deepStrictEqual(d.containers.map((c) => c.id), ["c1"]);
    // a payment on the Logistique Deka bill does not touch the other data, and writing the other data does not touch it
    assert.strictEqual((await save(lg, { items: [{ billId: id, amount: 10 }], checkDate: daysAgo(1) })).statusCode, 200);
    const after = (await admin.call(A().data)).body;
    assert.deepStrictEqual(after.bills, d.bills);
    assert.strictEqual((await save(lg, { items: [{ billId: "b1", amount: 5 }] })).statusCode, 404, "a container Bill id is unknown to Logistique Deka");
    assert.strictEqual((await list(lg)).length, 1);
  });

  await test("new bills: validation, number normalised, duplicates refused, delete (not once confirmed)", async () => {
    const admin = await legacyAdmin();
    await seed();
    const lg = await onboard(admin, { username: "log.paul", role: "logistique", name: "Paul" }, "198.51.100.48");
    assert.strictEqual((await create(lg, { division: "NOPE", numewo: "B-9" })).statusCode, 400, "unknown division");
    assert.strictEqual((await create(lg, { division: "ACS", numewo: " " })).statusCode, 400, "no number");
    assert.strictEqual((await create(lg, { division: "ACS", numewo: "B-9", amount: -2 })).statusCode, 400, "negative amount");
    assert.strictEqual((await create(lg, { division: "ACS", numewo: "B-9", currency: "EUR" })).statusCode, 400, "unknown currency");
    const r = await create(lg, { division: "ACS", numewo: "lmm-9", product: "Sik", amount: "75.5", currency: "USD" });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.bills[0].numewo, "LMM-9", "number is upper-cased");
    assert.strictEqual(r.body.bills[0].amount, 75.5);
    assert.strictEqual(r.body.bills[0].createdBy, "log.paul");
    assert.strictEqual((await create(lg, { division: "ACS", numewo: "LMM-9" })).statusCode, 409, "same number twice in a division");
    assert.strictEqual((await create(lg, { division: "MIKADO", numewo: "LMM-9" })).statusCode, 200, "same number in another division is a different bill");
    // edit identity
    const id = r.body.bills[0].id;
    assert.strictEqual((await post(lg, A().pay, { action: "edit", billId: id, product: "Sik blan" })).statusCode, 200);
    assert.strictEqual((await post(lg, A().pay, { action: "edit", billId: id, division: "MIKADO" })).statusCode, 409, "would duplicate the MIKADO one");
    // delete: refused once the payment is confirmed
    await save(lg, { items: [{ billId: id }], checkDate: daysAgo(4), paidDate: daysAgo(3), confirmedDate: daysAgo(2) });
    assert.strictEqual((await post(lg, A().pay, { action: "delete", billId: id })).statusCode, 400);
    await post(lg, A().pay, { action: "clear", billId: id, stage: "confirmed" });
    assert.strictEqual((await post(lg, A().pay, { action: "delete", billId: id })).statusCode, 200);
    assert.strictEqual((await list(lg)).length, 1);
    assert.strictEqual((await post(lg, A().pay, { action: "delete", billId: id })).statusCode, 404);
  });

  await test("full life of a payment: amount, check received, paid, confirmed", async () => {
    const admin = await legacyAdmin();
    await seed();
    const lg = await onboard(admin, { username: "log.paul", role: "logistique", name: "Paul" }, "198.51.100.43");
    const b1 = await mk(lg, "DEKAV", "B-1", "Diri");
    let r = await save(lg, { items: [{ billId: b1, amount: "1250.50" }], currency: "USD" });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.bills[0].amount, 1250.5);
    assert.strictEqual(r.body.bills[0].currency, "USD");
    assert.strictEqual(r.body.bills[0].checkDate, null);
    r = await save(lg, { items: [{ billId: b1 }], checkDate: daysAgo(5) });
    assert.strictEqual(r.body.bills[0].amount, 1250.5, "amount kept when only a date is sent");
    assert.strictEqual(r.body.bills[0].checkDate, daysAgo(5));
    r = await save(lg, { items: [{ billId: b1 }], confirmedDate: daysAgo(1) });
    assert.strictEqual(r.statusCode, 400, "cannot confirm before it is paid");
    r = await save(lg, { items: [{ billId: b1 }], paidDate: daysAgo(3), broker: "Brokè Pierre", reference: "CHK-001" });
    assert.strictEqual(r.statusCode, 200);
    r = await save(lg, { items: [{ billId: b1 }], confirmedDate: daysAgo(1) });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const p = (await list(lg))[0];
    assert.strictEqual(p.confirmedDate, daysAgo(1));
    assert.strictEqual(p.broker, "Brokè Pierre");
    assert.strictEqual(p.reference, "CHK-001");
    assert.strictEqual(p.updatedBy, "log.paul");
    r = await post(lg, A().pay, { action: "clear", billId: b1, stage: "confirmed" });
    assert.strictEqual(r.statusCode, 200);
    let q = (await list(lg))[0];
    assert.strictEqual(q.confirmedDate, null);
    assert.strictEqual(q.paidDate, daysAgo(3));
    await save(lg, { items: [{ billId: b1 }], confirmedDate: daysAgo(1) });
    await post(lg, A().pay, { action: "clear", billId: b1, stage: "paid" });
    q = await list(lg);
    assert.strictEqual(q.length, 1);
    assert.strictEqual(q[0].paidDate, null);
    assert.strictEqual(q[0].confirmedDate, null);
    assert.strictEqual(q[0].checkDate, daysAgo(5));
  });

  await test("one payment for SEVERAL bills at once (any divisions), each with its own amount", async () => {
    const admin = await legacyAdmin();
    await seed();
    const lg = await onboard(admin, { username: "log.paul", role: "logistique", name: "Paul" }, "198.51.100.44");
    const b1 = await mk(lg, "DEKAV", "B-1", "Diri");
    const b2 = await mk(lg, "ACS", "B-2", "Sik");
    const r = await save(lg, {
      items: [{ billId: b1, amount: 1000 }, { billId: b2, amount: 2500.25 }],
      checkDate: daysAgo(4), paidDate: daysAgo(2), confirmedDate: daysAgo(1), broker: "Brokè Jan", reference: "CHK-777",
    });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const by = Object.fromEntries((await list(lg)).map((p) => [p.id, p]));
    assert.strictEqual(by[b1].amount, 1000);
    assert.strictEqual(by[b2].amount, 2500.25);
    for (const id of [b1, b2]) {
      assert.strictEqual(by[id].paidDate, daysAgo(2));
      assert.strictEqual(by[id].confirmedDate, daysAgo(1));
      assert.strictEqual(by[id].reference, "CHK-777");
    }
    assert.ok(by[b1].batchId && by[b1].batchId === by[b2].batchId, "bills paid together share a batch id");
  });

  await test("validation: dates (format, future, order), amounts, duplicates, unknown bill, atomic refusal", async () => {
    const admin = await legacyAdmin();
    await seed();
    const lg = await onboard(admin, { username: "log.paul", role: "logistique", name: "Paul" }, "198.51.100.45");
    const b1 = await mk(lg, "DEKAV", "B-1", "Diri");
    const b2 = await mk(lg, "DEKAV", "B-2", "Sik");
    const bad = async (body, what) => assert.strictEqual((await save(lg, body)).statusCode, 400, what);
    await bad({ items: [] }, "no bill");
    await bad({ items: [{ billId: b1, amount: -5 }] }, "negative amount");
    await bad({ items: [{ billId: b1, amount: "abc" }] }, "non numeric amount");
    await bad({ items: [{ billId: b1 }, { billId: b1 }] }, "same bill twice");
    await bad({ items: [{ billId: b1, amount: 5 }], checkDate: "2026-13-45" }, "impossible date");
    await bad({ items: [{ billId: b1, amount: 5 }], checkDate: "12/05/2026" }, "wrong format");
    await bad({ items: [{ billId: b1, amount: 5 }], checkDate: daysAgo(-3) }, "date in the future");
    await bad({ items: [{ billId: b1, amount: 5 }], currency: "EUR" }, "unknown currency");
    await bad({ items: [{ billId: b1, amount: 5 }], paidDate: daysAgo(1) }, "paid without a check date");
    await bad({ items: [{ billId: b1, amount: 5 }], checkDate: daysAgo(1), paidDate: daysAgo(3) }, "paid before the check was received");
    await bad({ items: [{ billId: b1, amount: 5 }], checkDate: daysAgo(4), paidDate: daysAgo(3), confirmedDate: daysAgo(6) }, "confirmed before paid");
    await bad({ items: [{ billId: b1 }], checkDate: daysAgo(4), paidDate: daysAgo(3), confirmedDate: daysAgo(2) }, "confirmed without any amount");
    // atomic: b1 is fine, b2 has no amount -> nothing is written for b1 either
    await bad({ items: [{ billId: b1, amount: 5 }, { billId: b2 }], checkDate: daysAgo(4), paidDate: daysAgo(3), confirmedDate: daysAgo(2) }, "one bad bill refuses all");
    assert.ok((await list(lg)).every((p) => p.checkDate === null && p.amount === null), "nothing was saved");
    assert.strictEqual((await save(lg, { items: [{ billId: "nope", amount: 5 }] })).statusCode, 404);
    assert.strictEqual((await post(lg, A().pay, { action: "hack" })).statusCode, 400);
  });

  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  ok    " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n" + (r[2] && r[2].stack ? r[2].stack.split("\n").slice(0, 4).join("\n") : r[2]))));
  console.log(failed.length ? failed.length + " FAILED" : results.length + "/" + results.length + " passed");
  process.exit(failed.length ? 1 : 0);
})();
