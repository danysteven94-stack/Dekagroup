"use strict";
// Tests of the relational storage layer (SQLite stands in for PostgreSQL).  Run:  node tests/db.test.js
process.env.TEST_BACKEND = "pg";
const assert = require("assert");
const H = require("./helpers");
const DB = H.api("_lib/db");
const repo = H.api("_lib/repo");
const pg = H.api("_lib/pgrepo");
const S = H.api("_lib/store");
const { ApiError } = H.api("_lib/errors");
const { makeSqliteDriver } = require("./sqlite-driver");

const results = [];
async function test(name, fn) {
  try { H.reset(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); }
}
const today = () => new Date().toISOString().slice(0, 10);
const cont = (id, extra) => Object.assign({ id, numewo: "NUM" + id, billId: "b1", size: "20", division: "ACS", dateEntered: "2026-09-01", dateExpected: null, dateVerified: "2026-09-02", depo: "Depo " + id, trucking: "CFC", dateEmpty: null, dateLeft: null }, extra || {});
const seed = () => ({
  containers: [cont("c1"), cont("c2"), cont("c3"), cont("c4", { dateEmpty: "2026-09-10" })],
  bills: [{ id: "b1", numewo: "B-1", product: "Diri", completedAt: null }],
  notifications: [{ id: "n2", billNumewo: "B-1", date: "2026-09-02", message: "second" }, { id: "n1", billNumewo: "", date: "2026-09-01", message: "first" }],
  inventoryChecks: { c1: today() },
});

// a "browser tab": remembers the last snapshot it loaded, edits it locally, saves with rev + cid
function tab(cid) {
  const t = { cid, view: null, rev: null };
  t.load = async () => { const r = await repo.readAll(); t.view = JSON.parse(JSON.stringify(r.view)); t.rev = r.rev; return t; };
  t.save = async () => {
    const clean = S.sanitizeState(t.view);
    const out = await repo.writeClient(clean, { baseRev: t.rev, cid });
    // like the app: adopt the new fingerprints of what was saved
    ["containers", "bills"].forEach((k) => t.view[k].forEach((r) => { if (out.hashes && out.hashes[k][r.id]) r._h = out.hashes[k][r.id]; }));
    return out;
  };
  t.find = (id) => t.view.containers.find((c) => c.id === id);
  return t;
}
const conflictOf = async (fn) => { try { await fn(); } catch (e) { if (e instanceof ApiError) return e; throw e; } return null; };

(async () => {
  await test("schema is created by itself and the Redis data is imported once (Redis copy stays untouched)", async () => {
    await H.redis.set("deka-log-data", { containers: [cont("c1", { note: "legacy field" })], bills: seed().bills, notifications: seed().notifications, inventoryChecks: seed().inventoryChecks });
    const [a, b] = await Promise.all([repo.readAll(), repo.readAll()]); // two cold requests at the same time
    assert.strictEqual(a.blob.containers.length, 1);
    assert.strictEqual(b.blob.containers.length, 1);
    assert.strictEqual(a.blob.containers[0].note, "legacy field", "unknown legacy fields survive");
    assert.deepStrictEqual(a.blob.notifications.map((n) => n.id), ["n2", "n1"], "notification order kept");
    assert.strictEqual(a.rev, 1);
    const h = await repo.health();
    assert.deepStrictEqual([h.backend, h.ok, h.migrated, h.containers, h.bills], ["postgres", true, true, 1, 1]);
    assert.ok((await H.redis.get("deka-log-data")).containers.length === 1, "legacy copy kept as a safety net");
    DB.setDriver(DB.getDriver()); // same driver again: nothing is imported twice
    await repo.readAll();
    assert.strictEqual((await repo.readAll()).rev, 1);
  });

  await test("fresh install (nothing in Redis) starts empty and healthy", async () => {
    const r = await repo.readAll();
    assert.deepStrictEqual([r.blob.containers.length, r.blob.bills.length, r.rev], [0, 0, 1]);
  });

  await test("a row you did not touch is never overwritten by a stale screen (the classic lost update)", async () => {
    await H.setData(seed());
    const A = await tab("tabA0001").load(), B = await tab("tabB0001").load();
    A.find("c1").depo = "Depo NEW"; await A.save();
    // B never touched anything; it just re-saves its stale copy (e.g. after marking something else)
    B.find("c2").depo = "B edit c2"; await B.save();
    const d = await H.getData();
    assert.strictEqual(d.containers.find((c) => c.id === "c1").depo, "Depo NEW", "A's change survived B's stale save");
    assert.strictEqual(d.containers.find((c) => c.id === "c2").depo, "B edit c2", "B's own change was saved");
  });

  await test("two people editing the SAME row: the second is refused, nothing of its request is applied", async () => {
    await H.setData(seed());
    const A = await tab("tabA0002").load(), B = await tab("tabB0002").load();
    A.find("c1").depo = "A depo"; await A.save();
    B.find("c1").depo = "B depo"; B.find("c3").depo = "B also c3"; // c3 is fine on its own
    const err = await conflictOf(() => B.save());
    assert.ok(err && err.status === 409 && err.code === "conflict", "conflict reported");
    assert.ok(err.message.includes("NUMc1"));
    const d = await H.getData();
    assert.strictEqual(d.containers.find((c) => c.id === "c1").depo, "A depo");
    assert.strictEqual(d.containers.find((c) => c.id === "c3").depo, "Depo c3", "all-or-nothing: c3 edit not applied either");
    await B.load(); B.find("c1").depo = "B retry"; await B.save(); // after refreshing, B can go on
    assert.strictEqual((await H.getData()).containers.find((c) => c.id === "c1").depo, "B retry");
  });

  await test("new rows and deletions: a stale screen cannot delete what it never saw, and cannot resurrect deleted rows", async () => {
    await H.setData(seed());
    const A = await tab("tabA0003").load(), B = await tab("tabB0003").load();
    A.view.containers.unshift(Object.assign(cont("c9"), { numewo: "NEWBYA" })); await A.save(); // A adds c9
    B.view.containers = B.view.containers.filter((c) => c.id !== "c3"); await B.save(); // B (stale, has no c9) deletes c3
    let d = await H.getData();
    assert.ok(d.containers.some((c) => c.id === "c9"), "c9 (created by A after B's snapshot) was NOT deleted by B");
    assert.ok(!d.containers.some((c) => c.id === "c3"), "c3 deleted as B asked");
    assert.strictEqual(d.containers[0].id, "c9", "newest first");
    // A (stale about c3's deletion) carries c3 unchanged: it must not come back
    await A.save();
    d = await H.getData();
    assert.ok(!d.containers.some((c) => c.id === "c3"), "deleted row not resurrected");
    // A edits the deleted row -> conflict
    A.find("c3").depo = "zombie";
    const err = await conflictOf(() => A.save());
    assert.ok(err && err.code === "conflict");
  });

  await test("one tab saving twice in a row (before it refreshed) never conflicts with itself", async () => {
    await H.setData(seed());
    const A = await tab("tabA0004").load();
    A.find("c1").depo = "one"; await A.save();
    A.find("c1").depo = "two"; await A.save();
    A.find("c1").depo = "three"; A.find("c2").depo = "x"; await A.save();
    const d = await H.getData();
    assert.deepStrictEqual([d.containers.find((c) => c.id === "c1").depo, d.containers.find((c) => c.id === "c2").depo], ["three", "x"]);
  });

  await test("an old browser (no revision) is refused with a clear code; an empty payload cannot wipe the data", async () => {
    await H.setData(seed());
    const A = await tab("tabA0005").load();
    let err = await conflictOf(() => repo.writeClient(S.sanitizeState(A.view), { baseRev: null, cid: "x" }));
    assert.strictEqual(err.code, "stale_client");
    err = await conflictOf(() => repo.writeClient(S.sanitizeState({ containers: [], bills: [], notifications: [], inventoryChecks: {} }), { baseRev: A.rev, cid: "x" }));
    assert.strictEqual(err.code, "empty_payload");
    assert.strictEqual((await H.getData()).containers.length, 4);
  });

  await test("server-side actions run one at a time: simultaneous requests all land", async () => {
    await H.setData(seed());
    const fns = ["c1", "c2", "c3"].map((id) => () => repo.mutate(async (data) => {
      const c = data.containers.find((x) => x.id === id);
      await new Promise((r) => setTimeout(r, 5)); // widen the race window
      c.dateEmpty = "2026-09-20";
    }, { cid: "srv" }));
    await Promise.all(fns.map((f) => f()));
    const d = await H.getData();
    assert.deepStrictEqual(["c1", "c2", "c3"].map((id) => d.containers.find((c) => c.id === id).dateEmpty), ["2026-09-20", "2026-09-20", "2026-09-20"]);
    assert.strictEqual((await repo.readAll()).rev, 1 + 1 + 3, "one revision per real write (import + test load + 3 actions)");
  });

  await test("an action that changes nothing does not create a revision", async () => {
    await H.setData(seed());
    const before = (await repo.readAll()).rev;
    const out = await repo.mutate(async () => "nothing", { cid: "srv" });
    assert.strictEqual(out.changed, false);
    assert.strictEqual((await repo.readAll()).rev, before);
  });

  await test("a failing action rolls everything back", async () => {
    await H.setData(seed());
    const before = await H.getData();
    await assert.rejects(() => repo.mutate(async (data) => { data.containers[0].depo = "half done"; throw new Error("boom"); }, { cid: "srv" }));
    assert.deepStrictEqual(await H.getData(), before);
  });

  await test("notifications: newest first, capped at 200, a stale tab cannot delete newer ones", async () => {
    await H.setData(seed());
    const A = await tab("tabA0006").load(), B = await tab("tabB0006").load();
    A.view.notifications.unshift({ id: "nA", billNumewo: "", date: today(), message: "from A" }); await A.save();
    B.view.containers[0].depo = "touch"; await B.save(); // B's copy has no nA
    let d = await H.getData();
    assert.deepStrictEqual(d.notifications.map((n) => n.id), ["nA", "n2", "n1"], "nA kept, order kept");
    for (let i = 0; i < 205; i++) A.view.notifications.unshift({ id: "x" + i, billNumewo: "", date: today(), message: "m" + i });
    A.view.notifications = A.view.notifications.slice(0, 200); await A.save();
    d = await H.getData();
    assert.strictEqual(d.notifications.length, 200);
    assert.strictEqual(d.notifications[0].id, "x204", "newest first");
  });

  await test("inventory checks: kept for today, old ones dropped, a newer value from someone else wins over a stale one", async () => {
    await H.setData(seed());
    const A = await tab("tabA0007").load(), B = await tab("tabB0007").load();
    A.view.inventoryChecks = { c1: today(), c2: today() }; await A.save();
    B.view.inventoryChecks = { c1: today() }; B.view.containers[1].depo = "b edit"; await B.save(); // stale: does not know c2
    const d = await H.getData();
    assert.deepStrictEqual(Object.keys(d.inventoryChecks).sort(), ["c1", "c2"], "c2 (added by A) not removed by B");
    A.view.inventoryChecks.old = "2020-01-01"; await A.save();
    assert.ok(!("old" in (await H.getData()).inventoryChecks), "old checks pruned");
  });

  await test("fingerprints: a row served to the browser and sent back unchanged is recognised as untouched", async () => {
    await H.setData(seed());
    const r = await repo.readAll();
    const clean = S.sanitizeState(JSON.parse(JSON.stringify(r.view)));
    clean.containers.forEach((c) => assert.strictEqual(c._h, pg.rowHash(c), "sanitize keeps the row identical: " + c.id));
  });

  await test("data written through the relational layer keeps unknown short fields and drops junk", async () => {
    await H.setData(seed());
    const A = await tab("tabA0008").load();
    A.find("c1").note = "hello"; A.find("c1").nested = { a: 1 }; A.find("c2").big = "x".repeat(500);
    await A.save();
    const d = await H.getData();
    assert.strictEqual(d.containers.find((c) => c.id === "c1").note, "hello");
    assert.ok(!("nested" in d.containers.find((c) => c.id === "c1")) && !("big" in d.containers.find((c) => c.id === "c2")));
  });

  await test("sizes: hundreds of rows import and read back in the same order", async () => {
    const big = { containers: [], bills: [{ id: "b1", numewo: "B-1", product: "Diri", completedAt: null }], notifications: [], inventoryChecks: {} };
    for (let i = 0; i < 1500; i++) big.containers.push(cont("k" + i));
    await H.setData(big);
    const d = await H.getData();
    assert.strictEqual(d.containers.length, 1500);
    assert.deepStrictEqual(d.containers.slice(0, 3).map((c) => c.id), ["k0", "k1", "k2"]);
  });

  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  PASS  " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n        " + (r[2] && r[2].stack ? r[2].stack.split("\n").slice(0, 5).join("\n        ") : r[2]))));
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed");
  H.restoreClock();
  process.exit(failed.length ? 1 : 0);
})();
