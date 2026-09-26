// Depot: "Rapò Livrezon" (register + list deliveries, filterable by Bill and date) and
// "Livrezon Jounalye" (deliveries for one chosen day). A "livrezon" is a manual entry —
// Bill + Pwodwi (product) + Kantite (quantity) + Kliyan (client) — stored as a
// goods-incident of kind "livrezon", same as Machandiz Retounen/Avarye. NO link to any
// container: a client asking for a product and being handed it is a different event from
// a driver later taking an emptied container away with a trucking.
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

function deliveries() {
  return state.goodsIncidents.filter(function (e) { return e.kind === "livrezon"; });
}

function deliveryFormHtml() {
  return `<form id="delivery-form" class="card" style="padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px">
    <div class="h3" style="margin:0">Anrejistre yon Livrezon</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
      <div><span class="field-label">Bill *</span><select class="input" id="delivery-f-bill" required>${ billOptionsHtml("") }</select></div>
      <div><span class="field-label">Dat *</span><input class="input" type="date" id="delivery-f-date" value="${ today() }" required /></div>
      <div><span class="field-label">Kantite *</span><input class="input" type="number" min="0.01" step="0.01" id="delivery-f-qty" placeholder="Egz. 12" required /></div>
      <div><span class="field-label">Inite *</span><input class="input" list="delivery-units" id="delivery-f-unit" placeholder="Egz. sak, kolo, bwat" required /><datalist id="delivery-units"><option value="sak"/><option value="kolo"/><option value="bwat"/><option value="palèt"/><option value="lb"/><option value="pyès"/></datalist></div>
    </div>
    <div><span class="field-label">Deskripsyon Pwodwi *</span><input class="input" id="delivery-f-desc" placeholder="Egz. Rís Miami — sak 50lb" required /></div>
    <div><span class="field-label">Kliyan *</span><input class="input" id="delivery-f-client" placeholder="Non kliyan an" required /></div>
    <div><span class="field-label">Remak</span><input class="input" id="delivery-f-remarks" placeholder="Opsyonèl" /></div>
    ${ state.goodsErr ? `<div style="color:${ COLORS.urgent };font-size:12.5px">${ escapeHtml(state.goodsErr) }</div>` : "" }
    <div style="display:flex;justify-content:flex-end"><button class="btn teal" type="submit"${ state.goodsBusy ? " disabled" : "" }>${ icon("check", 15, "#fff") } ${ state.goodsBusy ? "K ap anrejistre..." : "Anrejistre Livrezon an" }</button></div>
  </form>`;
}

function deliveryRowHtml(item) {
  var bill = billById(item.billId);
  return `<div class="row"><div class="row-min"><span class="plate" style="border-color:${ COLORS.kite }">${ escapeHtml(item.description) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ bill ? escapeHtml(bill.numewo) : "\u2014" }</strong></div><div class="row-sub light">Kantite: <strong style="color:var(--muted)">${ escapeHtml(String(item.quantity)) } ${ escapeHtml(item.unit || "") }</strong></div><div class="row-sub light">Kliyan: <strong style="color:var(--muted)">${ escapeHtml(item.reason || "\u2014") }</strong></div>${ item.remarks ? `<div class="row-sub light">Nòt: ${ escapeHtml(item.remarks) }</div>` : "" }</div><div class="mini">Dat<strong style="color:${ COLORS.rust }">${ formatDateShort(item.entryDate) }</strong></div></div>`;
}

function deliveryReportRows(list) {
  return list.map(function (item, i) {
    var bill = billById(item.billId);
    return {
      cells: [
        String(i + 1),
        bill ? bill.numewo : "\u2014",
        item.description,
        String(item.quantity) + " " + (item.unit || ""),
        item.reason || "\u2014",
        formatDateShort(item.entryDate)
      ]
    };
  });
}

function filteredDeliveries() {
  var list = deliveries();
  if (state.deliveryFilterBill) list = list.filter(function (e) { return e.billId === state.deliveryFilterBill; });
  if (state.deliveryFrom) list = list.filter(function (e) { return (e.entryDate || "") >= state.deliveryFrom; });
  if (state.deliveryTo) list = list.filter(function (e) { return (e.entryDate || "") <= state.deliveryTo; });
  return list.slice().sort(function (a, b) { return (b.entryDate || "").localeCompare(a.entryDate || ""); });
}

export function deliveryReportTabView() {
  var list = filteredDeliveries();
  var body;
  if (state.goodsLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen livrezon anrejistre.</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(deliveryRowHtml).join("") }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">${ list.length } antre</div><h2 class="h2">Rapò Livrezon</h2></div><button class="btn navy" data-action="download-delivery-report">${ icon("grid", 15, "#fff") } Telechaje Rapò (PDF)</button></div>${ deliveryFormHtml() }<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap"><span class="field-label" style="margin:0">Filtre pa Bill</span><select class="input" id="delivery-filter-bill" style="max-width:280px">${ billOptionsHtml(state.deliveryFilterBill) }</select><span class="field-label" style="margin:0">Depi</span><input class="input" type="date" id="delivery-filter-from" value="${ state.deliveryFrom || "" }" style="max-width:160px" /><span class="field-label" style="margin:0">Rive</span><input class="input" type="date" id="delivery-filter-to" value="${ state.deliveryTo || "" }" style="max-width:160px" /></div>${ body }`;
}

export function downloadDeliveryReportRows() {
  return deliveryReportRows(filteredDeliveries());
}

export function dailyDeliveryTabView() {
  var date = state.dailyDeliveryDate || today();
  var list = deliveries().filter(function (e) { return e.entryDate === date; });
  if (state.deliveryFilterBill) list = list.filter(function (e) { return e.billId === state.deliveryFilterBill; });
  var body;
  if (state.goodsLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen livrezon pou jou sa a.</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(deliveryRowHtml).join("") }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">${ list.length } livrezon</div><h2 class="h2">Livrezon Jounalye \u2014 ${ formatDateShort(date) }</h2></div><button class="btn navy" data-action="download-daily-delivery">${ icon("boxes", 15, "#fff") } Telechaje Rapò (PDF)</button></div><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap"><span class="field-label" style="margin:0">Dat</span><input class="input" type="date" id="daily-delivery-date" value="${ date }" style="max-width:180px" /><span class="field-label" style="margin:0">Filtre pa Bill</span><select class="input" id="delivery-filter-bill" style="max-width:280px">${ billOptionsHtml(state.deliveryFilterBill) }</select></div>${ body }`;
}

export function downloadDailyDeliveryRows() {
  var date = state.dailyDeliveryDate || today();
  var list = deliveries().filter(function (e) { return e.entryDate === date; });
  if (state.deliveryFilterBill) list = list.filter(function (e) { return e.billId === state.deliveryFilterBill; });
  return deliveryReportRows(list);
}
