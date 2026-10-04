"use strict";
// Container history: every save leaves "who did what, when" events per container, readable by the administrator only.
// Run with:  node tests/history.test.js   (or TEST_BACKEND=pg node tests/history.test.js)
const assert = require("assert");
const H = require("./helpers");

const results = [];
async function test(name, fn) {
  try { H.reset(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); }
}
const PW = { admin: "Adm1n-Strong-Pass", depot: "Dep0t-Strong-Pass", daily: "Da1ly-Strong-Pass" };

async function login(user, role) {
  const b = H.browser();
  const r = await b.call(H.api("auth/login"), { method: "POST", body: { username: user, password: PW[role] } });
  assert.strictEqual(r.statusCode, 200, "login " + role + ": " + JSON.stringify(r.body));
  return b;
}
const cont = (o) => Object.assign({ id: "c1", numewo: "MSKU1111111", billId: "b1", size: "40", division: "ACS", dateEntered: null, dateVerified: null, depo: null, trucking: null, dateEmpty: null, dateLeft: null }, o || {});
const state = (containers) => ({ bills: [{ id: "b1", numewo: "B-1", product: "Diri", completedAt: null }], containers, notifications: [], inventoryChecks: {} });
async function save(admin, containers) {
  H.advance(5000);
  const r = await admin.call(H.api("data"), { method: "POST", body: Object.assign(state(containers), { rev: await H.rev() }) });
  assert.strictEqual(r.statusCode, 200, "save: " + JSON.stringify(r.body));
}
async function events(admin, id) {
  const r = await admin.call(H.api("history"), { method: "GET", query: { id: id } });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.events;
}
const kinds = (ev) => ev.map((e) => e.kind).reverse(); // oldest first

(async () => {
  const A = H.api("_lib/auth");
  process.env.AUTH_ADMIN_HASH = await A.hashPassword(PW.admin);
  process.env.AUTH_DEPOT_PASS = PW.depot;
  process.env.AUTH_DAILY_PASS = PW.daily;
  delete process.env.AUTH_SESSION_EPOCH;
  const act = H.api("act");

  await test("a new container leaves a 'created' event with the person who saved it", async () => {
    const admin = await login("logistic", "admin");
    await save(admin, [cont()]);
    const ev = await events(admin, "c1");
    assert.deepStrictEqual(kinds(ev), ["created"]);
    assert.strictEqual(ev[0].actor, "logistic");
    assert.ok(/^\d{4}-\d\d-\d\dT/.test(ev[0].ts), "has a timestamp");
  });

  await test("entering, verifying, emptying, transferring and leaving are recorded in order, by whoever did them", async () => {
    const admin = await login("logistic", "admin");
    const depot = await login("depotnord", "depot");
    await save(admin, [cont()]);
    await save(admin, [cont({ dateEntered: "2026-09-01" })]);
    await save(admin, [cont({ dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "Depo A", trucking: null })]);
    H.advance(5000);
    let r = await depot.call(act, { method: "POST", body: { action: "markEmpty", id: "c1" } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    H.advance(5000);
    r = await depot.call(act, { method: "POST", body: { action: "transfer", id: "c1", depo: "Depo B", trucking: "CFC 3" } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    H.advance(5000);
    r = await admin.call(act, { method: "POST", body: { action: "depart", ids: ["c1"], trucking: "CTSA" } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const ev = await events(admin, "c1");
    assert.deepStrictEqual(kinds(ev), ["created", "entered", "verified", "empty", "transfer", "left"]);
    const by = {}; ev.forEach((e) => { by[e.kind] = e; });
    assert.strictEqual(by.empty.actor, "depotnord", "emptied by the depot account");
    assert.strictEqual(by.transfer.actor, "depotnord");
    assert.ok(/Depo A/.test(by.transfer.info) && /Depo B/.test(by.transfer.info), "transfer says from where to where");
    assert.ok(/CTSA/.test(by.left.info), "leaving says which trucking took it");
    assert.strictEqual(by.left.actor, "logistic");
  });

  await test("correcting a date is recorded with the old and the new value", async () => {
    const admin = await login("logistic", "admin");
    await save(admin, [cont({ dateEntered: "2026-09-01" })]);
    await save(admin, [cont({ dateEntered: "2026-09-03" })]);
    const ev = await events(admin, "c1");
    const c = ev.find((e) => e.kind === "corrected");
    assert.ok(c && /2026-09-01/.test(c.info) && /2026-09-03/.test(c.info), JSON.stringify(ev));
  });

  await test("a save that changes nothing adds no events; other containers are not touched", async () => {
    const admin = await login("logistic", "admin");
    await save(admin, [cont(), cont({ id: "c2", numewo: "MSKU2222222" })]);
    const before = (await events(admin, "c1")).length;
    await save(admin, [cont(), cont({ id: "c2", numewo: "MSKU2222222", dateEntered: "2026-09-05" })]);
    assert.strictEqual((await events(admin, "c1")).length, before, "c1 unchanged");
    assert.deepStrictEqual(kinds(await events(admin, "c2")), ["created", "entered"]);
  });

  await test("deleting a container is recorded", async () => {
    const admin = await login("logistic", "admin");
    await save(admin, [cont(), cont({ id: "c2", numewo: "MSKU2222222" })]);
    await save(admin, [cont({ id: "c2", numewo: "MSKU2222222" })]);
    assert.deepStrictEqual(kinds(await events(admin, "c1")), ["created", "deleted"]);
    assert.deepStrictEqual(kinds(await events(admin, "c2")), ["created"]);
  });

  await test("only the administrator can read the history; bad ids are refused", async () => {
    const admin = await login("logistic", "admin");
    const depot = await login("depotnord", "depot");
    const daily = await login("logisticdepot", "daily");
    await save(admin, [cont()]);
    for (const b of [depot, daily, H.browser()]) {
      const r = await b.call(H.api("history"), { method: "GET", query: { id: "c1" } });
      assert.ok(r.statusCode === 401 || r.statusCode === 403, "refused: " + r.statusCode);
    }
    const bad = await admin.call(H.api("history"), { method: "GET", query: { id: "../x" } });
    assert.strictEqual(bad.statusCode, 400);
    const post = await admin.call(H.api("history"), { method: "POST", query: { id: "c1" }, body: {} });
    assert.strictEqual(post.statusCode, 405);
  });

  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  ok    " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n        " + (r[2] && r[2].message))));
  console.log(results.length - failed.length + "/" + results.length + " passed");
  process.exit(failed.length ? 1 : 0);
})();
