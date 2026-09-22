// Admin 'Itilizatè' tab: personal accounts management.
import {
  apiGet,
  apiJson,
  showToast
} from "../api.js";
import { COLORS } from "../constants.js";
import { icon } from "../icons.js";
import { render } from "../render.js";
import { state } from "../state.js";
import {
  escapeHtml,
  formatDateTimeShort,
  roleLabel
} from "../utils.js";

export function loadUsers() {
  var U = state.usr = state.usr || {
    loaded: false,
    busy: false,
    err: "",
    users: [],
    legacy: [],
    legacyDisabled: false,
    twoFactorAvailable: true,
    me: "",
    temp: null,
    form: {
      username: "",
      name: "",
      role: "depot",
      err: ""
    }
  };
  if (U.busy) {
    return;
  }
  U.busy = true;
  U.err = "";
  render();
  apiGet("/api/users").then(function (d) {
    Object.assign(U, d, {
      loaded: true,
      busy: false
    });
    render();
  }).catch(function (e) {
    U.busy = false;
    U.err = e.message;
    render();
  });
}

export function usersView() {
  var U = state.usr || {
    loaded: false,
    users: [],
    legacy: [],
    form: {}
  };
  var f = U.form || {};
  var head = `<div class="section-head"><div><div class="eyebrow">${ U.loaded ? `${ U.users.length } kont pèsonèl` : "Itilizatè" }</div><h2 class="h2">Itilizatè</h2></div><div class="toolbar"><button class="btn ghost" data-action="usr-refresh" style="background:transparent;color:var(--ink);border:1px solid var(--border)"${ U.busy ? " disabled" : "" }>${ icon("undo", 14) } ${ U.busy ? "K ap chaje..." : "Rafrechi" }</button></div></div>`;
  if (!U.loaded) {
    return head + (U.err ? `<div class="alert">${ icon("alert", 14) }${ escapeHtml(U.err) }</div>` : `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`);
  }
  var legacy = U.legacy && U.legacy.length && !U.legacyDisabled ? `<div class="alert" style="margin-bottom:16px">${ icon("alert", 14) }<div><strong>Kont pataje toujou aktif:</strong> ${ U.legacy.map(function (l) {
    return escapeHtml(l.username);
  }).join(", ") }. Nenpòt moun ki konn modpass yo ka antre ladan yo, epi jounal la pa ka di ki moun ki fè kisa. Kreye yon kont pèsonèl pou chak moun anba a, epi lè tout moun fin chanje modpass yo, dezaktive kont pataje yo (Vercel: <code>AUTH_LEGACY_DISABLED=1</code> epi Redeploy).</div></div>` : "";
  var warn2 = U.twoFactorAvailable ? "" : `<div class="alert" style="margin-bottom:16px">${ icon("alert", 14) }APP_SECRET manke sou sèvè a: ou pa ka kreye administratè pèsonèl (2FA obligatwa). Gade SEKIRITE.md.</div>`;
  var temp = U.temp ? `<div class="row" style="border-left:4px solid ${ COLORS.green };margin-bottom:16px"><div class="row-min"><div class="row-sub"><strong style="color:var(--navy)">Modpass tanporè pou ${ escapeHtml(U.temp.username) }</strong></div><div style="font-family:var(--font-mono);font-size:20px;margin:6px 0;user-select:all">${ escapeHtml(U.temp.pw) }</div><div class="row-sub light">Montre yon sèl fwa. Bay moun nan li; li dwe chanje l nan premye koneksyon an.</div></div><div style="display:flex;flex-direction:column;gap:6px"><button class="btn navy" data-action="usr-copy-temp">Kopye</button><button class="linklike" data-action="usr-dismiss-temp">Fèmen</button></div></div>` : "";
  var form = `<form id="usr-create-form" class="row" style="flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:20px"><div style="flex:1;min-width:150px"><span class="field-label">Non itilizatè</span><input class="input" id="usr-username" autocapitalize="none" spellcheck="false" placeholder="jean.paul" value="${ escapeHtml(f.username || "") }" /></div><div style="flex:1;min-width:150px"><span class="field-label">Non konplè</span><input class="input" id="usr-name" placeholder="Jean Paul" value="${ escapeHtml(f.name || "") }" /></div><div style="min-width:130px"><span class="field-label">Wòl</span><select class="input" id="usr-role">${ [
    "depot",
    "chofe",
    "daily",
    "admin"
  ].map(function (r) {
    return `<option value="${ r }"${ f.role === r ? " selected" : "" }>${ escapeHtml(roleLabel(r)) }</option>`;
  }).join("") }</select></div><button type="submit" class="btn navy">${ icon("plus", 14, "#fff") } Kreye kont</button>${ f.err ? `<div class="gate-err" style="width:100%">${ escapeHtml(f.err) }</div>` : "" }</form>`;
  var rows = U.users.length === 0 ? `<div class="empty">${ icon("circle", 22) }<div>Poko gen kont pèsonèl. Kreye premye a anlè a.</div></div>` : U.users.map(function (u) {
    var self = u.username === U.me;
    var chip = function (x, col) {
      return `<span style="display:inline-block;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;background:${ col };color:#fff;margin-right:4px">${ x }</span>`;
    };
    return `<div class="row" style="border-left:4px solid ${ u.active ? COLORS.green : COLORS.urgent }${ u.active ? "" : ";opacity:.65" };flex-wrap:wrap;gap:8px"><div class="row-min" style="min-width:200px"><div class="row-sub"><strong style="color:var(--navy)">${ escapeHtml(u.name) }</strong> <span style="color:var(--muted)">${ escapeHtml(u.username) }${ self ? " (ou)" : "" }</span></div><div class="row-sub light">${ u.active ? chip("aktif", COLORS.green) : chip("dezaktive", COLORS.urgent) }${ u.mustChange ? chip("modpass tanporè", "#B7791F") : "" }${ u.totpEnabled ? chip("2FA \u2713", COLORS.green) : u.role === "admin" ? chip("2FA manke", "#B7791F") : "" }${ u.lastLoginAt ? `Dènye koneksyon: ${ escapeHtml(formatDateTimeShort(u.lastLoginAt)) }` : "Pa janm konekte" }</div></div><select class="input usr-role-select" data-user="${ escapeHtml(u.username) }" style="width:auto;padding:6px 8px;font-size:12.5px"${ self ? " disabled" : "" }>${ [
      "depot",
      "chofe",
      "daily",
      "admin"
    ].map(function (r) {
      return `<option value="${ r }"${ u.role === r ? " selected" : "" }>${ escapeHtml(roleLabel(r)) }</option>`;
    }).join("") }</select>${ self ? "" : `<button class="btn ghost" data-action="usr-reset-pw" data-user="${ escapeHtml(u.username) }" style="background:transparent;color:var(--ink);border:1px solid var(--border);font-size:12px">Reyinisyalize modpass</button><button class="btn ghost" data-action="usr-toggle" data-user="${ escapeHtml(u.username) }" data-active="${ u.active ? "0" : "1" }" style="background:transparent;color:${ u.active ? COLORS.urgent : COLORS.green };border:1px solid var(--border);font-size:12px">${ u.active ? "Dezaktive" : "Aktive" }</button>` }${ u.totpEnabled ? `<button class="btn ghost" data-action="usr-reset-2fa" data-user="${ escapeHtml(u.username) }" style="background:transparent;color:var(--ink);border:1px solid var(--border);font-size:12px">Reyinisyalize 2FA</button>` : "" }</div>`;
  }).join("");
  return `${ head + legacy + warn2 + temp + form }<div style="display:flex;flex-direction:column;gap:8px">${ rows }</div>`;
}

export function userAction(body, ok) {
  return apiJson("/api/users", body).then(function (d) {
    if (ok) {
      ok(d);
    }
    loadUsers();
  }).catch(function (e) {
    showToast("Erè: " + e.message);
    loadUsers();
  });
}
