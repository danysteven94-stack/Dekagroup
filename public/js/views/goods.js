// Depot: "Machandiz Retounen" (goods returned) and "Machandiz Avarye" (goods damaged), both tied to a Bill.
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

var KIND_META = {
  retounen: {
    title: "Machandiz Retounen",
    formTitle: "Anrejistre yon Machandiz Retounen",
    reasonLabel: "Rezon Retou a *",
    reasonPlaceholder: "Egz. Kliyan refize, move kantite...",
    emptyMsg: "Pa gen machandiz retounen anrejistre.",
    submitLabel: "Anrejistre Retou a",
    color: COLORS.vid
  },
  avarye: {
    title: "Machandiz Avarye",
    formTitle: "Anrejistre yon Machandiz Avarye",
    reasonLabel: "Kòz Avari a *",
    reasonPlaceholder: "Egz. Domaj nan transpò, dlo...",
    emptyMsg: "Pa gen machandiz avarye anrejistre.",
    submitLabel: "Anrejistre Avari a",
    color: COLORS.urgent
  }
};

function goodsFormHtml(kind) {
  var meta = KIND_META[kind];
  return `<form id="goods-form" data-kind="${ kind }" class="card" style="padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px">
    <div class="h3" style="margin:0">${ meta.formTitle }</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
      <div><span class="field-label">Bill *</span><select class="input" id="goods-f-bill" required>${ billOptionsHtml("") }</select></div>
      <div><span class="field-label">Dat *</span><input class="input" type="date" id="goods-f-date" value="${ today() }" required /></div>
      <div><span class="field-label">Kantite *</span><input class="input" type="number" min="0.01" step="0.01" id="goods-f-qty" placeholder="Egz. 12" required /></div>
      <div><span class="field-label">Inite *</span><input class="input" list="goods-units" id="goods-f-unit" placeholder="Egz. sak, kolo, bwat" required /><datalist id="goods-units"><option value="sak"/><option value="kolo"/><option value="bwat"/><option value="palèt"/><option value="lb"/><option value="pyès"/></datalist></div>
      <div><span class="field-label">Kontenè (opsyonèl)</span><input class="input" id="goods-f-container" placeholder="Egz. MSCU1234567" /></div>
    </div>
    <div><span class="field-label">Deskripsyon Machandiz *</span><input class="input" id="goods-f-desc" placeholder="Egz. Rís Miami — sak 50lb" required /></div>
    <div><span class="field-label">${ meta.reasonLabel }</span><input class="input" id="goods-f-reason" placeholder="${ meta.reasonPlaceholder }" required /></div>
    <div><span class="field-label">Remak</span><input class="input" id="goods-f-remarks" placeholder="Opsyonèl" /></div>
    ${ state.goodsErr ? `<div style="color:${ COLORS.urgent };font-size:12.5px">${ escapeHtml(state.goodsErr) }</div>` : "" }
    <div style="display:flex;justify-content:flex-end"><button class="btn teal" type="submit"${ state.goodsBusy ? " disabled" : "" }>${ icon("check", 15, "#fff") } ${ state.goodsBusy ? "K ap anrejistre..." : meta.submitLabel }</button></div>
  </form>`;
}

function goodsRowHtml(item) {
  var bill = billById(item.billId);
  var meta = KIND_META[item.kind];
  return `<div class="row"><div class="row-min"><span class="plate" style="border-color:${ meta ? meta.color : COLORS.full }">${ escapeHtml(item.description) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ bill ? escapeHtml(bill.numewo) : "\u2014" }</strong></div><div class="row-sub light">Kantite: <strong style="color:var(--muted)">${ escapeHtml(String(item.quantity)) } ${ escapeHtml(item.unit || "") }</strong></div><div class="row-sub light">${ item.kind === "avarye" ? "Kòz" : "Rezon" }: <strong style="color:var(--muted)">${ escapeHtml(item.reason || "\u2014") }</strong></div>${ item.containerNumewo ? `<div class="row-sub light">Kontenè: <strong style="color:var(--muted)">${ escapeHtml(item.containerNumewo) }</strong></div>` : "" }${ item.remarks ? `<div class="row-sub light">Nòt: ${ escapeHtml(item.remarks) }</div>` : "" }</div><div class="mini">Dat<strong style="color:var(--rust)">${ formatDateShort(item.entryDate) }</strong></div></div>`;
}

function goodsKindTabView(kind) {
  var meta = KIND_META[kind];
  var list = state.goodsIncidents.filter(function (e) { return e.kind === kind; });
  if (state.goodsFilterBill) list = list.filter(function (e) { return e.billId === state.goodsFilterBill; });
  var body;
  if (state.goodsLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>${ meta.emptyMsg }</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(goodsRowHtml).join("") }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">${ list.length } antre</div><h2 class="h2">${ meta.title }</h2></div><button class="btn navy" data-action="download-goods-report" data-kind="${ kind }">${ icon("boxes", 15, "#fff") } Telechaje Rapò (PDF)</button></div>${ goodsFormHtml(kind) }<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span class="field-label" style="margin:0">Filtre pa Bill</span><select class="input" id="goods-filter-bill" style="max-width:280px">${ billOptionsHtml(state.goodsFilterBill) }</select></div>${ body }`;
}

export function returnedGoodsTabView() {
  return goodsKindTabView("retounen");
}

export function damagedGoodsTabView() {
  return goodsKindTabView("avarye");
}
