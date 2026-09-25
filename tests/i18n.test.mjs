// French mode: render every screen and check that no Kreyòl text is left (run: node --no-warnings tests/i18n.test.mjs)
import assert from "assert";

const root = { innerHTML: "" };
globalThis.document = {
  getElementById: () => root, addEventListener() {}, querySelector: () => null, activeElement: null,
  createTreeWalker: () => ({ nextNode: () => null }), documentElement: {},
};
root.querySelectorAll = () => [];
globalThis.window = { addEventListener() {} };
globalThis.localStorage = { _v: {}, getItem(k) { return this._v[k] || null; }, setItem(k, v) { this._v[k] = v; }, removeItem(k) { delete this._v[k]; } };
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), clone() { return this; } });

const { state } = await import("../public/js/state.js");
const { render } = await import("../public/js/render.js");
const I = await import("../public/js/i18n.js");
const A = await import("../public/js/archive.js");
const results = [];
const test = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); } };

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENT[m]);
// text nodes + translatable attributes, like the browser would give them
function texts(html) {
  const out = [];
  html.split(/<[^>]*>/).forEach((t) => { const s = decode(t).replace(/\s+/g, " ").trim(); if (s) out.push(s); });
  for (const m of html.matchAll(/(?:placeholder|title|alt|aria-label)="([^"]*)"/g)) out.push(decode(m[1]).trim());
  for (const m of html.matchAll(/data-fr="([^"]*)"/g)) out.push("\u0000" + m[1]);
  return out;
}
const CREOLE = /^(kontenè|konteneur|yon|kounye|epi|nan|ak|pwodwi|modpass|nimewo|eseye|ankò|tann|bezwen|sèvè|imèl|aktive|dezaktive|verifye|konfime|telechaje|chwazi|ajoute|efase|sove|rejis|rapò|itilizatè|antre|kite|dat|kont)$/i;
function leftovers(html) {
  const bad = [];
  texts(html).forEach((raw) => {
    if (raw.startsWith("\u0000")) return; // data-fr overrides: already French
    const fr = I.t(raw);
    const words = fr.split(/[^A-Za-zÀ-ÿ']+/).filter(Boolean);
    const hits = words.filter((w) => CREOLE.test(w));
    if (hits.length) bad.push(raw + "  =>  " + fr);
  });
  return bad;
}

const base = () => {
  Object.assign(state, { authChecking: false, authRole: null, unlocked: false, depotUnlocked: false, drUnlocked: false, gate2fa: false, help: false, acct: false, needs: null, loadingData: false, loadError: false, modal: null, confirmModal: null, toasts: [], tab: "dashboard", search: "", filterStatus: "tout", filterBillStatus: "", sessionRole: null });
  state.containers = [
    { id: "c1", numewo: "CSQU3054383", billId: "b1", size: "40", division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "Depo A", trucking: "DNK 002", chofer: "Jean", plak: "AA 1234", dateEmpty: null, dateLeft: null, dateExpected: null },
    { id: "c2", numewo: "MSKU0000001", billId: "b1", size: "20", division: "DEKAV", dateEntered: "2026-08-01", dateVerified: null, depo: null, trucking: null, dateEmpty: null, dateLeft: null, dateExpected: null },
    { id: "c3", numewo: "TEMU5858003", billId: "b2", size: "40", division: "MIKADO", dateEntered: "2026-07-01", dateVerified: "2026-07-02", depo: "Depo B", trucking: "CFC 12", dateEmpty: "2026-07-10", dateLeft: null, dateExpected: null },
    { id: "c4", numewo: "GXYU5013713", billId: "b2", size: "20", division: "ACS", dateEntered: "2026-06-01", dateVerified: "2026-06-02", depo: "Depo B", trucking: "CTSA", dateEmpty: "2026-06-05", dateLeft: "2026-06-09", plak: "BB 22", dateExpected: null },
    { id: "c5", numewo: "SEGU2843404", billId: "b1", size: "20", division: "ACS", dateEntered: null, dateVerified: null, depo: null, trucking: null, dateEmpty: null, dateLeft: null, dateExpected: "2026-10-01" },
  ];
  state.bills = [{ id: "b1", numewo: "LMM0592084", product: "LAIT", completedAt: null }, { id: "b2", numewo: "CHN3429599", product: "BROSSES", completedAt: "2026-06-09" }];
  state.notifications = [
    { id: "n1", billNumewo: "CHN3429599", date: "2026-06-09", message: "Bill CHN3429599 fini — tout kontenè li yo kite." },
    { id: "n2", billNumewo: "", date: "2026-06-09", message: "Kontenè GXYU5013713 kite ak chofè CFC." },
    { id: "n3", billNumewo: "LMM0592084", date: "2026-06-09", message: "Kontenè CSQU3054383 vid kounye a (Bill LMM0592084)." },
    { id: "n4", billNumewo: "", date: "2026-06-09", message: "Kontenè MSKU0000001 transfere nan depo Depo A (te nan Depo B) — trucking: CFC." },
  ];
  state.inventoryChecks = {};
};
const show = (setup) => { base(); setup(); render(); return root.innerHTML; };
const admin = (tab, extra) => show(() => { state.authRole = "admin"; state.unlocked = true; state.tab = tab; if (extra) extra(); });

await test("engine: exact, patterns, separators, plurals, whitespace", () => {
  I.setLang("fr");
  assert.strictEqual(I.t("Apèsi"), "Aperçu");
  assert.strictEqual(I.t("  Rejis Bill "), "  Registre des Bills ");
  assert.strictEqual(I.t("1 rezilta"), "1 résultat");
  assert.strictEqual(I.t("7 rezilta · 75 nan achiv"), "7 résultats · 75 dans les archives");
  assert.strictEqual(I.t("Depo: Depo A"), "Dépôt: Depo A", "label translated, data untouched");
  assert.strictEqual(I.t("LAIT"), "LAIT");
  assert.strictEqual(I.t("CSQU3054383"), "CSQU3054383");
  I.setLang("ht");
  assert.strictEqual(I.t("Apèsi"), "Apèsi", "Kreyòl mode leaves text alone");
  I.setLang("fr");
});

await test("switch persists (localStorage) and updates the page language", () => {
  I.setLang("ht"); assert.strictEqual(localStorage.getItem("deka-log-lang"), "ht");
  I.setLang("fr"); assert.strictEqual(localStorage.getItem("deka-log-lang"), "fr");
  assert.strictEqual(document.documentElement.lang, "fr");
  const html = show(() => {});
  assert.ok(html.includes('data-action="set-lang"') && html.includes('data-lang="ht"'), "login screen offers Kreyòl");
});

const SCREENS = {
  "login": () => show(() => {}),
  "login (resume)": () => show(() => { state.sessionRole = "admin"; state.sessionUser = "logistic"; }),
  "login 2FA": () => show(() => { state.gate2fa = true; state.gateUser = "logistic"; state.gateCanEmail = true; }),
  "load error": () => show(() => { state.authRole = "admin"; state.unlocked = true; state.loadError = true; state.loadErrorDetail = "HTTP 500"; }),
  "loading": () => show(() => { state.authRole = "admin"; state.unlocked = true; state.loadingData = true; }),
  "admin dashboard": () => admin("dashboard"),
  "admin add (nouvo)": () => admin("add"),
  "admin add (planifye)": () => admin("add", () => { state.entryMode = "planifye"; state.billMode = "ekzistan"; }),
  "admin containers": () => admin("containers"),
  "admin containers (search none)": () => admin("containers", () => { state.search = "zzz"; }),
  "admin inventory": () => admin("inventory"),
  "admin inventory (all done)": () => admin("inventory", () => { state.inventoryChecks = Object.fromEntries(state.containers.map((c) => [c.id, new Date().toISOString().slice(0, 10)])); state.inventoryShowConfirmed = true; }),
  "admin bills": () => admin("bills"),
  "admin bills (empty)": () => admin("bills", () => { state.bills = []; state.containers = []; }),
  "admin achiv": () => admin("achiv"),
  "admin achiv (empty)": () => admin("achiv", () => { state.containers = []; }),
  "admin rapo": () => admin("rapo"),
  "admin rapo (no dnk)": () => admin("rapo", () => { state.containers = []; }),
  "admin notifs": () => admin("notifs"),
  "admin notifs (empty)": () => admin("notifs", () => { state.notifications = []; }),
  "admin sekirite": () => admin("sekirite", () => { state.sec = { loaded: true, busy: false, err: "", filter: "tout", events: [{ t: new Date().toISOString(), ev: "login_ok", u: "logistic", n: "Jean", role: "admin", ip: "1.2.3.4" }, { t: new Date().toISOString(), ev: "login_fail", u: "x", ip: "1.2.3.4" }], backups: [{ i: 0, ts: new Date().toISOString(), containers: 5, bills: 2 }, { i: 1, broken: true }], health: { backend: "postgres", ok: true, rev: 3, containers: 5, bills: 2, notifications: 4 }, email: { available: false, recipients: [] }, legacy: {} }; }),
  "admin sekirite (loading)": () => admin("sekirite", () => { state.sec = { loaded: false, busy: true, err: "", filter: "tout", events: [], backups: [] }; }),
  "admin sekirite (error)": () => admin("sekirite", () => { state.sec = { loaded: false, busy: false, err: "HTTP 500", filter: "tout", events: [], backups: [] }; }),
  "admin itilizate": () => admin("itilizate", () => { state.usr = { loaded: true, err: "", users: [{ username: "jean.paul", name: "Jean Paul", role: "depot", active: true, must_change: true, totp_enabled: false, email: "", last_login_at: null, mustChange: true }], legacy: [{ role: "admin", username: "logistic" }], form: {}, canManage: true, secretOk: true }; }),
  "admin itilizate (loading)": () => admin("itilizate"),
  "admin help": () => show(() => { state.authRole = "admin"; state.unlocked = true; state.help = true; }),
  "depot dashboard": () => show(() => { state.authRole = "depot"; state.depotUnlocked = true; state.depotTab = "dashboard"; }),
  "depot list": () => show(() => { state.authRole = "depot"; state.depotUnlocked = true; state.depotTab = "list"; }),
  "depot division": () => show(() => { state.authRole = "depot"; state.depotUnlocked = true; state.depotTab = "dashboard"; state.depotDivision = "ACS"; }),
  "driver": () => show(() => { state.authRole = "chofe"; state.role = "chofe"; }),
  "driver (trucking chosen)": () => show(() => { state.authRole = "chofe"; state.role = "chofe"; state.driverTrucking = "CFC"; state.driverSelected = { c3: true }; }),
  "daily report": () => show(() => { state.authRole = "daily"; state.drUnlocked = true; state.dr.loaded = true; }),
  "account": () => show(() => { state.authRole = "admin"; state.unlocked = true; state.acct = true; state.sessionPersonal = true; state.personal = true; }),
  "account (forced password)": () => show(() => { state.authRole = "admin"; state.unlocked = true; state.needs = "password"; state.personal = true; }),
  "modal: correct date": () => admin("containers", () => { state.modal = { mode: "correct", id: "c1", date: "2026-09-01" }; }),
  "modal: confirm-enter": () => admin("containers", () => { state.modal = { mode: "confirm-enter", id: "c5", trucking: "" }; }),
  "modal: verify": () => admin("containers", () => { state.modal = { mode: "verify", id: "c2", depo: "", trucking: "" }; }),
  "modal: transfer": () => admin("containers", () => { state.modal = { mode: "transfer", id: "c1", depo: "A", trucking: "" }; }),
  "confirm modal": () => admin("containers", () => { state.confirmModal = { message: "Efase kontenè sa a nèt? Ou pap ka anile sa.", action: "delete-container", id: "c1" }; }),
  "toast": () => admin("dashboard", () => { state.toasts = [{ id: "t", message: "Bill X fini — tout kontenè li yo kite." }, { id: "u", message: "Chanjman an pa sove: HTTP 500" }]; }),
  "archive modal: pick": () => admin("achiv", () => { A.openArchiveScan(); }),
  "archive modal: pick + error": () => admin("achiv", () => { A.openArchiveScan(); state.modal.err = "Skane a echwe. Eseye ankò."; }),
  "archive modal: reading": () => admin("achiv", () => { A.openArchiveScan(); state.modal.phase = "reading"; }),
  "archive modal: review (errors)": () => admin("achiv", () => { A.openArchiveManual(); state.modal.rows.push({ ...state.modal.rows[0], k: "z", numewo: "CSQU3054384", bill: "X", dateEntered: "2026-09-01", dateLeft: "2026-08-01" }); state.modal.scans = 1; state.modal.docType = "Bon de sortie"; }),
  "archive modal: edit": () => admin("achiv", () => { A.openArchiveEdit("c4"); }),
};

for (const [name, fn] of Object.entries(SCREENS)) {
  await test("FR, no Kreyòl left: " + name, () => {
    I.setLang("fr");
    const bad = leftovers(fn());
    assert.deepStrictEqual(bad, [], "\n      " + bad.join("\n      "));
  });
}

let bad = 0;
results.forEach((r) => { console.log((r[0] ? "  ok    " : "  FAIL  ") + r[1]); if (!r[0]) { bad++; console.log("        " + String(r[2] && r[2].message || r[2]).split("\n").slice(0, 14).join("\n        ")); } });
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
