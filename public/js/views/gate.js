// Login screen, 2-step verification screen, loading and error screens.
import { LOGO_URL } from "../constants.js";
import { langButton } from "../i18n.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import { escapeHtml } from "../utils.js";

export function loginView() {
  return `<div class="gate-wrap"><form class="gate-card" id="gate-form"><div class="gate-brand"><div class="gate-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div class="gate-title">DEKA LOG</div></div>${ state.sessionRole ? `<button type="button" class="btn navy" data-action="resume-session" style="width:100%;justify-content:center;padding:12px;margin-bottom:10px">Kontinye kòm ${ escapeHtml(state.sessionUser) } · ${ escapeHtml({
    admin: "Administratè Lojistik",
    depot: "Depo",
    daily: "Daily Report",
    chofe: "Chofè"
  }[state.sessionRole] || state.sessionRole) }</button><div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:14px">oswa konekte ak yon lòt kont:</div>` : `<div style="text-align:center;font-size:13px;color:var(--muted);margin:-6px 0 16px">Konekte pou kontinye</div>` }<span class="field-label">Non Itilizatè</span><input class="input" id="gate-user" autocomplete="username" autocapitalize="none" spellcheck="false" value="${ escapeHtml(state.gateUser) }" style="margin-bottom:12px" /><span class="field-label">Modpass</span><input class="input gate-input" type="password" id="gate-pw" autocomplete="current-password" />${ state.gateError ? `<div class="gate-err">${ escapeHtml(state.gateMsg || "Non itilizatè oswa modpass pa bon. Eseye ankò.") }</div>` : "" }<button type="submit" class="gate-btn" data-fr="${ state.gateBusy ? "Connexion…" : "Se connecter" }"${ state.gateBusy ? " disabled" : "" }>${ state.gateBusy ? "K ap konekte..." : "Antre" }</button><div style="text-align:center;margin-top:14px">${ langButton("var(--muted)") }</div></form></div>`;
}

export function loadingView() {
  return `<div class="gate-wrap"><div style="color:#fff;font-weight:700;display:flex;align-items:center;gap:10px">${ icon("ship", 20, "#fff") }K ap chaje done yo...</div></div>`;
}

export function loadErrorView() {
  var e = state.loadErrorDetail ? `<div style="font-family:var(--font-mono);font-size:11px;color:var(--rust-deep);background:#FFF3E8;border:1px solid rgba(217,83,30,.3);border-radius:6px;padding:8px 10px;margin-bottom:16px;text-align:left;word-break:break-word">${ escapeHtml(state.loadErrorDetail) }</div>` : "";
  return `<div class="gate-wrap"><div class="gate-card" style="text-align:center"><div class="gate-brand" style="justify-content:center">${ icon("alert", 22, "#D9531E") }</div><div style="font-weight:700;color:var(--rust-deep);margin-bottom:10px">Pa ka konekte ak baz done a</div><div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">Verifye koneksyon entènèt ou, epi eseye ankò. Si sa kontinye, kopye mesaj teknik anba a voye bay sipò a.</div>${ e }<button class="gate-btn" data-action="retry-load">Eseye Ankò</button></div></div>`;
}

export function twoFactorLoginView() {
  var emailBtn = state.gateCanEmail ? `<button type="button" class="linklike" data-action="gate-send-email-code" style="width:100%;justify-content:center;margin-top:10px"${ state.gateEmailBusy ? " disabled" : "" }>${ state.gateEmailBusy ? "K ap voye..." : "Voye kòd la sou imèl mwen" }</button>` : "";
  var emailMsg = state.gateEmailMsg ? `<div style="font-size:12.5px;color:var(--muted);margin-top:8px;text-align:center">${ escapeHtml(state.gateEmailMsg) }</div>` : "";
  return `<div class="gate-wrap"><form class="gate-card" id="gate-form"><div class="gate-brand"><div class="gate-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div class="gate-title">DEKA LOG</div></div><div style="text-align:center;font-size:13px;color:var(--muted);margin:-6px 0 16px">Otantifikasyon 2 etap pou <strong>${ escapeHtml(state.gateUser) }</strong></div><span class="field-label">Kòd 6 chif (oswa yon kòd sekou)</span><input class="input gate-input" id="gate-code" inputmode="numeric" autocomplete="one-time-code" autocapitalize="characters" autofocus />${ state.gateError ? `<div class="gate-err">${ escapeHtml(state.gateMsg || "Kòd la pa bon.") }</div>` : "" }<button type="submit" class="gate-btn" data-fr="${ state.gateBusy ? "Vérification…" : "Valider" }"${ state.gateBusy ? " disabled" : "" }>${ state.gateBusy ? "K ap verifye..." : "Antre" }</button>${ emailBtn }${ emailMsg }<button type="button" class="linklike" data-action="gate-back" style="width:100%;justify-content:center;margin-top:14px">← Chanje kont</button></form></div>`;
}
