// Depot: "Livrezon Jounalye" (log a delivery made out of the depot to a client, tied to a Bill)
// and "Rapò Livrezon" (a date-range report of those deliveries, downloadable as a PDF).
import { COLORS, TRUCKING_OPTIONS } from "../constants.js";
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

function truckingOptionsHtml(selected) {
  var opts = TRUCKING_OPTIONS.map(function (o) {
    return `<option value="${ o }"${ selected === o ? " selected" : "" }>${ o }</option>`;
  }).join("");
  return `<option value=""${ selected ? "" : " selected" }>\u2014 Opsyonèl \u2014</option>${ opts }`;
}

// ---- Livrezon Jounalye (delivery log form + list) ----

function deliveryFormHtml() {
  return `<form id="delivery-form" class="card" style="padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px">
    <div class="h3" style="margin:0">Anrejistre yon Livrezon</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
      <div><span class="field-label">Bill *</span><select class="input" id="delivery-f-bill" required>${ billOptionsHtml("") }</select></div>
      <div><span class="field-label">Dat *</span><input class="input" type="date" id="delivery-f-date" value="${ today() }" required /></div>
      <div><span class="field-label">Kliyan / Destinasyon</span><input class="input" id="delivery-f-client" placeholder="Egz. Ekspò Karayib SA" /></div>
      <div><span class="field-label">Kantite *</span><input class="input" type="number" min="0.01" step="0.01" id="delivery-f-qty" placeholder="Egz. 12" required /></div>
      <div><span class="field-label">Inite *</span><input class="input" list="delivery-units" id="delivery-f-unit" placeholder="Egz. sak, kolo, bwat" required /><datalist id="delivery-units"><option value="sak"/><option value="kolo"/><option value="bwat"/><option value="palèt"/><option value="lb"/><option value="pyès"/></datalist></div>
      <div><span class="field-label">Kontenè (opsyonèl)</span><input class="input" id="delivery-f-container" placeholder="Egz. MSCU1234567" /></div>
      <div><span class="field-label">Trucking</span><select class="input" id="delivery-f-trucking">${ truckingOptionsHtml("") }</select></div>
      <div><span class="field-label">Chofè</span><input class="input" id="delivery-f-chofer" placeholder="Non chofè a" /></div>
    </div>
    <div><span class="field-label">Deskripsyon Machandiz *</span><input class="input" id="delivery-f-desc" placeholder="Egz. Rís Miami — sak 50lb" required /></div>
    <div><span class="field-label">Remak</span><input class="input" id="delivery-f-remarks" placeholder="Opsyonèl" /></div>
    ${ state.deliveriesErr ? `<div style="color:${ COLORS.urgent };font-size:12.5px">${ escapeHtml(state.deliveriesErr) }</div>` : "" }
    <div style="display:flex;justify-content:flex-end"><button class="btn teal" type="submit"${ state.deliveryBusy ? " disabled" : "" }>${ icon("check", 15, "#fff") } ${ state.deliveryBusy ? "K ap anrejistre..." : "Anrejistre Livrezon an" }</button></div>
  </form>`;
}

function deliveryRowHtml(item) {
  var bill = billById(item.billId);
  var truckLine = [item.trucking, item.chofer].filter(Boolean).join(" \u2014 ");
  return `<div class="row"><div class="row-min"><span class="plate" style="border-color:${ COLORS.teal }">${ escapeHtml(item.description) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ bill ? escapeHtml(bill.numewo) : "\u2014" }</strong></div><div class="row-sub light">Kantite: <strong style="color:var(--muted)">${ escapeHtml(String(item.quantity)) } ${ escapeHtml(item.unit || "") }</strong></div>${ item.clientName ? `<div class="row-sub light">Kliyan: <strong style="color:var(--muted)">${ escapeHtml(item.clientName) }</strong></div>` : "" }${ item.containerNumewo ? `<div class="row-sub light">Kontenè: <strong style="color:var(--muted)">${ escapeHtml(item.containerNumewo) }</strong></div>` : "" }${ truckLine ? `<div class="row-sub light">${ escapeHtml(truckLine) }</div>` : "" }${ item.remarks ? `<div class="row-sub light">Nòt: ${ escapeHtml(item.remarks) }</div>` : "" }</div><div class="mini">Dat<strong style="color:var(--rust)">${ formatDateShort(item.entryDate) }</strong></div></div>`;
}

export function dailyDeliveryTabView() {
  var list = state.deliveries;
  if (state.deliveryFilterBill) list = list.filter(function (e) { return e.billId === state.deliveryFilterBill; });
  var body;
  if (state.deliveriesLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen livrezon anrejistre.</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(deliveryRowHtml).join("") }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">${ list.length } livrezon</div><h2 class="h2">Livrezon Jounalye</h2></div></div>${ deliveryFormHtml() }<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span class="field-label" style="margin:0">Filtre pa Bill</span><select class="input" id="delivery-filter-bill" style="max-width:280px">${ billOptionsHtml(state.deliveryFilterBill) }</select></div>${ body }`;
}

// ---- Rapò Livrezon (date-range report + PDF download) ----

export function deliveryReportTabView() {
  var from = state.deliveryReportFrom;
  var to = state.deliveryReportTo;
  var list = state.deliveries.slice();
  if (from) list = list.filter(function (e) { return (e.entryDate || "") >= from; });
  if (to) list = list.filter(function (e) { return (e.entryDate || "") <= to; });
  list = list.slice().sort(function (a, b) {
    return (b.entryDate || "").localeCompare(a.entryDate || "");
  });
  var totalQty = list.reduce(function (sum, e) { return sum + (Number(e.quantity) || 0); }, 0);
  var kpis = [
    { label: "Livrezon", value: list.length },
    { label: "Kantite Total", value: totalQty }
  ].map(function (k) {
    return `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${ k.label }</span><div class="kpi-icon" style="background:${ COLORS.teal }1A;color:${ COLORS.teal }">${ icon("boxes", 14, COLORS.teal) }</div></div><div class="kpi-value">${ k.value }</div></div>`;
  }).join("");
  var body;
  if (state.deliveriesLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen livrezon pou peryòd sa a.</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(deliveryRowHtml).join("") }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">Rapò</div><h2 class="h2">Rapò Livrezon</h2></div><button class="btn teal" data-action="download-delivery-report">${ icon("download", 15, "#fff") } Telechaje Rapò (PDF)</button></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px">${ kpis }</div><div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:16px"><div><span class="field-label">Depi</span><input class="input" type="date" id="delivery-report-from" value="${ from }" /></div><div><span class="field-label">Jiska</span><input class="input" type="date" id="delivery-report-to" value="${ to }" /></div></div>${ body }`;
}
