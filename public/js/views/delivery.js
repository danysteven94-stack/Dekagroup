// Depot: "Rapò Livrezon" (all delivered containers, filterable) and "Livrezon Jounalye" (deliveries for one day).
// A "livrezon" happens when a client's product is handed over and the container becomes empty (dateEmpty) —
// NOT when a driver later takes the (now empty) container away with a trucking (dateLeft, a separate event).
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
  return `<option value=""${ selected ? "" : " selected" }>\u2014 Tout Bill \u2014</option>${ opts }`;
}

function deliveredContainers() {
  return state.containers.filter(function (c) { return !!c.dateEmpty; });
}

function billFor(c) {
  return state.bills.find(function (b) { return b.id === c.billId; });
}

function deliveryRowHtml(c) {
  var bill = billFor(c);
  return `<div class="row"><div class="row-min"><span class="plate" style="border-color:${ COLORS.vid }">${ escapeHtml(c.numewo) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ bill ? escapeHtml(bill.numewo) : "\u2014" }</strong></div><div class="row-sub light">Depo: <strong style="color:var(--muted)">${ escapeHtml(c.depo || "\u2014") }</strong></div><div class="row-sub light">Chofè: <strong style="color:var(--muted)">${ escapeHtml(c.chofer || "\u2014") }</strong></div><div class="row-sub light">Plak: <strong style="color:var(--muted)">${ escapeHtml(c.plak || "\u2014") }</strong></div>${ c.trucking ? `<div class="row-sub light">Trucking: <strong style="color:var(--muted)">${ escapeHtml(c.trucking) }</strong></div>` : "" }</div><div class="mini">Livre<strong style="color:${ COLORS.rust }">${ formatDateShort(c.dateEmpty) }</strong></div></div>`;
}

function deliveryReportRows(list) {
  return list.map(function (c, i) {
    var bill = billFor(c);
    return {
      cells: [
        String(i + 1),
        c.numewo,
        bill ? bill.numewo : "\u2014",
        c.depo || "\u2014",
        c.chofer || "\u2014",
        c.plak || "\u2014",
        formatDateShort(c.dateEmpty)
      ]
    };
  });
}

// ---- Rapò Livrezon (all deliveries, filterable by Bill and date range) ----

export function deliveryReportTabView() {
  var list = deliveredContainers();
  if (state.deliveryFilterBill) list = list.filter(function (c) { return c.billId === state.deliveryFilterBill; });
  if (state.deliveryFrom) list = list.filter(function (c) { return (c.dateEmpty || "") >= state.deliveryFrom; });
  if (state.deliveryTo) list = list.filter(function (c) { return (c.dateEmpty || "") <= state.deliveryTo; });
  list = list.slice().sort(function (a, b) { return (b.dateEmpty || "").localeCompare(a.dateEmpty || ""); });

  var body = list.length === 0
    ? `<div class="empty">${ icon("circle", 22) }<div>Pa gen livrezon pou filt sa a.</div></div>`
    : `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(deliveryRowHtml).join("") }</div>`;

  return `<div class="section-head"><div><div class="eyebrow">${ list.length } livrezon</div><h2 class="h2">Rapò Livrezon</h2></div><button class="btn navy" data-action="download-delivery-report">${ icon("boxes", 15, "#fff") } Telechaje Rapò (PDF)</button></div>
  <div class="card" style="padding:16px;margin-bottom:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
    <div><span class="field-label">Bill</span><select class="input" id="delivery-filter-bill">${ billOptionsHtml(state.deliveryFilterBill) }</select></div>
    <div><span class="field-label">Depi</span><input class="input" type="date" id="delivery-filter-from" value="${ state.deliveryFrom || "" }" /></div>
    <div><span class="field-label">Rive</span><input class="input" type="date" id="delivery-filter-to" value="${ state.deliveryTo || "" }" /></div>
  </div>
  ${ body }`;
}

export function downloadDeliveryReportRows() {
  var list = deliveredContainers();
  if (state.deliveryFilterBill) list = list.filter(function (c) { return c.billId === state.deliveryFilterBill; });
  if (state.deliveryFrom) list = list.filter(function (c) { return (c.dateEmpty || "") >= state.deliveryFrom; });
  if (state.deliveryTo) list = list.filter(function (c) { return (c.dateEmpty || "") <= state.deliveryTo; });
  list = list.slice().sort(function (a, b) { return (b.dateEmpty || "").localeCompare(a.dateEmpty || ""); });
  return deliveryReportRows(list);
}

// ---- Livrezon Jounalye (deliveries for one chosen day, default today) ----

export function dailyDeliveryTabView() {
  var date = state.dailyDeliveryDate || today();
  var list = deliveredContainers().filter(function (c) { return c.dateEmpty === date; });
  if (state.deliveryFilterBill) list = list.filter(function (c) { return c.billId === state.deliveryFilterBill; });

  var body = list.length === 0
    ? `<div class="empty">${ icon("circle", 22) }<div>Pa gen livrezon pou dat sa a.</div></div>`
    : `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(deliveryRowHtml).join("") }</div>`;

  return `<div class="section-head"><div><div class="eyebrow">${ list.length } livrezon</div><h2 class="h2">Livrezon Jounalye</h2></div><button class="btn navy" data-action="download-daily-delivery">${ icon("boxes", 15, "#fff") } Telechaje (PDF)</button></div>
  <div class="card" style="padding:16px;margin-bottom:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
    <div><span class="field-label">Dat</span><input class="input" type="date" id="daily-delivery-date" value="${ date }" /></div>
    <div><span class="field-label">Bill</span><select class="input" id="delivery-filter-bill">${ billOptionsHtml(state.deliveryFilterBill) }</select></div>
  </div>
  ${ body }`;
}

export function downloadDailyDeliveryRows() {
  var date = state.dailyDeliveryDate || today();
  var list = deliveredContainers().filter(function (c) { return c.dateEmpty === date; });
  if (state.deliveryFilterBill) list = list.filter(function (c) { return c.billId === state.deliveryFilterBill; });
  return deliveryReportRows(list);
}
