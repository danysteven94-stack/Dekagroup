// Depot: "Antre Estòk" (stock entries registered against a Bill) and "Fich Debakman" (landing sheet PDF per Bill).
import { COLORS } from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  escapeHtml,
  formatDateShort,
  today
} from "../utils.js";

function billLabel(bill) {
  if (!bill) return "\u2014";
  return bill.numewo + (bill.product ? " \u2014 " + bill.product : "");
}

function billOptionsHtml(selected) {
  var sorted = state.bills.slice().sort(function (a, b) {
    return (a.numewo || "").localeCompare(b.numewo || "");
  });
  var opts = sorted.map(function (b) {
    return `<option value="${ escapeHtml(b.id) }"${ b.id === selected ? " selected" : "" }>${ escapeHtml(billLabel(b)) }</option>`;
  }).join("");
  return `<option value=""${ selected ? "" : " selected" }>\u2014 Chwazi yon Bill \u2014</option>${ opts }`;
}

function billById(id) {
  return state.bills.find(function (b) { return b.id === id; });
}

// ---- Antre Estòk ----

function stockEntryFormHtml() {
  return `<form id="stock-entry-form" class="card" style="padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px">
    <div class="h3" style="margin:0">Anrejistre yon Antre Estòk</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
      <div><span class="field-label">Bill *</span><select class="input" id="stock-f-bill" required>${ billOptionsHtml("") }</select></div>
      <div><span class="field-label">Dat *</span><input class="input" type="date" id="stock-f-date" value="${ today() }" required /></div>
      <div><span class="field-label">Kantite *</span><input class="input" type="number" min="0.01" step="0.01" id="stock-f-qty" placeholder="Egz. 120" required /></div>
      <div><span class="field-label">Inite *</span><input class="input" list="stock-units" id="stock-f-unit" placeholder="Egz. sak, kolo, bwat" required /><datalist id="stock-units"><option value="sak"/><option value="kolo"/><option value="bwat"/><option value="palèt"/><option value="lb"/><option value="gallon"/><option value="pyès"/></datalist></div>
      <div><span class="field-label">Kontenè (opsyonèl)</span><input class="input" id="stock-f-container" placeholder="Egz. MSCU1234567" /></div>
    </div>
    <div><span class="field-label">Deskripsyon Machandiz *</span><input class="input" id="stock-f-desc" placeholder="Egz. Rís Miami — sak 50lb" required /></div>
    <div><span class="field-label">Remak</span><input class="input" id="stock-f-remarks" placeholder="Opsyonèl" /></div>
    ${ state.stockErr ? `<div style="color:${ COLORS.urgent };font-size:12.5px">${ escapeHtml(state.stockErr) }</div>` : "" }
    <div style="display:flex;justify-content:flex-end"><button class="btn teal" type="submit"${ state.stockBusy ? " disabled" : "" }>${ icon("check", 15, "#fff") } ${ state.stockBusy ? "K ap anrejistre..." : "Anrejistre Antre a" }</button></div>
  </form>`;
}

function stockEntryRowHtml(entry) {
  var bill = billById(entry.billId);
  return `<div class="row"><div class="row-min"><span class="plate" style="border-color:${ COLORS.full }">${ escapeHtml(entry.description) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ bill ? escapeHtml(bill.numewo) : "\u2014" }</strong></div><div class="row-sub light">Kantite: <strong style="color:var(--muted)">${ escapeHtml(String(entry.quantity)) } ${ escapeHtml(entry.unit || "") }</strong></div>${ entry.containerNumewo ? `<div class="row-sub light">Kontenè: <strong style="color:var(--muted)">${ escapeHtml(entry.containerNumewo) }</strong></div>` : "" }${ entry.remarks ? `<div class="row-sub light">Nòt: ${ escapeHtml(entry.remarks) }</div>` : "" }</div><div class="mini">Dat<strong style="color:var(--rust)">${ formatDateShort(entry.entryDate) }</strong></div></div>`;
}

export function stockEntryTabView() {
  var list = state.stockFilterBill
    ? state.stockEntries.filter(function (e) { return e.billId === state.stockFilterBill; })
    : state.stockEntries;
  var body;
  if (state.stockLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje antre estòk yo...</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen antre estòk anrejistre.</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(stockEntryRowHtml).join("") }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">Estòk</div><h2 class="h2">Antre Estòk</h2></div></div>${ stockEntryFormHtml() }<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span class="field-label" style="margin:0">Filtre pa Bill</span><select class="input" id="stock-filter-bill" style="max-width:280px">${ billOptionsHtml(state.stockFilterBill) }</select></div>${ body }`;
}

// ---- Fich Debakman (landing sheet) ----

export function landingSheetTabView() {
  var bill = billById(state.landingBillId);
  var containers = bill ? state.containers.filter(function (c) { return c.billId === bill.id; }) : [];
  var entries = bill ? state.stockEntries.filter(function (e) { return e.billId === bill.id; }) : [];
  var preview = "";
  if (bill) {
    var cRows = containers.map(function (c) {
      return `<div class="row"><div class="row-min"><span class="plate" style="border-color:${ COLORS.full }">${ escapeHtml(c.numewo) }</span><div class="row-sub light">Divizyon: <strong>${ escapeHtml(c.division || "\u2014") }</strong></div><div class="row-sub light">Depo: <strong>${ escapeHtml(c.depo || "\u2014") }</strong></div></div><div class="mini">Antre<strong style="color:var(--rust)">${ formatDateShort(c.dateEntered) }</strong></div></div>`;
    }).join("");
    var eRows = entries.map(stockEntryRowHtml).join("");
    preview = `<div class="section-head" style="margin-top:20px"><div><div class="eyebrow">${ containers.length } kontenè</div><h3 class="h3">Kontenè nan Bill sa a</h3></div></div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">${ cRows || `<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè.</div></div>` }</div><div class="section-head"><div><div class="eyebrow">${ entries.length } antre</div><h3 class="h3">Atik Estòk anrejistre</h3></div></div><div style="display:flex;flex-direction:column;gap:8px">${ eRows || `<div class="empty">${ icon("circle", 22) }<div>Pa gen antre estòk pou Bill sa a.</div></div>` }</div><div style="margin-top:22px;display:flex;justify-content:flex-end"><button class="btn navy" data-action="download-landing-sheet" data-id="${ escapeHtml(bill.id) }">${ icon("boxes", 15, "#fff") } Telechaje Fich Debakman (PDF)</button></div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">Dokiman</div><h2 class="h2">Fich Debakman</h2></div></div><div class="card" style="padding:16px;margin-bottom:8px"><span class="field-label">Chwazi yon Bill</span><select class="input" id="stock-landing-bill">${ billOptionsHtml(state.landingBillId) }</select></div>${ bill ? preview : `<div class="empty">${ icon("circle", 22) }<div>Chwazi yon Bill pou wè fich debakman an.</div></div>` }`;
}
