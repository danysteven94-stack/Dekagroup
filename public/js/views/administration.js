// Administration DEKA: a read-only window on EVERYTHING the logistic administrator and the depot enter —
// containers, products (bills), stock, deliveries, returned / damaged goods and invoices — for every division at once.
// Nothing can be changed from here. The data comes from /api/overview (see ../overview.js).
import {
  COLORS,
  LOGO_URL,
  STATUS_LABELS
} from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  divisionsInData,
  forDivision,
  summarize
} from "../overview.js";
import {
  daysBetween,
  escapeHtml,
  formatDateShort,
  formatLongDate,
  formatTime,
  isUrgent,
  truckingSearchText
} from "../utils.js";
import { accountButton } from "./account.js";
import { helpButton } from "./help.js";
import { expiryText } from "./inventory.js";

export var ADMINISTRATION_TABS = [
  { id: "apercu", label: "Apèsi", icon: "grid" },
  { id: "containers", label: "Kontenè", icon: "boxes" },
  { id: "products", label: "Pwodwi", icon: "clipboard" },
  { id: "stock", label: "Estòk", icon: "boxes" },
  { id: "moves", label: "Mouvman", icon: "truck" }
];

export var ADMINISTRATION_TITLES = {
  apercu: "Apèsi Jeneral",
  containers: "Rejis Kontenè",
  products: "Pwodwi ak Bill",
  stock: "Estòk nan Depo",
  moves: "Mouvman Estòk ak Dokiman"
};

export var CONTAINER_STATUSES = ["disponib", "pran", "pokoverifye", "full", "vid", "kite"];

export var MOVE_KINDS = [
  { id: "stock", label: "Antre Estòk" },
  { id: "slips", label: "Fich Livrezon" },
  { id: "retounen", label: "Machandiz Retounen" },
  { id: "avarye", label: "Machandiz Avarye" },
  { id: "invoices", label: "Fakti" },
  { id: "livrezon", label: "Ansyen Livrezon" }
];

var STOCK_FILTERS = [
  { id: "", label: "Tout" },
  { id: "instock", label: "Ann estòk" },
  { id: "soon", label: "Ap ekspire" },
  { id: "expired", label: "Ekspire" },
  { id: "empty", label: "Fini" },
  { id: "negative", label: "Negatif" }
];

var BILL_LABELS = { planifye: "Planifye", aktif: "Aktif", fini: "Fini" };
var BILL_COLORS = { planifye: COLORS.steel, aktif: COLORS.teal, fini: COLORS.green };
var INVOICE_LABELS = { anrejistre: "Anrejistre", fini: "Fini" };

function esc(v) {
  return escapeHtml(v);
}

function fmtQty(n) {
  var v = Number(n) || 0;
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function chip(text, color) {
  return `<span class="chip" style="color:${ color };background:${ color }1A">${ esc(text) }</span>`;
}

function statusChip(s) {
  return chip(STATUS_LABELS[s] || s, COLORS[s] || COLORS.steel);
}

function has(q, values) {
  return !q || values.some(function (v) {
    return String(v == null ? "" : v).toLowerCase().indexOf(q) !== -1;
  });
}

function query() {
  return (state.adm.search || "").trim().toLowerCase();
}

function divCell(d) {
  return d ? `<span class="adm-div">${ esc(d) }</span>` : "\u2014";
}

// ---- small building blocks ----

function table(cols, rows, emptyText) {
  if (!rows.length) {
    return `<div class="empty">${ icon("circle", 22) }<div>${ emptyText }</div></div>`;
  }
  var A = state.adm;
  var shown = rows.slice(0, A.limit);
  var head = cols.map(function (c) {
    return `<th${ c.cls ? ` class="${ c.cls }"` : "" }>${ c.h }</th>`;
  }).join("");
  var body = shown.map(function (r) {
    return "<tr>" + cols.map(function (c) {
      return `<td${ c.cls ? ` class="${ c.cls }"` : "" }>${ c.cell(r) }</td>`;
    }).join("") + "</tr>";
  }).join("");
  var more = rows.length > shown.length ? `<div style="text-align:center;margin-top:12px"><button class="btn ghost" data-action="adm-more">Montre plis (${ rows.length - shown.length } ankò)</button></div>` : "";
  return `<div class="adm-table-wrap"><table class="adm-table"><thead><tr>${ head }</tr></thead><tbody>${ body }</tbody></table></div>${ more }`;
}

function searchBox(placeholder) {
  return `<input class="input adm-search" id="adm-search" placeholder="${ placeholder }" value="${ esc(state.adm.search) }" autocomplete="off" />`;
}

function filterBtn(action, attr, value, label, count, active) {
  return `<button class="filter-btn${ active ? " active" : "" }" data-action="${ action }" ${ attr }="${ value }">${ label }${ count === undefined ? "" : ` (${ count })` }</button>`;
}

function csvBtn(kind) {
  return `<button class="btn ghost" data-action="adm-csv" data-kind="${ kind }">${ icon("download", 14) } Telechaje (.csv)</button>`;
}

function kpi(label, value, color, ic, tab, extra) {
  var attrs = tab ? ` data-action="adm-go" data-tab="${ tab }"${ extra || "" }` : "";
  return `<${ tab ? "button" : "div" } class="kpi adm-kpi"${ attrs }><div class="kpi-top"><span class="kpi-label">${ label }</span><div class="kpi-icon" style="background:${ color }1A;color:${ color }">${ icon(ic, 14, color) }</div></div><div class="kpi-value">${ value }</div></${ tab ? "button" : "div" }>`;
}

function poolBanner(M) {
  var down = M.poolStatus.filter(function (p) { return !p.ok; });
  if (!down.length) {
    return "";
  }
  var names = down.map(function (p) { return p.divisions.join(", "); }).join(" \u00B7 ");
  return `<div class="alert" style="margin-bottom:16px">${ icon("alert", 14) }<div>Done sa yo pa disponib kounye a (baz done a pa konfigire oswa li pa reponn): <strong>${ esc(names) }</strong>. Sa ki afiche a pa gen yo.</div></div>`;
}

// What was read from each database and what was left out so the totals stay real.
function sourcesCard(M) {
  var rows = M.poolStatus.map(function (p) {
    var left = p.foreign + p.duplicates;
    var state = !p.ok ? `<span style="color:${ COLORS.rust }">Pa disponib</span>` : left ? `<span style="color:${ COLORS.rust }">${ left } pa konte</span>` : `<span style="color:${ COLORS.green }">OK</span>`;
    return `<tr><td>${ p.divisions.map(function (d) { return `<span class="adm-div">${ esc(d) }</span>`; }).join(" ") }</td><td class="num">${ p.ok ? p.raw : "\u2014" }</td><td class="num">${ p.ok ? p.kept : "\u2014" }</td><td class="num">${ p.ok ? p.foreign : "\u2014" }</td><td class="num">${ p.ok ? p.duplicates : "\u2014" }</td><td>${ state }</td></tr>`;
  }).join("");
  return `<div class="card adm-card"><div class="h3">Baz Done yo</div><div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Divizyon</th><th class="num">Kontenè nan baz la</th><th class="num">Konte</th><th class="num">Lòt divizyon</th><th class="num">Doub</th><th>Eta</th></tr></thead><tbody>${ rows }</tbody></table></div><div class="form-hint" style="margin-top:8px">Yon kontenè konte yon sèl fwa, nan baz divizyon li an. Sa ki nan yon baz ki pa pou li oswa ki doub egzakteman pa konte (anyen pa efase nan baz yo).</div></div>`;
}

function divisionDown(M, d) {
  return M.poolStatus.some(function (p) { return !p.ok && p.divisions.indexOf(d) !== -1; });
}

// ---- Apèsi ----

function overviewView(M) {
  var A = state.adm;
  var S = summarize(M, A.division);
  var kpis = [
    kpi("Total Kontenè", S.containers, COLORS.navy, "boxes", "containers", ` data-status=""`),
    kpi("Full", S.full + S.pokoverifye, COLORS.full, "boxes", "containers", ` data-status="full"`),
    kpi("Vid", S.vid, COLORS.vid, "boxes", "containers", ` data-status="vid"`),
    kpi("Kite", S.kite, COLORS.kite, "check", "containers", ` data-status="kite"`),
    kpi("Bill Aktif", S.billsAktif, COLORS.teal, "clipboard", "products"),
    kpi("Pwodwi ann Estòk", S.inStock, COLORS.green, "boxes", "stock", ` data-filter="instock"`),
    kpi("Ap Ekspire", S.soon, COLORS.rust, "alert", "stock", ` data-filter="soon"`),
    kpi("Ekspire", S.expired, COLORS.urgent, "alert", "stock", ` data-filter="expired"`),
    kpi("Livrezon Jodi a", S.slipsToday, COLORS.steel, "truck", "moves", ` data-kind="slips"`)
  ].join("");

  var divisionTable = "";
  if (!A.division) {
    var rows = divisionsInData(M).map(function (d) {
      var s = summarize(M, d);
      var down = divisionDown(M, d);
      return `<tr class="adm-click${ down ? " adm-down" : "" }" data-action="adm-pick-div" data-div="${ esc(d) }"><td><span class="adm-div">${ esc(d) }</span>${ down ? ` <span class="adm-muted">(pa disponib)</span>` : "" }</td><td class="num">${ s.containers }</td><td class="num">${ s.full + s.pokoverifye }</td><td class="num">${ s.vid }</td><td class="num">${ s.kite }</td><td class="num">${ s.billsAktif }</td><td class="num">${ s.inStock }</td><td class="num" style="color:${ s.expired ? COLORS.urgent : "inherit" }">${ s.expired }</td></tr>`;
    }).join("");
    divisionTable = `<div class="card adm-card"><div class="h3">Pa Divizyon</div><div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Divizyon</th><th class="num">Kontenè</th><th class="num">Full</th><th class="num">Vid</th><th class="num">Kite</th><th class="num">Bill aktif</th><th class="num">Pwodwi ann estòk</th><th class="num">Ekspire</th></tr></thead><tbody>${ rows }</tbody></table></div><div class="form-hint" style="margin-top:8px">Peze sou yon divizyon pou wè sèlman li.</div></div>`;
  }

  var urgent = forDivision(M.containers, A.division).filter(isUrgent).map(function (c) {
    var full = c.status === "full" || c.status === "pokoverifye";
    return Object.assign({}, c, { jou: daysBetween(full ? c.dateEntered : c.dateEmpty) });
  }).sort(function (a, b) { return b.jou - a.jou; });
  var urgentHtml = urgent.length ? urgent.slice(0, 8).map(function (c) {
    return `<div class="adm-line"><span class="plate" style="border-color:${ COLORS[c.status] }">${ esc(c.numewo) }</span><span class="adm-grow">${ divCell(c.division) } ${ statusChip(c.status) }</span><strong style="color:${ COLORS.urgent }">${ c.jou } jou</strong></div>`;
  }).join("") + (urgent.length > 8 ? `<div class="form-hint" style="margin-top:6px">${ urgent.length - 8 } lòt ankò nan tab Kontenè.</div>` : "") : `<div class="adm-muted">Pa gen kontenè ki ijan.</div>`;

  var expiring = forDivision(M.inventory, A.division).filter(function (r) {
    return r.current > 0 && (r.expiryStatus === "soon" || r.expiryStatus === "expired");
  }).sort(function (a, b) { return (a.nextExpiry || "").localeCompare(b.nextExpiry || ""); });
  var expiringHtml = expiring.length ? expiring.slice(0, 8).map(function (r) {
    var col = r.expiryStatus === "expired" ? COLORS.urgent : COLORS.rust;
    return `<div class="adm-line"><div class="adm-grow"><strong style="color:var(--navy)">${ esc(r.description) }</strong><div class="adm-muted">${ divCell(r.division) } \u00B7 Bill ${ esc(r.billNumewo || "\u2014") } \u00B7 ${ fmtQty(r.current) } ${ esc(r.unit) }</div></div><span style="color:${ col };font-size:12px;font-weight:700;text-align:right">${ esc(expiryText(r)) }</span></div>`;
  }).join("") : `<div class="adm-muted">Pa gen pwodwi k ap ekspire.</div>`;

  var slips = forDivision(M.slips, A.division).slice().sort(function (a, b) {
    return (b.slipDate || "").localeCompare(a.slipDate || "") || (b.createdAt || "").localeCompare(a.createdAt || "");
  }).slice(0, 6);
  var slipsHtml = slips.length ? slips.map(function (s) {
    return `<div class="adm-line"><div class="adm-grow"><strong style="color:var(--navy)">Bon # ${ esc(s.slipNumber || "\u2014") }</strong><div class="adm-muted">${ divCell(s.division) } \u00B7 ${ esc(s.clientName || "\u2014") }</div></div><span class="adm-muted">${ formatDateShort(s.slipDate) }</span></div>`;
  }).join("") : `<div class="adm-muted">Poko gen fich livrezon.</div>`;

  var removed = M.poolStatus.reduce(function (t, p) { return t + p.foreign + p.duplicates; }, 0);
  var removedBanner = removed ? `<div class="alert" style="margin-bottom:16px">${ icon("alert", 14) }<div>${ removed } done pa konte paske yo pa nan bon baz la oswa yo doub. Gade «Baz Done yo» anba a.</div></div>` : "";
  return `${ poolBanner(M) }${ removedBanner }<div class="grid-kpi">${ kpis }</div>${ divisionTable }<div class="adm-two"><div class="card adm-card"><div class="h3">Kontenè ki Ijan</div>${ urgentHtml }</div><div class="card adm-card"><div class="h3">Estòk k ap Ekspire</div>${ expiringHtml }</div></div><div class="card adm-card"><div class="h3">Dènye Fich Livrezon</div>${ slipsHtml }</div>${ sourcesCard(M) }`;
}

// ---- Kontenè ----

export function filteredContainers(M) {
  var A = state.adm;
  var q = query();
  return forDivision(M.containers, A.division).filter(function (c) {
    return (!A.cStatus || c.status === A.cStatus) && has(q, [c.numewo, c.billNumewo, c.product, c.depo, truckingSearchText(c.trucking), c.chofer, c.plak, c.division]);
  }).sort(function (a, b) {
    return (b.dateEntered || b.dateExpected || "").localeCompare(a.dateEntered || a.dateExpected || "") || (a.numewo < b.numewo ? -1 : 1);
  });
}

function daysText(c) {
  var n = null;
  if (c.status === "full" || c.status === "pokoverifye") {
    n = daysBetween(c.dateEntered);
  } else if (c.status === "vid") {
    n = daysBetween(c.dateEmpty);
  } else if (c.status === "kite" && c.dateEmpty) {
    n = daysBetween(c.dateEmpty, c.dateLeft);
  }
  if (n === null) {
    return "\u2014";
  }
  return isUrgent(c) ? `<strong style="color:${ COLORS.urgent }">${ n } jou</strong>` : n + " jou";
}

function containersView(M) {
  var A = state.adm;
  var base = forDivision(M.containers, A.division);
  var list = filteredContainers(M);
  var btns = filterBtn("adm-status", "data-status", "", "Tout", base.length, !A.cStatus) + CONTAINER_STATUSES.map(function (s) {
    return filterBtn("adm-status", "data-status", s, STATUS_LABELS[s], base.filter(function (c) { return c.status === s; }).length, A.cStatus === s);
  }).join("");
  var cols = [
    { h: "Nimewo", cls: "adm-sticky", cell: function (c) { return `<span class="plate" style="border-color:${ COLORS[c.status] }">${ esc(c.numewo) }</span>`; } },
    { h: "Divizyon", cell: function (c) { return divCell(c.division); } },
    { h: "Estati", cell: function (c) { return statusChip(c.status); } },
    { h: "Bill", cell: function (c) { return esc(c.billNumewo || "\u2014"); } },
    { h: "Pwodwi", cell: function (c) { return esc(c.product || "\u2014"); } },
    { h: "Gwosè", cell: function (c) { return c.size ? esc(c.size) + "\u2032" : "\u2014"; } },
    { h: "Trucking", cell: function (c) { return esc(c.trucking || "\u2014"); } },
    { h: "Depo", cell: function (c) { return esc(c.depo || "\u2014"); } },
    { h: "Chofè / Plak", cell: function (c) { return esc([c.chofer, c.plak].filter(Boolean).join(" \u00B7 ") || "\u2014"); } },
    { h: "Dat Prevwa", cell: function (c) { return formatDateShort(c.dateExpected); } },
    { h: "Dat Antre", cell: function (c) { return formatDateShort(c.dateEntered); } },
    { h: "Dat Vid", cell: function (c) { return formatDateShort(c.dateEmpty); } },
    { h: "Dat Kite", cell: function (c) { return formatDateShort(c.dateLeft); } },
    { h: "Jou", cell: daysText }
  ];
  return `${ poolBanner(M) }<div class="section-head"><div><div class="eyebrow">${ list.length } nan ${ base.length } kontenè</div><h2 class="h2">Rejis Kontenè</h2></div><div class="toolbar">${ csvBtn("containers") }</div></div><div class="adm-filters">${ searchBox("Chèche kontenè, bill, pwodwi, chofè, plak...") }<div class="chiplist">${ btns }</div></div>${ table(cols, list, "Pa gen kontenè ki koresponn.") }`;
}

// ---- Pwodwi (bills) ----

export function filteredBills(M) {
  var A = state.adm;
  var q = query();
  return forDivision(M.bills, A.division).filter(function (b) {
    return has(q, [b.numewo, b.product, b.division]);
  }).map(function (b) {
    var cs = b.containers;
    var inv = M.inventory.filter(function (r) { return r._pool === b._pool && r.billId === b.id; });
    return Object.assign({}, b, {
      nTotal: cs.length,
      nFull: cs.filter(function (c) { return c.status === "full" || c.status === "pokoverifye"; }).length,
      nVid: cs.filter(function (c) { return c.status === "vid"; }).length,
      nKite: cs.filter(function (c) { return c.status === "kite"; }).length,
      nLines: inv.filter(function (r) { return r.current > 0; }).length
    });
  }).sort(function (a, b) {
    var order = { aktif: 0, planifye: 1, fini: 2 };
    return (order[a.status] - order[b.status]) || (a.numewo < b.numewo ? -1 : 1);
  });
}

function productsView(M) {
  var A = state.adm;
  var list = filteredBills(M);
  var cols = [
    { h: "Bill", cls: "adm-sticky", cell: function (b) { return `<span class="plate" style="border-color:${ BILL_COLORS[b.status] }">${ esc(b.numewo) }</span>`; } },
    { h: "Pwodwi", cell: function (b) { return esc(b.product || "\u2014"); } },
    { h: "Divizyon", cell: function (b) { return divCell(b.division); } },
    { h: "Estati", cell: function (b) { return chip(BILL_LABELS[b.status] || b.status, BILL_COLORS[b.status] || COLORS.steel); } },
    { h: "Kontenè", cls: "num", cell: function (b) { return b.nTotal; } },
    { h: "Full", cls: "num", cell: function (b) { return b.nFull; } },
    { h: "Vid", cls: "num", cell: function (b) { return b.nVid; } },
    { h: "Kite", cls: "num", cell: function (b) { return b.nKite; } },
    { h: "Liy ann estòk", cls: "num", cell: function (b) { return b.nLines; } },
    { h: "Fini le", cell: function (b) { return formatDateShort(b.completedAt); } }
  ];
  return `${ poolBanner(M) }<div class="section-head"><div><div class="eyebrow">${ list.length } bill</div><h2 class="h2">Pwodwi ak Bill</h2></div><div class="toolbar">${ csvBtn("products") }</div></div><div class="adm-filters">${ searchBox("Chèche bill oswa pwodwi...") }</div>${ table(cols, list, "Pa gen bill ki koresponn.") }`;
}

// ---- Estòk ----

export function filteredInventoryAdm(M) {
  var A = state.adm;
  var q = query();
  var f = A.invFilter;
  return forDivision(M.inventory, A.division).filter(function (r) {
    if (!has(q, [r.description, r.billNumewo, r.product, r.division])) {
      return false;
    }
    if (f === "expired") return r.expiryStatus === "expired";
    if (f === "soon") return r.expiryStatus === "soon" || r.expiryStatus === "expired";
    if (f === "empty") return r.current === 0;
    if (f === "negative") return r.negative;
    if (f === "instock") return r.current > 0;
    return true;
  }).sort(function (a, b) {
    return (a.division || "").localeCompare(b.division || "") || (a.billNumewo || "").localeCompare(b.billNumewo || "") || a.description.localeCompare(b.description);
  });
}

function stockView(M) {
  var A = state.adm;
  var all = forDivision(M.inventory, A.division);
  var list = filteredInventoryAdm(M);
  var S = summarize(M, A.division);
  var btns = STOCK_FILTERS.map(function (f) {
    return filterBtn("adm-inv-filter", "data-filter", f.id, f.label, undefined, A.invFilter === f.id);
  }).join("");
  var cols = [
    { h: "Pwodwi", cls: "adm-sticky", cell: function (r) { return `<strong style="color:var(--navy)">${ esc(r.description) }</strong>`; } },
    { h: "Divizyon", cell: function (r) { return divCell(r.division); } },
    { h: "Bill", cell: function (r) { return esc(r.billNumewo || "\u2014"); } },
    { h: "Antre", cls: "num", cell: function (r) { return fmtQty(r.entered); } },
    { h: "Livre", cls: "num", cell: function (r) { return fmtQty(r.delivered); } },
    { h: "Avarye", cls: "num", cell: function (r) { return fmtQty(r.damaged); } },
    { h: "Retounen", cls: "num", cell: function (r) { return fmtQty(r.returned); } },
    { h: "Kounye a", cls: "num", cell: function (r) {
      var color = r.negative ? COLORS.urgent : r.current === 0 ? "var(--muted-light)" : COLORS.teal;
      return `<strong style="color:${ color }">${ fmtQty(r.current) }</strong> ${ esc(r.unit) }${ r.negative ? " \u26A0" : "" }`;
    } },
    { h: "Ekspirasyon", cell: function (r) {
      var txt = expiryText(r);
      var col = r.expiryStatus === "expired" ? COLORS.urgent : r.expiryStatus === "soon" ? COLORS.rust : "var(--muted)";
      return txt ? `<span style="color:${ col };font-weight:${ r.expiryStatus === "ok" ? 400 : 700 }">${ esc(txt) }</span>` : "\u2014";
    } }
  ];
  var mini = `<div class="grid-kpi" style="margin-bottom:18px">${ kpi("Liy Pwodwi", all.length, COLORS.navy, "boxes") }${ kpi("Ann Estòk", S.inStock, COLORS.green, "boxes") }${ kpi("Ap Ekspire", S.soon, COLORS.rust, "alert") }${ kpi("Ekspire", S.expired, COLORS.urgent, "alert") }${ kpi("Negatif", S.negative, COLORS.urgent, "alert") }</div>`;
  return `${ poolBanner(M) }<div class="section-head"><div><div class="eyebrow">${ list.length } nan ${ all.length } liy pwodwi</div><h2 class="h2">Estòk nan Depo</h2></div><div class="toolbar">${ csvBtn("stock") }</div></div>${ mini }<div class="adm-filters">${ searchBox("Chèche pwodwi, bill...") }<div class="chiplist">${ btns }</div></div>${ table(cols, list, "Pa gen pwodwi ki koresponn.") }<div class="form-hint" style="margin-top:10px">Estòk = Antre Estòk − Fich Livrezon − Machandiz Avarye + Machandiz Retounen. Li kalkile pou kont li, menm jan ak Inventè Depo a.</div>`;
}

// ---- Mouvman ----

function slipItemsText(s) {
  return (s.items || []).map(function (it) {
    return (it.description || "") + " \u00D7 " + fmtQty(it.quantity) + " " + (it.unit || "");
  }).join(" ; ");
}

function invoiceTotal(i) {
  return (i.items || []).reduce(function (t, it) {
    return t + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
  }, 0);
}

function fmtMoney(n) {
  return (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The rows and columns of one kind of movement, already filtered by division and search.
export function moveTable(M, kind) {
  var A = state.adm;
  var q = query();
  var byDate = function (key) {
    return function (a, b) { return (b[key] || "").localeCompare(a[key] || "") || (b.createdAt || "").localeCompare(a.createdAt || ""); };
  };
  if (kind === "slips") {
    return {
      rows: forDivision(M.slips, A.division).filter(function (s) {
        return has(q, [s.slipNumber, s.clientName, s.invoiceNumber, s.driver, s.division, slipItemsText(s)]);
      }).sort(byDate("slipDate")),
      cols: [
        { h: "Bon #", cls: "adm-sticky", cell: function (s) { return `<strong style="color:var(--navy)">${ esc(s.slipNumber || "\u2014") }</strong>`; } },
        { h: "Dat", cell: function (s) { return formatDateShort(s.slipDate); } },
        { h: "Divizyon", cell: function (s) { return divCell(s.division); } },
        { h: "Kliyan", cell: function (s) { return esc(s.clientName || "\u2014"); } },
        { h: "Fakti #", cell: function (s) { return esc(s.invoiceNumber || "\u2014"); } },
        { h: "Pwodwi livre", cls: "wide", cell: function (s) { return esc(slipItemsText(s) || "\u2014"); } },
        { h: "Chofè", cell: function (s) { return esc(s.driver || "\u2014"); } },
        { h: "Magazinye", cell: function (s) { return esc(s.storekeeper || "\u2014"); } },
        { h: "Resevwa pa", cell: function (s) { return esc(s.receivedBy || "\u2014"); } },
        { h: "Livre le", cell: function (s) { return formatDateShort(s.deliveredOn); } }
      ]
    };
  }
  if (kind === "invoices") {
    return {
      rows: forDivision(M.invoices, A.division).filter(function (i) {
        return has(q, [i.invoiceNumber, i.clientName, i.billNumewo, i.division]);
      }).sort(byDate("invoiceDate")),
      cols: [
        { h: "Fakti #", cls: "adm-sticky", cell: function (i) { return `<strong style="color:var(--navy)">${ esc(i.invoiceNumber || "\u2014") }</strong>`; } },
        { h: "Dat", cell: function (i) { return formatDateShort(i.invoiceDate); } },
        { h: "Divizyon", cell: function (i) { return divCell(i.division); } },
        { h: "Bill", cell: function (i) { return esc(i.billNumewo || "\u2014"); } },
        { h: "Kliyan", cell: function (i) { return esc(i.clientName || "\u2014"); } },
        { h: "Estati", cell: function (i) { return chip(INVOICE_LABELS[i.status] || i.status || "\u2014", i.status === "fini" ? COLORS.green : COLORS.steel); } },
        { h: "Total", cls: "num", cell: function (i) { return fmtMoney(invoiceTotal(i)); } },
        { h: "Echeyans", cell: function (i) { return formatDateShort(i.dueDate); } }
      ]
    };
  }
  if (kind === "stock") {
    return {
      rows: forDivision(M.stock, A.division).filter(function (e) {
        return has(q, [e.description, e.billNumewo, e.product, e.containerNumewo, e.division, e.registeredBy]);
      }).sort(byDate("entryDate")),
      cols: [
        { h: "Dat", cls: "adm-sticky", cell: function (e) { return formatDateShort(e.entryDate); } },
        { h: "Divizyon", cell: function (e) { return divCell(e.division); } },
        { h: "Bill", cell: function (e) { return esc(e.billNumewo || "\u2014"); } },
        { h: "Deskripsyon", cell: function (e) { return `<strong style="color:var(--navy)">${ esc(e.description) }</strong>`; } },
        { h: "Kantite", cls: "num", cell: function (e) { return fmtQty(e.quantity) + " " + esc(e.unit); } },
        { h: "Kontenè", cell: function (e) { return esc(e.containerNumewo || "\u2014"); } },
        { h: "Ekspire", cell: function (e) { return formatDateShort(e.expiresOn); } },
        { h: "Remak", cell: function (e) { return esc(e.remarks || "\u2014"); } },
        { h: "Anrejistre pa", cell: function (e) { return esc(e.registeredBy || "\u2014"); } }
      ]
    };
  }
  // returned / damaged goods / old deliveries
  return {
    rows: forDivision(M.goods, A.division).filter(function (g) {
      return g.kind === kind && has(q, [g.description, g.billNumewo, g.product, g.reason, g.remarks, g.division]);
    }).sort(byDate("entryDate")),
    cols: [
      { h: "Dat", cls: "adm-sticky", cell: function (g) { return formatDateShort(g.entryDate); } },
      { h: "Divizyon", cell: function (g) { return divCell(g.division); } },
      { h: "Bill", cell: function (g) { return esc(g.billNumewo || "\u2014"); } },
      { h: "Deskripsyon", cell: function (g) { return `<strong style="color:var(--navy)">${ esc(g.description) }</strong>`; } },
      { h: "Kantite", cls: "num", cell: function (g) { return fmtQty(g.quantity) + " " + esc(g.unit); } },
      { h: kind === "livrezon" ? "Kliyan" : "Rezon", cell: function (g) { return esc(g.reason || "\u2014"); } },
      { h: "Remak", cell: function (g) { return esc(g.remarks || "\u2014"); } },
      { h: "Anrejistre pa", cell: function (g) { return esc(g.registeredBy || "\u2014"); } }
    ]
  };
}

function movesView(M) {
  var A = state.adm;
  var kinds = MOVE_KINDS.filter(function (k) {
    return k.id !== "livrezon" || forDivision(M.goods, A.division).some(function (g) { return g.kind === "livrezon"; }) || A.moveKind === "livrezon";
  });
  var counts = {
    stock: forDivision(M.stock, A.division).length,
    slips: forDivision(M.slips, A.division).length,
    invoices: forDivision(M.invoices, A.division).length
  };
  ["retounen", "avarye", "livrezon"].forEach(function (k) {
    counts[k] = forDivision(M.goods, A.division).filter(function (g) { return g.kind === k; }).length;
  });
  var btns = kinds.map(function (k) {
    return filterBtn("adm-move", "data-kind", k.id, k.label, counts[k.id], A.moveKind === k.id);
  }).join("");
  var T = moveTable(M, A.moveKind);
  var label = MOVE_KINDS.find(function (k) { return k.id === A.moveKind; });
  return `${ poolBanner(M) }<div class="section-head"><div><div class="eyebrow">${ T.rows.length } rezilta</div><h2 class="h2">${ label ? label.label : "Mouvman" }</h2></div><div class="toolbar">${ csvBtn("moves") }</div></div><div class="adm-filters"><div class="chiplist">${ btns }</div>${ searchBox("Chèche nan lis la...") }</div>${ table(T.cols, T.rows, "Pa gen anyen pou montre.") }`;
}

// ---- shell ----

function topbar() {
  var A = state.adm;
  var divOptions = `<option value="">Tout divizyon</option>` + (A.model ? divisionsInData(A.model) : []).map(function (d) {
    return `<option value="${ esc(d) }"${ A.division === d ? " selected" : "" }>${ esc(d) }</option>`;
  }).join("");
  var tab = ADMINISTRATION_TABS.find(function (t) { return t.id === A.tab; }) || ADMINISTRATION_TABS[0];
  return `<header class="topbar"><button class="hamburger-btn" data-action="toggle-nav-drawer" aria-label="Meni" style="background:rgba(11,33,56,.08);color:var(--navy);margin-right:2px">${ icon("menu", 18, "var(--navy)") }</button><div><div class="topbar-eyebrow">${ tab.label }</div><div class="topbar-title">${ ADMINISTRATION_TITLES[A.tab] }</div></div><div class="adm-top-actions"><select class="input adm-division" id="adm-division" aria-label="Divizyon">${ divOptions }</select><button class="btn ghost" data-action="adm-refresh"${ A.loading ? " disabled" : "" }>${ icon("undo", 14) } ${ A.loading ? "K ap rafrechi..." : "Rafrechi" }</button></div></header>`;
}

function sidebar() {
  var A = state.adm;
  var items = ADMINISTRATION_TABS.map(function (n) {
    return `<button class="navitem${ A.tab === n.id ? " active" : "" }" data-action="adm-tab" data-tab="${ n.id }">${ icon(n.icon, 16) }<span style="flex:1">${ n.label }</span></button>`;
  }).join("");
  return `<aside class="sidebar"><div class="sidebar-brand"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div><div class="sidebar-name">DEKA</div><div class="sidebar-sub">Administration</div></div></div><nav class="sidebar-nav">${ items }</nav><div class="sidebar-foot"><div style="display:flex;align-items:center;gap:7px;margin-bottom:10px"><span class="dot"></span>Lekti sèlman \u00B7 tout divizyon</div>${ A.at ? `<div style="font-size:10.5px;color:var(--steel-light);margin-bottom:8px">Dènye mizajou: ${ formatTime(A.at) }</div>` : "" }${ helpButton("var(--steel-light)") + accountButton("var(--steel-light)") }<button class="linklike" data-action="logout" style="color:var(--steel-light)">${ icon("undo", 12) } Dekonekte</button><div style="font-size:10px;color:var(--steel-light);margin-top:10px;opacity:.7">\u00A9 ${ new Date().getFullYear() } Deka Group</div></div></aside>`;
}

function drawer() {
  var A = state.adm;
  var open = !!state.navDrawerOpen;
  var nav = ADMINISTRATION_TABS.map(function (n) {
    var on = A.tab === n.id;
    return `<button class="drawer-item${ on ? " active" : "" }" data-action="adm-tab" data-tab="${ n.id }"><span class="drawer-ico">${ icon(n.icon, 15, on ? "#fff" : "var(--steel-light)") }</span><span style="flex:1">${ n.label }</span></button>`;
  }).join("");
  return `<div class="nav-drawer-overlay${ open ? " open" : "" }" data-action="close-nav-drawer"></div><nav class="nav-drawer${ open ? " open" : "" }"><div class="nav-drawer-head"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1;min-width:0"><div class="drawer-brand">DEKA</div><div class="drawer-user">Administration</div></div><button class="drawer-close" data-action="close-nav-drawer" aria-label="Fèmen">${ icon("x", 16, "#fff") }</button></div><div class="nav-drawer-nav">${ nav }</div><div class="nav-drawer-foot">${ helpButton("var(--steel-light)") + accountButton("var(--steel-light)") }<button class="drawer-logout drawer-item" data-action="logout">${ icon("undo", 14, "var(--steel-light)") }<span style="flex:1">Dekonekte</span></button></div></nav>`;
}

export function administrationView() {
  var A = state.adm;
  var body;
  if (!A.loaded) {
    body = A.err
      ? `<div class="alert">${ icon("alert", 14) }<div>${ esc(A.err) }</div></div><div style="margin-top:12px"><button class="btn" data-action="adm-refresh">Eseye ankò</button></div>`
      : `<div class="empty">${ icon("circle", 22) }<div>K ap chaje done yo...</div></div>`;
  } else if (A.tab === "containers") {
    body = containersView(A.model);
  } else if (A.tab === "products") {
    body = productsView(A.model);
  } else if (A.tab === "stock") {
    body = stockView(A.model);
  } else if (A.tab === "moves") {
    body = movesView(A.model);
  } else {
    body = overviewView(A.model);
  }
  var date = `<div style="font-size:11px;color:var(--muted-light);margin-bottom:14px">${ formatLongDate() }${ A.division ? ` \u00B7 <strong style="color:var(--navy)">${ esc(A.division) }</strong>` : "" }</div>`;
  return `${ drawer() }<div class="shell">${ sidebar() }<div class="main">${ topbar() }<main class="content">${ date }${ body }</main></div></div>`;
}
