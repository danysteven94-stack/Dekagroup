// Toasts and modal dialogs.
import {
  COLORS,
  TRUCKING_OPTIONS
} from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import { escapeHtml } from "../utils.js";

export function toastsView() {
  var e = state.toasts.map(function (n) {
    return `<div class="toast">${ icon("check", 18, "#fff") }${ escapeHtml(n.message) }</div>`;
  }).join("");
  return `<div class="toasts">${ e }</div>`;
}

export function confirmModalView() {
  if (!state.confirmModal) {
    return "";
  }
  var e = state.confirmModal;
  return `<div class="modal-overlay"><div class="modal-card" style="text-align:center"><div style="width:44px;height:44px;border-radius:999px;background:${ COLORS.urgent }1A;display:flex;align-items:center;justify-content:center;margin:0 auto 14px">${ icon("alert", 20, COLORS.urgent) }</div><div class="h3" style="margin-bottom:10px">Konfime Aksyon</div><div style="font-size:13px;color:var(--muted);margin-bottom:22px">${ escapeHtml(e.message) }</div><div style="display:flex;gap:8px;justify-content:center"><button class="btn ghost" data-action="close-confirm">Anile</button><button class="btn danger" style="background:${ COLORS.urgent };color:#fff;border-color:${ COLORS.urgent }" data-action="execute-confirm">Wi, Efase</button></div></div></div>`;
}

export function modalView() {
  if (!state.modal) {
    return "";
  }
  var e = state.modal;
  if (e.mode === "correct") {
    return `<div class="modal-overlay"><div class="modal-card"><div class="h3" style="margin-bottom:16px">Korije Dat Antre</div><p style="font-size:12.5px;color:var(--muted);margin-top:-8px;margin-bottom:16px">Chanje dat antre a si te gen yon erè. Sa ap rekalkile jou Full otomatikman.</p><div><span class="field-label">Dat Antre</span><input class="input" type="date" id="modal-correct-date" value="${ escapeHtml(e.date) }" /></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:22px"><button class="btn ghost" data-action="close-modal">Anile</button><button class="btn teal" data-action="submit-modal">Konfime</button></div></div></div>`;
  }
  if (e.mode === "confirm-enter") {
    var tro = (e.trucking && TRUCKING_OPTIONS.indexOf(e.trucking) === -1 ? `<option value="${ escapeHtml(e.trucking) }" selected>${ escapeHtml(e.trucking) }</option>` : "") + TRUCKING_OPTIONS.map(function (o) {
      return `<option value="${ o }"${ e.trucking === o ? " selected" : "" }>${ o }</option>`;
    }).join("");
    return `<div class="modal-overlay"><div class="modal-card"><div class="h3" style="margin-bottom:16px">Konfime Antre Kontenè a</div><p style="font-size:12.5px;color:var(--muted);margin-top:-8px;margin-bottom:16px">Konfime ke kontenè a antre jodi a, epi chwazi trucking ki pote l la si w konnen l.</p><div><span class="field-label">Trucking</span><select class="input" id="modal-trucking"><option value=""${ e.trucking ? "" : " selected" }>— Chwazi —</option>${ tro }</select></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:22px"><button class="btn ghost" data-action="close-modal">Anile</button><button class="btn teal" data-action="submit-modal">Konfime</button></div></div></div>`;
  }
  var n = e.mode === "verify" ? "Verifye Kontenè & Mete nan Depo" : "Transfere / Modifye Enfòmasyon";
  var i = [""].concat(e.trucking && TRUCKING_OPTIONS.indexOf(e.trucking) === -1 ? [e.trucking] : []).concat(TRUCKING_OPTIONS).map(function (o) {
    return `<option value="${ o }"${ e.trucking === o ? " selected" : "" }>${ o === "" ? "\u2014 Chwazi \u2014" : o }</option>`;
  }).join("");
  return `<div class="modal-overlay"><div class="modal-card"><div class="h3" style="margin-bottom:16px">${ n }</div><div style="display:flex;flex-direction:column;gap:12px"><div><span class="field-label">Depo</span><input class="input" id="modal-depo" value="${ escapeHtml(e.depo) }" placeholder="Egz. Depo Kòdòn" /></div><div><span class="field-label">Trucking</span><select class="input" id="modal-trucking">${ i }</select></div></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:22px"><button class="btn ghost" data-action="close-modal">Anile</button><button class="btn teal" data-action="submit-modal">Konfime</button></div></div></div>`;
}
