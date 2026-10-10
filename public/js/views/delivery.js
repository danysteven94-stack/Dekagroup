// Depot: "Fich Livrezon" (delivery slip: the sheet a client signs when goods leave the depot) and
// "Rapò Livrezon Jounalye" (the day's report of every slip).
//
// A slip follows the paper pad of Deka Group: company box ticked, date, Bon #, client, facture #, the products
// with their quantity, then magasinier / chauffeur / reçu par. Each product line is picked from the stock that
// the stock entries built (Antre Estòk), so what leaves on a slip is taken off that product in "Inventè" by itself.
// NO link to any container: a client being handed a product is a different event from a driver taking an emptied
// container away with a trucking.
import { COLORS } from "../constants.js";
import { icon } from "../icons.js";
import {
  computeInventory,
  requestedByKey
} from "../inventory.js";
import { state } from "../state.js";
import {
  escapeHtml,
  formatDateShort,
  today
} from "../utils.js";

// The eight companies printed on the pad, then the divisions of this app that are not on it (same list as the server).
export var SLIP_COMPANIES = ["CRISTO AL", "CRISTO PA", "CRISTO COM", "CONFIDEKA", "APOLLO MOTORS", "DEKA TIRES", "PCP", "LA MENAG\u00C8RE", "ACS", "MIKADO", "LA COLLECTION", "DEKAV"];

export function currentInventory() {
  return computeInventory({
    bills: state.bills,
    stockEntries: state.stockEntries,
    slips: state.slips,
    goodsIncidents: state.goodsIncidents
  }, today());
}

function fmtQty(n) {
  var v = Number(n) || 0;
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function billById(id) {
  return state.bills.find(function (b) { return b.id === id; });
}

// ---------------------------------------------------------------- Fich Livrezon: form

function productOptionsHtml(inventory, selectedKey) {
  var rows = inventory.filter(function (r) {
    return r.current > 0 || r.key === selectedKey;
  });
  var opts = rows.map(function (r) {
    var label = r.description + " \u00B7 Bill " + (r.billNumewo || "\u2014") + " \u00B7 disponib " + fmtQty(r.current) + " " + r.unit;
    return `<option value="${ escapeHtml(r.key) }"${ r.key === selectedKey ? " selected" : "" }>${ escapeHtml(label) }</option>`;
  }).join("");
  return `<option value=""${ selectedKey ? "" : " selected" }>\u2014 Chwazi yon pwodwi \u2014</option>${ opts }`;
}

function slipLineHtml(item, i, removable, inventory, asked) {
  var inv = inventory.find(function (r) { return r.key === item.key; });
  var avail = inv ? inv.current : 0;
  var over = inv && asked[item.key] > avail;
  var hint = inv ? `${ over ? `<div style="font-size:11.5px;margin-top:3px;color:${ COLORS.urgent };font-weight:700">\u26A0 Kantite a depase estòk la</div>` : "" }<div style="font-size:11.5px;margin-top:3px;color:var(--muted)">Disponib: <strong>${ fmtQty(avail) } ${ escapeHtml(inv.unit) }</strong></div>` : "";
  return `<div class="slip-line" data-index="${ i }" style="display:grid;grid-template-columns:1fr 120px 32px;gap:8px;align-items:start;margin-bottom:8px">
    <div><select class="input slip-line-product">${ productOptionsHtml(inventory, item.key) }</select>${ hint }</div>
    <div><input class="input slip-line-qty" type="number" min="0.01" step="0.01" placeholder="Kantite" value="${ escapeHtml(String(item.quantity || "")) }" />${ inv ? `<div style="font-size:11.5px;margin-top:3px;color:var(--muted)">${ escapeHtml(inv.unit) }</div>` : "" }</div>
    ${ removable ? `<button type="button" class="linklike" data-action="slip-remove-line" data-index="${ i }" title="Retire liy sa a">${ icon("undo", 16, COLORS.urgent) }</button>` : "<span></span>" }
  </div>`;
}

function companyBoxesHtml(selected) {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px 12px">${ SLIP_COMPANIES.map(function (name) {
    var on = selected === name;
    return `<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;cursor:pointer"><input type="checkbox" class="slip-company" value="${ escapeHtml(name) }"${ on ? " checked" : "" } /> ${ escapeHtml(name) }</label>`;
  }).join("") }</div>`;
}

function slipFormHtml() {
  var d = state.slipDraft;
  var inventory = currentInventory();
  var asked = requestedByKey(d.items);
  var removable = d.items.length > 1;
  var lines = d.items.map(function (it, i) {
    return slipLineHtml(it, i, removable, inventory, asked);
  }).join("");
  var noStock = inventory.every(function (r) { return r.current <= 0; });
  return `<form id="slip-form" class="card" style="padding:16px;margin-bottom:18px;display:flex;flex-direction:column;gap:12px">
    <div class="h3" style="margin:0">Nouvo Fich Livrezon</div>
    <div><span class="field-label">Konpayi</span>${ companyBoxesHtml(d.division) }</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
      <div><span class="field-label">Dat *</span><input class="input" type="date" id="slip-f-date" value="${ escapeHtml(d.slipDate || today()) }" required /></div>
      <div><span class="field-label">Bon #</span><input class="input" id="slip-f-number" placeholder="Egz. 296001" value="${ escapeHtml(d.slipNumber || "") }" /></div>
      <div><span class="field-label">Fakti #</span><input class="input" id="slip-f-invoice" placeholder="Egz. 120661C" value="${ escapeHtml(d.invoiceNumber || "") }" /></div>
    </div>
    <div><span class="field-label">Kliyan (Je ... certifie avoir re\u00E7u) *</span><input class="input" id="slip-f-client" placeholder="Non kliyan an" value="${ escapeHtml(d.clientName || "") }" required /></div>
    <div>
      <span class="field-label">Pwodwi ak Kantite *</span>
      ${ noStock ? `<div style="color:${ COLORS.urgent };font-size:12.5px;margin-bottom:8px">Pa gen pwodwi nan estòk. Anrejistre yon Antre Estòk anvan.</div>` : "" }
      <div id="slip-lines">${ lines }</div>
      <button type="button" class="btn small ghost" data-action="slip-add-line">${ icon("boxes", 13, "var(--ink)") } Ajoute yon Liy</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
      <div><span class="field-label">Magazinye</span><input class="input" id="slip-f-keeper" placeholder="Non magazinye a" value="${ escapeHtml(d.storekeeper || "") }" /></div>
      <div><span class="field-label">Chofè</span><input class="input" id="slip-f-driver" placeholder="Non chofè a" value="${ escapeHtml(d.driver || "") }" /></div>
      <div><span class="field-label">Resevwa pa</span><input class="input" id="slip-f-received" placeholder="Non moun ki resevwa a" value="${ escapeHtml(d.receivedBy || "") }" /></div>
      <div><span class="field-label">Livre le</span><input class="input" type="date" id="slip-f-delivered" value="${ escapeHtml(d.deliveredOn || d.slipDate || today()) }" /></div>
    </div>
    <div><span class="field-label">Remak</span><input class="input" id="slip-f-remarks" placeholder="Opsyonèl" value="${ escapeHtml(d.remarks || "") }" /></div>
    ${ state.slipsErr ? `<div style="color:${ COLORS.urgent };font-size:12.5px">${ escapeHtml(state.slipsErr) }</div>` : "" }
    <div style="display:flex;justify-content:flex-end"><button class="btn teal" type="submit"${ state.slipsBusy ? " disabled" : "" }>${ icon("check", 15, "#fff") } ${ state.slipsBusy ? "K ap anrejistre..." : "Anrejistre Fich la" }</button></div>
  </form>`;
}

// ---------------------------------------------------------------- Fich Livrezon: list

function slipLinesSummary(slip) {
  return (slip.items || []).map(function (it) {
    return `<div class="row-sub light">\u2022 <strong style="color:var(--muted)">${ escapeHtml(it.description) }</strong> \u2014 ${ escapeHtml(fmtQty(it.quantity)) } ${ escapeHtml(it.unit || "") }</div>`;
  }).join("");
}

function slipRowHtml(slip) {
  return `<div class="row"><div class="row-min"><span class="plate" style="border-color:${ COLORS.kite }">Bon # ${ escapeHtml(slip.slipNumber || "\u2014") }</span>${ slip.division ? ` <span class="chip" style="color:#fff;background:var(--navy)">${ escapeHtml(slip.division) }</span>` : "" }<div class="row-sub">Kliyan: <strong style="color:var(--navy)">${ escapeHtml(slip.clientName || "\u2014") }</strong></div><div class="row-sub light">Fakti #: <strong style="color:var(--muted)">${ escapeHtml(slip.invoiceNumber || "\u2014") }</strong></div>${ slipLinesSummary(slip) }${ slip.driver ? `<div class="row-sub light">Chofè: <strong style="color:var(--muted)">${ escapeHtml(slip.driver) }</strong></div>` : "" }${ slip.remarks ? `<div class="row-sub light">Nòt: ${ escapeHtml(slip.remarks) }</div>` : "" }</div><div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:6px"><div class="mini">Dat<strong style="color:${ COLORS.rust }">${ formatDateShort(slip.slipDate) }</strong></div><button class="btn small ghost" data-action="download-slip" data-id="${ escapeHtml(slip.id) }">${ icon("boxes", 13, "var(--ink)") } Fich (PDF)</button></div></div>`;
}

export function filteredSlips() {
  var q = (state.slipSearch || "").trim().toLowerCase();
  var list = state.slips.filter(function (s) {
    if (state.slipFrom && (s.slipDate || "") < state.slipFrom) return false;
    if (state.slipTo && (s.slipDate || "") > state.slipTo) return false;
    if (!q) return true;
    return [s.slipNumber, s.clientName, s.invoiceNumber, s.driver].some(function (v) {
      return String(v || "").toLowerCase().indexOf(q) !== -1;
    });
  });
  return list.slice().sort(function (a, b) {
    return (b.slipDate || "").localeCompare(a.slipDate || "") || (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

export function deliverySlipTabView() {
  var list = filteredSlips();
  var body;
  if (state.slipsLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`;
  } else if (list.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen fich livrezon anrejistre.</div></div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(slipRowHtml).join("") }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">${ list.length } fich</div><h2 class="h2">Fich Livrezon</h2></div></div>${ slipFormHtml() }<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap"><input class="input" id="slip-search" placeholder="Chèche Bon #, kliyan, fakti..." value="${ escapeHtml(state.slipSearch || "") }" style="max-width:260px" /><span class="field-label" style="margin:0">Depi</span><input class="input" type="date" id="slip-filter-from" value="${ state.slipFrom || "" }" style="max-width:160px" /><span class="field-label" style="margin:0">Rive</span><input class="input" type="date" id="slip-filter-to" value="${ state.slipTo || "" }" style="max-width:160px" /></div>${ body }`;
}

// ---------------------------------------------------------------- Rapò Livrezon Jounalye

function legacyDeliveries(date) {
  return state.goodsIncidents.filter(function (g) { return g.kind === "livrezon" && g.entryDate === date; });
}

// One row per product line of every slip of the chosen day, plus the old-style deliveries of that day (registered before the slips existed).
export function dailyReportLines(date) {
  var out = [];
  state.slips.filter(function (s) { return s.slipDate === date; }).slice().sort(function (a, b) {
    return String(a.slipNumber || "").localeCompare(String(b.slipNumber || ""), undefined, { numeric: true }) || (a.createdAt || "").localeCompare(b.createdAt || "");
  }).forEach(function (s) {
    (s.items || []).forEach(function (it) {
      out.push({
        slipNumber: s.slipNumber || "\u2014",
        clientName: s.clientName || "\u2014",
        invoiceNumber: s.invoiceNumber || "\u2014",
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || "",
        driver: s.driver || "\u2014"
      });
    });
  });
  legacyDeliveries(date).forEach(function (g) {
    var bill = billById(g.billId);
    out.push({
      slipNumber: "\u2014",
      clientName: g.reason || "\u2014",
      invoiceNumber: bill ? bill.numewo : "\u2014",
      description: g.description,
      quantity: Number(g.quantity) || 0,
      unit: g.unit || "",
      driver: "\u2014"
    });
  });
  return out;
}

export function dailyReportTotals(lines) {
  var map = {};
  var order = [];
  lines.forEach(function (l) {
    var k = l.description.trim().toLowerCase() + "|" + l.unit.trim().toLowerCase();
    if (!map[k]) {
      map[k] = { description: l.description, unit: l.unit, quantity: 0 };
      order.push(k);
    }
    map[k].quantity += l.quantity;
  });
  return order.map(function (k) {
    map[k].quantity = Math.round(map[k].quantity * 100) / 100;
    return map[k];
  });
}

export function dailySlipDateValue() {
  return state.dailySlipDate || today();
}

export function dailyReportTabView() {
  var date = dailySlipDateValue();
  var lines = dailyReportLines(date);
  var slipsOfDay = state.slips.filter(function (s) { return s.slipDate === date; });
  var totals = dailyReportTotals(lines);
  var body;
  if (state.slipsLoading || state.goodsLoading) {
    body = `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`;
  } else if (lines.length === 0) {
    body = `<div class="empty">${ icon("circle", 22) }<div>Pa gen livrezon pou jou sa a.</div></div>`;
  } else {
    var rows = slipsOfDay.slice().sort(function (a, b) {
      return String(a.slipNumber || "").localeCompare(String(b.slipNumber || ""), undefined, { numeric: true });
    }).map(slipRowHtml).join("");
    var legacy = legacyDeliveries(date).map(function (g) {
      return `<div class="row"><div class="row-min"><span class="plate" style="border-color:${ COLORS.kite }">${ escapeHtml(g.description) }</span><div class="row-sub">Kliyan: <strong style="color:var(--navy)">${ escapeHtml(g.reason || "\u2014") }</strong></div><div class="row-sub light">Kantite: <strong style="color:var(--muted)">${ escapeHtml(fmtQty(g.quantity)) } ${ escapeHtml(g.unit || "") }</strong></div><div class="row-sub light">Ansyen livrezon (anvan fich yo)</div></div></div>`;
    }).join("");
    var totalRows = totals.map(function (t) {
      return `<div class="row"><div class="row-min"><strong style="color:var(--navy)">${ escapeHtml(t.description) }</strong></div><div class="mini">Total<strong style="color:${ COLORS.rust }">${ escapeHtml(fmtQty(t.quantity)) } ${ escapeHtml(t.unit) }</strong></div></div>`;
    }).join("");
    body = `<div class="h3" style="margin:0 0 8px">Total pa pwodwi</div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">${ totalRows }</div><div class="h3" style="margin:0 0 8px">Fich yo</div><div style="display:flex;flex-direction:column;gap:8px">${ rows }${ legacy }</div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">${ slipsOfDay.length } fich \u00B7 ${ lines.length } liy</div><h2 class="h2">Rapò Livrezon Jounalye \u2014 ${ formatDateShort(date) }</h2></div><button class="btn navy" data-action="download-daily-delivery">${ icon("boxes", 15, "#fff") } Telechaje Rapò (PDF)</button></div><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap"><span class="field-label" style="margin:0">Dat</span><input class="input" type="date" id="daily-slip-date" value="${ date }" style="max-width:180px" /></div>${ body }`;
}
