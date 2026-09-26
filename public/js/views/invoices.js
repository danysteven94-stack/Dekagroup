// Depot: "Anrejistreman Fakti" (register a draft invoice against a Bill, with line items) and
// "Fakti Fini" (invoices marked finished, ready to download as a professional PDF).
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

function invoiceTotal(inv) {
  return (inv.items || []).reduce(function (sum, it) {
    return sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
  }, 0);
}

function money(n) {
  return n.toLocaleString("fr-HT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Anrejistreman Fakti (registration form with dynamic line items) ----

function itemRowHtml(item, i, removable) {
  return `<div class="inv-item-row" data-index="${ i }" style="display:grid;grid-template-columns:1fr 90px 110px 32px;gap:8px;align-items:center;margin-bottom:6px">
    <input class="input inv-item-desc" placeholder="Deskripsyon (egz. Estokaj kontenè)" value="${ escapeHtml(item.description || "") }" />
    <input class="input inv-item-qty" type="number" min="0.01" step="0.01" placeholder="Kantite" value="${ escapeHtml(String(item.qty || "")) }" />
    <input class="input inv-item-price" type="number" min="0" step="0.01" placeholder="Pri Inite" value="${ escapeHtml(String(item.unitPrice || "")) }" />
    ${ removable ? `<button type="button" class="linklike" data-action="invoice-remove-item" data-index="${ i }" title="Retire liy sa a">${ icon("undo", 16, COLORS.urgent) }</button>` : "<span></span>" }
  </div>`;
}

function invoiceFormHtml() {
  var d = state.invoiceDraft;
  var rows = d.items.map(function (item, i) {
    return itemRowHtml(item, i, d.items.length > 1);
  }).join("");
  return `<form id="invoice-form" class="card" style="padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px">
    <div class="h3" style="margin:0">Anrejistre yon Fakti</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
      <div><span class="field-label">Bill *</span><select class="input" id="inv-f-bill" required>${ billOptionsHtml(d.billId) }</select></div>
      <div><span class="field-label">Non Kliyan *</span><input class="input" id="inv-f-client" placeholder="Egz. Ekspò Karayib SA" value="${ escapeHtml(d.clientName || "") }" required /></div>
      <div><span class="field-label">Nimewo Fakti</span><input class="input" id="inv-f-number" placeholder="Otomatik si vid" value="${ escapeHtml(d.invoiceNumber || "") }" /></div>
      <div><span class="field-label">Dat Fakti</span><input class="input" type="date" id="inv-f-date" value="${ d.invoiceDate || today() }" /></div>
      <div><span class="field-label">Dat Delè</span><input class="input" type="date" id="inv-f-due" value="${ d.dueDate || "" }" /></div>
    </div>
    <div><span class="field-label">Adrès Kliyan</span><input class="input" id="inv-f-address" placeholder="Opsyonèl" value="${ escapeHtml(d.clientAddress || "") }" /></div>
    <div>
      <span class="field-label">Liy Fakti *</span>
      <div id="invoice-items">${ rows }</div>
      <button type="button" class="btn small ghost" data-action="invoice-add-item">${ icon("boxes", 13, "var(--ink)") } Ajoute yon Liy</button>
    </div>
    <div><span class="field-label">Remak</span><input class="input" id="inv-f-notes" placeholder="Opsyonèl" value="${ escapeHtml(d.notes || "") }" /></div>
    ${ state.invoicesErr ? `<div style="color:${ COLORS.urgent };font-size:12.5px">${ escapeHtml(state.invoicesErr) }</div>` : "" }
    <div style="display:flex;justify-content:flex-end"><button class="btn teal" type="submit"${ state.invoiceBusy ? " disabled" : "" }>${ icon("check", 15, "#fff") } ${ state.invoiceBusy ? "K ap anrejistre..." : "Anrejistre Fakti a" }</button></div>
  </form>`;
}

function invoiceRowHtml(inv, mode) {
  var bill = billById(inv.billId);
  var total = invoiceTotal(inv);
  var isFinished = inv.status === "fini";
  var actionHtml = mode === "registration"
    ? (isFinished
      ? `<button class="btn small navy" data-action="download-invoice" data-id="${ escapeHtml(inv.id) }">${ icon("boxes", 13, "#fff") } PDF</button>`
      : `<button class="btn small green" data-action="finish-invoice" data-id="${ escapeHtml(inv.id) }"${ state.invoiceBusy ? " disabled" : "" }>${ icon("check", 13, "#fff") } Make Fini</button>`)
    : `<button class="btn small navy" data-action="download-invoice" data-id="${ escapeHtml(inv.id) }">${ icon("boxes", 13, "#fff") } Telechaje PDF</button>`;
  return `<div class="row"><div class="row-min"><span class="plate" style="border-color:${ isFinished ? COLORS.green : COLORS.full }">${ escapeHtml(inv.invoiceNumber) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ bill ? escapeHtml(bill.numewo) : "\u2014" }</strong></div><div class="row-sub light">Kliyan: <strong style="color:var(--muted)">${ escapeHtml(inv.clientName || "\u2014") }</strong></div><div class="row-sub light">Total: <strong style="color:var(--muted)">${ money(total) } HTG</strong></div></div><div class="mini">Estati<strong style="color:${ isFinished ? COLORS.green : COLORS.rust }">${ isFinished ? "Fini" : "Anrejistre" }</strong></div>${ actionHtml }</div>`;
}

export function invoiceRegistrationTabView() {
  var list = state.invoiceFilterBill
    ? state.invoices.filter(function (e) { return e.billId === state.invoiceFilterBill; })
    : state.invoices;
  var body;
  if (state.invoicesLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje fakti yo...</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen fakti anrejistre.</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(function (inv) { return invoiceRowHtml(inv, "registration"); }).join("") }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">Fakti</div><h2 class="h2">Anrejistreman Fakti</h2></div></div>${ invoiceFormHtml() }<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span class="field-label" style="margin:0">Filtre pa Bill</span><select class="input" id="invoice-filter-bill" style="max-width:280px">${ billOptionsHtml(state.invoiceFilterBill) }</select></div>${ body }`;
}

// ---- Fakti Fini (finished invoices only) ----

export function invoiceFinishedTabView() {
  var list = state.invoices.filter(function (inv) { return inv.status === "fini"; });
  if (state.invoiceFilterBill) list = list.filter(function (inv) { return inv.billId === state.invoiceFilterBill; });
  var body;
  if (state.invoicesLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje fakti yo...</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen fakti fini pou kounye a.</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(function (inv) { return invoiceRowHtml(inv, "finished"); }).join("") }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">${ list.length } fakti fini</div><h2 class="h2">Fakti Fini</h2></div></div><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span class="field-label" style="margin:0">Filtre pa Bill</span><select class="input" id="invoice-filter-bill" style="max-width:280px">${ billOptionsHtml(state.invoiceFilterBill) }</select></div>${ body }`;
}
