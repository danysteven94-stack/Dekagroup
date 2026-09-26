// Depot interface.
import {
  ALL_DIVISIONS,
  COLORS,
  LOGO_URL,
  URGENT_AFTER_DAYS
} from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  daysBetween,
  escapeHtml,
  formatDateShort,
  formatLongDate,
  formatTime,
  statusOf
} from "../utils.js";
import { accountButton } from "./account.js";
import { helpButton } from "./help.js";
import {
  landingSheetTabView,
  stockEntryTabView
} from "./stock.js";
import {
  invoiceFinishedTabView,
  invoiceRegistrationTabView
} from "./invoices.js";
import {
  damagedGoodsTabView,
  returnedGoodsTabView
} from "./goods.js";
import {
  dailyDeliveryTabView,
  deliveryReportTabView
} from "./livrezon.js";

var DEPOT_TABS = [
  { id: "list", label: "Kontenè Full", icon: "boxes" },
  { id: "dashboard", label: "Tablo Kontwôl", icon: "grid" },
  { id: "stock", label: "Antre Estòk", icon: "boxes" },
  { id: "landing", label: "Fich Debakman", icon: "grid" },
  { id: "invreg", label: "Anrejistreman Fakti", icon: "boxes" },
  { id: "invfin", label: "Fakti Fini", icon: "check" },
  { id: "returned", label: "Machandiz Retounen", icon: "undo" },
  { id: "damaged", label: "Machandiz Avarye", icon: "alert" },
  { id: "livrezon", label: "Livrezon Jounalye", icon: "boxes" },
  { id: "livrezonrapo", label: "Rapò Livrezon", icon: "download" }
];

function depotDivisionView() {
  var e = state.containers.filter(function (container) {
    return statusOf(container) === "full";
  });
  if (state.depotDivision) {
    var dv = state.depotDivision;
    var list = e.filter(function (i) {
      return i.division === dv;
    });
    var rows = list.length === 0 ? `<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè nan divizyon sa a.</div></div>` : list.map(function (i) {
      var bl = state.bills.find(function (bill) {
        return bill.id === i.billId;
      });
      var days = daysBetween(i.dateEntered);
      var urgent = days > URGENT_AFTER_DAYS;
      var col = urgent ? COLORS.urgent : COLORS.full;
      return `<div class="row" style="border-left:4px solid ${ col }"><div class="row-min"><span class="plate" style="border-color:${ col }">${ escapeHtml(i.numewo) }</span><div class="row-sub">Pwodwi: <strong style="color:var(--navy)">${ bl && bl.product ? escapeHtml(bl.product) : "\u2014" }</strong></div><div class="row-sub light">Depo: <strong style="color:${ COLORS.full }">${ i.depo ? escapeHtml(i.depo) : "\u2014" }</strong></div><div class="row-sub light">Antre: <strong style="color:var(--muted)">${ formatDateShort(i.dateEntered) }</strong></div></div><div class="mini">Jou Full<strong style="color:${ urgent ? COLORS.urgent : COLORS.rust }">${ days } jou</strong></div>${ urgent ? `<span class="chip" style="color:#fff;background:${ COLORS.urgent }">⚠ Ijan</span>` : "" }<div style="margin-left:auto;display:flex;gap:6px"><button class="btn small ghost" data-action="transfer-depo" data-id="${ i.id }">Transfere Depo</button><button class="btn small green" data-action="mark-empty" data-id="${ i.id }">Mete Vid Jodi a</button></div></div>`;
    }).join("");
    return `<button class="linklike" data-action="back-depot-division" style="margin-bottom:14px">← Tounen nan Tablo Kontwôl</button><div class="section-head"><div><div class="eyebrow">${ list.length } kontenè full</div><h2 class="h2">${ escapeHtml(dv) }</h2></div></div><div style="display:flex;flex-direction:column;gap:8px">${ rows }</div>`;
  }
  var tot = e.length;
  var divs = ALL_DIVISIONS.map(function (dv) {
    return {
      name: dv,
      count: e.filter(function (i) {
        return i.division === dv;
      }).length
    };
  });
  var cards = divs.map(function (d) {
    return `<div class="kpi" data-action="view-depot-division" data-division="${ escapeHtml(d.name) }" style="cursor:pointer"><div class="kpi-top"><span class="kpi-label">${ escapeHtml(d.name) }</span><div class="kpi-icon" style="background:${ COLORS.full }1A;color:${ COLORS.full }">${ icon("boxes", 14, COLORS.full) }</div></div><div class="kpi-value">${ d.count }</div></div>`;
  }).join("");
  return `<div class="section-head"><div><div class="eyebrow">Estatistik</div><h2 class="h2">Tablo Kontwôl</h2></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:22px"><div class="kpi"><div class="kpi-top"><span class="kpi-label">Total Kontenè Full</span><div class="kpi-icon" style="background:${ COLORS.navy }1A;color:${ COLORS.navy }">${ icon("boxes", 14, COLORS.navy) }</div></div><div class="kpi-value">${ tot }</div></div></div><div style="font-size:12.5px;color:var(--muted-light);margin-bottom:10px;font-weight:600">Pa Divizyon (klike pou wè detay)</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">${ cards }</div>`;
}

export function depotView() {
  var e = state.containers.filter(function (container) {
    return statusOf(container) === "full";
  });
  var n;
  var tabs;
  var body;
  if (e.length === 0) {
    n = `<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè Full kounye a.</div></div>`;
  } else {
    n = e.map(function (i) {
      var o = state.bills.find(function (bill) {
        return bill.id === i.billId;
      });
      var a = daysBetween(i.dateEntered);
      var l = a > URGENT_AFTER_DAYS;
      var s = l ? COLORS.urgent : COLORS.full;
      return `<div class="row" style="border-left:4px solid ${ s }"><div class="row-min"><span class="plate" style="border-color:${ s }">${ escapeHtml(i.numewo) }</span> <span style="display:inline-block;font-family:var(--font-mono);font-weight:700;font-size:11px;background:var(--navy);color:#fff;padding:2px 6px;border-radius:4px;vertical-align:middle">${ i.size || "\u2014" }'</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ o ? escapeHtml(o.numewo) : "\u2014" }</strong></div><div class="row-sub light">Pwodwi: <strong style="color:var(--muted)">${ o && o.product ? escapeHtml(o.product) : "\u2014" }</strong></div><div class="row-sub light">Depo: <strong style="color:${ COLORS.full }">${ i.depo ? escapeHtml(i.depo) : "\u2014" }</strong></div></div><div class="mini">Jou Full<strong style="color:${ l ? COLORS.urgent : COLORS.rust }">${ a } jou</strong></div>${ l ? `<span class="chip" style="color:#fff;background:${ COLORS.urgent }">⚠ Ijan</span>` : "" }<div style="margin-left:auto;display:flex;gap:6px"><button class="btn small ghost" data-action="transfer-depo" data-id="${ i.id }">Transfere Depo</button><button class="btn small green" data-action="mark-empty" data-id="${ i.id }">Mete Vid Jodi a</button></div></div>`;
    }).join("");
  }
  var curTab = state.depotTab || "dashboard";
  tabs = `<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">${ DEPOT_TABS.map(function (tb) {
    var on = curTab === tb.id;
    return `<button class="btn${ on ? "" : " ghost" }" data-action="set-depot-tab" data-tab="${ tb.id }" style="background:${ on ? COLORS.full : "transparent" };color:${ on ? "#fff" : "var(--ink)" };border:1px solid ${ on ? COLORS.full : "var(--border)" }">${ icon(tb.icon, 15, on ? "#fff" : "var(--ink)") } ${ tb.label }</button>`;
  }).join("") }</div>`;
  if (curTab === "dashboard") {
    body = depotDivisionView();
  } else if (curTab === "stock") {
    body = stockEntryTabView();
  } else if (curTab === "landing") {
    body = landingSheetTabView();
  } else if (curTab === "invreg") {
    body = invoiceRegistrationTabView();
  } else if (curTab === "invfin") {
    body = invoiceFinishedTabView();
  } else if (curTab === "returned") {
    body = returnedGoodsTabView();
  } else if (curTab === "damaged") {
    body = damagedGoodsTabView();
  } else if (curTab === "livrezon") {
    body = dailyDeliveryTabView();
  } else if (curTab === "livrezonrapo") {
    body = deliveryReportTabView();
  } else {
    body = `<div class="section-head"><div><div class="eyebrow">${ e.length } kontenè full</div><h2 class="h2">Kontenè nan Depo yo</h2></div></div><div style="display:flex;flex-direction:column;gap:8px">${ n }</div>`;
  }
  return `<div style="min-height:100vh;background:var(--bg)"><header style="background:var(--navy);padding:18px 20px;display:flex;align-items:center;gap:12px"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1"><div style="color:#fff;font-weight:800;font-size:16px">DEKA LOG — Depo</div><div style="color:var(--steel-light);font-size:11.5px">Jesyon kontenè Full ak depo yo · ${ formatLongDate() }</div></div>${ state.lastSyncTime ? `<div style="color:var(--steel-light);font-size:10.5px;text-align:right">Dènye sinkwonizasyon<br/>${ formatTime(state.lastSyncTime) }</div>` : "" }${ helpButton("#fff") + accountButton("#fff") }<button class="linklike" data-action="logout" style="color:#fff">${ icon("undo", 12) } Dekonekte</button></header><main class="content" style="max-width:820px;margin:0 auto">${ tabs }${ body }</main><div style="text-align:center;font-size:10px;color:var(--muted-light);padding:20px">© ${ new Date().getFullYear() } Deka Group · v1.0</div></div>`;
}
