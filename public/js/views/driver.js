// Driver (chofè) interface.
import {
  COLORS,
  LOGO_URL,
  TRUCKING_OPTIONS
} from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  escapeHtml,
  formatDateShort,
  formatLongDate,
  statusOf
} from "../utils.js";
import { accountButton } from "./account.js";
import { helpButton } from "./help.js";

export function driverView() {
  var e = state.containers.filter(function (container) {
    return statusOf(container) === "vid";
  });
  var up = state.containers.filter(function (container) {
    return statusOf(container) === "disponib";
  }).sort(function (r, d) {
    return r.dateExpected && d.dateExpected ? (r.dateExpected < d.dateExpected ? -1 : 1) : r.dateExpected ? -1 : d.dateExpected ? 1 : 0;
  });
  var taken = state.containers.filter(function (container) {
    return statusOf(container) === "pran";
  }).sort(function (r, d) {
    return (r.pranBy === state.username ? 0 : 1) - (d.pranBy === state.username ? 0 : 1);
  });
  // Containers still on their way (not entered yet) and not taken by anybody: the driver ticks the ones he
  // takes. Once ticked, a container leaves this list (its status is "pran", no longer "disponib"): his name,
  // trucking and plate are stamped on it by the server, and it moves to "Kontenè Pran" below.
  function billOf(r) {
    return state.bills.find(function (bill) {
      return bill.id === r.billId;
    });
  }
  function rowTop(r, s) {
    return `<div class="row-min"><span class="plate" style="border-color:${ s.color }">${ escapeHtml(r.numewo) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ s.bill ? escapeHtml(s.bill.numewo) : "\u2014" }</strong></div><div class="row-sub light">Pwodwi: <strong style="color:var(--muted)">${ s.bill && s.bill.product ? escapeHtml(s.bill.product) : "\u2014" }</strong></div>`;
  }
  function availableRow(r) {
    var b = billOf(r);
    return `<label class="row" style="cursor:pointer;border-left:4px solid ${ COLORS.disponib }"><input type="checkbox" data-action="driver-toggle-pran" data-id="${ r.id }" style="width:18px;height:18px;flex-shrink:0" />${ rowTop(r, { color: COLORS.disponib, bill: b }) }</div>${ r.dateExpected ? `<div class="mini">Dat Prevwa<strong style="color:${ COLORS.disponib }">${ formatDateShort(r.dateExpected) }</strong></div>` : "" }</label>`;
  }
  function takenRow(r) {
    var b = billOf(r);
    var mine = r.pranBy === state.username;
    var who = `<div class="row-sub" style="color:${ COLORS.pran }">Pran pa: <strong>${ r.chofer ? escapeHtml(r.chofer) : "\u2014" }</strong>${ r.trucking ? " · Trucking: <strong>" + escapeHtml(r.trucking) + "</strong>" : "" }${ r.plak ? " · Plak: <strong>" + escapeHtml(r.plak) + "</strong>" : "" }</div>`;
    return `<label class="row" style="${ mine ? "cursor:pointer;background:#F0FAF5" : "cursor:not-allowed;opacity:.75" };border-left:4px solid ${ COLORS.pran }"><input type="checkbox" data-action="driver-toggle-pran" data-id="${ r.id }" checked${ mine ? "" : " disabled" } style="width:18px;height:18px;flex-shrink:0" />${ rowTop(r, { color: COLORS.pran, bill: b }) }${ who }</div>${ r.dateExpected ? `<div class="mini">Dat Prevwa<strong style="color:${ COLORS.pran }">${ formatDateShort(r.dateExpected) }</strong></div>` : "" }</label>`;
  }
  // Two boxes: one list of 40' containers, one list of 20' containers (and a third only if some have no size).
  function sizeBox(title, list, color) {
    return `<div class="card" style="margin-bottom:14px;border-top:4px solid ${ color }"><div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px"><div class="h3" style="margin:0">${ title }</div><div class="eyebrow" style="margin:0">${ list.length } kontenè</div></div>${ list.length === 0 ? `<div style="font-size:13px;color:var(--muted-light);padding:6px 0">Pa gen kontenè ${ title === "Kontenè 40 pye" ? "40 pye" : title === "Kontenè 20 pye" ? "20 pye" : "" } kounye a.</div>` : `<div style="display:flex;flex-direction:column;gap:8px">${ list.map(availableRow).join("") }</div>` }</div>`;
  }
  var up40 = up.filter(function (r) {
    return String(r.size) === "40";
  });
  var up20 = up.filter(function (r) {
    return String(r.size) === "20";
  });
  var upOther = up.filter(function (r) {
    return String(r.size) !== "40" && String(r.size) !== "20";
  });
  var upBlock = `<div class="section-head" style="margin-top:28px"><div><div class="eyebrow">${ up.length } kontenè</div><h2 class="h2">Kontenè Disponib (Poko Antre)</h2></div></div><p style="font-size:12.5px;color:var(--muted);margin:-6px 0 12px">Lè w pran yon kontenè, make l. Non w, trucking ou chwazi a ak plak ou ap parèt sou kontenè a otomatikman, epi l ap soti nan lis disponib la.</p>${ sizeBox("Kontenè 40 pye", up40, COLORS.navy) }${ sizeBox("Kontenè 20 pye", up20, COLORS.steel) }${ upOther.length ? sizeBox("Kontenè san gwosè", upOther, COLORS.disponib) : "" }`;
  var takenBlock = taken.length === 0 ? "" : `<div class="section-head" style="margin-top:12px"><div><div class="eyebrow">${ taken.length } kontenè</div><h2 class="h2">Kontenè Pran (Poko Antre)</h2></div></div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">${ taken.map(takenRow).join("") }</div>`;
  var n = Object.keys(state.driverSelected).filter(function (l) {
    return state.driverSelected[l];
  }).length;
  var i = state.driverTrucking && n > 0;
  var o = [""].concat(TRUCKING_OPTIONS).map(function (l) {
    return `<option value="${ l }"${ state.driverTrucking === l ? " selected" : "" }>${ l === "" ? "\u2014 Chwazi trucking ou \u2014" : l }</option>`;
  }).join("");
  var a;
  if (e.length === 0) {
    a = `<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè vid disponib kounye a.</div></div>`;
  } else {
    a = e.map(function (l) {
      var s = state.bills.find(function (bill) {
        return bill.id === l.billId;
      });
      var f = !!state.driverSelected[l.id];
      return `<label class="row" style="cursor:pointer;border-left:4px solid ${ COLORS.vid }${ f ? ";background:#FFF9EC" : "" }"><input type="checkbox" data-action="driver-toggle-select" data-id="${ l.id }"${ f ? " checked" : "" } style="width:18px;height:18px;flex-shrink:0" /><div class="row-min"><span class="plate" style="border-color:${ COLORS.vid }">${ escapeHtml(l.numewo) }</span><div class="row-sub">Bill: <strong style="color:var(--navy)">${ s ? escapeHtml(s.numewo) : "\u2014" }</strong></div><div class="row-sub light">Pwodwi: <strong style="color:var(--muted)">${ s && s.product ? escapeHtml(s.product) : "\u2014" }</strong></div>${ l.depo ? `<div class="row-sub light">Depo: <strong style="color:${ COLORS.full }">${ escapeHtml(l.depo) }</strong></div>` : "" }</div><div class="mini">Vid Depi<strong>${ formatDateShort(l.dateEmpty) }</strong></div></label>`;
    }).join("");
  }
  var drawerOpen = !!state.navDrawerOpen;
  var drawer = `<div class="nav-drawer-overlay${ drawerOpen ? " open" : "" }" data-action="close-nav-drawer"></div><nav class="nav-drawer${ drawerOpen ? " open" : "" }"><div class="nav-drawer-head"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1;min-width:0"><div class="drawer-brand">DEKA LOG</div><div class="drawer-user">Chofè</div></div><button class="drawer-close" data-action="close-nav-drawer" aria-label="Fèmen">${ icon("x", 16, "#fff") }</button></div><div class="nav-drawer-nav" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--steel-light)">${ icon("ship", 34, "rgba(255,255,255,.3)") }<div style="font-size:12.5px;text-align:center;max-width:180px;line-height:1.5">Konfime depa kontenè vid yo · ${ formatLongDate() }</div></div><div class="nav-drawer-foot"><div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">${ helpButton("#C9D6DE") + accountButton("#C9D6DE") }</div><button class="drawer-logout" data-action="logout">${ icon("logout", 15) } Dekonekte</button></div></nav>`;
  return `<div style="min-height:100vh;background:var(--bg)">${ drawer }<header style="background:var(--navy);padding:18px 20px;display:flex;align-items:center;gap:12px"><button class="hamburger-btn" data-action="toggle-nav-drawer" aria-label="Meni">${ icon("menu", 18, "#fff") }</button><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1"><div style="color:#fff;font-weight:800;font-size:16px">DEKA LOG — Chofè</div><div style="color:var(--steel-light);font-size:11.5px" class="simple-header-actions">Konfime depa kontenè vid yo · ${ formatLongDate() }</div></div><div class="simple-header-actions" style="display:flex;align-items:center;gap:14px">${ helpButton("#fff") + accountButton("#fff") }<button class="linklike" data-action="logout" style="color:#fff">Dekonekte</button></div></header><main class="content" style="max-width:720px;margin:0 auto"><div class="card" style="margin-bottom:20px"><span class="field-label">Trucking ou</span><select class="input" id="driver-trucking-select" style="margin-top:6px">${ o }</select></div><div class="section-head"><div><div class="eyebrow">${ e.length } kontenè vid</div><h2 class="h2">Chwazi Kontenè w ap Pran</h2></div></div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">${ a }</div>${ upBlock }${ takenBlock }<div style="height:70px"></div></main><div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid var(--line);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 -4px 16px rgba(0,0,0,.08)"><span style="font-size:13px;color:var(--muted)">${ n } kontenè chwazi</span><button class="btn teal" data-action="driver-confirm"${ i ? "" : " disabled" }>${ icon("check", 15, "#fff") } Konfime Depa</button></div></div>`;
}
