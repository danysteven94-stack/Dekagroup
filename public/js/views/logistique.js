// Logistique Deka: its OWN bills (typed in here, never taken from the containers of the other interfaces) and the
// confirmation of their payment, division by division. A Logistique Deka account always sees every division.
// A Bill goes through: Pa peye -> Chèk resevwa (check received) -> Peye (the broker took it and paid it) -> Konfime.
// Every date is typed in by hand. One payment can cover one Bill or several Bills at once.
import {
  COLORS,
  LOGISTIQUE_DIVISIONS,
  LOGO_URL
} from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  escapeHtml,
  formatDateShort,
  formatLongDate,
  formatTime,
  today
} from "../utils.js";
import { pushCard } from "../push.js";
import { accountButton } from "./account.js";
import { helpButton } from "./help.js";

export var STAGES = [
  { id: "poko", label: "Pa peye", color: COLORS.rust },
  { id: "chek", label: "Chèk resevwa", color: COLORS.vid },
  { id: "peye", label: "Peye", color: COLORS.teal },
  { id: "konfime", label: "Peman konfime", color: COLORS.green }
];

var TABS = [
  { id: "bills", label: "Pèman Bill yo", icon: "check" },
  { id: "summary", label: "Rezime pa Divizyon", icon: "grid" }
];

export function stageOf(p) {
  if (!p) return "poko";
  if (p.confirmedDate) return "konfime";
  if (p.paidDate) return "peye";
  if (p.checkDate) return "chek";
  return "poko";
}

// A bill whose check was received 3 days ago (or more) and whose payment is still not confirmed.
export var OVERDUE_DAYS = 3;

export function daysSince(date) {
  return Math.floor((Date.parse(today() + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / 86400000);
}

export function isOverdue(rec) {
  return !!(rec && rec.checkDate && !rec.confirmedDate && daysSince(rec.checkDate) >= OVERDUE_DAYS);
}

export function stageInfo(id) {
  return STAGES.find(function (s) { return s.id === id; }) || STAGES[0];
}

// A Logistique Deka bill carries its own payment steps: the record itself is the payment.
export function paymentOf(billId) {
  return state.lgBills.find(function (p) { return p.id === billId; }) || null;
}

// The six divisions of Logistique Deka, plus any older division still found on an existing bill (never hidden).
export function lgDivisions() {
  var list = LOGISTIQUE_DIVISIONS.slice();
  state.lgBills.forEach(function (b) {
    if (b && b.division && list.indexOf(b.division) === -1) list.push(b.division);
  });
  return list;
}

export function billDivisions(bill) {
  return bill && bill.division ? [bill.division] : [];
}

export function billDivision(bill) {
  var d = billDivisions(bill);
  return d.length ? d[0] : "";
}

export function money(n, currency) {
  if (n === null || n === undefined || n === "" || !isFinite(Number(n))) return "\u2014";
  return Number(n).toLocaleString("fr-HT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (currency || "HTG");
}

function sumByCurrency(list) {
  var out = {};
  list.forEach(function (p) {
    if (p && p.amount > 0) out[p.currency || "HTG"] = (out[p.currency || "HTG"] || 0) + p.amount;
  });
  return out;
}

function sumsHtml(sums) {
  var keys = Object.keys(sums).sort();
  if (!keys.length) return "\u2014";
  return keys.map(function (k) { return escapeHtml(money(sums[k], k)); }).join(" + ");
}

// The Bills shown in the list, after the filters (division, step, search).
export function filteredBills() {
  var P = state.pay;
  var q = (P.search || "").trim().toLowerCase();
  return state.lgBills.filter(function (b) {
    if (P.filterDivision && billDivision(b) !== P.filterDivision) return false;
    if (P.filterStatus && stageOf(paymentOf(b.id)) !== P.filterStatus) return false;
    if (P.filterOverdue && !isOverdue(paymentOf(b.id))) return false;
    if (q && (String(b.numewo || "") + " " + String(b.product || "")).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function (a, b) {
    var ca = stageOf(paymentOf(a.id)) === "konfime" ? 1 : 0;
    var cb = stageOf(paymentOf(b.id)) === "konfime" ? 1 : 0;
    return ca - cb || String(a.numewo || "").localeCompare(String(b.numewo || ""));
  });
}

export function selectedIds() {
  return Object.keys(state.pay.sel).filter(function (id) { return state.pay.sel[id]; });
}

// What the form starts with: the values of the Bill when only one is chosen, or the values every chosen Bill has in common.
export function prefillForm(ids) {
  var recs = ids.map(paymentOf);
  function common(key) {
    var vals = recs.map(function (r) { return r && r[key] ? r[key] : ""; });
    return vals.every(function (v) { return v === vals[0]; }) ? vals[0] : "";
  }
  var cur = common("currency");
  return {
    currency: cur === "USD" ? "USD" : "HTG",
    checkDate: common("checkDate"),
    paidDate: common("paidDate"),
    confirmedDate: common("confirmedDate"),
    broker: common("broker"),
    reference: common("reference"),
    notes: common("notes"),
    err: ""
  };
}

function totalOfSelection() {
  var P = state.pay;
  var total = 0;
  selectedIds().forEach(function (id) {
    var v = P.amounts[id];
    var n = parseFloat(String(v === undefined ? (paymentOf(id) && paymentOf(id).amount !== null ? paymentOf(id).amount : "") : v).replace(/,/g, ""));
    if (isFinite(n) && n > 0) total += n;
  });
  return total;
}

export function totalText() {
  return money(totalOfSelection(), state.pay.form ? state.pay.form.currency : "HTG");
}

// ---- the payment form (opens above the list as soon as at least one Bill is chosen)

function dateFieldHtml(field, label, hint, value) {
  return `<div><span class="field-label">${ label }</span><div style="display:flex;gap:6px"><input class="input" type="date" data-payf="${ field }" max="${ today() }" value="${ escapeHtml(value || "") }" /><button type="button" class="btn small ghost" data-action="pay-today" data-field="${ field }" style="white-space:nowrap">Jodi a</button></div><div style="font-size:11px;color:var(--muted-light);margin-top:3px">${ hint }</div></div>`;
}

function paymentFormHtml() {
  var P = state.pay;
  var f = P.form;
  var ids = selectedIds();
  if (!ids.length || !f) return "";
  var rows = ids.map(function (id) {
    var bill = state.lgBills.find(function (b) { return b.id === id; });
    if (!bill) return "";
    var rec = paymentOf(id);
    var amt = P.amounts[id] === undefined ? (rec && rec.amount !== null ? String(rec.amount) : "") : P.amounts[id];
    return `<div style="display:grid;grid-template-columns:1fr 130px;gap:8px;align-items:center;margin-bottom:6px"><div style="min-width:0"><strong style="color:var(--navy)">${ escapeHtml(bill.numewo) }</strong><div style="font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ escapeHtml(bill.product || "") }${ billDivision(bill) ? " · " + escapeHtml(billDivision(bill)) : "" }</div></div><input class="input" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Montan" data-payamt="${ escapeHtml(id) }" value="${ escapeHtml(amt) }" /></div>`;
  }).join("");
  var many = ids.length > 1;
  return `<form id="pay-form" class="card" style="padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px;border:2px solid ${ COLORS.teal }">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><div class="h3" style="margin:0">${ many ? "Yon sèl peman pou " + ids.length + " bill" : "Peman pou yon bill" }</div><button type="button" class="linklike" data-action="pay-cancel">Anile</button></div>
    <div><span class="field-label">Ki monte chak bill la vo *</span>${ rows }
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px"><select class="input" data-payf="currency" style="max-width:110px"><option value="HTG"${ f.currency === "HTG" ? " selected" : "" }>HTG</option><option value="USD"${ f.currency === "USD" ? " selected" : "" }>USD</option></select><div style="font-weight:800;color:var(--navy)">Total: <span id="pay-total">${ escapeHtml(totalText()) }</span></div></div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px">
      ${ dateFieldHtml("checkDate", "Dat ou resevwa chèk la", "Lè chèk la rive pou bill la.", f.checkDate) }
      ${ dateFieldHtml("paidDate", "Dat li peye", "Lè brokè a pote chèk la ale epi peye.", f.paidDate) }
      ${ dateFieldHtml("confirmedDate", "Dat ou konfime", "Lè ou konfime ke peman an pase.", f.confirmedDate) }
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      <div><span class="field-label">Brokè</span><input class="input" data-payf="broker" placeholder="Non brokè a" value="${ escapeHtml(f.broker || "") }" /></div>
      <div><span class="field-label">Nimewo chèk / Referans</span><input class="input" data-payf="reference" placeholder="Opsyonèl" value="${ escapeHtml(f.reference || "") }" /></div>
    </div>
    <div><span class="field-label">Remak</span><input class="input" data-payf="notes" placeholder="Opsyonèl" value="${ escapeHtml(f.notes || "") }" /></div>
    <div style="font-size:11.5px;color:var(--muted-light)">Ranpli sèlman etap ki fèt yo. Etap ou kite vid yo rete jan yo ye.</div>
    ${ f.err ? `<div class="alert" style="margin:0">${ icon("alert", 14) }${ escapeHtml(f.err) }</div>` : "" }
    <div style="display:flex;justify-content:flex-end"><button class="btn teal" type="submit"${ state.paymentsBusy ? " disabled" : "" }>${ icon("check", 15, "#fff") } ${ state.paymentsBusy ? "K ap konfime..." : "Konfime Peman an" }</button></div>
  </form>`;
}

// ---- a new bill (typed in by hand: division, number, product, amount if known)

function newBillFormHtml() {
  var f = state.pay.newForm;
  if (!f) return "";
  var opts = `<option value=""${ f.division ? "" : " selected" }>— Chwazi —</option>` + lgDivisions().map(function (d) {
    return `<option value="${ escapeHtml(d) }"${ f.division === d ? " selected" : "" }>${ escapeHtml(d) }</option>`;
  }).join("");
  return `<form id="pay-new-form" class="card" style="padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px;border:2px solid ${ COLORS.navy || "#1B2A4A" }">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div class="h3" style="margin:0">Nouvo bill</div><button type="button" class="linklike" data-action="pay-new-cancel">Anile</button></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      <div><span class="field-label">Divizyon *</span><select class="input" data-newf="division">${ opts }</select></div>
      <div><span class="field-label">Nimewo bill *</span><input class="input" data-newf="numewo" autocapitalize="characters" placeholder="Egz. LMM0592084" value="${ escapeHtml(f.numewo || "") }" /></div>
      <div><span class="field-label">Pwodwi</span><input class="input" data-newf="product" placeholder="Opsyonèl" value="${ escapeHtml(f.product || "") }" /></div>
    </div>
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
      <div style="flex:1;min-width:150px"><span class="field-label">Montan (si ou konnen l)</span><input class="input" type="number" inputmode="decimal" min="0" step="0.01" data-newf="amount" placeholder="Opsyonèl" value="${ escapeHtml(f.amount || "") }" /></div>
      <div style="min-width:170px"><span class="field-label">Dat chèk la rive</span><input class="input" type="date" data-newf="checkDate" max="${ today() }" value="${ escapeHtml(f.checkDate || "") }" /></div>
      <select class="input" data-newf="currency" style="max-width:110px"><option value="HTG"${ f.currency === "USD" ? "" : " selected" }>HTG</option><option value="USD"${ f.currency === "USD" ? " selected" : "" }>USD</option></select>
    </div>
    ${ f.err ? `<div class="alert" style="margin:0">${ icon("alert", 14) }${ escapeHtml(f.err) }</div>` : "" }
    <div style="display:flex;justify-content:flex-end"><button class="btn navy" type="submit"${ state.paymentsBusy ? " disabled" : "" }>${ icon("check", 15, "#fff") } Anrejistre bill la</button></div>
  </form>`;
}

// ---- the list of Bills

function billRowHtml(bill) {
  var rec = paymentOf(bill.id);
  var st = stageInfo(stageOf(rec));
  var checked = !!state.pay.sel[bill.id];
  var divs = billDivisions(bill);
  var dates = [];
  if (rec && rec.paidDate) dates.push("Peye: " + formatDateShort(rec.paidDate));
  var extra = [];
  if (rec && rec.broker) extra.push("Brokè: " + rec.broker);
  if (rec && rec.reference) extra.push("Chèk #: " + rec.reference);
  var last = rec ? (rec.confirmedDate ? "confirmed" : rec.paidDate ? "paid" : rec.checkDate ? "check" : "") : "";
  var undo = last ? `<button class="btn small ghost" data-action="pay-undo" data-id="${ escapeHtml(bill.id) }" data-stage="${ last }" title="Defèt dènye etap la">${ icon("undo", 13, COLORS.urgent) } Defèt</button>` : "";
  var del = rec && rec.confirmedDate ? "" : `<button class="btn small ghost" data-action="pay-delete" data-id="${ escapeHtml(bill.id) }" title="Efase bill la">${ icon("x", 13, COLORS.urgent) } Efase</button>`;
  var late = isOverdue(rec);
  var lateChip = late ? `<div class="row-sub" style="color:${ COLORS.urgent };font-weight:700">${ icon("alert", 12, COLORS.urgent) } ${ daysSince(rec.checkDate) } jou depi chèk la rive — peman poko konfime</div>` : "";
  var canConfirm = !!(rec && rec.checkDate && !rec.confirmedDate);
  var confirmBtn = canConfirm ? `<button class="btn small teal" data-action="pay-confirm" data-id="${ escapeHtml(bill.id) }" title="Konfime peman bill sa a sèlman">${ icon("check", 13, "#fff") } Konfime</button>` : "";
  return `<div class="row" style="border-left:4px solid ${ late ? COLORS.urgent : st.color };align-items:flex-start">
    <label style="display:flex;align-items:center;padding-top:2px;cursor:pointer"><input type="checkbox" data-action="pay-toggle" data-id="${ escapeHtml(bill.id) }"${ checked ? " checked" : "" } style="width:20px;height:20px" aria-label="Chwazi bill la" /></label>
    <div class="row-min" style="flex:1;min-width:190px"><span class="plate" style="border-color:${ st.color }">${ escapeHtml(bill.numewo) }</span>
      <div class="row-sub">Pwodwi: <strong style="color:var(--navy)">${ bill.product ? escapeHtml(bill.product) : "\u2014" }</strong></div>
      <div class="row-sub light">Divizyon: <strong style="color:var(--muted)">${ divs.length ? escapeHtml(divs.join(", ")) : "\u2014" }</strong></div>
      ${ lateChip }
      ${ dates.length ? `<div class="row-sub light">${ dates.map(escapeHtml).join(" · ") }</div>` : "" }
      ${ extra.length ? `<div class="row-sub light">${ extra.map(escapeHtml).join(" · ") }</div>` : "" }</div>
    <div class="mini">Dat chèk la rive<strong style="color:var(--navy)">${ rec && rec.checkDate ? escapeHtml(formatDateShort(rec.checkDate)) : "\u2014" }</strong></div>
    <div class="mini">Dat peman konfime<strong style="color:${ rec && rec.confirmedDate ? COLORS.green : "var(--navy)" }">${ rec && rec.confirmedDate ? escapeHtml(formatDateShort(rec.confirmedDate)) : "\u2014" }</strong></div>
    <div class="mini">Montan<strong style="color:var(--navy)">${ rec && rec.amount > 0 ? escapeHtml(money(rec.amount, rec.currency)) : "Poko mete" }</strong></div>
    <div class="mini">Estati<strong style="color:${ st.color }">${ st.label }</strong></div>
    <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${ confirmBtn }<button class="btn small ${ stageOf(rec) === "konfime" ? "ghost" : canConfirm ? "ghost" : "teal" }" data-action="pay-open" data-id="${ escapeHtml(bill.id) }">${ stageOf(rec) === "konfime" ? "Modifye" : "Peman" }</button>${ undo }${ del }</div>
  </div>`;
}

function kpiRowHtml() {
  var counts = { poko: 0, chek: 0, peye: 0, konfime: 0 };
  state.lgBills.forEach(function (b) {
    if (state.pay.filterDivision && billDivision(b) !== state.pay.filterDivision) return;
    counts[stageOf(paymentOf(b.id))]++;
  });
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px">${ STAGES.map(function (s) {
    var on = state.pay.filterStatus === s.id;
    return `<div class="kpi" data-action="pay-filter-stage" data-stage="${ s.id }" style="cursor:pointer;padding:12px;${ on ? "outline:2px solid " + s.color : "" }"><div class="kpi-top"><span class="kpi-label">${ s.label }</span></div><div class="kpi-value" style="color:${ s.color }">${ counts[s.id] }</div></div>`;
  }).join("") }</div>`;
}

function divisionOptionsHtml() {
  var list = lgDivisions();
  return `<option value=""${ state.pay.filterDivision ? "" : " selected" }>Tout divizyon</option>` + list.map(function (d) {
    return `<option value="${ escapeHtml(d) }"${ state.pay.filterDivision === d ? " selected" : "" }>${ escapeHtml(d) }</option>`;
  }).join("");
}

function statusOptionsHtml() {
  return `<option value=""${ state.pay.filterStatus ? "" : " selected" }>Tout estati</option>` + STAGES.map(function (s) {
    return `<option value="${ s.id }"${ state.pay.filterStatus === s.id ? " selected" : "" }>${ s.label }</option>`;
  }).join("");
}

function overdueBannerHtml() {
  var n = state.lgBills.filter(function (b) { return isOverdue(b); }).length;
  if (!n) return "";
  var on = !!state.pay.filterOverdue;
  return `<div class="alert" style="margin-bottom:16px;align-items:center">${ icon("alert", 16, COLORS.urgent) }<div style="flex:1;min-width:180px"><strong>${ n } bill gen ${ OVERDUE_DAYS } jou oswa plis san konfimasyon peman.</strong></div><button class="btn small ghost" data-action="pay-filter-overdue">${ on ? "Wè tout bill yo" : "Wè yo sèlman" }</button></div>`;
}

function billsTabView() {
  var list = filteredBills();
  var ids = selectedIds();
  var body;
  if (state.paymentsLoading && !state.paymentsLoaded) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje pèman yo...</div></div>`;
  } else if (state.lgBills.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Poko gen bill. Peze «Nouvo bill» pou ajoute youn.</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen bill ki koresponn.</div></div>`;
  } else {
    body = list.map(billRowHtml).join("");
  }
  var err = state.paymentsErr ? `<div class="alert">${ icon("alert", 14) }<div style="flex:1">${ escapeHtml(state.paymentsErr) }</div><button class="btn small ghost" data-action="pay-retry">Eseye Ankò</button></div>` : "";
  var pending = list.filter(function (b) { return stageOf(paymentOf(b.id)) !== "konfime"; }).length;
  return `<div class="section-head"><div><div class="eyebrow">${ list.length } bill</div><h2 class="h2">Pèman Bill yo</h2></div><div class="toolbar"><button class="btn teal" data-action="pay-new-open">${ icon("plus", 14, "#fff") } Nouvo bill</button></div></div>${ err }${ pushCard() }${ overdueBannerHtml() }${ newBillFormHtml() }${ kpiRowHtml() }${ paymentFormHtml() }
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
    <input class="input" id="pay-search" placeholder="Chèche bill oswa pwodwi..." value="${ escapeHtml(state.pay.search || "") }" style="flex:1;min-width:160px" />
    <select class="input" id="pay-filter-division" style="width:auto;min-width:140px">${ divisionOptionsHtml() }</select>
    <select class="input" id="pay-filter-status" style="width:auto;min-width:130px">${ statusOptionsHtml() }</select>
  </div>
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;font-size:12.5px">${ pending ? `<button class="linklike" data-action="pay-select-all">Chwazi tout ki poko konfime (${ pending })</button>` : "" }${ ids.length ? `<span style="color:var(--muted)">${ ids.length } chwazi</span><button class="linklike" data-action="pay-select-none">Dechwazi tout</button>` : "" }</div>
  <div>${ body }</div>`;
}

// ---- summary by division

function summaryTabView() {
  var names = lgDivisions();
  var cards = names.map(function (dv) {
    var bills = state.lgBills.filter(function (b) { return (billDivision(b) || "") === dv; });
    var counts = { poko: 0, chek: 0, peye: 0, konfime: 0 };
    var confirmed = [];
    var open = [];
    bills.forEach(function (b) {
      var rec = paymentOf(b.id);
      var s = stageOf(rec);
      counts[s]++;
      if (rec) (s === "konfime" ? confirmed : open).push(rec);
    });
    var chips = STAGES.map(function (s) {
      return `<span class="chip" style="color:#fff;background:${ s.color };opacity:${ counts[s.id] ? 1 : 0.35 }">${ s.label } · ${ counts[s.id] }</span>`;
    }).join(" ");
    return `<div class="kpi" data-action="pay-view-division" data-division="${ escapeHtml(dv) }" style="cursor:pointer"><div class="kpi-top"><span class="kpi-label">${ dv ? escapeHtml(dv) : "San divizyon" }</span><div class="kpi-icon" style="background:${ COLORS.teal }1A;color:${ COLORS.teal }">${ icon("check", 14, COLORS.teal) }</div></div><div class="kpi-value">${ bills.length }<span style="font-size:13px;font-weight:600;color:var(--muted)"> bill</span></div><div style="display:flex;flex-wrap:wrap;gap:5px">${ chips }</div><div class="kpi-sub">Konfime: <strong>${ sumsHtml(sumByCurrency(confirmed)) }</strong></div><div class="kpi-sub">Poko konfime (montan konnen): <strong>${ sumsHtml(sumByCurrency(open)) }</strong></div></div>`;
  }).join("");
  return `<div class="section-head"><div><div class="eyebrow">Estatistik</div><h2 class="h2">Rezime pa Divizyon</h2></div></div><div style="font-size:12.5px;color:var(--muted-light);margin-bottom:10px;font-weight:600">Peze sou yon divizyon pou wè bill li yo</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px">${ cards }</div>`;
}

export function logistiqueView() {
  var cur = state.pay.tab || "bills";
  var tabs = `<div class="depot-tabs">${ TABS.map(function (tb) {
    var on = cur === tb.id;
    return `<button class="dtab${ on ? " active" : "" }" data-action="pay-tab" data-tab="${ tb.id }">${ icon(tb.icon, 15, on ? "#fff" : "var(--muted)") } ${ tb.label }</button>`;
  }).join("") }</div>`;
  var drawerNav = TABS.map(function (tb) {
    var on = cur === tb.id;
    return `<button class="drawer-item${ on ? " active" : "" }" data-action="pay-tab" data-tab="${ tb.id }"><span class="drawer-ico">${ icon(tb.icon, 15, on ? "#fff" : "var(--steel-light)") }</span>${ tb.label }</button>`;
  }).join("");
  var body = cur === "summary" ? summaryTabView() : billsTabView();
  var drawerOpen = !!state.navDrawerOpen;
  var drawer = `<div class="nav-drawer-overlay${ drawerOpen ? " open" : "" }" data-action="close-nav-drawer"></div><nav class="nav-drawer${ drawerOpen ? " open" : "" }"><div class="nav-drawer-head"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1;min-width:0"><div class="drawer-brand">DEKA LOG<span class="depot-badge">Logistique Deka</span></div><div class="drawer-user">${ escapeHtml(state.sessionName || state.username || "") }</div></div><button class="drawer-close" data-action="close-nav-drawer" aria-label="Fèmen">${ icon("x", 16, "#fff") }</button></div><div class="nav-drawer-nav">${ drawerNav }</div><div class="nav-drawer-foot">${ state.lastSyncTime ? `<div class="drawer-sync">Dènye sinkwonizasyon · ${ formatTime(state.lastSyncTime) }</div>` : "" }<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">${ helpButton("#C9D6DE") + accountButton("#C9D6DE") }</div><button class="drawer-logout" data-action="logout">${ icon("logout", 15) } Dekonekte</button></div></nav>`;
  return `<div style="min-height:100vh;background:var(--bg)">${ drawer }<header class="depot-header"><button class="hamburger-btn" data-action="toggle-nav-drawer" aria-label="Meni">${ icon("menu", 18, "#fff") }</button><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1;min-width:180px"><div style="color:#fff;font-weight:800;font-size:16px">DEKA LOG<span class="depot-badge">Logistique Deka</span></div><div class="depot-desktop-actions" style="color:rgba(255,255,255,.8);font-size:11.5px;margin-top:2px">Konfimasyon pèman bill yo · ${ formatLongDate() }</div></div><div class="depot-desktop-actions" style="display:flex;align-items:center;gap:14px">${ state.lastSyncTime ? `<div style="color:rgba(255,255,255,.75);font-size:10.5px;text-align:right">Dènye sinkwonizasyon<br/>${ formatTime(state.lastSyncTime) }</div>` : "" }${ helpButton("#fff") + accountButton("#fff") }<button class="linklike" data-action="logout" style="color:#fff">${ icon("undo", 12) } Dekonekte</button></div></header><main class="content" style="max-width:860px;margin:0 auto">${ tabs }${ body }</main><div style="text-align:center;font-size:10px;color:var(--muted-light);padding:20px">© ${ new Date().getFullYear() } Deka Group · v1.0</div></div>`;
}
