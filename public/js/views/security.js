// Admin 'Sekirite' tab: storage status, backups, activity log.
import {
  apiFetch,
  apiJson,
  showToast
} from "../api.js";
import {
  AUDIT_LABELS,
  AUDIT_WARNINGS,
  COLORS
} from "../constants.js";
import { icon } from "../icons.js";
import { render } from "../render.js";
import { state } from "../state.js";
import {
  escapeHtml,
  formatDateTimeShort
} from "../utils.js";

export function loadSecurityTab() {
  var S = state.sec = state.sec || {
    loaded: false,
    busy: false,
    err: "",
    events: [],
    backups: [],
    filter: "tout"
  };
  if (S.busy) {
    return;
  }
  S.busy = true;
  S.err = "";
  render();
  var g = function (u) {
    return apiFetch(u).then(function (r) {
      if (!r.ok) {
        throw new Error("HTTP " + r.status);
      }
      return r.json();
    });
  };
  Promise.all([
    g("/api/audit"),
    g("/api/backup"),
    g("/api/health").catch(function () {
      return null;
    }),
    g("/api/email").catch(function () {
      return null;
    })
  ]).then(function (x) {
    S.health = x[2];
    S.events = x[0].events || [];
    S.backups = x[1].backups || [];
    S.email = x[3] || { available: false, recipients: [] };
    S.emailForm = S.emailForm || { email: "", err: "" };
    S.loaded = true;
    S.busy = false;
    render();
  }).catch(function (e) {
    S.busy = false;
    S.err = e && e.message ? e.message : String(e);
    render();
  });
}

export function emailAction(body, onOk) {
  return apiJson("/api/email", body).then(function (d) {
    var S = state.sec;
    if (S) {
      S.email = { available: S.email ? S.email.available : true, recipients: d.recipients || (S.email && S.email.recipients) || [] };
    }
    if (onOk) {
      onOk(d);
    }
    render();
  }).catch(function (e) {
    var S = state.sec;
    if (S && S.emailForm) {
      S.emailForm.err = e.message;
    } else {
      showToast("Erè: " + e.message);
    }
    render();
  });
}

function storageHealthCard(S) {
  var h = S.health;
  if (!h) {
    return "";
  }
  return `<div class="row" style="margin-bottom:22px;border-left:4px solid ${ h.ok ? COLORS.green : COLORS.urgent }"><div class="row-min"><div class="row-sub"><strong style="color:var(--navy)">Baz done: ${ h.backend === "postgres" ? "PostgreSQL" : "Redis (ansyen)" } · ${ h.ok ? "ap mache" : "pa reponn" }</strong></div><div class="row-sub light">${ h.ok ? `${ h.containers } kontenè · ${ h.bills } bill · ${ h.notifications } notifikasyon${ typeof h.rev === "number" ? " \xB7 revizyon " + h.rev : "" }` : escapeHtml(h.error || "") }${ h.backend !== "postgres" ? " \xB7 Konekte yon baz PostgreSQL pou plis sekirite (gade SEKIRITE.md)." : "" }</div></div></div>`;
}

function auditDetailText(detail) {
  if (!detail || typeof detail !== "object") {
    return "";
  }
  var o = [];
  Object.keys(detail).forEach(function (k) {
    if (k === "username" || detail[k] === null || detail[k] === undefined || detail[k] === "") {
      return;
    }
    o.push(`${ k }: ${ detail[k] }`);
  });
  return o.join(" \xB7 ").slice(0, 140);
}

function emailSection(S) {
  var e = S.email && Array.isArray(S.email.recipients) ? S.email : { available: false, recipients: [] };
  var f = S.emailForm || { email: "", err: "" };
  var warn = e.available ? "" : `<div class="alert" style="margin-bottom:14px">${ icon("alert", 14) }RESEND_API_KEY pa konfigire sou sèvè a: imèl yo p ap voye toutotan sa poko fèt. Gade SEKIRITE.md.</div>`;
  var rows = e.recipients.length === 0 ? `<div class="empty" style="padding:16px">${ icon("circle", 18) }<div>Poko gen adrès imèl.</div></div>` : e.recipients.map(function (r) {
    return `<div class="row"><div class="row-min"><div class="row-sub"><strong style="color:var(--navy)">${ escapeHtml(r.email) }</strong></div></div><button class="btn ghost" data-action="sec-email-remove" data-email="${ escapeHtml(r.email) }" style="background:transparent;color:${ COLORS.urgent };border:1px solid var(--border);font-size:12px">Retire</button></div>`;
  }).join("");
  return `<h3 style="margin:26px 0 10px;font-size:15px;color:var(--navy)">Notifikasyon Imèl</h3><p style="font-size:12.5px;color:var(--muted);margin:0 0 12px">Chak fwa gen yon nouvo notifikasyon (yon bill fini, yon kontenè kite...), yon imèl rezime voye bay adrès sa yo.</p>${ warn }<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">${ rows }</div><form id="sec-email-add-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px"><div style="flex:1;min-width:200px"><input class="input" id="sec-email-input" type="email" placeholder="egzanp@imèl.com" value="${ escapeHtml(f.email || "") }" /></div><button type="submit" class="btn">${ icon("plus", 14, "#fff") } Ajoute</button>${ e.available ? `<button type="button" class="btn ghost" data-action="sec-email-test" style="background:transparent;color:var(--ink);border:1px solid var(--border)">Voye yon tès</button>` : "" }</form>${ f.err ? `<div class="gate-err">${ escapeHtml(f.err) }</div>` : "" }`;
}

export function securityView() {
  var S = state.sec || {
    loaded: false,
    busy: false,
    err: "",
    events: [],
    backups: [],
    filter: "tout"
  };
  var day = Date.now() - 86400000;
  var alerts = S.events.filter(function (e) {
    return AUDIT_WARNINGS[e.ev] && new Date(e.t).getTime() > day;
  }).length;
  var list = S.events.filter(function (e) {
    return S.filter !== "alet" || AUDIT_WARNINGS[e.ev];
  });
  var head = `<div class="section-head"><div><div class="eyebrow">${ S.loaded ? `${ alerts } alèt nan dènye 24 è` : "Sekirite" }</div><h2 class="h2">Sekirite ak Aktivite</h2></div><div class="toolbar"><button class="btn ghost" data-action="sec-refresh" style="background:transparent;color:var(--ink);border:1px solid var(--border)"${ S.busy ? " disabled" : "" }>${ icon("undo", 14) } ${ S.busy ? "K ap chaje..." : "Rafrechi" }</button></div></div>`;
  if (!S.loaded) {
    return head + (S.err ? `<div class="alert">${ icon("alert", 14) }Pa t kapab chaje done sekirite yo (${ escapeHtml(S.err) }).</div>` : `<div class="empty">${ icon("circle", 22) }<div>K ap chaje...</div></div>`);
  }
  var bk = S.backups.length === 0 ? `<div class="empty">${ icon("circle", 22) }<div>Poko gen kopi. Premye a kreye lè yon admin sove done yo, epi yon nouvo chak 30 minit apre sa.</div></div>` : S.backups.map(function (k) {
    return `<div class="row"><div class="row-min"><div class="row-sub"><strong style="color:var(--navy)">${ k.broken ? "Kopi domaje" : formatDateTimeShort(k.ts) }</strong></div>${ k.broken ? "" : `<div class="row-sub light">${ k.containers } kontenè · ${ k.bills } bill</div>` }</div>${ k.broken ? "" : `<a class="btn" href="/api/backup?i=${ k.i }" download style="text-decoration:none">${ icon("download", 14, "#fff") } Telechaje</a>` }</div>`;
  }).join("");
  var ev = list.length === 0 ? `<div class="empty">${ icon("circle", 22) }<div>Pa gen aktivite pou montre.</div></div>` : list.map(function (e) {
    var w = AUDIT_WARNINGS[e.ev];
    var col = w ? COLORS.urgent : COLORS.green;
    return `<div class="row" style="border-left:4px solid ${ col }"><div class="row-min"><div class="row-sub"><strong style="color:${ w ? COLORS.urgent : "var(--navy)" }">${ escapeHtml(AUDIT_LABELS[e.ev] || e.ev) }</strong> <span style="color:var(--muted)">${ escapeHtml(formatDateTimeShort(e.t)) }</span></div><div class="row-sub light">${ escapeHtml((e.n ? e.n + " \xB7 " : "") + (e.u || e.d && e.d.username || "\u2014") + (e.role ? ` (${ e.role })` : "")) } · IP ${ escapeHtml(e.ip || "\u2014") }</div>${ auditDetailText(e.d) ? `<div class="row-sub light">${ escapeHtml(auditDetailText(e.d)) }</div>` : "" }</div></div>`;
  }).join("");
  var fl = function (id, l) {
    return `<button class="btn ghost" data-action="sec-filter" data-filter="${ id }" style="${ S.filter === id ? "" : "background:transparent;color:var(--ink);border:1px solid var(--border)" }">${ l }</button>`;
  };
  return `${ head + storageHealthCard(S) + emailSection(S) }<h3 style="margin:6px 0 10px;font-size:15px;color:var(--navy)">Kopi otomatik done yo</h3><p style="font-size:12.5px;color:var(--muted);margin:0 0 12px">Sèvè a kenbe dyèn 12 kopi. Telechaje youn si w bezwen retounen nan yon vyè done.</p><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:26px">${ bk }</div><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px"><h3 style="margin:0;font-size:15px;color:var(--navy)">Jounal aktivite (${ list.length })</h3><div style="display:flex;gap:8px">${ fl("tout", "Tout") }${ fl("alet", "Alèt sèlman") }</div></div><div style="display:flex;flex-direction:column;gap:8px">${ ev }</div>`;
}
