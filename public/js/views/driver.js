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
  var mine = state.username;
  var empty = state.containers.filter(function (container) {
    return statusOf(container) === "vid";
  });
  var up = state.containers.filter(function (container) {
    return statusOf(container) === "disponib";
  }).sort(byExpected);
  var taken = state.containers.filter(function (container) {
    return statusOf(container) === "pran";
  }).sort(function (r, d) {
    return (r.pranBy === mine ? 0 : 1) - (d.pranBy === mine ? 0 : 1);
  });
  var selectedIds = Object.keys(state.driverSelected).filter(function (l) {
    return state.driverSelected[l];
  });
  var n = selectedIds.length;
  var canConfirm = state.driverTrucking && n > 0;

  function billOf(r) {
    return state.bills.find(function (bill) {
      return bill.id === r.billId;
    });
  }
  function byExpected(r, d) {
    return r.dateExpected && d.dateExpected ? (r.dateExpected < d.dateExpected ? -1 : 1) : r.dateExpected ? -1 : d.dateExpected ? 1 : 0;
  }
  function sizeOf(r) {
    return String(r.size) === "40" ? "40" : String(r.size) === "20" ? "20" : "other";
  }
  function line(label, value, color) {
    return `<div class="kpi-sub">${ label }: <strong style="color:${ color || "var(--navy)" }">${ value }</strong></div>`;
  }
  // One selectable card (same look as the dashboard cards). The whole card is the tap target.
  function tile(r, o) {
    var b = billOf(r);
    var extra = o.extra || "";
    return `<div class="kpi sel-tile${ o.selected ? " selected" : "" }${ o.locked ? " locked" : "" }" ${ o.locked ? "" : `data-action="${ o.action }" data-id="${ r.id }"` } style="--sel:${ o.color }" role="checkbox" aria-checked="${ o.selected ? "true" : "false" }"><div class="kpi-top"><span class="plate" style="border-color:${ o.color }">${ escapeHtml(r.numewo) }</span><div class="sel-check">${ o.selected ? icon("check", 15, "#fff") : "" }</div></div>${ line("Bill", b ? escapeHtml(b.numewo) : "\u2014") }${ line("Pwodwi", b && b.product ? escapeHtml(b.product) : "\u2014", "var(--muted)") }${ extra }</div>`;
  }
  // A box holding one list (40' or 20'), with the number of containers and an optional "select all".
  function box(title, list, color, emptyText, selectAllSize, renderTile) {
    var all = list.length > 0 && list.every(function (r) {
      return !!state.driverSelected[r.id];
    });
    var selAll = selectAllSize && list.length > 0 ? `<button class="linklike" data-action="driver-select-all" data-size="${ selectAllSize }" style="font-size:12.5px;font-weight:700;color:${ color }">${ all ? "Dezeleksyone tout" : "Seleksyone tout" }</button>` : "";
    return `<div class="size-box" style="--sel:${ color }"><div class="size-head"><div class="h3" style="margin:0">${ title }</div><div class="size-count">${ list.length } kontenè</div></div>${ selAll ? `<div style="margin:-2px 0 10px">${ selAll }</div>` : "" }${ list.length === 0 ? `<div class="size-empty">${ emptyText }</div>` : `<div class="grid-kpi" style="margin-bottom:0">${ list.map(renderTile).join("") }</div>` }</div>`;
  }
  function split(list) {
    return {
      s40: list.filter(function (r) { return sizeOf(r) === "40"; }),
      s20: list.filter(function (r) { return sizeOf(r) === "20"; }),
      other: list.filter(function (r) { return sizeOf(r) === "other"; })
    };
  }

  // ---- Vid: selectable, then "Konfime Depa"
  function emptyTile(r) {
    var extra = (r.depo ? line("Depo", escapeHtml(r.depo), COLORS.full) : "") + line("Vid Depi", formatDateShort(r.dateEmpty), "var(--ink)");
    return tile(r, { action: "driver-toggle-select", selected: !!state.driverSelected[r.id], color: COLORS.vid, extra: extra });
  }
  var ev = split(empty);
  var emptyBlock = `<div class="section-head"><div><div class="eyebrow">${ empty.length } kontenè vid</div><h2 class="h2">Chwazi Kontenè w ap Pran</h2></div></div>` + (empty.length === 0 ? `<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè vid disponib kounye a.</div></div>` : box("Kontenè Vid 40 pye", ev.s40, COLORS.navy, "Pa gen kontenè vid 40 pye kounye a.", "40", emptyTile) + box("Kontenè Vid 20 pye", ev.s20, COLORS.steel, "Pa gen kontenè vid 20 pye kounye a.", "20", emptyTile) + (ev.other.length ? box("Kontenè Vid san gwosè", ev.other, COLORS.vid, "", "other", emptyTile) : ""));

  // ---- Disponib (not entered yet, not taken): tap a card to say "I took it" -> it moves to "Pran"
  function availableTile(r) {
    return tile(r, { action: "driver-toggle-pran", selected: false, color: COLORS.disponib, extra: r.dateExpected ? line("Dat Prevwa", formatDateShort(r.dateExpected), COLORS.disponib) : "" });
  }
  var uv = split(up);
  var upBlock = `<div class="section-head" style="margin-top:28px"><div><div class="eyebrow">${ up.length } kontenè</div><h2 class="h2">Kontenè Disponib (Poko Antre)</h2></div></div><p class="size-hint">Peze sou yon kontenè lè w pran l. Non w, trucking ou chwazi a ak plak ou ap parèt sou kontenè a otomatikman, epi l ap soti nan lis disponib la.</p>${ box("Kontenè 40 pye", uv.s40, COLORS.navy, "Pa gen kontenè 40 pye kounye a.", "", availableTile) }${ box("Kontenè 20 pye", uv.s20, COLORS.steel, "Pa gen kontenè 20 pye kounye a.", "", availableTile) }${ uv.other.length ? box("Kontenè san gwosè", uv.other, COLORS.disponib, "", "", availableTile) : "" }`;

  // ---- Pran: mine (tap to undo) and the other drivers' (locked)
  function takenTile(r) {
    var isMine = r.pranBy === mine;
    var extra = line("Pran pa", r.chofer ? escapeHtml(r.chofer) : "\u2014", COLORS.pran) + (r.trucking ? line("Trucking", escapeHtml(r.trucking), "var(--ink)") : "") + (r.plak ? line("Plak", escapeHtml(r.plak), "var(--ink)") : "");
    return tile(r, { action: "driver-toggle-pran", selected: true, locked: !isMine, color: COLORS.pran, extra: extra });
  }
  var tv = split(taken);
  var takenBlock = taken.length === 0 ? "" : `<div class="section-head" style="margin-top:12px"><div><div class="eyebrow">${ taken.length } kontenè</div><h2 class="h2">Kontenè Pran (Poko Antre)</h2></div></div>${ box("Kontenè 40 pye", tv.s40, COLORS.pran, "Pa gen kontenè 40 pye kounye a.", "", takenTile) }${ box("Kontenè 20 pye", tv.s20, COLORS.pran, "Pa gen kontenè 20 pye kounye a.", "", takenTile) }${ tv.other.length ? box("Kontenè san gwosè", tv.other, COLORS.pran, "", "", takenTile) : "" }`;

  // ---- top cards (same look as the dashboard)
  var kpis = [
    { label: "Vid", value: empty.length, color: COLORS.vid, icon: "boxes", sub: "Ap tann soti" },
    { label: "Disponib", value: up.length, color: COLORS.disponib, icon: "boxes", sub: "Poko antre" },
    { label: "Pran", value: taken.length, color: COLORS.pran, icon: "boxes", sub: "Chofè pran, poko antre" },
    { label: "Seleksyone", value: n, color: COLORS.kite, icon: "check", sub: "Pou konfime depa" }
  ].map(function (r) {
    return `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${ r.label }</span><div class="kpi-icon" style="background:${ r.color }1A;color:${ r.color }">${ icon(r.icon, 14, r.color) }</div></div><div class="kpi-value">${ r.value }</div><div class="kpi-sub">${ r.sub }</div></div>`;
  }).join("");
  var truckingOpts = [""].concat(TRUCKING_OPTIONS).map(function (l) {
    return `<option value="${ l }"${ state.driverTrucking === l ? " selected" : "" }>${ l === "" ? "\u2014 Chwazi trucking ou \u2014" : l }</option>`;
  }).join("");

  var drawerOpen = !!state.navDrawerOpen;
  var drawer = `<div class="nav-drawer-overlay${ drawerOpen ? " open" : "" }" data-action="close-nav-drawer"></div><nav class="nav-drawer${ drawerOpen ? " open" : "" }"><div class="nav-drawer-head"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1;min-width:0"><div class="drawer-brand">DEKA LOG</div><div class="drawer-user">Chofè</div></div><button class="drawer-close" data-action="close-nav-drawer" aria-label="Fèmen">${ icon("x", 16, "#fff") }</button></div><div class="nav-drawer-nav" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--steel-light)">${ icon("ship", 34, "rgba(255,255,255,.3)") }<div style="font-size:12.5px;text-align:center;max-width:180px;line-height:1.5">Konfime depa kontenè vid yo · ${ formatLongDate() }</div></div><div class="nav-drawer-foot"><div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">${ helpButton("#C9D6DE") + accountButton("#C9D6DE") }</div><button class="drawer-logout" data-action="logout">${ icon("logout", 15) } Dekonekte</button></div></nav>`;
  // An account tied to a trucking by the administrator shows it as fixed text; otherwise the driver picks one.
  var truckingCard = state.sessionTrucking
    ? `<div class="card" style="margin-bottom:24px"><span class="field-label">Trucking ou</span><div style="margin-top:6px;font-weight:800;font-size:18px;color:var(--navy)">${ escapeHtml(state.sessionTrucking) }</div></div>`
    : `<div class="card" style="margin-bottom:24px"><span class="field-label">Trucking ou</span><select class="input" id="driver-trucking-select" style="margin-top:6px">${ truckingOpts }</select></div>`;
  var topbar = `<header class="topbar"><button class="hamburger-btn" data-action="toggle-nav-drawer" aria-label="Meni" style="background:rgba(11,33,56,.08);color:var(--navy);margin-right:2px">${ icon("menu", 18, "var(--navy)") }</button><div><div class="topbar-eyebrow">Chofè</div><div class="topbar-title">Tablo Kontwòl</div></div><div class="simple-header-actions" style="display:flex;align-items:center;gap:14px;margin-left:auto">${ helpButton("var(--navy)") + accountButton("var(--navy)") }<button class="linklike" data-action="logout">Dekonekte</button></div><div class="topbar-stats" style="flex-basis:100%"><div class="topbar-stat"><span class="mini-dot" style="background:${ COLORS.vid }"></span>Vid <strong>${ empty.length }</strong></div><div class="topbar-stat"><span class="mini-dot" style="background:${ COLORS.disponib }"></span>Disponib <strong>${ up.length }</strong></div><div class="topbar-stat"><span class="mini-dot" style="background:${ COLORS.pran }"></span>Pran <strong>${ taken.length }</strong></div></div></header>`;
  return `<div style="min-height:100vh;background:var(--bg)">${ drawer }${ topbar }<main class="content" style="max-width:760px;margin:0 auto"><div class="section-head"><div><div class="eyebrow">Jodi a</div><h2 class="h2">Apèsi Jeneral</h2></div></div><div class="grid-kpi">${ kpis }</div>${ truckingCard }${ emptyBlock }${ upBlock }${ takenBlock }<div style="height:90px"></div></main><div class="driver-bar"><span style="font-size:13px;color:var(--muted)">${ n } kontenè chwazi</span><button class="btn teal" data-action="driver-confirm"${ canConfirm ? "" : " disabled" }>${ icon("check", 15, "#fff") } Konfime Depa</button></div></div>`;
}
