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
  "admin trucking": () => admin("trucking"),
  "admin trucking (one trucking, Full)": () => admin("trucking", () => { state.truckingGroup = "CFC"; state.truckingStatus = "full"; }),
  "admin trucking (Vid)": () => admin("trucking", () => { state.truckingStatus = "vid"; }),
  "admin trucking (Pran)": () => admin("trucking", () => { state.truckingStatus = "pran"; }),
  "admin trucking (Kite)": () => admin("trucking", () => { state.truckingStatus = "kite"; }),
  "admin trucking (search none)": () => admin("trucking", () => { state.search = "zzz"; }),
  "admin pwodwi": () => admin("pwodwi"),
  "admin pwodwi (empty)": () => admin("pwodwi", () => { state.containers = []; }),
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
  "driver (containers taken)": () => show(() => {
    state.authRole = "chofe"; state.role = "chofe"; state.username = "me"; state.driverTrucking = "CFC";
    state.containers = state.containers.concat([
      { id: "c6", numewo: "PRAN0000001", billId: "b1", size: "20", division: "ACS", dateEntered: null, dateVerified: null, depo: null, trucking: "CFC", chofer: "Jan Batis", plak: "CC-9999", datePran: "2026-10-02", pranBy: "me", dateEmpty: null, dateLeft: null, dateExpected: "2026-10-03" },
      { id: "c8", numewo: "DISP0000040", billId: "b1", size: "40", division: "ACS", dateEntered: null, dateVerified: null, depo: null, trucking: null, dateEmpty: null, dateLeft: null, dateExpected: null },
      { id: "c9", numewo: "DISP0000020", billId: "b1", size: "20", division: "ACS", dateEntered: null, dateVerified: null, depo: null, trucking: null, dateEmpty: null, dateLeft: null, dateExpected: null },
      { id: "c7", numewo: "PRAN0000002", billId: "b1", size: "20", division: "ACS", dateEntered: null, dateVerified: null, depo: null, trucking: "MAD", chofer: "Pyer Louis", plak: "DD-1111", datePran: "2026-10-02", pranBy: "other", dateEmpty: null, dateLeft: null, dateExpected: null },
    ]);
  }),
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

await test("driver page: taken containers leave the available list; available ones are split in a 40' box and a 20' box", () => {
  I.setLang("ht");
  const html = SCREENS["driver (containers taken)"]();
  I.setLang("fr");
  const iBox40 = html.indexOf("Kontenè 40 pye");
  const iBox20 = html.indexOf("Kontenè 20 pye");
  const iTaken = html.indexOf("Kontenè Pran (Poko Antre)");
  assert.ok(iBox40 > -1 && iBox20 > iBox40 && iTaken > iBox20, "two boxes (40 then 20), then the taken list");
  const avail = html.slice(iBox40, iTaken);
  assert.ok(avail.includes("DISP0000040") && avail.includes("DISP0000020"));
  assert.ok(!avail.includes("PRAN0000001") && !avail.includes("PRAN0000002"), "a taken container is no longer in the available boxes");
  assert.ok(html.slice(iBox40, iBox20).includes("DISP0000040") && !html.slice(iBox40, iBox20).includes("DISP0000020"), "40' box holds only 40' containers");
  assert.ok(html.slice(iTaken).includes("PRAN0000001"), "taken list shows the container");
  assert.ok(!html.includes("Jan Batis"), "a driver's name is not shown on the cards");
});

await test("driver page: empty containers are split in a 40' box and a 20' box, and \"select all\" works per box", async () => {
  I.setLang("ht");
  state.containers = [
    { id: "v1", numewo: "VID00000401", billId: "b1", size: "40", division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "D", dateEmpty: "2026-09-10", dateLeft: null },
    { id: "v2", numewo: "VID00000402", billId: "b1", size: "40", division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "D", dateEmpty: "2026-09-11", dateLeft: null },
    { id: "v3", numewo: "VID00000201", billId: "b1", size: "20", division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "D", dateEmpty: "2026-09-12", dateLeft: null },
  ];
  state.authRole = "chofe"; state.role = "chofe"; state.driverSelected = { v3: true };
  render();
  let html = root.innerHTML;
  I.setLang("fr");
  const a = html.indexOf("Kontenè Vid 40 pye"), b = html.indexOf("Kontenè Vid 20 pye");
  assert.ok(a > -1 && b > a, "40' box first, then 20' box");
  assert.ok(html.slice(a, b).includes("VID00000401") && html.slice(a, b).includes("VID00000402") && !html.slice(a, b).includes("VID00000201"));
  assert.ok(html.slice(b).includes("VID00000201"));
  assert.ok(html.includes('data-action="driver-toggle-select" data-id="v1"'), "each card is a tap target");
  assert.ok(html.includes("sel-tile selected"), "a selected card looks selected");
  const M = await import("../public/js/mutations.js");
  M.toggleSelectAllEmpty("40");
  assert.ok(state.driverSelected.v1 && state.driverSelected.v2 && state.driverSelected.v3, "select all 40' keeps the 20' choice");
  M.toggleSelectAllEmpty("40");
  assert.ok(!state.driverSelected.v1 && !state.driverSelected.v2 && state.driverSelected.v3, "second tap un-selects only the 40' ones");
  state.driverSelected = {};
});

const TR = await import("../public/js/views/trucking.js");
const trCont = (id, numewo, size, trucking, extra) => Object.assign({ id, numewo, billId: "b1", size, division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "Depo A", trucking, dateEmpty: null, dateLeft: null }, extra || {});
const trSetup = () => {
  state.truckingGroup = ""; state.truckingStatus = "tout"; state.search = "";
  state.containers = [
    trCont("t1", "FULLCFC0001", "40", "CFC"),
    trCont("t2", "FULLCFC0002", "20", "CFC 7"),
    trCont("t3", "VIDCFC00001", "40", "CFC", { dateEmpty: "2026-09-10" }),
    trCont("t4", "VIDCTSA0001", "20", "CTSA", { dateEmpty: "2026-09-10" }),
    trCont("t5", "FULLDKN0001", "20", "DKN 003"),
    trCont("t6", "FULLNONE001", "40", null),
    trCont("t7", "KITECFC0001", "40", "CFC", { dateEmpty: "2026-09-05", dateLeft: "2026-09-06" }),
    trCont("t8", "PRANCTSA001", "20", "CTSA", { dateEntered: null, dateVerified: null, depo: null, datePran: "2026-10-02", pranBy: "me", chofer: "Jan Batis", plak: "CC-9999" }),
    trCont("t9", "DISPONIB001", "20", null, { dateEntered: null, dateVerified: null, depo: null }),
  ];
};

await test("trucking tab: containers are grouped per trucking (CFC 7 counts as CFC, DKN 003 counts as CTSA: same company), Full / Vid / Pran are counted, a waiting container is left out", () => {
  I.setLang("ht");
  trSetup();
  const g = Object.fromEntries(TR.truckingGroups(state.containers).map((x) => [x.key, x.list.map((c) => c.numewo).sort()]));
  assert.deepStrictEqual(g["CFC"], ["FULLCFC0001", "FULLCFC0002", "KITECFC0001", "VIDCFC00001"]);
  assert.deepStrictEqual(g["CTSA"], ["FULLDKN0001", "PRANCTSA001", "VIDCTSA0001"], "DKN is the same company as CTSA");
  assert.strictEqual(g["DKN"], undefined, "no separate DKN group");
  assert.deepStrictEqual(g["MAD"], [], "a known trucking is always shown, even with nothing on it");
  assert.deepStrictEqual(g["__none"], ["FULLNONE001"], "containers without trucking are visible too");
  assert.ok(!JSON.stringify(g).includes("DISPONIB001"), "a container still waiting is not part of any trucking yet");
  const html = admin("trucking", trSetup);
  I.setLang("fr");
  ["CFC", "CTSA", "MAD", "__none"].forEach((k) => assert.ok(html.includes('data-group="' + k + '"'), "a card for " + k));
  assert.ok(!html.includes('data-group="DKN"'), "no separate DKN card");
  assert.ok(html.includes("FULLCFC0001") && html.includes("FULLNONE001") && html.includes("PRANCTSA001"), "no trucking picked: the detail shows every active container");
  assert.ok(!html.includes("KITECFC0001") && !html.includes("DISPONIB001"), "kite and waiting containers stay out of the default list");
  assert.ok(!html.includes("Jan Batis") && !html.includes("CC-9999"), "no driver name or plate on the trucking card or the container cards");
  assert.ok(html.includes('data-action="container-info" data-id="t8"'), "a container card opens the detail");
});

await test("trucking tab: pick a trucking and a status, containers show in a 40' box and a 20' box", () => {
  I.setLang("ht");
  trSetup();
  const view = (extra) => admin("trucking", () => { trSetup(); extra(); });
  let html = view(() => { state.truckingGroup = "CFC"; state.truckingStatus = "tout"; });
  assert.ok(html.includes("FULLCFC0001") && html.includes("FULLCFC0002") && html.includes("VIDCFC00001"));
  assert.ok(!html.includes("VIDCTSA0001") && !html.includes("KITECFC0001"), "other trucking and kite ones are not listed under Tout");
  const b40 = html.indexOf("Kontenè 40 pye"), b20 = html.indexOf("Kontenè 20 pye");
  assert.ok(b40 > -1 && b20 > b40, "40' box first, then 20' box");
  assert.ok(html.slice(b40, b20).includes("FULLCFC0001") && !html.slice(b40, b20).includes("FULLCFC0002"), "the 20' one is not in the 40' box");
  html = view(() => { state.truckingGroup = "CFC"; state.truckingStatus = "vid"; });
  assert.ok(html.includes("VIDCFC00001") && !html.includes("FULLCFC0001"));
  html = view(() => { state.truckingGroup = "CTSA"; state.truckingStatus = "pran"; });
  assert.ok(html.includes("PRANCTSA001") && !html.includes("Jan Batis") && !html.includes("CC-9999"), "a taken container card does not show the driver or the plate");
  html = view(() => { state.truckingGroup = ""; state.truckingStatus = "kite"; });
  assert.ok(html.includes("KITECFC0001") && !html.includes("FULLCFC0001"));
  html = view(() => { state.truckingGroup = ""; state.truckingStatus = "tout"; state.search = "cc-9999"; });
  assert.ok(html.includes("PRANCTSA001") && !html.includes("VIDCFC00001"), "the search finds a plate");
  html = view(() => { state.truckingGroup = ""; state.truckingStatus = "tout"; state.search = "dkn"; });
  assert.ok(html.includes("FULLDKN0001") && html.includes("VIDCTSA0001") && !html.includes("VIDCFC00001"), "searching DKN also finds CTSA containers");
  html = view(() => { state.truckingGroup = ""; state.truckingStatus = "tout"; state.search = "ctsa"; });
  assert.ok(html.includes("FULLDKN0001") && html.includes("VIDCTSA0001"), "searching CTSA also finds DKN containers");
  I.setLang("fr");
  state.truckingGroup = ""; state.truckingStatus = "tout"; state.search = "";
});

await test("products tab: one dashboard-style card per product; tapping a card shows its containers", () => {
  I.setLang("ht");
  const setup = (pick) => () => {
    trSetup();
    state.bills = [{ id: "b1", numewo: "BILL-1", product: "Lait" }];
    state.productGroup = pick;
  };
  let html = admin("pwodwi", setup(""));
  assert.ok(html.includes('data-action="product-group" data-group="LAIT"'), "a card for the product");
  assert.ok(html.includes("kpi-value"), "same card look as the dashboard");
  assert.ok(!html.includes("FULLCFC0001"), "containers stay hidden until a product is picked");
  html = admin("pwodwi", setup("LAIT"));
  assert.ok(html.includes("FULLCFC0001") && html.includes("sel-tile selected"), "the picked product lists its containers");
  state.productGroup = "";
  I.setLang("fr");
});

await test("driver page: an account tied to a trucking sees it as fixed text (no dropdown); without one the driver chooses", () => {
  I.setLang("ht");
  let html = show(() => { state.authRole = "chofe"; state.role = "chofe"; state.sessionTrucking = "CTSA"; state.driverTrucking = "CTSA"; });
  assert.ok(!html.includes("driver-trucking-select") && html.includes("CTSA"));
  html = show(() => { state.authRole = "chofe"; state.role = "chofe"; state.sessionTrucking = ""; state.driverTrucking = ""; });
  assert.ok(html.includes("driver-trucking-select"));
  I.setLang("fr");
});

let bad = 0;
results.forEach((r) => { console.log((r[0] ? "  ok    " : "  FAIL  ") + r[1]); if (!r[0]) { bad++; console.log("        " + String(r[2] && r[2].message || r[2]).split("\n").slice(0, 14).join("\n        ")); } });
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
