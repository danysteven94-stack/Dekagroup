// 'Kont mwen' screen: change password and manage 2-step verification (also the forced flows).
import {
  apiGet,
  loadData
} from "../api.js";
import {
  COLORS,
  LOGO_URL
} from "../constants.js";
import { render } from "../render.js";
import { state } from "../state.js";
import {
  escapeHtml,
  roleLabel
} from "../utils.js";

export function accountButton(color) {
  return `<button class="linklike" data-action="open-account" style="color:${ color }">Kont mwen</button> `;
}

function newTwoFactorState() {
  return {
    loaded: false,
    busy: false,
    enabled: false,
    pending: false,
    required: false,
    available: true,
    recoveryLeft: 0,
    secret: "",
    otpauth: "",
    recovery: null,
    msg: "",
    err: ""
  };
}

export function loadTwoFactor() {
  if (!state.personal) {
    state.tf = newTwoFactorState();
    state.tf.loaded = true;
    render();
    return;
  }
  state.tf = state.tf || newTwoFactorState();
  apiGet("/api/auth/2fa").then(function (d) {
    var k = state.tf;
    var ks = {
      secret: k.secret,
      otpauth: k.otpauth,
      recovery: k.recovery
    };
    state.tf = Object.assign(newTwoFactorState(), d, ks, { loaded: true });
    render();
  }).catch(function (e) {
    state.tf = state.tf || newTwoFactorState();
    state.tf.loaded = true;
    state.tf.err = e.message;
    render();
  });
}

export function finishAccountScreen() {
  state.acct = false;
  state.tf = null;
  state.pwf = null;
  if (state.lastSyncTime) {
    render();
  } else {
    state.loadingData = true;
    render();
    loadData();
  }
}

export function accountView() {
  var f = state.pwf || {};
  var tf = state.tf || newTwoFactorState();
  var forced = state.needs;
  var pw = state.personal;
  var card = `<div class="gate-wrap" style="align-items:flex-start;padding:24px 14px"><div class="gate-card" style="max-width:480px;width:100%">`;
  var hd = `<div class="gate-brand"><div class="gate-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div class="gate-title">Kont mwen</div></div><div style="text-align:center;font-size:13px;color:var(--muted);margin:-6px 0 16px">${ escapeHtml(state.name || state.username) } · ${ escapeHtml(roleLabel(state.authRole)) }${ state.name ? " \xB7 " + escapeHtml(state.username) : "" }</div>`;
  var banner = forced === "password" ? `<div class="alert" style="margin-bottom:14px">Ou dwe chanje modpass tanporè a anvan w kontinye.</div>` : forced === "2fa" ? `<div class="alert" style="margin-bottom:14px">Administratè yo dwe aktive otantifikasyon 2 etap (2FA) anvan yo kontinye.</div>` : "";
  var sh = function (l) {
    return `<h3 style="margin:18px 0 8px;font-size:14px;color:var(--navy)">${ l }</h3>`;
  };
  var note = function (x, c) {
    return `<div style="font-size:12.5px;color:${ c || "var(--muted)" };margin:6px 0 10px">${ x }</div>`;
  };
  var msg = function (o) {
    return o.err ? `<div class="gate-err">${ escapeHtml(o.err) }</div>` : o.msg ? `<div style="font-size:12.5px;color:${ COLORS.green };margin:8px 0">${ escapeHtml(o.msg) }</div>` : "";
  };
  var h = card + hd + banner;
  if (!pw) {
    return `${ h + note("Ou konekte ak yon kont pataje. Kont sa yo pa gen modpass pèsonèl ni 2FA. Mande administratè a kreye yon kont pèsonèl pou ou.") }<button type="button" class="btn navy" data-action="close-account" style="width:100%;justify-content:center;margin-top:10px">← Retounen</button></div></div>`;
  }
  if (forced !== "2fa") {
    h += `${ sh("Chanje modpass") }<form id="pw-form"><span class="field-label">Modpass aktyèl${ forced === "password" ? " (modpass tanporè a)" : "" }</span><input class="input" type="password" id="pw-cur" autocomplete="current-password" style="margin-bottom:10px" /><span class="field-label">Nouvo modpass</span><input class="input" type="password" id="pw-new" autocomplete="new-password" style="margin-bottom:10px" /><span class="field-label">Konfime nouvo modpass</span><input class="input" type="password" id="pw-new2" autocomplete="new-password" />${ note("Omwen 10 karaktè. Evite mo ki twò komen oswa non itilizatè a. Chanje l dekonekte lòt aparèy ou yo.") }${ msg(f) }<button type="submit" class="gate-btn"${ f.busy ? " disabled" : "" }>${ f.busy ? "K ap sove..." : "Chanje modpass" }</button></form>`;
  }
  if (forced !== "password") {
    h += sh("Otantifikasyon 2 etap (2FA)");
    if (!tf.loaded) {
      h += note("K ap chaje...");
    } else if (tf.recovery) {
      h += `<div class="alert" style="background:#E4F3EC;color:#1D7A5A;border-color:#1D7A5A">2FA aktive.</div>${ note("<strong>Sove kòd sekou sa yo kounye a</strong> (yon kote ki sekirize). Chak kòd sèvi yon sèl fwa si w pèdi telefòn ou. Yo pa pral parèt ankò.", "var(--ink)") }<div style="font-family:var(--font-mono);font-size:15px;line-height:1.9;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">${ tf.recovery.map(escapeHtml).join("<br/>") }</div><button type="button" class="gate-btn" data-action="tf-done" style="margin-top:12px">Mwen sove yo, kontinye</button>`;
    } else if (tf.enabled) {
      h += `<div style="font-size:13px;margin-bottom:6px"><strong style="color:${ COLORS.green }">✓ 2FA aktive.</strong> Kòd sekou ki rete: ${ tf.recoveryLeft }</div>`;
      if (tf.required) {
        h += note("Kòm administratè, ou pa ka dezaktive 2FA. Yon lòt administratè ka reyinisyalize l si w pèdi telefòn ou.");
      } else {
        h += `<form id="tf-disable-form"><span class="field-label">Modpass ou</span><input class="input" type="password" id="tf-pw" autocomplete="current-password" style="margin-bottom:10px" /><span class="field-label">Kòd 2FA</span><input class="input" id="tf-code2" inputmode="numeric" autocomplete="one-time-code" maxlength="8" />${ msg(tf) }<button type="submit" class="gate-btn" style="background:var(--rust)">Dezaktive 2FA</button></form>`;
      }
    } else if (tf.secret) {
      h += `${ note(`1. Louvri yon aplikasyon otantifikasyon (Google Authenticator, Microsoft Authenticator, Authy, 1Password...).<br/>2. Ajoute yon nouvo kont epi chwazi <strong>"Antre yon kle"</strong> (enter setup key). Non: DEKA LOG.<br/>3. Antre kle sa a:`, "var(--ink)") }<div style="font-family:var(--font-mono);font-size:16px;letter-spacing:1px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;word-break:break-all;user-select:all">${ escapeHtml(tf.secret.replace(/(.{4})/g, "$1 ").trim()) }</div>${ note(`Sou telefòn nan, ou ka tou <a href="${ escapeHtml(tf.otpauth) }">tape isit la pou louvri aplikasyon an dirèkteman</a>.`) }<form id="tf-confirm-form"><span class="field-label">4. Kòd 6 chif aplikasyon an montre</span><input class="input" id="tf-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" autofocus />${ msg(tf) }<button type="submit" class="gate-btn"${ tf.busy ? " disabled" : "" }>Konfime ak aktive 2FA</button></form>`;
    } else {
      h += `${ note(tf.available ? "2FA ajoute yon kòd ki chanje chak 30 segonn (sou telefòn ou) anplis modpass ou. Li fè kont ou pi difisil pou vòlè." : "2FA pa disponib: APP_SECRET manke sou sèvè a.") + msg(tf) }<button type="button" class="gate-btn" data-action="tf-begin"${ tf.available && !tf.busy ? "" : " disabled" }>Aktive 2FA</button>`;
    }
  }
  h += `<div style="display:flex;justify-content:space-between;gap:10px;margin-top:18px">${ forced ? "<span></span>" : `<button type="button" class="linklike" data-action="close-account">← Retounen</button>` }<button type="button" class="linklike" data-action="logout">Dekonekte</button></div></div></div>`;
  return h;
}
