"use strict";
// End-to-end check of the browser app against the REAL API handlers (fake DOM, in-memory Redis).
//   node tests/client.e2e.js
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");
const H = require("./helpers");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const main = scripts.reduce((a, b) => (b.length > a.length ? b : a), "");

const PW = { admin: "Adm1n-Strong-Pass", depot: "Dep0t-Strong-Pass", daily: "Da1ly-Strong-Pass", chofe: "Chof3-Strong-Pass" };
process.env.AUTH_ADMIN_PASS = PW.admin;
process.env.AUTH_DEPOT_PASS = PW.depot;
process.env.AUTH_DAILY_PASS = PW.daily;
process.env.AUTH_CHOFE_PASS = PW.chofe;

const routes = {
  "/api/auth/login": "auth/login", "/api/auth/me": "auth/me", "/api/auth/logout": "auth/logout",
  "/api/data": "data", "/api/audit": "audit", "/api/backup": "backup", "/api/act": "act", "/api/daily": "daily", "/api/verify": "verify", "/api/push": "push",
};
const today = () => new Date().toISOString().slice(0, 10);
const seed = () => ({
  containers: [
    { id: "c1", numewo: "FULL0000001", billId: "b1", size: "40", division: "ACS", dateEntered: "2026-09-10", dateVerified: "2026-09-10", depo: "Depo A", trucking: "CFC", dateEmpty: null, dateLeft: null },
    { id: "c2", numewo: "VIDD0000002", billId: "b1", size: "20", division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "Depo B", trucking: "MAD", dateEmpty: "2026-09-15", dateLeft: null },
    { id: "c3", numewo: "POKO0000003", billId: "b2", size: "20", division: "DEKAV", dateEntered: "2026-09-18", dateVerified: null, depo: null, trucking: null, dateEmpty: null, dateLeft: null },
  ],
  bills: [{ id: "b1", numewo: "B-1", product: "Diri", completedAt: null }, { id: "b2", numewo: "B-2", product: "Sik", completedAt: null }],
  notifications: [], inventoryChecks: {},
});

// One "page load" in a browser that shares cookies with previous loads.
function openPage(b) {
  const handlers = {};
  const els = {};
  const root = { innerHTML: "" };
  const calls = [];
  const ctx = {
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Date, Math, JSON, Object, Array, String, Number, Promise, RegExp, Error, Uint8Array, URL,
    navigator: {}, location: { search: "", host: H.HOST }, confirm: () => true,
    localStorage: (() => { const s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; }, dump: s }; })(),
    fetch: async (u, o) => {
      const p = String(u).split("?")[0];
      const name = routes[p];
      calls.push((o && o.method) || "GET " + p);
      if (!name) return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
      let body;
      if (o && o.body) { try { body = JSON.parse(o.body); } catch (e) { body = o.body; } }
      const res = await b.call(H.api(name), { method: (o && o.method) || "GET", url: p, body, headers: Object.assign({}, o && o.headers) });
      return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, statusText: "", json: async () => res.body, text: async () => JSON.stringify(res.body) };
    },
  };
  ctx.window = ctx;
  ctx.document = {
    getElementById: (id) => (id === "root" ? root : id === "app-favicon" ? {} : els[id] || null),
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); },
    querySelector: () => ({ focus() {} }), activeElement: null, body: { appendChild() {}, removeChild() {} },
    createElement: () => ({ click() {} }), documentElement: {},
  };
  vm.createContext(ctx);
  vm.runInContext(main, ctx);
  const page = {
    root, els, ctx,
    async settle() { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 15)); },
    fire(type, ev) { (handlers[type] || []).forEach((f) => f(ev)); },
    click(attrs) { this.fire("click", { target: { closest: () => ({ getAttribute: (k) => attrs[k] }) } }); },
    change(props) { this.fire("change", { target: Object.assign({ classList: { contains: () => false }, getAttribute: () => null }, props) }); },
    async login(user, pw, role) {
      els["gate-user"] = { value: user }; els["gate-pw"] = { value: pw };
      this.fire("submit", { target: { id: "gate-form" }, preventDefault() {} });
      await this.settle();
    },
    has(t) { return root.innerHTML.includes(t); },
  };
  return page;
}

const results = [];
async function test(name, fn) {
  try { H.reset(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); }
}

(async () => {
  await test("no password or credential constants are left in the page code", async () => {
    for (const bad of ["1201", "0102", "1221", "depotnord", "logisticdepot", '"logistic"']) assert.ok(!html.includes(bad), "page still contains " + bad);
    assert.ok(!/localStorage[^;]*unlocked/i.test(main.replace(/Jt\(wt\)|Jt\(Tt\)|Jt\(DRK\)/g, "")), "no unlocked flag in localStorage");
  });

  await test("fresh visitor: only the role chooser, no data is requested before login", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); const pg = openPage(b); await pg.settle();
    assert.ok(pg.has('id="gate-form"') && !pg.has("choose-role"), "one single login page, no role buttons");
    assert.ok(!pg.has("FULL0000001"));
  });

  await test("wrong password shows the server message; nothing unlocks", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); const pg = openPage(b); await pg.settle();
    await pg.login("logistic", "wrong", "admin");
    await new Promise((r) => setTimeout(r, 450)); // the server slows wrong answers down on purpose
    assert.ok(pg.has("gate-err"), "error shown"); assert.ok(pg.has('id="gate-form"'), "still on the gate");
    assert.ok(pg.has('value="logistic"'), "username kept");
    assert.ok(!pg.has("FULL0000001"));
  });

  await test("admin: login, data loads, a change is saved on the server, page reload stays logged in, logout wipes everything", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); let pg = openPage(b); await pg.settle();
    await pg.login("logistic", PW.admin, "admin");
    assert.ok(pg.has("FULL0000001") || pg.has("Tablo"), "admin dashboard visible");
    pg.click({ "data-action": "toggle-inventory", "data-id": "c1" }); await pg.settle();
    assert.strictEqual((await H.redis.get("deka-log-data")).inventoryChecks.c1, today(), "admin change saved via /api/data");
    pg = openPage(b); await pg.settle(); // reload the page, same browser (cookie)
    assert.ok(pg.has('id="gate-form"') && pg.has("Kontinye k\u00F2m logistic"), "reload shows the login page with a 'continue as' button");
    assert.ok(!pg.has("FULL0000001"), "nothing opens by itself");
    pg.click({ "data-action": "resume-session" }); await pg.settle();
    assert.ok(!pg.has("gate-form") && pg.has("FULL0000001"), "continue resumes without a password");
    pg.click({ "data-action": "logout" }); await pg.settle();
    assert.ok(pg.has('id="gate-form"') && !pg.has("FULL0000001"), "back to the login page, data gone from the page");
    pg = openPage(b); await pg.settle();
    assert.ok(pg.has('id="gate-form"') && !pg.has("Kontinye k\u00F2m"), "session is dead after logout");
  });

  await test("admin: Sekirite tab shows the activity log and the backups with download links (and stays safe against injected text)", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); const pg = openPage(b); await pg.settle();
    const evil = H.browser("198.51.100.5");
    await evil.call(H.api("auth/login"), { method: "POST", body: { username: "<img src=x onerror=alert(1)>", password: "x" } });
    await pg.login("logistic", PW.admin, "admin");
    pg.click({ "data-action": "toggle-inventory", "data-id": "c1" }); await pg.settle(); // a save creates the first backup
    pg.click({ "data-action": "set-tab", "data-tab": "sekirite" }); await pg.settle();
    assert.ok(pg.has("Sekirite ak Aktivite"));
    assert.ok(pg.has("Koneksyon reyisi") && pg.has("Ech\u00E8k koneksyon"), "events listed");
    assert.ok(pg.has('href="/api/backup?i=0"') && pg.has("Telechaje"), "backup download link");
    assert.ok(!pg.has("<img src=x"), "attacker-controlled text is escaped");
    pg.click({ "data-action": "sec-filter", "data-filter": "alet" });
    assert.ok(pg.has("Ech\u00E8k koneksyon") && !pg.has("Koneksyon reyisi"), "alerts-only filter");
  });

  await test("one login page: the account you type decides which interface opens", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); const pg = openPage(b); await pg.settle();
    const which = () => (pg.has("Konfime depa") ? "chofe" : pg.has("Envant\u00E8 jounalye") && pg.has("Daily Report") ? "daily" : pg.has("view-depot-division") ? "depot" : pg.has("set-tab") ? "admin" : pg.has('id="gate-form"') ? "login" : "other");
    const out = () => { pg.click({ "data-action": "logout" }); return pg.settle(); };
    assert.strictEqual(which(), "login");
    await pg.login("logistic", PW.admin); assert.strictEqual(which(), "admin");
    await out(); assert.strictEqual(which(), "login");
    await pg.login("depotnord", PW.depot); assert.strictEqual(which(), "depot");
    await out();
    await pg.login("chofe", PW.chofe); assert.strictEqual(which(), "chofe");
    await out();
    await pg.login("LogisticDepot ", PW.daily); assert.strictEqual(which(), "daily", "username is case/space tolerant");
    await out();
    await pg.login("chofe", PW.daily); await new Promise((r) => setTimeout(r, 450));
    assert.strictEqual(which(), "login", "right username + another account's password opens nothing");
  });

  await test("switching accounts on the same device: 'continue as' for the open session, or a new login that replaces it", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); let pg = openPage(b); await pg.settle();
    await pg.login("chofe", PW.chofe);
    assert.ok(pg.has("Konfime depa"));
    pg = openPage(b); await pg.settle(); // reload
    assert.ok(pg.has("Kontinye k\u00F2m chofe") && pg.has('id="gate-user"'), "resume button + a form for another account");
    await pg.login("logisticdepot", PW.daily); // log in as someone else right here
    assert.ok(pg.has("POKO0000003") && pg.has("Daily Report"), "the other account opens its own interface");
    const sessions = [...H.store.keys()].filter((k) => k.startsWith("dl:sess:")).length;
    assert.strictEqual(sessions, 1, "the previous session was destroyed");
  });

  await test("depot: marks a container empty and transfers it through /api/act (never sends the whole data set)", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); const pg = openPage(b); await pg.settle();
    await pg.login("depotnord", PW.depot, "depot");
    pg.click({ "data-action": "view-depot-division", "data-division": "ACS" }); await pg.settle();
    assert.ok(pg.has("FULL0000001"), "depot sees Full containers");
    pg.click({ "data-action": "mark-empty", "data-id": "c1" }); await pg.settle();
    let d = await H.redis.get("deka-log-data");
    assert.strictEqual(d.containers[0].dateEmpty, today());
    assert.ok(d.notifications[0].message.includes("FULL0000001"));
    pg.click({ "data-action": "transfer-depo", "data-id": "c2" }); await pg.settle();
    pg.els["modal-depo"] = { value: "Depo Nord" }; pg.els["modal-trucking"] = { value: "MAD" };
    pg.click({ "data-action": "submit-modal" }); await pg.settle();
    d = await H.redis.get("deka-log-data");
    assert.strictEqual(d.containers[1].depo, "Depo Nord");
  });

  await test("chofe now needs a login, only sees Vid containers, and departs through /api/act", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); const pg = openPage(b); await pg.settle();
    assert.ok(pg.has('id="gate-form"'), "driver gets the login form, not the data");
    assert.ok(!pg.has("VIDD0000002"));
    await pg.login("chofe", PW.chofe, "chofe");
    assert.ok(pg.has("VIDD0000002"), "driver sees the Vid container");
    assert.ok(!pg.has("FULL0000001") && !pg.has("POKO0000003"), "driver does not see other containers");
    pg.change({ id: "driver-trucking-select", value: "CTSA" });
    pg.click({ "data-action": "driver-toggle-select", "data-id": "c2" });
    pg.click({ "data-action": "driver-confirm" }); await pg.settle();
    const d = await H.redis.get("deka-log-data");
    assert.strictEqual(d.containers[1].dateLeft, today());
    assert.ok(d.notifications.some((n) => n.message.includes("kite ak chof\u00E8 CTSA")));
    assert.ok(!pg.has("VIDD0000002") || pg.has("Pa gen konten"), "container disappears from the driver's list");
  });

  await test("daily report: login, verify button writes the verification to logistic data", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); const pg = openPage(b); await pg.settle();
    await pg.login("logisticdepot", PW.daily, "daily");
    assert.ok(pg.has("Daily Report") && pg.has("POKO0000003"));
    pg.change({ classList: { contains: (c) => c === "dr-depo-input" }, getAttribute: () => "c3", value: "Depo Q" });
    pg.click({ "data-action": "dr-verify", "data-id": "c3" }); await pg.settle();
    const d = await H.redis.get("deka-log-data");
    assert.deepStrictEqual([d.containers[2].dateVerified, d.containers[2].depo], [today(), "Depo Q"]);
    assert.deepStrictEqual(d.inventoryChecks, {});
  });

  await test("expired / revoked session: the app says so and returns to the chooser, data is wiped from the page", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); const pg = openPage(b); await pg.settle();
    await pg.login("depotnord", PW.depot, "depot");
    pg.click({ "data-action": "view-depot-division", "data-division": "ACS" }); await pg.settle();
    assert.ok(pg.has("FULL0000001"));
    for (const k of [...H.store.keys()]) if (k.startsWith("dl:sess:")) H.store.delete(k); // server forgets the session
    pg.click({ "data-action": "mark-empty", "data-id": "c1" }); await pg.settle();
    assert.ok(pg.has("Sesyon an fini"), "toast shown"); assert.ok(pg.has('id="gate-form"') && !pg.has("FULL0000001"));
    assert.strictEqual((await H.redis.get("deka-log-data")).containers[0].dateEmpty, null, "nothing was changed");
  });

  await test("a stolen non-admin session cannot rewrite the data set from the console", async () => {
    await H.redis.set("deka-log-data", seed());
    const b = H.browser(); const pg = openPage(b); await pg.settle();
    await pg.login("chofe", PW.chofe, "chofe");
    const r = await b.call(H.api("data"), { method: "POST", body: { containers: [], bills: [] } });
    assert.strictEqual(r.statusCode, 403);
    assert.strictEqual((await H.redis.get("deka-log-data")).containers.length, 3);
  });

  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  PASS  " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n        " + (r[2] && r[2].stack ? r[2].stack.split("\n").slice(0, 4).join("\n        ") : r[2]))));
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed");
  H.restoreClock();
  process.exit(failed.length ? 1 : 0);
})();
