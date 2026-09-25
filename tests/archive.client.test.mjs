// Client-side archive logic (run with: node --no-warnings tests/archive.client.test.mjs)
import assert from "assert";
import { writeFileSync } from "fs";
const require_fs_write = (p, b) => writeFileSync(p, b);

const root = { innerHTML: "" };
globalThis.document = { getElementById: (id) => (id === "root" ? root : null), addEventListener() {}, querySelector: () => null, activeElement: null };
globalThis.window = { addEventListener() {}, createImageBitmap: undefined };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let posts = [];
globalThis.fetch = async (url, opts) => { posts.push([url, opts]); return { ok: true, status: 200, json: async () => ({ ok: true }), clone() { return this; } }; };

const { state } = await import("../public/js/state.js");
const A = await import("../public/js/archive.js");
const V = await import("../public/js/views/archive.js");
const I = await import("../public/js/iso6346.js");
const results = [];
const test = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); } };
const reset = () => { state.containers = []; state.bills = []; state.notifications = []; state.modal = null; state.authRole = "admin"; state.unlocked = true; state.loadingData = false; state.tab = "achiv"; state.search = ""; posts = []; };

await test("ISO 6346 check digit", () => {
  assert.ok(I.containerCheckOk("CSQU3054383"));
  assert.ok(!I.containerCheckOk("CSQU3054384"));
  assert.ok(!I.containerCheckOk("CSQU305438"));
  assert.strictEqual(I.normalizeContainer(" csqu 305438-3 "), "CSQU3054383");
});

await test("manual entry: creates bill + container, silent completion, no notification", async () => {
  reset();
  A.openArchiveManual();
  Object.assign(state.modal.rows[0], { numewo: "csqu3054383", bill: "bl-100", product: "Diri", dateEntered: "2026-01-05", dateLeft: "2026-01-20", plak: "aa 1234", chofer: "Jean" });
  A.saveArchive();
  assert.strictEqual(state.modal, null);
  assert.strictEqual(state.containers.length, 1);
  const c = state.containers[0];
  assert.strictEqual(c.numewo, "CSQU3054383");
  assert.strictEqual(c.plak, "AA 1234");
  assert.strictEqual(c.dateLeft, "2026-01-20");
  assert.strictEqual(state.bills.length, 1);
  assert.strictEqual(state.bills[0].numewo, "BL-100");
  assert.strictEqual(state.bills[0].completedAt, "2026-01-20");
  assert.strictEqual(state.notifications.length, 0);
  assert.strictEqual(A.archiveRecords().length, 1);
  const saved = posts.find((p) => p[0] === "/api/data");
  assert.ok(saved, "saveData was called");
  assert.strictEqual(JSON.parse(saved[1].body).containers[0].plak, "AA 1234");
});

await test("second container on the same bill reuses the bill", () => {
  A.openArchiveManual();
  Object.assign(state.modal.rows[0], { numewo: "MSKU0000000", bill: "BL-100", dateEntered: "2026-01-06", dateLeft: "2026-01-21", plak: "" });
  A.saveArchive();
  assert.strictEqual(state.bills.length, 1);
  assert.strictEqual(state.containers.length, 2);
  assert.strictEqual(state.containers[0].plak, null);
});

await test("validation blocks: missing fields, dates reversed, duplicates", () => {
  const rows = [
    { k: "a", numewo: "", bill: "", dateEntered: "", dateLeft: "", plak: "" },
    { k: "b", numewo: "CSQU3054383", bill: "X", dateEntered: "2026-02-10", dateLeft: "2026-02-01", plak: "AA1" },
    { k: "c", numewo: "CSQU3054383", bill: "X", dateEntered: "2026-01-05", dateLeft: "2026-01-06", plak: "AA1" },
  ];
  assert.ok(A.rowIssues(rows[0], rows, null).errors.length >= 4);
  assert.ok(A.rowIssues(rows[1], rows, null).errors.includes("Dat kite anvan dat antre"));
  assert.ok(A.rowIssues(rows[2], rows, null).errors.some((e) => /Deja nan rejis/.test(e)), "same number + same entry date already stored");
  const w = A.rowIssues({ k: "d", numewo: "CSQU3054384", bill: "X", dateEntered: "2026-03-01", dateLeft: "2026-03-02", plak: "" }, [], null);
  assert.deepStrictEqual(w.errors, []);
  assert.strictEqual(w.warns.length, 2, "bad check digit + missing plate are warnings, not errors");
});

await test("same container number with another entry date is allowed (container came back later)", () => {
  const r = { k: "e", numewo: "CSQU3054383", bill: "Y", dateEntered: "2026-06-01", dateLeft: "2026-06-05", plak: "AB1" };
  assert.deepStrictEqual(A.rowIssues(r, [r], null).errors, []);
});

await test("save refuses when a row has errors", () => {
  const n = state.containers.length;
  A.openArchiveManual();
  A.saveArchive();
  assert.ok(state.modal, "modal stays open");
  assert.strictEqual(state.containers.length, n);
});

await test("edit an archived record", () => {
  state.modal = null;
  const id = state.containers.find((c) => c.numewo === "CSQU3054383").id;
  A.openArchiveEdit(id);
  state.modal.rows[0].plak = "zz 999";
  A.saveArchive();
  assert.strictEqual(state.containers.find((c) => c.id === id).plak, "ZZ 999");
});

await test("views render without throwing and escape user text", () => {
  state.search = "";
  const html = V.archiveView();
  assert.ok(html.includes("CSQU3054383") && html.includes("ZZ 999"));
  state.containers[0].plak = "<img src=x onerror=alert(1)>";
  assert.ok(!V.archiveView().includes("<img src=x"));
  A.openArchiveScan();
  assert.ok(V.archiveModalView(state.modal).includes("arch-file-cam"));
  A.openArchiveManual();
  assert.ok(V.archiveModalView(state.modal).includes('id="arch-save"'));
});

await test("search filters by plate and bill", () => {
  state.containers[0].plak = "QQ 777";
  state.search = "qq 777";
  const html = V.archiveView();
  assert.ok(html.includes("1 rezilta"));
  state.search = "bl-100";
  assert.ok(V.archiveView().includes("2 rezilta"));
});

await test("DNK report: only DNK trucking not yet left, with driver + plate, valid PDF bytes", async () => {
  const P = await import("../public/js/pdf.js");
  reset();
  const mk = (id, numewo, trucking, extra) => Object.assign({ id, numewo, billId: null, size: "40", division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "Depo A", trucking, dateEmpty: null, dateLeft: null }, extra || {});
  state.containers = [
    mk("a", "AAAA0000001", "DNK 002", { chofer: "Jean Pierre", plak: "AA 1234" }),
    mk("b", "BBBB0000002", "DNK 001", { chofer: null, plak: null }),
    mk("c", "CCCC0000003", "CFC"),
    mk("d", "DDDD0000004", "DNK 003", { dateLeft: "2026-09-10", dateEmpty: "2026-09-05" }),
  ];
  const rows = P.dnkReportRows(state.containers);
  assert.deepStrictEqual(rows.map((r) => r.cells[0]), ["BBBB0000002", "AAAA0000001"], "sorted by trucking, kite + non-DNK excluded");
  assert.deepStrictEqual(rows[1].cells.slice(4), ["Jean Pierre", "AA 1234"]);
  assert.deepStrictEqual(rows[0].cells.slice(4), ["\u2014", "\u2014"]);
  const bytes = P.buildTablePdf(rows, "RAPO TRUCKING DNK", ["#", "Container", "Trucking", "Status", "Depot", "Chof\u00e8", "Plak"]);
  const txt = Buffer.from(bytes).toString("latin1");
  assert.ok(txt.startsWith("%PDF-1.4") && txt.trim().endsWith("%%EOF"));
  assert.ok(txt.includes("(AA 1234)") && txt.includes("(Jean Pierre)") && txt.includes("(Plak)"));
  require_fs_write("/tmp/dnk-test.pdf", bytes);
});

let bad = 0;
results.forEach((r) => { console.log((r[0] ? "  ok    " : "  FAIL  ") + r[1]); if (!r[0]) { bad++; console.log("        " + (r[2] && r[2].stack || r[2]).split("\n").slice(0, 4).join("\n        ")); } });
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
