// Administrator interface: sidebar, top bar, dashboard, containers, inventory, bills, reports, notifications.
import {
  ADMIN_TABS,
  ALL_DIVISIONS,
  COLORS,
  DIVISIONS_GROUP_1,
  DIVISIONS_GROUP_2,
  LOGO_URL,
  STATUS_LABELS,
  TAB_TITLES,
  URGENT_AFTER_DAYS
} from "../constants.js";
import { icon } from "../icons.js";
import {
  pushBanner,
  pushCard
} from "../push.js";
import { state } from "../state.js";
import {
  billStatus,
  daysBetween,
  daysLabel,
  escapeHtml,
  formatDateShort,
  formatLongDate,
  formatTime,
  isUrgent,
  statusOf,
  today,
  truckingOptionsHtml
} from "../utils.js";
import { accountButton } from "./account.js";
import { helpButton } from "./help.js";
import { archiveView } from "./archive.js";
import { securityView } from "./security.js";
import { usersView } from "./users.js";

function adminSidebar() {
  var e = ADMIN_TABS.map(function (n) {
    var i = state.tab === n.id;
    var o = n.id === "notifs" ? Math.max(0, state.notifications.length - state.lastSeenNotifCount) : 0;
    return `<button class="navitem${ i ? " active" : "" }" data-action="set-tab" data-tab="${ n.id }">${ icon(n.icon, 16) }<span style="flex:1">${ n.label }</span>${ o ? `<span class="count">${ o }</span>` : "" }</button>`;
  }).join("");
  return `<aside class="sidebar"><div class="sidebar-brand"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div><div class="sidebar-name">DEKA LOG</div><div class="sidebar-sub">Jesyon Tèminal Kontenè</div></div></div><nav class="sidebar-nav">${ e }</nav><div class="sidebar-foot"><div style="display:flex;align-items:center;gap:7px;margin-bottom:10px"><span class="dot${ state.saveErr ? " err" : "" }"></span>${ state.saveErr ? "Erè pandan sovgad \u2014 chanjman an lokal sèlman" : "Done yo sove nan baz done pataje a" }</div>${ state.lastSyncTime ? `<div style="font-size:10.5px;color:var(--steel-light);margin-bottom:8px">Dènye sinkwonizasyon: ${ formatTime(state.lastSyncTime) }</div>` : "" }${ helpButton("var(--steel-light)") + accountButton("var(--steel-light)") }<button class="linklike" data-action="logout" style="color:var(--steel-light)">${ icon("undo", 12) } Dekonekte</button><div style="font-size:10px;color:var(--steel-light);margin-top:10px;opacity:.7">© ${ new Date().getFullYear() } Deka Group · v1.0</div></div></aside>`;
}

function adminTopbar() {
  var e = computeStats();
  return `<header class="topbar"><div><div class="topbar-eyebrow">${ ADMIN_TABS.find(function (n) {
    return n.id === state.tab;
  }).label }</div><div class="topbar-title">${ TAB_TITLES[state.tab] }</div></div><div style="display:flex;align-items:center;gap:18px"><div style="text-align:right"><div style="font-size:11px;color:var(--muted-light)">Konekte kòm <strong style="color:var(--navy)">Administratè Lojistik</strong></div><div style="font-size:10.5px;color:var(--muted-light)">${ formatLongDate() }</div></div><div class="topbar-stats"><div class="topbar-stat"><span class="mini-dot" style="background:${ COLORS.full }"></span>Full <strong>${ e.full }</strong></div><div class="topbar-stat"><span class="mini-dot" style="background:${ COLORS.vid }"></span>Vid <strong>${ e.vid }</strong></div><div class="topbar-stat"><span class="mini-dot" style="background:${ COLORS.kite }"></span>Kite <strong>${ e.kite }</strong></div></div></div></header>`;
}

function computeStats() {
  var e = state.containers.length;
  var n = state.containers.filter(function (container) {
    return statusOf(container) === "disponib";
  }).length;
  var i = state.containers.filter(function (container) {
    return statusOf(container) === "pokoverifye";
  }).length;
  var o = state.containers.filter(function (container) {
    return statusOf(container) === "full" || statusOf(container) === "pokoverifye";
  }).length;
  var a = state.containers.filter(function (container) {
    return statusOf(container) === "vid";
  }).length;
  var l = state.containers.filter(function (container) {
    return statusOf(container) === "kite";
  }).length;
  var s = state.bills.filter(function (bill) {
    return billStatus(bill, state.containers) === "aktif";
  }).length;
  var f = state.bills.filter(function (bill) {
    return billStatus(bill, state.containers) === "fini";
  }).length;
  var g = state.containers.filter(isUrgent).length;
  return {
    total: e,
    disponib: n,
    pokoverifye: i,
    full: o,
    vid: a,
    kite: l,
    billsAktif: s,
    billsFini: f,
    urgent: g
  };
}

function dashboardView() {
  var e = computeStats();
  var n = state.containers.filter(function (container) {
    return statusOf(container) === "full" || statusOf(container) === "pokoverifye";
  }).map(function (container) {
    return Object.assign({}, container, { jou: daysBetween(container.dateEntered) });
  }).sort(function (r, d) {
    return d.jou - r.jou;
  }).slice(0, 5);
  var i = Math.max(1, Math.max.apply(null, n.map(function (r) {
    return r.jou;
  }).concat([1])));
  var o = state.notifications.slice(0, 5);
  var a = state.containers.filter(isUrgent).map(function (container) {
    var d = statusOf(container);
    var u = daysBetween(d === "full" || d === "pokoverifye" ? container.dateEntered : container.dateEmpty);
    return Object.assign({}, container, {
      jou: u,
      ust: d
    });
  }).sort(function (r, d) {
    return d.jou - r.jou;
  }).slice(0, 8);
  var l = state.containers.filter(function (container) {
    return statusOf(container) === "disponib";
  }).sort(function (r, d) {
    return r.dateExpected && d.dateExpected ? r.dateExpected < d.dateExpected ? -1 : 1 : r.dateExpected ? -1 : d.dateExpected ? 1 : 0;
  });
  var s = [
    {
      label: "Total Kontenè",
      value: e.total,
      color: COLORS.navy,
      icon: "boxes",
      tab: "containers",
      filter: "tout"
    },
    {
      label: "Disponib",
      value: e.disponib,
      color: COLORS.disponib,
      icon: "boxes",
      sub: "Poko antre",
      tab: "containers",
      filter: "disponib"
    },
    {
      label: "Poko Verifye",
      value: e.pokoverifye,
      color: COLORS.pokoverifye,
      icon: "boxes",
      sub: "Ap tann verifikasyon",
      tab: "containers",
      filter: "pokoverifye"
    },
    {
      label: "Full",
      value: e.full,
      color: COLORS.rust,
      icon: "boxes",
      sub: "Ap tann vide",
      tab: "containers",
      filter: "full"
    },
    {
      label: "Vid",
      value: e.vid,
      color: COLORS.vid,
      icon: "boxes",
      sub: "Ap tann soti",
      tab: "containers",
      filter: "vid"
    },
    {
      label: "Kite",
      value: e.kite,
      color: COLORS.green,
      icon: "check",
      tab: "containers",
      filter: "kite"
    },
    {
      label: "\u26A0 Ijan",
      value: e.urgent,
      color: COLORS.urgent,
      icon: "alert",
      sub: `Plis pase ${ URGENT_AFTER_DAYS } jou`,
      tab: "containers",
      filter: "ijan"
    },
    {
      label: "Bill Aktif",
      value: e.billsAktif,
      color: COLORS.rust,
      icon: "clipboard",
      tab: "bills",
      billfilter: "aktif"
    },
    {
      label: "Bill Fini",
      value: e.billsFini,
      color: COLORS.green,
      icon: "check",
      tab: "bills",
      billfilter: "fini"
    }
  ].map(function (r) {
    return `<div class="kpi" data-action="view-kpi" data-tab="${ r.tab }" data-filter="${ r.filter || "" }" data-billfilter="${ r.billfilter || "" }" style="cursor:pointer"><div class="kpi-top"><span class="kpi-label">${ r.label }</span><div class="kpi-icon" style="background:${ r.color }1A;color:${ r.color }">${ icon(r.icon, 14, r.color) }</div></div><div class="kpi-value">${ r.value }</div>${ r.sub ? `<div class="kpi-sub">${ r.sub }</div>` : "" }</div>`;
  }).join("");
  var f = n.length === 0 ? `<div class="empty compact">${ icon("circle", 18) }<div>Pa gen kontenè 'Full' kounye a.</div></div>` : n.map(function (r) {
    var d = state.bills.find(function (bill) {
      return bill.id === r.billId;
    });
    return `<div><div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:12.5px"><span><span class="plate" style="border-color:${ COLORS.rust }">${ escapeHtml(r.numewo) }</span> <span style="color:var(--muted-light);font-size:11.5px">Bill ${ d ? escapeHtml(d.numewo) : "\u2014" }${ d && d.product ? " \xB7 " + escapeHtml(d.product) : "" }</span></span><strong style="font-family:var(--font-mono);color:${ COLORS.rust }">${ r.jou } jou</strong></div><div class="progress"><div class="progress-fill" style="width:${ Math.max(6, r.jou / i * 100) }%;background:${ COLORS.rust }"></div></div></div>`;
  }).join(`<div style="height:12px"></div>`);
  var g = o.length === 0 ? `<div class="empty compact">${ icon("circle", 18) }<div>Poko gen aktivite. Yon bill fini deklanche yon notifikasyon.</div></div>` : o.map(function (r) {
    return `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px"><div class="notif-ico" style="width:22px;height:22px;margin-top:1px">${ icon("check", 12, "#fff") }</div><div><div style="font-size:12.5px;color:var(--ink);line-height:1.4">${ escapeHtml(r.message) }</div><div style="font-size:11px;color:var(--muted-light);font-family:var(--font-mono)">${ formatDateShort(r.date) }</div></div></div>`;
  }).join("");
  var v = l.length === 0 ? `<div class="empty compact">${ icon("circle", 18) }<div>Pa gen kontenè k ap tann antre kounye a.</div></div>` : l.map(function (r) {
    var d = state.bills.find(function (bill) {
      return bill.id === r.billId;
    });
    return `<div class="row" style="border-left:4px solid ${ COLORS.disponib }"><div class="row-min"><span class="plate" style="border-color:${ COLORS.disponib }">${ escapeHtml(r.numewo) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ d ? escapeHtml(d.numewo) : "\u2014" }</strong></div><div class="row-sub light">Pwodwi: <strong style="color:var(--muted)">${ d && d.product ? escapeHtml(d.product) : "\u2014" }</strong></div></div><div class="mini">Dat Prevwa<strong style="color:${ COLORS.disponib }">${ formatDateShort(r.dateExpected) }</strong></div><div style="margin-left:auto"><button class="btn small teal" data-action="confirm-enter" data-id="${ r.id }">Konfime Antre Jodi a</button></div></div>`;
  }).join("");
  var A = a.length === 0 ? `<div class="empty compact">${ icon("circle", 18) }<div>Pa gen kontenè ijan kounye a.</div></div>` : a.map(function (r) {
    var d = state.bills.find(function (bill) {
      return bill.id === r.billId;
    });
    return `<div class="row" style="border-left:4px solid ${ COLORS.urgent }"><div class="row-min"><span class="plate" style="border-color:${ COLORS.urgent }">${ escapeHtml(r.numewo) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ d ? escapeHtml(d.numewo) : "\u2014" }</strong></div><div class="row-sub light">Pwodwi: <strong style="color:var(--muted)">${ d && d.product ? escapeHtml(d.product) : "\u2014" }</strong></div></div><div class="mini">${ r.ust === "full" ? "Jou Full" : "Jou Vid" }<strong style="color:${ COLORS.urgent }">${ r.jou } jou</strong></div><div style="margin-left:auto"><span class="chip" style="color:#fff;background:${ COLORS.urgent }">⚠ Ijan</span></div></div>`;
  }).join("");
  return `${ pushBanner() }<div class="section-head"><div><div class="eyebrow">Jodi a</div><h2 class="h2">Apèsi Jeneral</h2></div></div><div class="grid-kpi">${ s }</div><div class="grid-dash"><div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h3 class="h3">Kontenè ki Full pi Lontan</h3><button class="linklike" data-action="set-tab" data-tab="containers">Wè tout ${ icon("arrow", 12) }</button></div>${ f }</div><div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h3 class="h3">Aktivite Resan</h3><button class="linklike" data-action="set-tab" data-tab="notifs">Wè tout ${ icon("arrow", 12) }</button></div>${ g }</div></div><div style="height:18px"></div><div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h3 class="h3">⚠ Kontenè Ijan (plis pase ${ URGENT_AFTER_DAYS } jou)</h3><button class="linklike" data-action="set-tab" data-tab="containers" data-filter="ijan">Wè tout ${ icon("arrow", 12) }</button></div>${ A }</div><div style="height:18px"></div><div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h3 class="h3">Kontenè k ap Tann Antre (Disponib)</h3><button class="linklike" data-action="set-tab" data-tab="containers">Wè tout ${ icon("arrow", 12) }</button></div>${ v }</div>`;
}

function inventoryView() {
  var d = today();
  var items = state.containers.filter(function (container) {
    var s = statusOf(container);
    return s === "full" || s === "vid" || s === "pokoverifye";
  });
  if (state.inventorySearch.trim()) {
    var q2 = state.inventorySearch.trim().toLowerCase();
    items = items.filter(function (cc) {
      var bl = state.bills.find(function (bill) {
        return bill.id === cc.billId;
      });
      return cc.numewo.toLowerCase().indexOf(q2) !== -1 || cc.division && cc.division.toLowerCase().indexOf(q2) !== -1 || cc.depo && cc.depo.toLowerCase().indexOf(q2) !== -1 || bl && bl.product && bl.product.toLowerCase().indexOf(q2) !== -1;
    });
  }
  items = items.sort(function (a, l) {
    var oa = {
      full: 0,
      pokoverifye: 1,
      vid: 2
    };
    var sa = statusOf(a);
    var sl = statusOf(l);
    return oa[sa] !== oa[sl] ? oa[sa] - oa[sl] : a.numewo < l.numewo ? -1 : 1;
  });
  var pending = items.filter(function (cc) {
    return state.inventoryChecks[cc.id] !== d;
  });
  var confirmed = items.filter(function (cc) {
    return state.inventoryChecks[cc.id] === d;
  });
  function inventoryRow(cc, ck) {
    var st = statusOf(cc);
    var col = st === "full" ? COLORS.rust : st === "vid" ? COLORS.vid : COLORS.pokoverifye;
    var bl = state.bills.find(function (bill) {
      return bill.id === cc.billId;
    });
    return `<div class="row" style="border-left:4px solid ${ col }${ ck ? ";opacity:.6" : "" }"><div class="row-min"><span class="plate" style="border-color:${ col }">${ escapeHtml(cc.numewo) }</span><div class="row-sub">${ STATUS_LABELS[st] } · ${ cc.division ? escapeHtml(cc.division) : "\u2014" }</div><div class="row-sub light">${ bl && bl.product ? `Pwodwi: <strong>${ escapeHtml(bl.product) }</strong>` : "" }</div></div><div style="width:150px;flex-shrink:0"><span class="field-label" style="font-size:9.5px">Depo</span><input class="input inv-depo-input" data-id="${ cc.id }" value="${ escapeHtml(cc.depo || "") }" placeholder="Egz. Depo Kòdòn" style="padding:6px 8px;font-size:12.5px" /></div><div style="width:130px;flex-shrink:0;margin-left:8px"><span class="field-label" style="font-size:9.5px">Trucking</span><select class="input inv-trucking-select" data-id="${ cc.id }" style="padding:6px 8px;font-size:12.5px">${ truckingOptionsHtml(cc.trucking) }</select></div>${ st === "pokoverifye" ? `<button class="btn small teal" data-action="verify-container" data-id="${ cc.id }" style="flex-shrink:0;margin-left:8px">Verifye</button>` : "" }<button class="btn small${ ck ? "" : " ghost" }" data-action="toggle-inventory" data-id="${ cc.id }" style="flex-shrink:0;margin-left:8px;background:${ ck ? COLORS.green : "transparent" };color:${ ck ? "#fff" : "var(--ink)" };border:1.5px solid ${ ck ? COLORS.green : "var(--border)" }">${ icon("check", 14, ck ? "#fff" : "var(--ink)") } ${ ck ? "Konfime — Anile" : "Konfime" }</button></div>`;
  }
  var rows = pending.map(function (cc) {
    return inventoryRow(cc, false);
  }).join("");
  var confirmedRows = confirmed.map(function (cc) {
    return inventoryRow(cc, true);
  }).join("");
  var confirmedToggle = confirmed.length === 0 ? "" : `<button class="linklike" data-action="toggle-inventory-confirmed" style="margin:14px 0 8px">${ icon("arrow", 12) } ${ state.inventoryShowConfirmed ? "Kache" : "Wè" } kontenè konfime yo (${ confirmed.length })</button>${ state.inventoryShowConfirmed ? `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px">${ confirmedRows }</div>` : "" }`;
  return `<div class="section-head"><div><div class="eyebrow">${ confirmed.length }/${ items.length } konfime jodi a</div><h2 class="h2">Envantè Jounalye</h2></div><div class="toolbar"><div class="search-wrap"><span class="search-icon">${ icon("search", 14) }</span><input class="input" id="f-inv-search" placeholder="Chèche kontenè, divizyon oswa depo..." value="${ escapeHtml(state.inventorySearch) }" /></div></div></div><p style="font-size:12.5px;color:var(--muted);margin-top:-10px;margin-bottom:16px">Ale tcheke chak kontenè pandan w ap kontwole yo fizikman (Full, Poko Verifye ak Vid). Klike bouton Konfime a, epi ekri depo a si w bezwen. Yon fwa konfime, kontenè a sot nan lis anba a pou w ka konsantre sou sa ki poko konfime. Lis la re-mize a zèro chak jou.</p><div style="display:flex;flex-direction:column;gap:8px">${ pending.length === 0 ? `<div class="empty">${ icon("circle", 22) }<div>${ items.length === 0 ? "Pa gen kontenè pou envantè kounye a." : "Tout kontenè konfime — bon travay!" }</div></div>` : rows }</div>${ confirmedToggle }`;
}

function addContainerView() {
  var e = state.bills.map(function (bill) {
    return `<option value="${ bill.id }">${ escapeHtml(bill.numewo) } — ${ escapeHtml(bill.product || "san pwodwi") }</option>`;
  }).join("");
  var n = state.billMode === "nouvo" ? `<input class="input" style="flex:1" id="f-billnumewo" placeholder="Nimewo Bill" required />` : `<select class="input" style="flex:1" id="f-billid" required><option value="">— chwazi —</option>${ e }</select>`;
  var i;
  if (state.billMode === "ekzistan") {
    i = `<input class="input" id="f-product-display" style="background:var(--line-soft);color:var(--muted)" placeholder="chwazi yon bill" disabled />`;
  } else {
    i = `<input class="input" id="f-product" placeholder="Egz. Diri, Sikwit, Sik..." />`;
  }
  var o = `<div><span class="field-label">Kontenè a</span><select class="input" id="f-entrymode"><option value="antre"${ state.entryMode === "antre" ? " selected" : "" }>Deja Antre</option><option value="planifye"${ state.entryMode === "planifye" ? " selected" : "" }>Poko Antre (Disponib)</option></select></div>`;
  var a = state.entryMode === "planifye" ? `<div><span class="field-label">Dat Prevwa (opsyonèl)</span><input class="input" type="date" id="f-date-expected" /></div>` : `<div><span class="field-label">Dat Antre</span><input class="input" type="date" id="f-date" value="${ today() }" /></div>`;
  return `<div class="section-head"><div><div class="eyebrow">Aksyon Rapid</div><h2 class="h2">Ajoute yon Kontenè</h2></div></div><form class="form-grid" id="add-form"><div><span class="field-label">Nimewo Kontenè</span><input class="input" id="f-numewo" placeholder="Egz. MSCU1234567" required /></div><div><span class="field-label">Gwosè (Pye)</span><select class="input" id="f-size" required><option value="">— Chwazi —</option><option value="20">20 Pye</option><option value="40">40 Pye</option></select></div><div><span class="field-label">Divizyon</span><select class="input" id="f-division" required><option value="">— Chwazi —</option>${ ALL_DIVISIONS.map(function (l) {
    return `<option value="${ l }">${ l }</option>`;
  }).join("") }</select></div><div><span class="field-label">Trucking (opsyonèl)</span><select class="input" id="f-trucking">${ truckingOptionsHtml("") }</select></div><div><span class="field-label">Bill</span><div style="display:flex;gap:6px"><select class="input" style="width:96px" id="f-billmode"><option value="nouvo"${ state.billMode === "nouvo" ? " selected" : "" }>Nouvo/Egz.</option><option value="ekzistan"${ state.billMode === "ekzistan" ? " selected" : "" }>Chwazi</option></select>${ n }</div></div><div><span class="field-label">Pwodwi nan Bill la</span>${ i }</div>${ o }${ a }<button type="submit" class="btn teal">${ icon("plus", 15, "#fff") } Ajoute</button></form><p class="form-hint">Tout kontenè ki nan menm bill la otomatikman gen menm pwodwi a. Si kontenè a "Poko Antre", li ap parèt kòm <strong>Disponib</strong> jiskaske w konfime antre l.</p>`;
}

function containersView() {
  var e = state.containers.filter(function (container) {
    if (state.filterStatus === "ijan") {
      if (!isUrgent(container)) {
        return false;
      }
    } else if (state.filterStatus !== "tout" && statusOf(container) !== state.filterStatus) {
      return false;
    }
    if (!state.search.trim()) {
      return true;
    }
    var l = state.bills.find(function (bill) {
      return bill.id === container.billId;
    });
    var s = state.search.trim().toLowerCase();
    return container.numewo.toLowerCase().indexOf(s) !== -1 || l && l.numewo.toLowerCase().indexOf(s) !== -1 || l && l.product && l.product.toLowerCase().indexOf(s) !== -1;
  }).sort(function (a, l) {
    return a.dateEntered < l.dateEntered ? 1 : -1;
  });
  var n = [
    "tout",
    "disponib",
    "pokoverifye",
    "full",
    "vid",
    "kite",
    "ijan"
  ].map(function (a) {
    var l = state.filterStatus === a;
    return `<button class="filter-btn${ l ? " active" : "" }" data-action="set-filter" data-filter="${ a }">${ a === "tout" ? "Tout" : a === "ijan" ? "\u26A0 Ijan" : STATUS_LABELS[a] }</button>`;
  }).join("");
  var i = `<div class="section-head"><div><div class="eyebrow">${ e.length } rezilta</div><h2 class="h2">Rejis Kontenè</h2></div><div class="toolbar"><div class="search-wrap"><span class="search-icon">${ icon("search", 14) }</span><input class="input" id="f-search" placeholder="Chèche kontenè, bill oswa pwodwi..." value="${ escapeHtml(state.search) }" /></div><div style="display:flex;gap:6px">${ n }</div></div></div>`;
  if (e.length === 0) {
    return `${ i }<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè ki koresponn. Ajoute yon kontenè pou kòmanse.</div></div>`;
  }
  var o = e.map(function (a) {
    var l = state.bills.find(function (bill) {
      return bill.id === a.billId;
    });
    var s = statusOf(a);
    var f = daysBetween(a.dateEntered, a.dateEmpty);
    var g = s === "disponib" ? "\u2014" : f + " jou";
    var v = isUrgent(a);
    var A = daysLabel(a);
    var r = v ? COLORS.urgent : COLORS[s];
    var d = "";
    if (s === "disponib") {
      d += `<button class="btn small teal" data-action="confirm-enter" data-id="${ a.id }">Konfime Antre Jodi a</button>`;
    } else if (s === "pokoverifye") {
      d += `<button class="btn small teal" data-action="verify-container" data-id="${ a.id }">Verifye &amp; Mete nan Depo</button>`;
      d += `<button class="btn small ghost" data-action="correct-date" data-id="${ a.id }">Korije Dat</button>`;
      d += `<button class="btn small ghost" data-action="unconfirm-enter" data-id="${ a.id }">${ icon("undo", 12) } Anile Antre</button>`;
    } else if (s === "full") {
      d += `<button class="btn small ghost" data-action="transfer-depo" data-id="${ a.id }">Transfere Depo</button>`;
      d += `<button class="btn small ghost" data-action="correct-date" data-id="${ a.id }">Korije Dat</button>`;
      d += `<button class="btn small ghost" data-action="mark-empty" data-id="${ a.id }">Mete Vid Jodi a</button>`;
    } else if (s === "vid") {
      d += `<button class="btn small ghost" data-action="transfer-depo" data-id="${ a.id }">Transfere Depo</button>`;
      d += `<button class="btn small ghost" data-action="undo-empty" data-id="${ a.id }">${ icon("undo", 12) } Anile Vid</button>`;
      d += `<button class="btn small green" data-action="mark-left" data-id="${ a.id }">Kontenè Kite Jodi a</button>`;
    } else {
      d += `<button class="btn small ghost" data-action="undo-left" data-id="${ a.id }">${ icon("undo", 12) } Anile Kite</button>`;
    }
    d += `<button class="btn small danger" data-action="delete-container" data-id="${ a.id }">${ icon("trash", 12) }</button>`;
    var u = a.dateExpected ? `<div class="mini">Dat Prevwa<strong style="color:${ COLORS.disponib }">${ formatDateShort(a.dateExpected) }</strong></div>` : "";
    var E = a.depo ? `<div class="row-sub light">Depo: <strong style="color:${ COLORS.full }">${ escapeHtml(a.depo) }</strong></div>` : "";
    var y = a.trucking ? `<div class="row-sub light">Trucking: <strong style="color:var(--muted)">${ escapeHtml(a.trucking) }</strong></div>` : "";
    var P = a.plak ? `<div class="row-sub light">Plak: <strong style="color:var(--muted)">${ escapeHtml(a.plak) }</strong></div>` : "";
    var U = a.division ? `<div class="row-sub light">Divizyon: <strong style="color:var(--navy)">${ escapeHtml(a.division) }</strong></div>` : "";
    return `<div class="row" style="border-left:4px solid ${ r }"><div class="row-min"><span class="plate" style="border-color:${ r }">${ escapeHtml(a.numewo) }</span> <span style="display:inline-block;font-family:var(--font-mono);font-weight:700;font-size:11px;background:var(--navy);color:#fff;padding:2px 6px;border-radius:4px;vertical-align:middle">${ a.size || "\u2014" }'</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ l ? escapeHtml(l.numewo) : "\u2014" }</strong></div><div class="row-sub light">Pwodwi: <strong style="color:var(--muted)">${ l && l.product ? escapeHtml(l.product) : "\u2014" }</strong></div>${ U }${ E }${ y }${ P }</div>${ u }<div class="mini">Antre<strong>${ formatDateShort(a.dateEntered) }</strong></div><div class="mini">Jou Full<strong style="color:${ s === "full" && v ? COLORS.urgent : COLORS.rust }">${ g }</strong></div><div class="mini">Jou Vid<strong style="color:${ s === "vid" && v ? COLORS.urgent : "var(--ink)" }">${ A }</strong></div><div class="mini">Vid Depi<strong>${ formatDateShort(a.dateEmpty) }</strong></div><div class="mini">Kite Depi<strong>${ formatDateShort(a.dateLeft) }</strong></div><div style="margin-left:auto;display:flex;gap:6px;align-items:center">${ v ? `<span class="chip" style="color:#fff;background:${ COLORS.urgent }">⚠ Ijan</span>` : "" }<span class="chip" style="color:${ COLORS[s] };background:${ COLORS[s] }1A;border:1px solid ${ COLORS[s] }55"><span class="mini-dot" style="background:${ COLORS[s] }"></span>${ STATUS_LABELS[s] }</span></div><div class="row-actions">${ d }</div></div>`;
  }).join("");
  return i + o;
}

function billsView() {
  var e = `<div class="section-head"><div><div class="eyebrow">${ state.bills.length } bill</div><h2 class="h2">Rejis Bill</h2></div></div>${ state.filterBillStatus ? `<div style="margin-bottom:14px"><span class="chip" style="color:${ state.filterBillStatus === "fini" ? COLORS.green : COLORS.rust };background:${ state.filterBillStatus === "fini" ? COLORS.green : COLORS.rust }1A;border:1px solid ${ state.filterBillStatus === "fini" ? COLORS.green : COLORS.rust }55">Bill ${ state.filterBillStatus === "fini" ? "Fini" : "Aktif" } <button data-action="clear-bill-filter" style="background:none;border:none;cursor:pointer;color:inherit;font-weight:700;margin-left:4px">✕</button></span></div>` : "" }`;
  if (state.bills.length === 0) {
    return `${ e }<div class="empty">${ icon("circle", 22) }<div>Pa gen bill ankò. Yo kreye otomatikman lè w ajoute yon kontenè.</div></div>`;
  }
  var n = state.bills.filter(function (bill) {
    return !state.filterBillStatus || billStatus(bill, state.containers) === state.filterBillStatus;
  }).sort(function (i, o) {
    var a = billStatus(i, state.containers) === "fini" ? 1 : 0;
    var l = billStatus(o, state.containers) === "fini" ? 1 : 0;
    return a - l;
  }).map(function (bill) {
    var o = state.containers.filter(function (container) {
      return container.billId === bill.id;
    });
    var a = billStatus(bill, state.containers);
    var l = o.filter(function (r) {
      return r.dateLeft;
    }).length;
    var s = o.length ? Math.round(l / o.length * 100) : 0;
    var f = {
      vid: {
        c: "#8CA0B3",
        label: "San Kontenè"
      },
      planifye: {
        c: COLORS.disponib,
        label: "Planifye"
      },
      aktif: {
        c: COLORS.rust,
        label: "Aktif"
      },
      fini: {
        c: COLORS.green,
        label: "Fini"
      }
    };
    var g = f[a];
    var v = a === "fini" ? COLORS.green : a === "aktif" ? COLORS.rust : a === "planifye" ? COLORS.disponib : COLORS.steel;
    var A = o.map(function (r) {
      var d = statusOf(r);
      var u = COLORS[d];
      return `<span class="mini-chip" style="border:1px solid ${ u }55"><span class="mini-dot" style="background:${ u }"></span>${ escapeHtml(r.numewo) }</span>`;
    }).join("");
    return `<div class="bill-card"><div class="bill-top"><span class="plate" style="border-color:${ v }">${ escapeHtml(bill.numewo) }</span><span class="badge" style="background:${ g.c }">${ a === "fini" ? icon("check", 13, "#fff") : "" }${ g.label }</span><span class="product-tag">${ escapeHtml(bill.product || "San pwodwi") }</span><span style="font-size:12.5px;color:var(--muted);font-family:var(--font-mono)">${ l }/${ o.length } kontenè kite</span>${ a === "fini" ? `<span style="font-size:11.5px;color:${ COLORS.green }">Fini ${ formatDateShort(bill.completedAt) }</span>` : "" }${ o.length === 0 ? `<div style="margin-left:auto"><button class="btn small danger" data-action="delete-bill" data-id="${ bill.id }">${ icon("trash", 12) } Efase</button></div>` : "" }</div>${ o.length > 0 ? `<div class="progress"><div class="progress-fill" style="width:${ s }%;background:${ a === "fini" ? COLORS.green : COLORS.rust }"></div></div><div class="chiplist">${ A }</div>` : "" }</div>`;
  }).join("");
  return e + n;
}

function dknReportSection() {
  var items = state.containers.filter(function (container) {
    return /^DNK\s?\d+/i.test(container.trucking || "") && statusOf(container) !== "kite";
  }).sort(function (a, b) {
    return (a.trucking || "").localeCompare(b.trucking || "") || (a.numewo < b.numewo ? -1 : 1);
  });
  var rows = items.map(function (cc) {
    var st = statusOf(cc);
    var col = st === "full" ? COLORS.rust : st === "vid" ? COLORS.vid : COLORS.pokoverifye;
    return `<div class="row" style="border-left:4px solid ${ col }"><div class="row-min"><span class="plate" style="border-color:${ col }">${ escapeHtml(cc.numewo) }</span><div class="row-sub">${ STATUS_LABELS[st] } · ${ escapeHtml(cc.trucking || "") } · ${ cc.division ? escapeHtml(cc.division) : "\u2014" }</div></div><div style="width:200px;flex-shrink:0"><span class="field-label" style="font-size:9.5px">Non Chofè</span><input class="input dkn-chofer-input" data-id="${ cc.id }" value="${ escapeHtml(cc.chofer || "") }" placeholder="Non chofè a" style="padding:6px 8px;font-size:12.5px" /></div></div>`;
  }).join("");
  return `<div class="section-head" style="margin-top:28px"><div><div class="eyebrow">${ items.length } kontenè</div><h2 class="h2">Rapò Trucking DNK</h2></div></div><p style="font-size:12.5px;color:var(--muted-light);margin-top:-10px;margin-bottom:16px">Tout kontenè ki asiyen a yon trucking DNK. Ekri non chofè ki vini ak chak kontenè a.</p><div style="display:flex;flex-direction:column;gap:8px">${ items.length === 0 ? `<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè sou trucking DNK kounye a.</div></div>` : rows }</div>`;
}

function reportsView() {
  var e = state.containers.filter(function (container) {
    return (statusOf(container) === "full" || statusOf(container) === "pokoverifye") && DIVISIONS_GROUP_1.indexOf(container.division) !== -1;
  }).length;
  var n = state.containers.filter(function (container) {
    return (statusOf(container) === "full" || statusOf(container) === "pokoverifye") && DIVISIONS_GROUP_2.indexOf(container.division) !== -1;
  }).length;
  var i = state.containers.filter(function (container) {
    return statusOf(container) === "vid";
  }).length;
  function o(a, l, s, f, g, v) {
    return `<div class="card" style="display:flex;flex-direction:column;gap:14px"><div style="display:flex;align-items:center;gap:12px"><div style="width:40px;height:40px;border-radius:9px;background:${ f }16;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ icon("filetext", 19, f) }</div><div><div class="h3">${ a }</div><div style="font-size:12px;color:var(--muted)">${ l }</div></div></div><div style="font-family:var(--font-mono);font-weight:800;font-size:26px;color:var(--ink)">${ s } <span style="font-size:12px;font-weight:600;color:var(--muted-light)">kontenè</span></div><button class="btn teal" data-action="print-report" data-status="${ g }"${ v ? ` data-group="${ v }"` : "" } style="align-self:flex-start">${ icon("download", 15, "#fff") } Telechaje PDF</button></div>`;
  }
  return `<div class="section-head"><div><div class="eyebrow">Dokiman</div><h2 class="h2">Rapò Kontenè</h2></div></div><p style="font-size:12.5px;color:var(--muted-light);margin-top:-10px;margin-bottom:20px">Klike "Telechaje PDF" pou telechaje fichye a dirèkteman sou aparèy ou.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">${ o("Rapò Full \u2014 Gwoup 1", "CRISTO AL, CRISTO COMM, CONFIDEKA, DEKAV", e, COLORS.rust, "full", "1") }${ o("Rapò Full \u2014 Gwoup 2", "ACS, MIKADO, LA COLLECTION, DEKA TIRES", n, COLORS.rust, "full", "2") }${ o("Rapò Kontenè Vid", "Tout kontenè ki vide men poko kite", i, COLORS.vid, "vid", null) }<div class="card" style="display:flex;flex-direction:column;gap:14px"><div style="display:flex;align-items:center;gap:12px"><div style="width:40px;height:40px;border-radius:9px;background:${ COLORS.green }16;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ icon("filetext", 19, COLORS.green) }</div><div><div class="h3">Rejis Konplè — Excel</div><div style="font-size:12px;color:var(--muted)">Tout kontenè yo, yon fichye .csv ki louvri nan Excel</div></div></div><div style="font-family:var(--font-mono);font-weight:800;font-size:26px;color:var(--ink)">${ state.containers.length } <span style="font-size:12px;font-weight:600;color:var(--muted-light)">kontenè</span></div><button class="btn teal" data-action="export-containers-csv" style="align-self:flex-start">${ icon("download", 15, "#fff") } Telechaje CSV</button></div></div>${ dknReportSection() }`;
}

function notificationsView() {
  var e = `<div class="section-head"><div><div class="eyebrow">${ state.notifications.length } notifikasyon</div><h2 class="h2">Istwa Notifikasyon</h2></div></div>${ pushCard() }`;
  if (state.notifications.length === 0) {
    return `${ e }<div class="empty">${ icon("circle", 22) }<div>Poko gen notifikasyon. W ap resevwa yonn lè yon bill fini.</div></div>`;
  }
  var n = state.notifications.map(function (notification) {
    return `<div class="notif-item"><div class="notif-ico">${ icon("check", 16, "#fff") }</div><div><div class="notif-msg">${ escapeHtml(notification.message) }</div><div class="notif-date">${ formatDateShort(notification.date) }</div></div></div>`;
  }).join("");
  return e + n;
}

export function adminContent() {
  var e = "";
  if (state.tab === "dashboard") {
    e = dashboardView();
  } else if (state.tab === "add") {
    e = addContainerView();
  } else if (state.tab === "containers") {
    e = containersView();
  } else if (state.tab === "inventory") {
    e = inventoryView();
  } else if (state.tab === "bills") {
    e = billsView();
  } else if (state.tab === "achiv") {
    e = archiveView();
  } else if (state.tab === "rapo") {
    e = reportsView();
  } else if (state.tab === "notifs") {
    e = notificationsView();
  }
  if (state.tab === "sekirite") {
    e = securityView();
  }
  if (state.tab === "itilizate") {
    e = usersView();
  }
  return `<div class="shell">${ adminSidebar() }<div class="main">${ adminTopbar() }<main class="content">${ state.saveErr ? `<div class="alert">${ icon("alert", 14) }Pa t kapab sove chanjman an. Verifye epi eseye ankò.</div>` : "" }${ e }</main></div></div>`;
}
