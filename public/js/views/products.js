// "Pwodwi" tab (administrator): the containers that are Full or Poko Verifye, grouped by the product of their Bill.
import { COLORS, STATUS_LABELS } from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  daysBetween,
  escapeHtml,
  formatDateShort,
  statusOf
} from "../utils.js";

// Pure helper (also used by the tests): [{ name, containers: [{ container, bill, status }], full, pokoverifye }]
// Same product written with different capitals/spaces ("Lait", "LAIT ") is one group; Bills without a product go last.
export function productGroups(containers, bills) {
  var groups = {};
  var order = [];
  (containers || []).forEach(function (container) {
    var status = statusOf(container);
    if (status !== "full" && status !== "pokoverifye") {
      return;
    }
    var bill = (bills || []).find(function (b) {
      return b.id === container.billId;
    });
    var name = bill && bill.product ? String(bill.product).trim().replace(/\s+/g, " ") : "";
    var key = name.toUpperCase();
    if (!groups[key]) {
      groups[key] = { name: name, containers: [], full: 0, pokoverifye: 0 };
      order.push(key);
    }
    groups[key].containers.push({ container: container, bill: bill, status: status });
    groups[key][status]++;
  });
  return order.map(function (key) {
    var g = groups[key];
    g.containers.sort(function (a, b) {
      var da = a.container.dateEntered || "";
      var db = b.container.dateEntered || "";
      return da === db ? (a.container.numewo < b.container.numewo ? -1 : 1) : da < db ? -1 : 1;
    });
    return g;
  }).sort(function (a, b) {
    if (!a.name !== !b.name) {
      return a.name ? -1 : 1;
    }
    return b.containers.length - a.containers.length || a.name.localeCompare(b.name);
  });
}

function productRow(item) {
  var c = item.container;
  var col = item.status === "full" ? COLORS.rust : COLORS.pokoverifye;
  var days = daysBetween(c.dateEntered, c.dateEmpty);
  return `<div class="row" style="border-left:4px solid ${ col }"><div class="row-min"><span class="plate" style="border-color:${ col }">${ escapeHtml(c.numewo) }</span> <span style="display:inline-block;font-family:var(--font-mono);font-weight:700;font-size:11px;background:var(--navy);color:#fff;padding:2px 6px;border-radius:4px;vertical-align:middle">${ c.size || "\u2014" }'</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ item.bill ? escapeHtml(item.bill.numewo) : "\u2014" }</strong></div>${ c.division ? `<div class="row-sub light">Divizyon: <strong style="color:var(--navy)">${ escapeHtml(c.division) }</strong></div>` : "" }${ c.depo ? `<div class="row-sub light">Depo: <strong style="color:${ COLORS.full }">${ escapeHtml(c.depo) }</strong></div>` : "" }</div><div class="mini">Antre<strong>${ formatDateShort(c.dateEntered) }</strong></div><div class="mini">Jou Full<strong style="color:${ col }">${ days } jou</strong></div><div style="margin-left:auto"><span class="chip" style="color:${ col };background:${ col }1A;border:1px solid ${ col }55"><span class="mini-dot" style="background:${ col }"></span>${ STATUS_LABELS[item.status] }</span></div></div>`;
}

export function productsView() {
  var groups = productGroups(state.containers, state.bills);
  var total = groups.reduce(function (sum, g) {
    return sum + g.containers.length;
  }, 0);
  var head = `<div class="section-head"><div><div class="eyebrow">${ total } kontenè \u00B7 ${ groups.length } pwodwi</div><h2 class="h2">Kontenè pa Pwodwi</h2></div></div><p style="font-size:12.5px;color:var(--muted-light);margin-top:-10px;margin-bottom:16px">Kontenè ki Full ak kontenè ki Poko Verifye yo, gwoupe selon pwodwi ki nan Bill la.</p>`;
  if (groups.length === 0) {
    return `${ head }<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè Full oswa Poko Verifye kounye a.</div></div>`;
  }
  var cards = groups.map(function (g) {
    var fullChip = g.full ? `<span class="chip" style="color:${ COLORS.rust };background:${ COLORS.rust }1A;border:1px solid ${ COLORS.rust }55"><strong>${ g.full }</strong> Full</span>` : "";
    var pvChip = g.pokoverifye ? `<span class="chip" style="color:${ COLORS.pokoverifye };background:${ COLORS.pokoverifye }1A;border:1px solid ${ COLORS.pokoverifye }55"><strong>${ g.pokoverifye }</strong> Poko Verifye</span>` : "";
    return `<div class="card" style="margin-bottom:16px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px"><span class="product-tag" style="font-size:13.5px">${ escapeHtml(g.name || "San pwodwi") }</span><span style="font-size:12.5px;color:var(--muted);font-family:var(--font-mono)">${ g.containers.length } kontenè</span><div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${ fullChip }${ pvChip }</div></div><div style="display:flex;flex-direction:column;gap:8px">${ g.containers.map(productRow).join("") }</div></div>`;
  }).join("");
  return head + cards;
}
