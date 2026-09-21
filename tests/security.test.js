"use strict";
// Run with:  node tests/security.test.js
const assert = require("assert");
const H = require("./helpers");

const results = [];
async function test(name, fn) {
  if (process.env.TRACE) console.error("--- " + name);
  try { H.reset(); await fn(); results.push([true, name]); }
  catch (e) { results.push([false, name, e]); }
}

const PW = { admin: "Adm1n-Strong-Pass", depot: "Dep0t-Strong-Pass", daily: "Da1ly-Strong-Pass", chofe: "Chof3-Strong-Pass" };

async function setup() {
  const A = H.api("_lib/auth");
  process.env.AUTH_ADMIN_HASH = await A.hashPassword(PW.admin); // hashed
  process.env.AUTH_DEPOT_PASS = PW.depot; // plain text also accepted
  process.env.AUTH_DAILY_PASS = PW.daily;
  process.env.AUTH_CHOFE_PASS = PW.chofe;
  delete process.env.AUTH_SESSION_EPOCH;
}

// posts the whole data set like the app does (with the revision it last saw)
const post = async (b, body, extra) => b.call(H.api("data"), Object.assign({ method: "POST", body: Object.assign({}, body, { rev: await H.rev() }) }, extra || {}));
const today = () => new Date().toISOString().slice(0, 10);
const seed = () => ({
  containers: [
    { id: "c1", numewo: "FULL0000001", billId: "b1", size: "40", division: "ACS", dateEntered: "2026-09-10", dateVerified: "2026-09-10", depo: "Depo A", trucking: "CFC", dateEmpty: null, dateLeft: null },
    { id: "c2", numewo: "VIDD0000002", billId: "b1", size: "20", division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "Depo B", trucking: "MAD", dateEmpty: "2026-09-15", dateLeft: null },
    { id: "c3", numewo: "POKO0000003", billId: "b2", size: "20", division: "DEKAV", dateEntered: "2026-09-18", dateVerified: null, depo: null, trucking: null, dateEmpty: null, dateLeft: null },
    { id: "c4", numewo: "LEFT0000004", billId: "b3", size: "20", division: "DEKAV", dateEntered: "2026-08-01", dateVerified: "2026-08-02", depo: "Depo C", trucking: "CTSA", dateEmpty: "2026-08-10", dateLeft: "2026-08-12" },
  ],
  bills: [
    { id: "b1", numewo: "B-1", product: "Diri", completedAt: null },
    { id: "b2", numewo: "B-2", product: "Sik", completedAt: null },
    { id: "b3", numewo: "B-3", product: "Sel", completedAt: null },
  ],
  notifications: [],
  inventoryChecks: { c1: today() },
});

async function login(user, role) {
  const b = H.browser();
  const r = await b.call(H.api("auth/login"), { method: "POST", body: { username: user, password: PW[role] } });
  assert.strictEqual(r.statusCode, 200, "login " + role + ": " + JSON.stringify(r.body));
  return b;
}

async function run() {
  await setup();
  const login_ = H.api("auth/login"), me = H.api("auth/me"), logout = H.api("auth/logout");
  const data = H.api("data"), act = H.api("act"), daily = H.api("daily"), verify = H.api("verify"), audit = H.api("audit"), backup = H.api("backup"), push = H.api("push");
  const USERS = { admin: "logistic", depot: "depotnord", daily: "logisticdepot", chofe: "chofe" };

  await test("login: not configured -> 503 (fails closed)", async () => {
    const saved = Object.assign({}, process.env);
    ["AUTH_ADMIN_HASH", "AUTH_DEPOT_PASS", "AUTH_DAILY_PASS", "AUTH_CHOFE_PASS"].forEach((k) => delete process.env[k]);
    const r = await H.browser().call(login_, { method: "POST", body: { username: "logistic", password: "x" } });
    Object.assign(process.env, saved);
    assert.strictEqual(r.statusCode, 503);
  });

  await test("login: right password (hash + plain) gives a hardened cookie and the right role", async () => {
    for (const role of Object.keys(USERS)) {
      const b = H.browser();
      const r = await b.call(login_, { method: "POST", body: { username: USERS[role].toUpperCase() + " ", password: PW[role] } });
      assert.strictEqual(r.statusCode, 200);
      assert.strictEqual(r.body.role, role);
      for (const f of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "__Host-"]) assert.ok(r.cookieAttrs.includes(f), role + " cookie missing " + f);
      assert.ok(!("password" in r.body));
      const m = await b.call(me);
      assert.deepStrictEqual(m.body, { authenticated: true, role, username: USERS[role] });
    }
  });

  await test("login: the chosen gate must match the account role (no session for a mismatch)", async () => {
    const b = H.browser();
    const r = await b.call(login_, { method: "POST", body: { username: "logisticdepot", password: PW.daily, role: "chofe" } });
    assert.strictEqual(r.statusCode, 403);
    assert.strictEqual(r.body.code, "wrong_role");
    assert.ok(!r.headers["set-cookie"] && !b.jar["__Host-dl_sid"]);
    const ok = await b.call(login_, { method: "POST", body: { username: "logisticdepot", password: PW.daily, role: "daily" } });
    assert.strictEqual(ok.statusCode, 200);
  });

  await test("login: wrong password / unknown user give the same generic 401", async () => {
    const b = H.browser();
    const a = await b.call(login_, { method: "POST", body: { username: "logistic", password: "nope" } });
    const c = await b.call(login_, { method: "POST", body: { username: "ghost", password: "nope" } });
    assert.strictEqual(a.statusCode, 401);
    assert.deepStrictEqual(a.body, c.body);
    assert.ok(!a.headers["set-cookie"]);
  });

  await test("login: brute force is locked after 5 failures, other IPs are not affected, then it unlocks", async () => {
    const attacker = H.browser("198.51.100.7");
    for (let i = 0; i < 5; i++) assert.strictEqual((await attacker.call(login_, { method: "POST", body: { username: "logistic", password: "guess" + i } })).statusCode, 401);
    const locked = await attacker.call(login_, { method: "POST", body: { username: "logistic", password: PW.admin } });
    assert.strictEqual(locked.statusCode, 429, "even the right password is refused while locked");
    assert.ok(Number(locked.headers["retry-after"]) > 0);
    const other = H.browser("198.51.100.99");
    assert.strictEqual((await other.call(login_, { method: "POST", body: { username: "logistic", password: PW.admin } })).statusCode, 200);
    H.advance(16 * 60 * 1000);
    assert.strictEqual((await attacker.call(login_, { method: "POST", body: { username: "logistic", password: PW.admin } })).statusCode, 200);
  });

  await test("login: CSRF (bad Origin), no Origin, and non-JSON are refused", async () => {
    const b = H.browser();
    assert.strictEqual((await b.call(login_, { method: "POST", body: { username: "logistic", password: PW.admin }, headers: { origin: "https://evil.example" } })).statusCode, 403);
    assert.strictEqual((await b.call(login_, { method: "POST", body: { username: "logistic", password: PW.admin }, headers: { origin: null } })).statusCode, 403);
    assert.strictEqual((await b.call(login_, { method: "POST", body: { username: "logistic", password: PW.admin }, headers: { "content-type": "text/plain" } })).statusCode, 415);
  });

  await test("everything requires a session", async () => {
    const b = H.browser();
    for (const [h, m] of [[data, "GET"], [data, "POST"], [act, "POST"], [daily, "GET"], [verify, "POST"], [audit, "GET"], [backup, "GET"], [push, "POST"]]) {
      const r = await b.call(h, { method: m, body: {} });
      assert.strictEqual(r.statusCode, 401, m + " should be 401 without a session, got " + r.statusCode);
    }
  });

  await test("a forged / random cookie is not a session", async () => {
    const b = H.browser();
    const r = await b.call(data, { headers: { cookie: "__Host-dl_sid=" + "A".repeat(43) } });
    assert.strictEqual(r.statusCode, 401);
  });

  await test("read access: admin sees all, chofe only Vid containers, others never get admin inventory checks", async () => {
    await H.setData(seed());
    const admin = await login("logistic", "admin"), chofe = await login("chofe", "chofe"), depot = await login("depotnord", "depot"), dr = await login("logisticdepot", "daily");
    assert.strictEqual((await admin.call(data)).body.containers.length, 4);
    assert.deepStrictEqual((await admin.call(data)).body.inventoryChecks, { c1: today() });
    const c = (await chofe.call(data)).body;
    assert.deepStrictEqual(c.containers.map((x) => x.id), ["c2"]);
    assert.deepStrictEqual(c.bills.map((x) => x.id), ["b1"]);
    assert.deepStrictEqual(c.inventoryChecks, {});
    assert.deepStrictEqual((await depot.call(data)).body.inventoryChecks, {});
    assert.strictEqual((await dr.call(data)).body.containers.length, 4);
  });

  await test("write access: only admin can replace the data set", async () => {
    await H.setData(seed());
    for (const [u, r] of [["depotnord", "depot"], ["logisticdepot", "daily"], ["chofe", "chofe"]]) {
      const b = await login(u, r);
      assert.strictEqual((await post(b, seed())).statusCode, 403, r);
    }
    const admin = await login("logistic", "admin");
    const s = seed(); s.containers[0].depo = "Depo Z";
    assert.strictEqual((await post(admin, s)).statusCode, 200);
    assert.strictEqual((await H.getData()).containers[0].depo, "Depo Z");
  });

  await test("admin save: rejects malformed data, wipes and script-like dates", async () => {
    await H.setData(seed());
    const admin = await login("logistic", "admin");
    let s = seed(); s.containers[0].dateEntered = '<img src=x onerror=alert(1)>';
    assert.strictEqual((await post(admin, s)).statusCode, 400);
    s = seed(); s.containers[1].id = "c1";
    assert.strictEqual((await post(admin, s)).statusCode, 400);
    s = seed(); s.containers = "nope";
    assert.strictEqual((await post(admin, s)).statusCode, 400);
    s = seed(); s.containers = []; s.bills = [];
    const w = await post(admin, s);
    assert.strictEqual(w.statusCode, 409, "empty payload must not wipe the data");
    assert.strictEqual((await H.getData()).containers.length, 4);
  });

  await test("admin save keeps unknown short fields, drops nested / oversized junk", async () => {
    const admin = await login("logistic", "admin");
    const s = seed(); s.containers[0].note = "keep me"; s.containers[0].evil = { a: 1 }; s.containers[0].__proto__x = 1;
    s.containers[1].big = "x".repeat(500);
    assert.strictEqual((await post(admin, s)).statusCode, 200);
    const d = await H.getData();
    assert.strictEqual(d.containers[0].note, "keep me");
    assert.ok(!("evil" in d.containers[0]) && !("big" in d.containers[1]));
  });

  await test("targeted actions: depot marks empty / transfers, chofe departs; roles cannot cross", async () => {
    await H.setData(seed());
    const depot = await login("depotnord", "depot"), chofe = await login("chofe", "chofe");

    assert.strictEqual((await chofe.call(act, { method: "POST", body: { action: "markEmpty", id: "c1" } })).statusCode, 403);
    assert.strictEqual((await depot.call(act, { method: "POST", body: { action: "depart", ids: ["c2"], trucking: "CFC" } })).statusCode, 403);
    assert.strictEqual((await depot.call(act, { method: "POST", body: { action: "hack" } })).statusCode, 400);
    assert.strictEqual((await depot.call(act, { method: "POST", body: { action: "__proto__" } })).statusCode, 400);

    const e = await depot.call(act, { method: "POST", body: { action: "markEmpty", id: "c1" } });
    assert.strictEqual(e.statusCode, 200);
    let d = await H.getData();
    assert.strictEqual(d.containers.find((c) => c.id === "c1").dateEmpty, today());
    assert.ok(d.notifications[0].message.includes("FULL0000001") && d.notifications[0].message.includes("Bill B-1"));
    assert.strictEqual((await depot.call(act, { method: "POST", body: { action: "markEmpty", id: "c1" } })).statusCode, 409, "already empty");
    assert.strictEqual((await depot.call(act, { method: "POST", body: { action: "markEmpty", id: "c3" } })).statusCode, 409, "not verified yet");

    const t = await depot.call(act, { method: "POST", body: { action: "transfer", id: "c1", depo: "Depo Nord", trucking: "MAD" } });
    assert.strictEqual(t.statusCode, 200);
    d = await H.getData();
    assert.deepStrictEqual([d.containers[0].depo, d.containers[0].trucking], ["Depo Nord", "MAD"]);
    assert.strictEqual((await depot.call(act, { method: "POST", body: { action: "transfer", id: "c1", depo: "" } })).statusCode, 400);
    assert.strictEqual((await depot.call(act, { method: "POST", body: { action: "transfer", id: "c4", depo: "X" } })).statusCode, 409, "already left");

    const dep = await chofe.call(act, { method: "POST", body: { action: "depart", ids: ["c1", "c2", "c3", "nope"], trucking: "CTSA" } });
    assert.strictEqual(dep.statusCode, 200);
    assert.strictEqual(dep.body.result.left, 2, "only the two Vid containers leave (c1 is now empty, c2 empty)");
    assert.ok(!JSON.stringify(dep.body.data).includes("POKO0000003"), "driver never receives non-Vid containers");
    d = await H.getData();
    assert.strictEqual(d.containers.find((c) => c.id === "c3").dateLeft, null);
    assert.strictEqual(d.containers.find((c) => c.id === "c2").dateLeft, today());
    assert.ok(d.bills.find((b) => b.id === "b1").completedAt, "bill B-1 completes when all its containers left");
    assert.ok(d.notifications.some((n) => n.message.includes("Bill B-1 fini")));
    assert.strictEqual((await chofe.call(act, { method: "POST", body: { action: "depart", ids: ["c2"], trucking: "CTSA" } })).statusCode, 409, "already left");
    assert.strictEqual((await chofe.call(act, { method: "POST", body: { action: "depart", ids: ["c2"], trucking: "<b>" } })).statusCode, 400);
  });

  await test("daily report: only daily/admin; verify touches only that container", async () => {
    await H.setData(seed());
    const dr = await login("logisticdepot", "daily"), depot = await login("depotnord", "depot"), chofe = await login("chofe", "chofe");
    assert.strictEqual((await depot.call(daily)).statusCode, 403);
    assert.strictEqual((await chofe.call(verify, { method: "POST", body: { id: "c3", depo: "X" } })).statusCode, 403);
    assert.strictEqual((await dr.call(daily, { method: "POST", body: { checks: { c1: today() }, overrides: { c1: { trucking: "DNK 007" } } } })).statusCode, 200);
    assert.deepStrictEqual((await dr.call(daily)).body.overrides.c1, { trucking: "DNK 007" });
    assert.strictEqual((await dr.call(verify, { method: "POST", body: { id: "c3" } })).statusCode, 400, "depo required");
    const v = await dr.call(verify, { method: "POST", body: { id: "c3", depo: "Depo Q", trucking: "DNK 003", date: today() } });
    assert.strictEqual(v.statusCode, 200);
    const d = await H.getData();
    assert.deepStrictEqual([d.containers[2].dateVerified, d.containers[2].depo, d.containers[2].trucking], [today(), "Depo Q", "DNK 003"]);
    assert.deepStrictEqual([d.containers[0].depo, d.containers[0].trucking, d.containers[0].dateVerified, d.containers[0].dateEmpty], ["Depo A", "CFC", "2026-09-10", null]);
    assert.deepStrictEqual(d.inventoryChecks, { c1: today() });
    assert.strictEqual((await dr.call(verify, { method: "POST", body: { id: "c4", depo: "X" } })).body.already, true, "already verified stays untouched");
  });

  await test("push: subscribing needs a session; only real push services are accepted; test is admin only", async () => {
    const depot = await login("depotnord", "depot"), admin = await login("logistic", "admin");
    const sub = (endpoint) => ({ action: "subscribe", deviceId: "d1", subscription: { endpoint, keys: { p256dh: "a", auth: "b" } } });
    assert.strictEqual((await depot.call(push, { method: "POST", body: sub("https://fcm.googleapis.com/fcm/send/abc") })).statusCode, 200);
    assert.strictEqual((await depot.call(push, { method: "POST", body: sub("https://internal.example.local/x") })).statusCode, 500, "arbitrary hosts (SSRF) refused");
    assert.strictEqual((await depot.call(push, { method: "POST", body: { action: "test" } })).statusCode, 403);
    assert.strictEqual((await admin.call(push, { method: "POST", body: { action: "test" } })).statusCode, 200);
  });

  await test("audit + backup are admin only and record what happened", async () => {
    await H.setData(seed());
    const admin = await login("logistic", "admin"), depot = await login("depotnord", "depot");
    await post(depot, seed());
    const s = seed(); s.containers[0].depo = "Depo Z";
    await post(admin, s);
    assert.strictEqual((await depot.call(audit)).statusCode, 403);
    assert.strictEqual((await depot.call(backup)).statusCode, 403);
    const a = (await admin.call(audit)).body.events.map((e) => e.ev);
    for (const ev of ["login_ok", "forbidden", "data_write"]) assert.ok(a.includes(ev), "audit missing " + ev + " in " + a);
    assert.ok(!JSON.stringify((await admin.call(audit)).body).includes(PW.admin), "no password in the audit log");
    const list = (await admin.call(backup)).body;
    assert.strictEqual(list.count, 1, "a snapshot of the previous data was kept");
    const dl = await admin.call(backup, { query: { i: "0" } });
    assert.strictEqual(dl.body.containers[0].depo, "Depo A", "snapshot holds the data from before the save");
  });

  await test("logout kills the session on the server (a stolen cookie stops working)", async () => {
    const b = await login("logistic", "admin");
    const stolen = "__Host-dl_sid=" + b.jar["__Host-dl_sid"];
    assert.strictEqual((await b.call(data, { headers: { cookie: stolen } })).statusCode, 200);
    assert.strictEqual((await b.call(logout, { method: "POST", body: {} })).statusCode, 200);
    assert.strictEqual((await H.browser().call(data, { headers: { cookie: stolen } })).statusCode, 401);
  });

  await test("sessions expire when idle, and admin sessions have a hard 24h limit", async () => {
    const b = await login("depotnord", "depot");
    H.advance(13 * 3600 * 1000);
    assert.strictEqual((await b.call(data)).statusCode, 401, "idle > 12h");
    const a = await login("logistic", "admin");
    for (let i = 0; i < 5; i++) { H.advance(5 * 3600 * 1000); await a.call(data); }
    H.advance(1 * 3600 * 1000);
    assert.strictEqual((await a.call(data)).statusCode, 401, "admin absolute limit 24h");
  });

  await test("changing AUTH_SESSION_EPOCH (or removing an account) logs everyone out", async () => {
    const b = await login("logistic", "admin");
    process.env.AUTH_SESSION_EPOCH = "2";
    assert.strictEqual((await b.call(data)).statusCode, 401);
    delete process.env.AUTH_SESSION_EPOCH;
    const c = await login("depotnord", "depot");
    const saved = process.env.AUTH_DEPOT_PASS; delete process.env.AUTH_DEPOT_PASS;
    assert.strictEqual((await c.call(data)).statusCode, 401);
    process.env.AUTH_DEPOT_PASS = saved;
  });

  await test("state-changing requests from another origin are refused even with a valid cookie", async () => {
    const b = await login("logistic", "admin");
    const r = await post(b, seed(), { headers: { origin: "https://evil.example" } });
    assert.strictEqual(r.statusCode, 403);
    const r2 = await post(b, seed(), { headers: { origin: null, "sec-fetch-site": "cross-site" } });
    assert.strictEqual(r2.statusCode, 403);
  });

  await test("write rate limit protects an authenticated session", async () => {
    await H.setData(seed());
    const b = await login("logistic", "admin");
    let last = 0;
    for (let i = 0; i < 125; i++) last = (await post(b, seed())).statusCode;
    assert.strictEqual(last, 429);
  });

  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  PASS  " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n        " + (r[2] && r[2].stack ? r[2].stack.split("\n").slice(0, 3).join("\n        ") : r[2]))));
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed");
  H.restoreClock();
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
