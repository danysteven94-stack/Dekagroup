// Depot: "Inventè" — what is left in the depot for each product, worked out by itself from the stock entries
// (Antre Estòk), the delivery slips (Fich Livrezon) and the returned / damaged goods. Nothing is typed here.
// The calculation lives in ../inventory.js.
import { COLORS } from "../constants.js";
import { icon } from "../icons.js";
import {
  daysUntil,
  EXPIRY_SOON_DAYS
} from "../inventory.js";
import { state } from "../state.js";
import {
  escapeHtml,
  formatDateShort,
  today
} from "../utils.js";
import { currentInventory } from "./delivery.js";

function fmtQty(n) {
  var v = Number(n) || 0;
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

export function filteredInventory() {
  var q = (state.invSearch || "").trim().toLowerCase();
  var f = state.invFilter || "";
  return currentInventory().filter(function (r) {
    if (q && [r.description, r.billNumewo, r.product].every(function (v) {
      return String(v || "").toLowerCase().indexOf(q) === -1;
    })) {
      return false;
    }
    if (f === "expired") return r.expiryStatus === "expired";
    if (f === "soon") return r.expiryStatus === "soon" || r.expiryStatus === "expired";
    if (f === "empty") return r.current === 0;
    if (f === "negative") return r.negative;
    if (f === "instock") return r.current > 0;
    return true;
  });
}

// Text for the expiry of a product's soonest-expiring goods still in stock.
export function expiryText(r) {
  if (!r.nextExpiry || r.current <= 0) {
    return "";
  }
  var d = daysUntil(r.nextExpiry, today());
  if (r.expiryStatus === "expired") {
    return "Ekspire depi " + Math.abs(d) + " jou (" + formatDateShort(r.nextExpiry) + ")";
  }
  if (r.expiryStatus === "soon") {
    return d === 0 ? "Ekspire jodi a" : "Ekspire nan " + d + " jou (" + formatDateShort(r.nextExpiry) + ")";
  }
  return "Ekspire: " + formatDateShort(r.nextExpiry);
}

function expiryColor(r) {
  if (r.expiryStatus === "expired") return COLORS.urgent;
  if (r.expiryStatus === "soon") return COLORS.rust;
  return "var(--muted)";
}

function inventoryRowHtml(r) {
  var color = r.negative ? COLORS.urgent : r.current === 0 ? "var(--muted-light)" : COLORS.teal;
  var exp = expiryText(r);
  var chip = r.negative ? `<span class="chip" style="color:#fff;background:${ COLORS.urgent }">\u26A0 Estòk negatif</span>` : r.current === 0 ? `<span class="chip" style="color:var(--muted);background:var(--bg)">Fini</span>` : "";
  return `<div class="row" style="border-left:4px solid ${ color }"><div class="row-min"><span class="plate" style="border-color:${ color }">${ escapeHtml(r.description) }</span>${ chip }<div class="row-sub">Bill: <strong style="color:var(--navy)">${ escapeHtml(r.billNumewo || "\u2014") }</strong>${ r.product ? ` \u00B7 ${ escapeHtml(r.product) }` : "" }</div><div class="row-sub light">Antre: <strong style="color:var(--muted)">${ fmtQty(r.entered) }</strong> \u00B7 Livre: <strong style="color:var(--muted)">${ fmtQty(r.delivered) }</strong>${ r.damaged ? ` \u00B7 Avarye: <strong style="color:var(--muted)">${ fmtQty(r.damaged) }</strong>` : "" }${ r.returned ? ` \u00B7 Retounen: <strong style="color:var(--muted)">${ fmtQty(r.returned) }</strong>` : "" }</div>${ exp ? `<div class="row-sub light" style="color:${ expiryColor(r) };font-weight:700">${ r.expiryStatus === "expired" ? "\u26A0 " : "" }${ escapeHtml(exp) }</div>` : "" }</div><div class="mini">Estòk kounye a<strong style="color:${ color };font-size:20px">${ fmtQty(r.current) } ${ escapeHtml(r.unit) }</strong></div></div>`;
}

function kpi(label, value, color) {
  return `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${ label }</span><div class="kpi-icon" style="background:${ color }1A;color:${ color }">${ icon("boxes", 14, color) }</div></div><div class="kpi-value">${ value }</div></div>`;
}

export function inventoryTabView() {
  var all = currentInventory();
  var list = filteredInventory();
  var expired = all.filter(function (r) { return r.expiryStatus === "expired"; }).length;
  var soon = all.filter(function (r) { return r.expiryStatus === "soon"; }).length;
  var negative = all.filter(function (r) { return r.negative; }).length;
  var inStock = all.filter(function (r) { return r.current > 0; }).length;
  var body;
  if (state.stockLoading || state.slipsLoading || state.goodsLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`;
  } else if (all.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen pwodwi nan inventè a. Anrejistre yon Antre Estòk pou kòmanse.</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen pwodwi pou filt sa a.</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(inventoryRowHtml).join("") }</div>`;
  }
  var f = state.invFilter || "";
  var opt = function (v, label) { return `<option value="${ v }"${ f === v ? " selected" : "" }>${ label }</option>`; };
  return `<div class="section-head"><div><div class="eyebrow">${ list.length } pwodwi</div><h2 class="h2">Inventè</h2></div><button class="btn navy" data-action="download-inventory">${ icon("boxes", 15, "#fff") } Telechaje Inventè (PDF)</button></div><div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">Estòk kounye a = Antre Estòk \u2212 Fich Livrezon \u2212 Machandiz Avarye + Machandiz Retounen. Li kalkile pou kont li.</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:18px">${ kpi("Pwodwi nan estòk", inStock, COLORS.teal) }${ kpi("Ekspire", expired, COLORS.urgent) }${ kpi("Ap ekspire (" + EXPIRY_SOON_DAYS + " jou)", soon, COLORS.rust) }${ negative ? kpi("Estòk negatif", negative, COLORS.urgent) : "" }</div><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap"><input class="input" id="inv-search" placeholder="Chèche pwodwi, Bill..." value="${ escapeHtml(state.invSearch || "") }" style="max-width:240px" /><select class="input" id="inv-filter" style="max-width:240px">${ opt("", "\u2014 Tout pwodwi \u2014") }${ opt("instock", "Gen estòk") }${ opt("soon", "Ap ekspire / ekspire") }${ opt("expired", "Ekspire sèlman") }${ opt("empty", "Fini (0)") }${ opt("negative", "Estòk negatif") }</select></div>${ body }`;
}
