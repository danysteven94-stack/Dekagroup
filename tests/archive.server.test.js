"use strict";
// Server side of the archive: plate field persistence (both storage backends) and the scan endpoint.
// Run with:  node tests/archive.server.test.js   (or TEST_BACKEND=pg node tests/archive.server.test.js)
const assert = require("assert");
const H = require("./helpers");
const L = H.api("_lib/scanlib");

const results = [];
async function test(name, fn) {
  try { H.reset(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); }
}
const PW = { admin: "Adm1n-Strong-Pass", depot: "Dep0t-Strong-Pass" };

async function login(user, role) {
  const b = H.browser();
  const r = await b.call(H.api("auth"), { method: "POST", query: { action: "login" }, body: { username: user, password: PW[role] } });
  assert.strictEqual(r.statusCode, 200, "login " + role + ": " + JSON.stringify(r.body));
  return b;
}
const png = Buffer.from("iVBORw0KGgo=", "base64").toString("base64");
const modelReply = (obj) => ({ ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "```json\n" + JSON.stringify(obj) + "\n```" }] }) });

(async () => {
  const A = H.api("_lib/auth");
  process.env.AUTH_ADMIN_HASH = await A.hashPassword(PW.admin);
  process.env.AUTH_DEPOT_PASS = PW.depot;
  delete process.env.AUTH_SESSION_EPOCH;
  const realFetch = global.fetch;

  await test("scanlib: normalizers and parsing", () => {
    assert.ok(L.containerCheckOk("CSQU3054383") && !L.containerCheckOk("CSQU3054380"));
    assert.strictEqual(L.normalizeDate("23/09/2026"), "2026-09-23");
    assert.strictEqual(L.normalizeDate("2026-02-30"), null);
    assert.strictEqual(L.normalizeDate("1999-01-01"), null);
    assert.strictEqual(L.normalizePlate(" aa-1234 <x> "), "AA-1234 X");
    const out = L.toRecords(L.parseModelText('Sure!\n```json\n{"records":[{"container":"csqu 305438 3","bill":"bl 9","size":"40HC","date_in":"05/01/2026","date_out":"2026-01-20","plate":"aa 1234"},{"container":null,"bill":null},{"container":"csqu 305438 3","bill":"bl 9","date_in":"05/01/2026","date_out":"2026-01-20"}]}\n```'));
    assert.strictEqual(out.records.length, 1, "empty and duplicate records dropped");
    assert.deepStrictEqual(out.records[0], { numewo: "CSQU3054383", bill: "BL 9", product: "", size: "40", dateEntered: "2026-01-05", dateLeft: "2026-01-20", plak: "AA 1234", chofer: "" });
    assert.throws(() => L.parseModelText("no json here"));
  });

  await test("plak is saved and returned (admin save), extra fields still validated", async () => {
    const b = await login("logistic", "admin");
    const body = {
      containers: [{ id: "c1", numewo: "CSQU3054383", billId: "b1", size: "", division: null, dateEntered: "2026-01-05", dateLeft: "2026-01-20", plak: "AA 1234", chofer: "Jean" }],
      bills: [{ id: "b1", numewo: "BL-1", product: "Diri", completedAt: "2026-01-20" }],
      notifications: [], inventoryChecks: {}, rev: await H.rev(),
    };
    const r = await b.call(H.api("data"), { method: "POST", body });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual((await H.getData()).containers[0].plak, "AA 1234");
    const g = await b.call(H.api("data"));
    assert.strictEqual(g.body.containers[0].plak, "AA 1234");
    body.containers[0].plak = "x".repeat(21);
    body.rev = await H.rev();
    const bad = await b.call(H.api("data"), { method: "POST", body });
    assert.strictEqual(bad.statusCode, 400);
  });

  await test("scan: needs a session, admin only, refuses when not configured", async () => {
    const scan = H.api("scan");
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const anon = await H.browser().call(scan, { method: "POST", body: { image: png, mime: "image/png" } });
    assert.strictEqual(anon.statusCode, 401);
    const depot = await (async () => { const b = await login("depotnord", "depot"); return b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } }); })();
    assert.strictEqual(depot.statusCode, 403);
    const b = await login("logistic", "admin");
    delete process.env.ANTHROPIC_API_KEY;
    const off = await b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } });
    assert.strictEqual(off.statusCode, 503);
    assert.strictEqual(off.body.code, "scan_not_configured");
  });

  await test("scan: validates input, calls the model, returns clean records, never echoes the key", async () => {
    const scan = H.api("scan");
    process.env.ANTHROPIC_API_KEY = "sk-test-secret";
    const b = await login("logistic", "admin");
    let seen;
    global.fetch = async (url, opts) => { seen = { url, opts }; return modelReply({ document_type: "Bon de sortie", records: [{ container: "csqu 305438 3", bill: "bl-77", date_out: "20/01/2026", plate: "aa 1234" }], notes: null }); };
    try {
      const bad1 = await b.call(scan, { method: "POST", body: { image: png, mime: "text/html" } });
      assert.strictEqual(bad1.statusCode, 400);
      const bad2 = await b.call(scan, { method: "POST", body: { image: "not base64!!", mime: "image/png" } });
      assert.strictEqual(bad2.statusCode, 400);
      const bad3 = await b.call(scan, { method: "POST", body: { image: "A".repeat(3700000), mime: "image/png" } });
      assert.strictEqual(bad3.statusCode, 400);
      assert.strictEqual(seen, undefined, "nothing was sent to the model for invalid input");

      const ok = await b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } });
      assert.strictEqual(ok.statusCode, 200, JSON.stringify(ok.body));
      assert.strictEqual(ok.body.docType, "Bon de sortie");
      assert.deepStrictEqual(ok.body.records[0], { numewo: "CSQU3054383", bill: "BL-77", product: "", size: "", dateEntered: "", dateLeft: "2026-01-20", plak: "AA 1234", chofer: "" });
      assert.strictEqual(seen.url, "https://api.anthropic.com/v1/messages");
      assert.strictEqual(seen.opts.headers["x-api-key"], "sk-test-secret");
      const sent = JSON.parse(seen.opts.body);
      assert.strictEqual(sent.messages[0].content[0].type, "image");
      assert.ok(!JSON.stringify(ok.body).includes("sk-test"));
      const pdf = await b.call(scan, { method: "POST", body: { image: png, mime: "application/pdf" } });
      assert.strictEqual(JSON.parse(seen.opts.body).messages[0].content[0].type, "document");
      assert.strictEqual(pdf.statusCode, 200);
    } finally { global.fetch = realFetch; }
  });

  await test("scan: upstream failures become clear errors; unreadable answer -> 422; hourly cap", async () => {
    const scan = H.api("scan");
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const b = await login("logistic", "admin");
    try {
      global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
      assert.strictEqual((await b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } })).body.code, "scan_bad_key");
      global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }) });
      const cr = await b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } });
      assert.strictEqual(cr.body.code, "scan_no_credit");
      global.fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: { message: "model: nope" } }) });
      assert.strictEqual((await b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } })).body.code, "scan_bad_model");
      global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "messages.0.content.0.image: bad" } }) });
      const other = await b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } });
      assert.ok(other.body.code === "scan_upstream" && /400/.test(other.body.error) && /image: bad/.test(other.body.error));
      global.fetch = async () => ({ ok: false, status: 529, json: async () => ({}) });
      assert.strictEqual((await b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } })).statusCode, 503);
      global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "sorry, I cannot read this" }] }) });
      assert.strictEqual((await b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } })).statusCode, 422);
      process.env.SCAN_HOURLY_LIMIT = "1";
      const limited = await b.call(scan, { method: "POST", body: { image: png, mime: "image/png" } });
      assert.strictEqual(limited.statusCode, 429);
    } finally { global.fetch = realFetch; delete process.env.SCAN_HOURLY_LIMIT; }
  });

  let bad = 0;
  results.forEach((r) => { console.log((r[0] ? "  ok    " : "  FAIL  ") + r[1]); if (!r[0]) { bad++; console.log("        " + String(r[2] && r[2].stack || r[2]).split("\n").slice(0, 5).join("\n        ")); } });
  console.log(`${results.length - bad}/${results.length} passed  [${H.BACKEND}]`);
  process.exit(bad ? 1 : 0);
})();
