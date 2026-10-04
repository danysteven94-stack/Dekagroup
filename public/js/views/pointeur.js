// Pointeur interface: the person who unloads containers at a depot.
// He sees the Full containers of his depot account, taps "Debarquement" when he starts unloading one
// (the administrator sees it immediately), then "Mete Vid" when it is empty. His own name is stamped by the server.
import {
  COLORS,
  LOGO_URL,
  URGENT_AFTER_DAYS
} from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  daysBetween,
  escapeHtml,
  formatDateShort,
  formatLongDate,
  formatTime,
  statusOf
} from "../utils.js";
import { accountButton } from "./account.js";
import { helpButton } from "./help.js";

function matches(c, bill, q) {
  if (!q) {
    return true;
  }
  q = q.toLowerCase();
  return [c.numewo, bill && bill.numewo, bill && bill.product, c.depo, c.division].some(function (v) {
    return v && String(v).toLowerCase().indexOf(q) !== -1;
  });
}

export function pointeurView() {
  var mine = state.username;
  var q = (state.pointeurSearch || "").trim();
  var full = state.containers.filter(function (c) {
    return statusOf(c) === "full";
  });
  function billOf(c) {
    return state.bills.find(function (b) {
      return b.id === c.billId;
    });
  }
  var visible = full.filter(function (c) {
    return matches(c, billOf(c), q);
  });
  var mineList = visible.filter(function (c) {
    return c.dateDebarq && c.debarqBy === mine;
  });
  var othersList = visible.filter(function (c) {
    return c.dateDebarq && c.debarqBy !== mine;
  });
  var todo = visible.filter(function (c) {
    return !c.dateDebarq;
  }).sort(function (a, b) {
    return (a.dateEntered || "") < (b.dateEntered || "") ? -1 : 1;
  });

  function line(label, value, color) {
    return `<div class="row-sub light">${ label }: <strong style="color:${ color || "var(--navy)" }">${ value }</strong></div>`;
  }
  function card(c, kind) {
    var b = billOf(c);
    var days = daysBetween(c.dateEntered);
    var urgent = days > URGENT_AFTER_DAYS;
    var col = kind === "todo" ? (urgent ? COLORS.urgent : COLORS.full) : COLORS.pran;
    var btn = "";
    if (kind === "todo") {
      btn = `<button class="btn small green" data-action="pointeur-debarq" data-id="${ c.id }" style="padding:10px 14px;font-size:13.5px">Debarquement</button>`;
    } else if (kind === "mine") {
      btn = `<button class="btn small green" data-action="pointeur-vid" data-id="${ c.id }" style="padding:10px 14px;font-size:13.5px">Mete Vid</button><button class="btn small ghost" data-action="pointeur-undo" data-id="${ c.id }">Anile</button>`;
    } else {
      btn = `<span class="chip" style="color:#fff;background:${ COLORS.pran }">Ap debake pa ${ escapeHtml(c.debarqName || c.debarqBy || "") }</span>`;
    }
    var size = c.size ? ` <span style="display:inline-block;font-family:var(--font-mono);font-weight:700;font-size:11px;background:var(--navy);color:#fff;padding:2px 6px;border-radius:4px;vertical-align:middle">${ escapeHtml(c.size) }'</span>` : "";
    return `<div class="row" style="border-left:4px solid ${ col };flex-wrap:wrap;gap:8px"><div class="row-min"><span class="plate" style="border-color:${ col }">${ escapeHtml(c.numewo) }</span>${ size }${ line("Bill", b ? escapeHtml(b.numewo) : "\u2014") }${ line("Pwodwi", b && b.product ? escapeHtml(b.product) : "\u2014", "var(--muted)") }${ line("Depo", c.depo ? escapeHtml(c.depo) : "\u2014", COLORS.full) }${ c.division ? line("Divizyon", escapeHtml(c.division), "var(--muted)") : "" }${ kind !== "todo" ? line("Debarkman", formatDateShort(c.dateDebarq), COLORS.pran) : line("Antre", formatDateShort(c.dateEntered), "var(--muted)") }</div>${ kind === "todo" ? `<div class="mini">Jou Full<strong style="color:${ urgent ? COLORS.urgent : COLORS.rust }">${ days } jou</strong></div>` : "" }${ urgent && kind === "todo" ? `<span class="chip" style="color:#fff;background:${ COLORS.urgent }">\u26A0 Ijan</span>` : "" }<div style="margin-left:auto;display:flex;gap:6px;align-items:center">${ btn }</div></div>`;
  }
  function section(title, eyebrow, list, kind, first) {
    if (list.length === 0) {
      return "";
    }
    return `<div class="section-head" style="${ first ? "" : "margin-top:24px" }"><div><div class="eyebrow">${ list.length } ${ eyebrow }</div><h2 class="h2">${ title }</h2></div></div><div style="display:flex;flex-direction:column;gap:8px">${ list.map(function (c) {
      return card(c, kind);
    }).join("") }</div>`;
  }

  var body = section("Debarkman m ap fè", "kontenè", mineList, "mine", true)
    + section("Kontenè pou debake", "kontenè full", todo, "todo", mineList.length === 0)
    + section("Lòt pointeur ap debake", "kontenè", othersList, "other", false);
  if (!body) {
    body = `<div class="empty">${ icon("circle", 22) }<div>${ q ? "Pa gen kontenè ki koresponn." : "Pa gen kontenè Full pou debake kounye a." }</div></div>`;
  }

  var kpis = [
    { label: "Pou debake", value: full.filter(function (c) { return !c.dateDebarq; }).length, color: COLORS.full, sub: "Full, poko debake" },
    { label: "Ap debake", value: full.filter(function (c) { return c.dateDebarq; }).length, color: COLORS.pran, sub: "Debarkman an kou" },
    { label: "Mwen", value: full.filter(function (c) { return c.dateDebarq && c.debarqBy === mine; }).length, color: COLORS.kite, sub: "Se mwen k ap debake yo" }
  ].map(function (r) {
    return `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${ r.label }</span><div class="kpi-icon" style="background:${ r.color }1A;color:${ r.color }">${ icon("boxes", 14, r.color) }</div></div><div class="kpi-value">${ r.value }</div><div class="kpi-sub">${ r.sub }</div></div>`;
  }).join("");

  var search = `<input class="input" id="f-pointeur-search" placeholder="Chèche kontenè, bill, pwodwi..." value="${ escapeHtml(state.pointeurSearch || "") }" autocomplete="off" style="margin-bottom:16px" />`;

  var drawerOpen = !!state.navDrawerOpen;
  var drawer = `<div class="nav-drawer-overlay${ drawerOpen ? " open" : "" }" data-action="close-nav-drawer"></div><nav class="nav-drawer${ drawerOpen ? " open" : "" }"><div class="nav-drawer-head"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1;min-width:0"><div class="drawer-brand">DEKA LOG<span class="depot-badge">Pointeur</span></div><div class="drawer-user">${ escapeHtml(state.sessionName || state.username || "") }</div></div><button class="drawer-close" data-action="close-nav-drawer" aria-label="Fèmen">${ icon("x", 16, "#fff") }</button></div><div class="nav-drawer-nav"></div><div class="nav-drawer-foot">${ state.lastSyncTime ? `<div class="drawer-sync">Dènye sinkwonizasyon · ${ formatTime(state.lastSyncTime) }</div>` : "" }<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">${ helpButton("#C9D6DE") + accountButton("#C9D6DE") }</div><button class="drawer-logout" data-action="logout">${ icon("logout", 15) } Dekonekte</button></div></nav>`;

  return `<div style="min-height:100vh;background:var(--bg)">${ drawer }<header class="depot-header"><button class="hamburger-btn" data-action="toggle-nav-drawer" aria-label="Meni">${ icon("menu", 18, "#fff") }</button><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1;min-width:180px"><div style="color:#fff;font-weight:800;font-size:16px">DEKA LOG<span class="depot-badge">Pointeur</span></div><div class="depot-desktop-actions" style="color:rgba(255,255,255,.8);font-size:11.5px;margin-top:2px">${ escapeHtml(state.sessionName || state.username || "") } · ${ formatLongDate() }</div></div><div class="depot-desktop-actions" style="display:flex;align-items:center;gap:14px">${ state.lastSyncTime ? `<div style="color:rgba(255,255,255,.75);font-size:10.5px;text-align:right">Dènye sinkwonizasyon<br/>${ formatTime(state.lastSyncTime) }</div>` : "" }${ helpButton("#fff") + accountButton("#fff") }<button class="linklike" data-action="logout" style="color:#fff">${ icon("undo", 12) } Dekonekte</button></div></header><main class="content" style="max-width:860px;margin:0 auto"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:22px">${ kpis }</div>${ search }${ body }</main><div style="text-align:center;font-size:10px;color:var(--muted-light);padding:20px">© ${ new Date().getFullYear() } Deka Group · v1.0</div></div>`;
}
