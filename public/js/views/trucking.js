// Administrator "Trucking" tab: for every trucking company (CFC, CTSA, MAD, DKN...) how many containers are Full / Vid / Pran,
// and the details of those containers, laid out like the driver page (40' and 20' boxes of cards).
import {
  COLORS,
  STATUS_LABELS,
  TRUCKING_OPTIONS
} from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  daysBetween,
  escapeHtml,
  formatDateShort,
  statusOf,
  truckingSearchText
} from "../utils.js";

var NONE = "__none";
var COUNTED = ["full", "vid", "pran", "pokoverifye"];

// "CFC 12" -> "CFC", "DKN 003" (or the old "DNK" spelling) -> "CTSA" (DKN is the same company as CTSA), nothing -> NONE.
export function truckingGroupOf(value) {
  var v = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!v) {
    return NONE;
  }
  if (/^(DKN|DNK)(\s|\d|$)/.test(v)) {
    return "CTSA";
  }
  return v.replace(/[\s._-]*\d+$/, "") || v;
}

function sizeOf(c) {
  return String(c.size) === "40" ? "40" : String(c.size) === "20" ? "20" : "other";
}

function countBy(list, status) {
  return list.filter(function (c) {
    return statusOf(c) === status;
  });
}

function sizeNote(list) {
  var a = list.filter(function (c) { return sizeOf(c) === "40"; }).length;
  var b = list.filter(function (c) { return sizeOf(c) === "20"; }).length;
  var x = list.length - a - b;
  return `40': ${ a } \u00B7 20': ${ b }${ x ? ` \u00B7 ?: ${ x }` : "" }`;
}

// Every container that has a trucking story (not the ones still on their way with nobody on them), grouped by trucking company.
export function truckingGroups(containers) {
  var map = {};
  function get(key) {
    return map[key] || (map[key] = { key: key, list: [] });
  }
  TRUCKING_OPTIONS.forEach(get);
  containers.forEach(function (c) {
    if (statusOf(c) !== "disponib") {
      get(truckingGroupOf(c.trucking)).list.push(c);
    }
  });
  var fixed = TRUCKING_OPTIONS;
  var others = Object.keys(map).filter(function (k) {
    return fixed.indexOf(k) === -1 && k !== NONE;
  }).sort();
  var keys = fixed.concat(others);
  if (map[NONE]) {
    keys.push(NONE);
  }
  return keys.map(function (k) {
    return map[k];
  });
}

function line(label, value, color) {
  return `<div class="kpi-sub">${ label }: <strong style="color:${ color || "var(--navy)" }">${ value }</strong></div>`;
}

function groupCard(g, selected) {
  var name = g.key === NONE ? "San trucking" : g.key;
  var active = g.list.filter(function (c) {
    return statusOf(c) !== "kite";
  }).length;
  var rows = ["full", "vid", "pran", "pokoverifye"].map(function (s) {
    var l = countBy(g.list, s);
    if (l.length === 0 && s !== "full" && s !== "vid") {
      return "";
    }
    return `<div class="kpi-sub">${ STATUS_LABELS[s] }: <strong style="color:${ COLORS[s] };font-size:15px">${ l.length }</strong>${ l.length ? ` <span style="color:var(--muted-light)">(${ sizeNote(l) })</span>` : "" }</div>`;
  }).join("");
  var kite = countBy(g.list, "kite").length;
  return `<div class="kpi sel-tile${ selected ? " selected" : "" }" data-action="trucking-group" data-group="${ escapeHtml(g.key) }" style="--sel:${ COLORS.navy }" role="checkbox" aria-checked="${ selected ? "true" : "false" }"><div class="kpi-top"><span class="plate" style="border-color:${ COLORS.navy }">${ escapeHtml(name) }</span><div class="kpi-value" style="font-size:22px">${ active }</div></div>${ rows }<div class="kpi-sub" style="color:var(--muted-light)">Kite: ${ kite }</div></div>`;
}

function tile(c) {
  var st = statusOf(c);
  var color = COLORS[st] || COLORS.navy;
  var bill = state.bills.find(function (b) {
    return b.id === c.billId;
  });
  var extra = "";
  if (st === "full" || st === "pokoverifye") {
    extra = line("Antre", formatDateShort(c.dateEntered), "var(--ink)") + line("Jou", String(daysBetween(c.dateEntered)), "var(--ink)");
  } else if (st === "vid") {
    extra = line("Vid Depi", formatDateShort(c.dateEmpty), "var(--ink)") + line("Jou", String(daysBetween(c.dateEmpty)), "var(--ink)");
  } else if (st === "kite") {
    extra = line("Kite", formatDateShort(c.dateLeft), "var(--ink)");
  }
  return `<div class="kpi" data-action="container-info" data-id="${ escapeHtml(c.id) }" style="border-left:4px solid ${ color };gap:8px;cursor:pointer"><div class="kpi-top"><span class="plate" style="border-color:${ color }">${ escapeHtml(c.numewo) }</span><span class="badge" style="background:${ color }">${ STATUS_LABELS[st] }</span></div>${ line("Bill", bill ? escapeHtml(bill.numewo) : "\u2014") }${ line("Pwodwi", bill && bill.product ? escapeHtml(bill.product) : "\u2014", "var(--muted)") }${ line("Trucking", c.trucking ? escapeHtml(c.trucking) : "\u2014", "var(--ink)") }${ c.depo ? line("Depo", escapeHtml(c.depo), COLORS.full) : "" }${ extra }</div>`;
}

function box(title, list, color) {
  return `<div class="size-box" style="--sel:${ color }"><div class="size-head"><div class="h3" style="margin:0">${ title }</div><div class="size-count">${ list.length } kontenè</div></div>${ list.length === 0 ? `<div class="size-empty">Pa gen kontenè kounye a.</div>` : `<div class="grid-kpi" style="margin-bottom:0">${ list.map(tile).join("") }</div>` }</div>`;
}

export function truckingView() {
  var all = state.containers.filter(function (c) {
    return statusOf(c) !== "disponib";
  });
  var groups = truckingGroups(state.containers);
  var picked = state.truckingGroup || "";
  var pickedGroup = groups.find(function (g) {
    return g.key === picked;
  });
  if (!pickedGroup) {
    picked = "";
  }
  var fs = state.truckingStatus || "tout";
  var q = state.search.trim().toLowerCase();

  // top cards: all truckings together (same look as the driver page)
  var kpis = COUNTED.map(function (s) {
    var l = countBy(all, s);
    return `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${ STATUS_LABELS[s] }</span><div class="kpi-icon" style="background:${ COLORS[s] }1A;color:${ COLORS[s] }">${ icon("boxes", 14, COLORS[s]) }</div></div><div class="kpi-value">${ l.length }</div><div class="kpi-sub">${ sizeNote(l) }</div></div>`;
  }).join("");

  var cards = groups.map(function (g) {
    return groupCard(g, g.key === picked);
  }).join("");

  var filters = ["tout", "full", "vid", "pran", "pokoverifye", "kite"].map(function (s) {
    return `<button class="filter-btn${ fs === s ? " active" : "" }" data-action="trucking-status" data-filter="${ s }">${ s === "tout" ? "Tout" : STATUS_LABELS[s] }</button>`;
  }).join("");

  var list = (pickedGroup ? pickedGroup.list : all).filter(function (c) {
    var st = statusOf(c);
    if (fs === "tout" ? st === "kite" : st !== fs) {
      return false;
    }
    if (!q) {
      return true;
    }
    var b = state.bills.find(function (x) {
      return x.id === c.billId;
    });
    return [c.numewo, b && b.numewo, b && b.product, c.chofer, c.plak, truckingSearchText(c.trucking), c.depo].some(function (v) {
      return v && String(v).toLowerCase().indexOf(q) !== -1;
    });
  }).sort(function (a, b) {
    return COUNTED.concat(["kite"]).indexOf(statusOf(a)) - COUNTED.concat(["kite"]).indexOf(statusOf(b)) || (a.numewo < b.numewo ? -1 : 1);
  });
  var s40 = list.filter(function (c) { return sizeOf(c) === "40"; });
  var s20 = list.filter(function (c) { return sizeOf(c) === "20"; });
  var other = list.filter(function (c) { return sizeOf(c) === "other"; });

  var title = picked ? (picked === NONE ? "San trucking" : picked) : "Tout trucking";
  var details = `<div class="section-head" style="margin-top:8px"><div><div class="eyebrow">${ list.length } kontenè</div><h2 class="h2">${ escapeHtml(title) }</h2></div><div class="toolbar"><div class="search-wrap"><span class="search-icon">${ icon("search", 14) }</span><input class="input" id="f-search" placeholder="Chèche kontenè, bill, chofè, plak..." value="${ escapeHtml(state.search) }" /></div></div></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">${ filters }</div>` +
    (list.length === 0 ? `<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè ki koresponn.</div></div>` : box("Kontenè 40 pye", s40, COLORS.navy) + box("Kontenè 20 pye", s20, COLORS.steel) + (other.length ? box("Kontenè san gwosè", other, COLORS.disponib) : ""));

  return `<div class="section-head"><div><div class="eyebrow">${ all.length } kontenè</div><h2 class="h2">Apèsi pa Trucking</h2></div></div><div class="grid-kpi">${ kpis }</div><p class="size-hint">Peze sou yon trucking pou wè kontenè li yo. Peze ankò pou wè tout.</p><div class="grid-kpi">${ cards }</div>${ details }`;
}
