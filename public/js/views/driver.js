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
  return `<div style="min-height:100vh;background:var(--bg)">${ drawer }<header style="background:var(--navy);padding:18px 20px;display:flex;align-items:center;gap:12px"><button class="hamburger-btn" data-action="toggle-nav-drawer" aria-label="Meni">${ icon("menu", 18, "#fff") }</button><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1"><div style="color:#fff;font-weight:800;font-size:16px">DEKA LOG — Chofè</div><div style="color:var(--steel-light);font-size:11.5px" class="simple-header-actions">Konfime depa kontenè vid yo · ${ formatLongDate() }</div></div><div class="simple-header-actions" style="display:flex;align-items:center;gap:14px">${ helpButton("#fff") + accountButton("#fff") }<button class="linklike" data-action="logout" style="color:#fff">Dekonekte</button></div></header><main class="content" style="max-width:720px;margin:0 auto"><div class="card" style="margin-bottom:20px"><span class="field-label">Trucking ou</span><select class="input" id="driver-trucking-select" style="margin-top:6px">${ o }</select></div><div class="section-head"><div><div class="eyebrow">${ e.length } kontenè vid</div><h2 class="h2">Chwazi Kontenè w ap Pran</h2></div></div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:90px">${ a }</div></main><div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid var(--line);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 -4px 16px rgba(0,0,0,.08)"><span style="font-size:13px;color:var(--muted)">${ n } kontenè chwazi</span><button class="btn teal" data-action="driver-confirm"${ i ? "" : " disabled" }>${ icon("check", 15, "#fff") } Konfime Depa</button></div></div>`;
}
