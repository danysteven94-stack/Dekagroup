"use strict";
// Pointeur role: attached to a depot account, starts unloading ("debarquement") a Full container, then empties it.
//   node tests/pointeur.test.js            (Redis)      TEST_BACKEND=pg node tests/pointeur.test.js   (SQL)
const assert = require("assert");
const H = require("./helpers");

const results = [];
async function test(name, fn) {
  try { H.reset(); H.env(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); }
}
const LEGACY = { admin: "Adm1n-Strong-Pass", depot: "Dep0t-Strong-Pass", daily: "Da1ly-Strong-Pass", chofe: "Chof3-Strong-Pass" };
H.env = () => {
  process.env.AUTH_ADMIN_PASS = LEGACY.admin; process.env.AUTH_DEPOT_PASS = LEGACY.depot;
  process.env.AUTH_DAILY_PASS = LEGACY.daily; process.env.AUTH_CHOFE_PASS = LEGACY.chofe;
  process.env.APP_SECRET = "unit-test-app-secret-0123456789abcdef";
  delete process.env.AUTH_LEGACY_DISABLED; delete process.env.AUTH_SESSION_EPOCH; delete process.env.PRINCIPAL_USERNAME;
};
const A = () => ({ login: H.api("auth/login"), password: H.api("auth/password"), users: H.api("users"), data: H.api("data"), act: H.api("act"), history: H.api("history") });
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
  r = await post(b, A().password, { current: created.body.tempPassword, next: "Pointeur-Strong-Pass-9" });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return b;
}
const full = (id, num, division) => ({ id, numewo: num, billId: null, size: "40", division, dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "D", trucking: "CFC", dateEmpty: null, dateLeft: null });

(async () => {
  await test("a pointeur must belong to an active depot account and inherits its divisions", async () => {
    const admin = await legacyAdmin();
    const bad = (body) => post(admin, A().users, Object.assign({ action: "create" }, body));
    assert.strictEqual((await bad({ username: "poin.un", role: "pointeur", name: "Poin Un" })).statusCode, 400, "depot account required");
    assert.strictEqual((await bad({ username: "poin.un", role: "pointeur", name: "Poin Un", depotOf: "nobody" })).statusCode, 400);
    await onboard(admin, { username: "depo.marie", role: "depot", name: "Marie Depo", divisions: ["DEKAV"] }, "198.51.100.30");
    const r = await bad({ username: "poin.un", role: "pointeur", name: "Poin Un", depotOf: "depo.marie", divisions: ["ACS"] });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.user.depotOf, "depo.marie");
    assert.ok(r.body.user.divisions.indexOf("DEKAV") !== -1 && r.body.user.divisions.indexOf("ACS") === -1, "divisions come from the depot account, not from the form");
    // the depot account cannot stop being a depot while it has pointeurs
    assert.strictEqual((await post(admin, A().users, { action: "set_role", username: "depo.marie", role: "daily" })).statusCode, 409);
    // a pointeur's divisions cannot be edited directly
    assert.strictEqual((await post(admin, A().users, { action: "set_divisions", username: "poin.un", divisions: ["ACS"] })).statusCode, 400);
    // but they follow the depot account
    assert.strictEqual((await post(admin, A().users, { action: "set_divisions", username: "depo.marie", divisions: ["CONFIDEKA"] })).statusCode, 200);
    const list = (await admin.call(A().users)).body.users;
    assert.ok(list.find((u) => u.username === "poin.un").divisions.indexOf("CONFIDEKA") !== -1);
  });

  await test("debarquement: shows up for the admin at once, stamps the pointeur's name, only he can empty it, history names him", async () => {
    const admin = await legacyAdmin();
    await onboard(admin, { username: "depo.marie", role: "depot", name: "Marie Depo", divisions: ["DEKAV"] }, "198.51.100.31");
    const p1 = await onboard(admin, { username: "poin.un", role: "pointeur", name: "Jean Pointeur", depotOf: "depo.marie" }, "198.51.100.32");
    const p2 = await onboard(admin, { username: "poin.de", role: "pointeur", name: "Paul Pointeur", depotOf: "depo.marie" }, "198.51.100.33");
    await H.setData({ containers: [
      full("f1", "FULL0000001", "DEKAV"), full("f2", "FULL0000002", "DEKAV"), full("f3", "FULL0000003", "ACS"),
      Object.assign(full("v1", "VIDE0000001", "DEKAV"), { dateEmpty: "2026-09-10" }),
    ], bills: [], notifications: [], inventoryChecks: {} });
    const act = (b, body) => b.call(A().act, { method: "POST", body });

    // a pointeur sees only Full containers of his depot account's divisions
    const view = await p1.call(A().data);
    assert.deepStrictEqual(view.body.containers.map((c) => c.id).sort(), ["f1", "f2"]);

    // cannot empty before the debarquement; cannot touch another division, an empty container, or use someone else's role
    assert.strictEqual((await act(p1, { action: "markEmpty", id: "f1" })).statusCode, 409);
    assert.strictEqual((await act(p1, { action: "debarq", id: "f3" })).statusCode, 403);
    assert.strictEqual((await act(p1, { action: "debarq", id: "v1" })).statusCode, 409);
    assert.strictEqual((await act(p1, { action: "debarq", id: "nope" })).statusCode, 404);
    assert.strictEqual((await act(p1, { action: "transfer", id: "f1", depo: "X" })).statusCode, 403);

    let r = await act(p1, { action: "debarq", id: "f1" });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    let d = await H.getData();
    let c = d.containers.find((x) => x.id === "f1");
    assert.ok(c.dateDebarq && c.debarqBy === "poin.un" && c.debarqName === "Jean Pointeur");
    assert.ok(d.notifications[0].message.includes("FULL0000001") && d.notifications[0].message.includes("Jean Pointeur") && d.notifications[0].message.includes("Marie Depo"));
    // still Full for everybody (it is not empty yet)
    assert.strictEqual(require("../api/_lib/store").statusOf(c), "full");
    assert.ok(require("../api/_lib/store").isUnloading(c));

    // the administrator sees it (stamp included) right away
    const adminView = await admin.call(A().data);
    assert.strictEqual(adminView.body.containers.find((x) => x.id === "f1").debarqName, "Jean Pointeur");

    // doing it twice is harmless; another pointeur cannot take it, undo it or empty it
    assert.strictEqual((await act(p1, { action: "debarq", id: "f1" })).statusCode, 200);
    assert.strictEqual((await act(p2, { action: "debarq", id: "f1" })).statusCode, 409);
    assert.strictEqual((await act(p2, { action: "undoDebarq", id: "f1" })).statusCode, 403);
    assert.strictEqual((await act(p2, { action: "markEmpty", id: "f1" })).statusCode, 403);

    // he can undo a mistake: everything stamped is cleared
    assert.strictEqual((await act(p1, { action: "undoDebarq", id: "f2" })).statusCode, 200, "nothing to undo is fine");
    assert.strictEqual((await act(p1, { action: "debarq", id: "f2" })).statusCode, 200);
    assert.strictEqual((await act(p1, { action: "undoDebarq", id: "f2" })).statusCode, 200);
    c = (await H.getData()).containers.find((x) => x.id === "f2");
    assert.ok(!c.dateDebarq && !c.debarqBy && !c.debarqName);

    // he empties it: his name stays on the container and goes on the notification
    r = await act(p1, { action: "markEmpty", id: "f1" });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    d = await H.getData();
    c = d.containers.find((x) => x.id === "f1");
    assert.ok(c.dateEmpty && c.debarqName === "Jean Pointeur");
    assert.ok(d.notifications[0].message.includes("vid") && d.notifications[0].message.includes("Jean Pointeur"));

    // history (admin only): who unloaded it, then who emptied it
    const hist = await admin.call(A().history, { query: { id: "f1" }, url: "/api/history?id=f1" });
    assert.strictEqual(hist.statusCode, 200, JSON.stringify(hist.body));
    const ev = hist.body.events;
    const debarq = ev.find((e) => e.kind === "debarq");
    const empty = ev.find((e) => e.kind === "empty");
    assert.ok(debarq && debarq.actor === "poin.un" && debarq.actorName === "Jean Pointeur" && debarq.role === "pointeur" && debarq.info === "Jean Pointeur");
    assert.ok(empty && empty.actor === "poin.un" && empty.info.includes("Pointeur: Jean Pointeur"));
    assert.strictEqual((await p1.call(A().history, { query: { id: "f1" }, url: "/api/history?id=f1" })).statusCode, 403, "a pointeur cannot read the history");
  });

  await test("the depot account can still empty a container a pointeur unloaded; the history keeps the pointeur's name", async () => {
    const admin = await legacyAdmin();
    const depot = await onboard(admin, { username: "depo.marie", role: "depot", name: "Marie Depo", divisions: ["DEKAV"] }, "198.51.100.34");
    const p1 = await onboard(admin, { username: "poin.un", role: "pointeur", name: "Jean Pointeur", depotOf: "depo.marie" }, "198.51.100.35");
    await H.setData({ containers: [full("f1", "FULL0000001", "DEKAV")], bills: [], notifications: [], inventoryChecks: {} });
    assert.strictEqual((await p1.call(A().act, { method: "POST", body: { action: "debarq", id: "f1" } })).statusCode, 200);
    assert.strictEqual((await depot.call(A().act, { method: "POST", body: { action: "markEmpty", id: "f1" } })).statusCode, 200);
    const hist = await admin.call(A().history, { query: { id: "f1" }, url: "/api/history?id=f1" });
    const empty = hist.body.events.find((e) => e.kind === "empty");
    assert.ok(empty.actor === "depo.marie" && empty.info.includes("Pointeur: Jean Pointeur"));
  });

  await test("a pointeur cannot save the whole data set and a normal depot account cannot start a debarquement", async () => {
    const admin = await legacyAdmin();
    const depot = await onboard(admin, { username: "depo.marie", role: "depot", name: "Marie Depo", divisions: ["DEKAV"] }, "198.51.100.36");
    const p1 = await onboard(admin, { username: "poin.un", role: "pointeur", name: "Jean Pointeur", depotOf: "depo.marie" }, "198.51.100.37");
    await H.setData({ containers: [full("f1", "FULL0000001", "DEKAV")], bills: [], notifications: [], inventoryChecks: {} });
    assert.strictEqual((await p1.call(A().data, { method: "POST", body: { containers: [], bills: [], notifications: [], inventoryChecks: {} } })).statusCode, 403);
    assert.strictEqual((await depot.call(A().act, { method: "POST", body: { action: "debarq", id: "f1" } })).statusCode, 403);
    // the stamp survives the administrator saving the whole data set (the admin screen sends every field back)
    await p1.call(A().act, { method: "POST", body: { action: "debarq", id: "f1" } });
    const cur = (await admin.call(A().data)).body;
    const save = await admin.call(A().data, { method: "POST", body: { containers: cur.containers, bills: cur.bills, notifications: cur.notifications, inventoryChecks: cur.inventoryChecks, rev: cur.rev } });
    assert.strictEqual(save.statusCode, 200, JSON.stringify(save.body));
    assert.strictEqual((await H.getData()).containers[0].debarqName, "Jean Pointeur");
  });

  let bad = 0;
  results.forEach(([ok, name, e]) => { console.log((ok ? "  PASS  " : "  FAIL  ") + name); if (!ok) { bad++; console.log("        " + (e && e.stack || e)); } });
  console.log("\n" + (results.length - bad) + "/" + results.length + " passed");
  process.exit(bad ? 1 : 0);
})();
