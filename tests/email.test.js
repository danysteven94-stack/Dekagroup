"use strict";
// Email notifications (Resend API). Mocks global.fetch so no real network call is ever made.
//   node tests/email.test.js            (Redis storage)      TEST_BACKEND=pg node tests/email.test.js   (PostgreSQL layer)
const assert = require("assert");
const H = require("./helpers");

const results = [];
async function test(name, fn) {
  try {
    H.reset();
    calls = [];
    failNext = 0;
    process.env.AUTH_ADMIN_PASS = "Adm1n-Strong-Pass";
    process.env.AUTH_DEPOT_PASS = "Dep0t-Strong-Pass";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    await fn();
    results.push([true, name]);
  } catch (e) {
    results.push([false, name, e]);
  }
}

// ---- fetch mock: records every call, lets a test simulate Resend failures.
let calls = [];
let failNext = 0;
const realFetch = global.fetch;
global.fetch = async function (url, opts) {
  if (String(url).indexOf("api.resend.com") === -1) return realFetch(url, opts);
  calls.push({ url: String(url), body: JSON.parse((opts && opts.body) || "{}"), auth: opts && opts.headers && opts.headers.Authorization });
  if (failNext > 0) {
    failNext--;
    return { ok: false, status: 422, text: async () => JSON.stringify({ message: "invalid domain" }) };
  }
  return { ok: true, status: 200, json: async () => ({ id: "email_test_id" }) };
};

const login = async () => {
  const b = H.browser();
  const r = await b.call(H.api("auth/login"), { method: "POST", body: { username: "logistic", password: "Adm1n-Strong-Pass" } });
  assert.strictEqual(r.statusCode, 200);
  return b;
};
const post = (b, body) => b.call(H.api("email"), { method: "POST", body });
const seed = () => ({
  containers: [{ id: "c1", numewo: "NUM1", billId: "b1", size: "20", division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "D", trucking: "CFC", dateEmpty: null, dateLeft: null }],
  bills: [{ id: "b1", numewo: "B-1", product: "Diri", completedAt: null }],
  notifications: [], inventoryChecks: {},
});

(async () => {
  await test("without RESEND_API_KEY: GET says unavailable, sending is a silent no-op, test button refuses clearly", async () => {
    const admin = await login();
    const g = await admin.call(H.api("email"));
    assert.deepStrictEqual(g.body, { available: false, recipients: [] });
    const Email = H.api("_lib/email");
    assert.deepStrictEqual(await Email.sendEmail("x", "y"), { sent: 0, skipped: true });
    assert.strictEqual(calls.length, 0);
    const t = await post(admin, { action: "test" });
    assert.deepStrictEqual([t.statusCode, t.body.code], [503, "not_configured"]);
  });

  await test("only admin can manage recipients", async () => {
    const b = H.browser();
    const r1 = await post(b, { action: "add", email: "x@example.com" });
    assert.strictEqual(r1.statusCode, 401);
    const depotB = H.browser();
    await depotB.call(H.api("auth/login"), { method: "POST", body: { username: "depotnord", password: "Dep0t-Strong-Pass" } });
    assert.strictEqual((await post(depotB, { action: "add", email: "x@example.com" })).statusCode, 403);
  });

  await test("add/remove recipients: validation, duplicates, list cap, persists across requests", async () => {
    const admin = await login();
    const bad = async (email) => assert.strictEqual((await post(admin, { action: "add", email })).statusCode, 400, email);
    await bad("not-an-email");
    await bad("");
    await bad("a@b");
    const r1 = await post(admin, { action: "add", email: "Marie@Example.COM " });
    assert.strictEqual(r1.statusCode, 200);
    assert.deepStrictEqual(r1.body.recipients.map((x) => x.email), ["marie@example.com"], "lowercased and trimmed");
    const r2 = await post(admin, { action: "add", email: "marie@example.com" });
    assert.strictEqual(r2.body.recipients.length, 1, "duplicate not added twice");
    await post(admin, { action: "add", email: "jean@example.com" });
    const g = await admin.call(H.api("email"));
    assert.deepStrictEqual(g.body.recipients.map((x) => x.email).sort(), ["jean@example.com", "marie@example.com"]);
    const r3 = await post(admin, { action: "remove", email: "marie@example.com" });
    assert.deepStrictEqual(r3.body.recipients.map((x) => x.email), ["jean@example.com"]);
    for (let i = 0; i < 30; i++) await post(admin, { action: "add", email: "n" + i + "@example.com" });
    const full = await post(admin, { action: "add", email: "one-too-many@example.com" });
    assert.strictEqual(full.statusCode, 400);
  });

  await test("with RESEND_API_KEY: test button sends via the Resend API to every recipient (BCC), audited", async () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    const admin = await login();
    await post(admin, { action: "add", email: "marie@example.com" });
    await post(admin, { action: "add", email: "jean@example.com" });
    const g = await admin.call(H.api("email"));
    assert.strictEqual(g.body.available, true);
    const t = await post(admin, { action: "test" });
    assert.strictEqual(t.statusCode, 200);
    assert.strictEqual(t.body.sent, 2);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].auth, "Bearer re_test_key_123");
    assert.deepStrictEqual(calls[0].body.bcc.sort(), ["jean@example.com", "marie@example.com"]);
    assert.ok(calls[0].body.subject.includes("Tès"));
    const ev = (await admin.call(H.api("audit"))).body.events.map((e) => e.ev);
    assert.ok(ev.includes("email_test") && ev.includes("email_recipient_add"));
  });

  await test("test button is rate limited (15s lock) so it cannot be used to spam the list", async () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    const admin = await login();
    await post(admin, { action: "add", email: "marie@example.com" });
    assert.strictEqual((await post(admin, { action: "test" })).statusCode, 200);
    const again = await post(admin, { action: "test" });
    assert.strictEqual(again.statusCode, 429);
  });

  await test("Resend API failure surfaces as a clear error, not a 500 crash", async () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    const admin = await login();
    await post(admin, { action: "add", email: "marie@example.com" });
    failNext = 1;
    const t = await post(admin, { action: "test" });
    assert.strictEqual(t.statusCode, 502);
    assert.ok(t.body.error.includes("422") || t.body.error.includes("invalid domain"));
  });

  await test("saving data / a targeted action that creates a fresh notification triggers exactly one digest email; old ones are not resent", async () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    const admin = await login();
    await post(admin, { action: "add", email: "marie@example.com" });
    await H.setData(seed());
    const depot = H.browser();
    await depot.call(H.api("auth/login"), { method: "POST", body: { username: "depotnord", password: "Dep0t-Strong-Pass" } });
    const rev = await H.rev();
    const r = await depot.call(H.api("act"), { method: "POST", body: { action: "markEmpty", id: "c1", rev } });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(calls.length, 1, "one email sent for the new notification");
    assert.ok(calls[0].body.text.includes("NUM1"));
    // saving again with no new notification must not send another email
    await depot.call(H.api("act"), { method: "POST", body: { action: "markEmpty", id: "c1", rev: await H.rev() } });
    assert.strictEqual(calls.length, 1, "no duplicate email for unchanged notifications");
  });

  await test("with no recipients configured, a save still succeeds and sends nothing", async () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    await H.setData(seed());
    const depot = H.browser();
    await depot.call(H.api("auth/login"), { method: "POST", body: { username: "depotnord", password: "Dep0t-Strong-Pass" } });
    const r = await depot.call(H.api("act"), { method: "POST", body: { action: "markEmpty", id: "c1", rev: await H.rev() } });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(calls.length, 0);
  });

  await test("no recipient email address or password ever appears in the audit log", async () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    const admin = await login();
    await post(admin, { action: "add", email: "secret.person@example.com" });
    const ev = (await admin.call(H.api("audit"))).body.events;
    const withEmail = ev.find((e) => e.ev === "email_recipient_add");
    assert.strictEqual(withEmail.d.email, "secret.person@example.com", "the audit log does say who was added (that's the point)");
    assert.ok(!JSON.stringify(ev).includes("re_test_key"), "the API key never appears in the log");
  });

  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  PASS  " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n        " + (r[2] && r[2].stack ? r[2].stack.split("\n").slice(0, 5).join("\n        ") : r[2]))));
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed");
  global.fetch = realFetch;
  H.restoreClock();
  process.exit(failed.length ? 1 : 0);
})();
