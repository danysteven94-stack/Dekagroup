// Browser-side logic of offline work: outbox order and failure handling, and the merge after a conflict.
// Run with:  node --no-warnings tests/offline.client.test.mjs
import assert from "assert";

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.window = { addEventListener() {} };
let script = [];
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null, key: opts && opts.headers && opts.headers["X-Idempotency-Key"] });
  const next = script.shift() || { status: 200, body: { ok: true } };
  if (next.network) throw new TypeError("Failed to fetch");
  return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body || {} };
};

const O = await import("../public/js/outbox.js");
const DB = await import("../public/js/offlinedb.js");
const { state } = await import("../public/js/state.js");

const results = [];
async function test(name, fn) {
  try {
    DB._reset(); calls.length = 0; script = [];
    state.username = "logistic"; state.pool = "default"; state.pendingCount = 0; state.rejectedCount = 0;
    await fn(); results.push([true, name]);
  } catch (e) { results.push([false, name, e]); }
}

await test("requests are sent oldest first and removed once sent", async () => {
  await O.enqueue("act", "/api/act", { n: 1 }, "un");
  await O.enqueue("stock", "/api/stock", { n: 2 }, "de");
  assert.strictEqual(state.pendingCount, 2);
  const r = await O.flush();
  assert.deepStrictEqual(calls.map((c) => c.body.n), [1, 2]);
  assert.strictEqual(r.sent, 2);
  assert.strictEqual(state.pendingCount, 0);
  assert.ok(calls.every((c) => c.key), "each request carries its own key");
});

await test("a network failure stops the sending and keeps everything", async () => {
  await O.enqueue("act", "/api/act", { n: 1 }, "un");
  await O.enqueue("act", "/api/act", { n: 2 }, "de");
  script = [{ network: true }];
  const r = await O.flush();
  assert.strictEqual(r.stop, "network");
  assert.strictEqual(state.pendingCount, 2);
  assert.strictEqual(calls.length, 1, "does not go on after a failure (order matters)");
});

await test("session ended (401): everything is kept for after the next login", async () => {
  await O.enqueue("act", "/api/act", { n: 1 }, "un");
  script = [{ status: 401, body: { error: "x" } }];
  const r = await O.flush();
  assert.strictEqual(r.stop, "auth");
  assert.strictEqual(state.pendingCount, 1);
  assert.strictEqual((await O.rejectedList()).length, 0);
});

await test("server error (5xx): kept and retried later", async () => {
  await O.enqueue("act", "/api/act", { n: 1 }, "un");
  script = [{ status: 503, body: {} }];
  const r = await O.flush();
  assert.strictEqual(r.stop, "server");
  assert.strictEqual(state.pendingCount, 1);
});

await test("a refusal (4xx) goes to the visible list, and the rest continues", async () => {
  await O.enqueue("stock", "/api/stock", { n: 1 }, "Antre estòk: Diri");
  await O.enqueue("act", "/api/act", { n: 2 }, "suivant");
  script = [{ status: 400, body: { error: "Kantite a dwe yon nonm ki pi gran pase 0." } }, { status: 200, body: {} }];
  const r = await O.flush();
  assert.strictEqual(r.rejected, 1);
  assert.strictEqual(r.sent, 1);
  assert.strictEqual(state.pendingCount, 0);
  const list = await O.rejectedList();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].label, "Antre estòk: Diri");
  assert.ok(list[0].error.includes("Kantite"));
});

await test("an action already applied before the connection dropped is not reported as an error", async () => {
  await O.enqueue("act", "/api/act", { n: 1 }, "un", { maybeDone: true });
  script = [{ status: 409, body: { code: "wrong_status", error: "deja fè" } }];
  const r = await O.flush();
  assert.strictEqual(r.rejected, 0);
  assert.strictEqual(state.pendingCount, 0);
});

await test("work of one person is not sent under another login", async () => {
  await O.enqueue("act", "/api/act", { n: 1 }, "un");
  state.username = "depotnord";
  const r = await O.flush();
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(r.sent, 0);
  state.username = "logistic";
  assert.strictEqual(await O.countPending(), 1);
});

await test("work of one division is not sent into another", async () => {
  await O.enqueue("act", "/api/act", { n: 1 }, "un");
  state.pool = "acs";
  await O.flush();
  assert.strictEqual(calls.length, 0);
});

await test("merge: keeps my changes, takes the server's other changes, and the server's copy on conflict", async () => {
  const base = O.makeBase({ containers: [{ id: "a", v: 1 }, { id: "b", v: 1 }, { id: "c", v: 1 }, { id: "d", v: 1 }], bills: [], inventoryChecks: {} });
  const local = { containers: [{ id: "a", v: 2 }, { id: "b", v: 1 }, { id: "c", v: 1 }, { id: "n", v: 1 }], bills: [], notifications: [{ id: "m1" }], inventoryChecks: {} };
  // I edited a and c, deleted d, added n. Server: somebody else edited a (conflict) and b, and added e.
  const fresh = { containers: [{ id: "a", v: 9 }, { id: "b", v: 5 }, { id: "c", v: 1 }, { id: "d", v: 1 }, { id: "e", v: 1 }], bills: [], notifications: [{ id: "s1" }], inventoryChecks: {}, rev: 42 };
  local.containers[2] = { id: "c", v: 7 };
  const m = O.mergeState(local, base, fresh, ["a"]);
  const by = Object.fromEntries(m.containers.map((x) => [x.id, x.v]));
  assert.strictEqual(by.a, 9, "conflict: server copy wins");
  assert.strictEqual(by.b, 5, "not touched by me: server copy");
  assert.strictEqual(by.c, 7, "edited by me only: my copy");
  assert.strictEqual(by.e, 1, "added by somebody else: kept");
  assert.strictEqual(by.n, 1, "added by me: kept");
  assert.ok(!("d" in by), "deleted by me: stays deleted");
  assert.strictEqual(m.rev, 42);
  assert.deepStrictEqual(m.notifications.map((x) => x.id).sort(), ["m1", "s1"]);
});

await test("recovery copy and snapshot are stored per person and division", async () => {
  state.containers = [{ id: "z" }]; state.bills = []; state.notifications = []; state.inventoryChecks = {};
  await O.saveSnapshot();
  assert.strictEqual((await O.loadSnapshot()).containers[0].id, "z");
  state.username = "depotnord";
  assert.strictEqual(await O.loadSnapshot(), null, "another login sees nothing");
});

let fail = 0;
results.forEach((r) => { if (r[0]) console.log("  ok    " + r[1]); else { fail++; console.log("  FAIL  " + r[1] + "\n        " + (r[2] && r[2].stack || r[2])); } });
console.log(results.length - fail + "/" + results.length + " passed");
process.exit(fail ? 1 : 0);
