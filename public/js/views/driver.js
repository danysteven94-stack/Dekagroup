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
  return `<div style="min-height:100vh;background:var(--bg)"><header style="background:var(--navy);padding:18px 20px;display:flex;align-items:center;gap:12px"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1"><div style="color:#fff;font-weight:800;font-size:16px">DEKA LOG — Chofè</div><div style="color:var(--steel-light);font-size:11.5px">Konfime depa kontenè vid yo · ${ formatLongDate() }</div></div>${ helpButton("#fff") + accountButton("#fff") }<button class="linklike" data-action="logout" style="color:#fff">Dekonekte</button></header><main class="content" style="max-width:720px;margin:0 auto"><div class="card" style="margin-bottom:20px"><span class="field-label">Trucking ou</span><select class="input" id="driver-trucking-select" style="margin-top:6px">${ o }</select></div><div class="section-head"><div><div class="eyebrow">${ e.length } kontenè vid</div><h2 class="h2">Chwazi Kontenè w ap Pran</h2></div></div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:90px">${ a }</div></main><div style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid var(--line);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 -4px 16px rgba(0,0,0,.08)"><span style="font-size:13px;color:var(--muted)">${ n } kontenè chwazi</span><button class="btn teal" data-action="driver-confirm"${ i ? "" : " disabled" }>${ icon("check", 15, "#fff") } Konfime Depa</button></div></div>`;
}
