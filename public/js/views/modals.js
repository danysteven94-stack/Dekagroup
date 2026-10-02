// Toasts and modal dialogs.
import { COLORS } from "../constants.js";
import { icon } from "../icons.js";
import { archiveModalView } from "./archive.js";
import { state } from "../state.js";
import {
  escapeHtml,
  statusOf,
  truckingOptionsHtml
} from "../utils.js";

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
  if (e.mode === "arch") {
    return archiveModalView(e);
  }
  if (e.mode === "rejected") {
    var rows = (e.items || []).map(function (x) {
      return `<div style="border:1px solid var(--line,#E2E8F0);border-radius:10px;padding:10px 12px;margin-bottom:8px;text-align:left"><div style="font-weight:700;font-size:13px">${ escapeHtml(x.label || x.kind) }</div><div style="font-size:12px;color:var(--rust-deep);margin-top:3px">${ escapeHtml(x.error || "") }</div><div style="margin-top:6px"><button class="linklike" data-action="rejected-dismiss" data-id="${ escapeHtml(x.id) }">Efase</button></div></div>`;
    }).join("");
    return `<div class="modal-overlay"><div class="modal-card"><div class="h3" style="margin-bottom:6px">Chanjman ki pa t pase</div><p style="font-size:12.5px;color:var(--muted);margin-bottom:14px">Sèvè a pa t aksepte chanjman sa yo lè yo te rive (egzanp yon lòt moun te chanje yo anvan). Refè yo si sa nesesè.</p><div style="max-height:50vh;overflow:auto">${ rows || "<div style=\"font-size:13px;color:var(--muted)\">Pa gen anyen.</div>" }</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn ghost" data-action="close-modal">Fèmen</button><button class="btn teal" data-action="rejected-clear">Efase tout</button></div></div></div>`;
  }
  if (e.mode === "container-info") {
    var ci = state.containers.find(function (x) { return x.id === e.id; });
    if (!ci) {
      return "";
    }
    var cb = state.bills.find(function (x) { return x.id === ci.billId; });
    var crow = function (label, value) {
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line,#E2E8F0);font-size:13.5px"><span style="color:var(--muted)">${ label }</span><strong style="text-align:right">${ value ? escapeHtml(value) : "\u2014" }</strong></div>`;
    };
    var cWho = ci.chofer || ci.plak ? crow(statusOf(ci) === "pran" ? "Pran pa chof\u00E8" : "Chof\u00E8", ci.chofer) + crow("Plak", ci.plak) : `<p style="font-size:12.5px;color:var(--muted);margin:10px 0 0">Pa gen chof\u00E8 ni plak anrejistre pou kontenè sa a.</p>`;
    return `<div class="modal-overlay"><div class="modal-card"><div class="h3" style="margin-bottom:12px">${ escapeHtml(ci.numewo) }</div>${ crow("Bill", cb && cb.numewo) }${ crow("Trucking", ci.trucking) }${ crow("Depo", ci.depo) }${ cWho }<div style="display:flex;justify-content:flex-end;margin-top:20px"><button class="btn ghost" data-action="close-modal">F\u00E8men</button></div></div></div>`;
  }
  if (e.mode === "correct") {
    return `<div class="modal-overlay"><div class="modal-card"><div class="h3" style="margin-bottom:16px">Korije Dat Antre</div><p style="font-size:12.5px;color:var(--muted);margin-top:-8px;margin-bottom:16px">Chanje dat antre a si te gen yon erè. Sa ap rekalkile jou Full otomatikman.</p><div><span class="field-label">Dat Antre</span><input class="input" type="date" id="modal-correct-date" value="${ escapeHtml(e.date) }" /></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:22px"><button class="btn ghost" data-action="close-modal">Anile</button><button class="btn teal" data-action="submit-modal">Konfime</button></div></div></div>`;
  }
  if (e.mode === "edit-container") {
    return `<div class="modal-overlay"><div class="modal-card"><div class="h3" style="margin-bottom:16px">Modifye Kontenè a</div><p style="font-size:12.5px;color:var(--muted);margin-top:-8px;margin-bottom:16px">Korije nenpòt enfòmasyon si te gen yon erè. Vide yon dat si ou te make l pa erè (egz. si ou te bliye mete kontenè a vid, mete dat vid la la a).</p><div style="display:flex;flex-direction:column;gap:12px"><div><span class="field-label">Nimewo Kontenè</span><input class="input" id="modal-edit-numewo" value="${ escapeHtml(e.numewo) }" placeholder="Egz. MSCU1234567" /></div><div><span class="field-label">Bill</span><input class="input" id="modal-edit-bill" value="${ escapeHtml(e.billNumewo) }" placeholder="Nimewo bill la" /></div><div><span class="field-label">Pwodwi</span><input class="input" id="modal-edit-product" value="${ escapeHtml(e.product) }" placeholder="Egz. Diri, Sikwit, Sik..." /></div><div><span class="field-label">Dat Antre</span><input class="input" type="date" id="modal-edit-date-entered" value="${ escapeHtml(e.dateEntered) }" /></div><div><span class="field-label">Dat Vid</span><input class="input" type="date" id="modal-edit-date-empty" value="${ escapeHtml(e.dateEmpty) }" /></div><div><span class="field-label">Dat Kite</span><input class="input" type="date" id="modal-edit-date-left" value="${ escapeHtml(e.dateLeft) }" /></div><div><span class="field-label">Depo</span><input class="input" id="modal-edit-depo" value="${ escapeHtml(e.depo) }" placeholder="Egz. Depo Kòdòn" /></div><div><span class="field-label">Trucking</span><select class="input" id="modal-edit-trucking">${ truckingOptionsHtml(e.trucking) }</select></div><div><span class="field-label">Plak</span><input class="input" id="modal-edit-plak" value="${ escapeHtml(e.plak) }" placeholder="Egz. AB-1234" /></div></div><p class="form-hint" style="margin-top:10px">Si w chanje nimewo bill la pou yon bill ki egziste deja, kontenè a ap mare ak bill sa a. Si l pa egziste, l ap kreye l.</p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:22px"><button class="btn ghost" data-action="close-modal">Anile</button><button class="btn teal" data-action="submit-modal">Konfime</button></div></div></div>`;
  }
  if (e.mode === "confirm-enter") {
    return `<div class="modal-overlay"><div class="modal-card"><div class="h3" style="margin-bottom:16px">Konfime Antre Kontenè a</div><p style="font-size:12.5px;color:var(--muted);margin-top:-8px;margin-bottom:16px">Konfime ke kontenè a antre jodi a, epi chwazi trucking ki pote l la si w konnen l.</p><div><span class="field-label">Trucking</span><select class="input" id="modal-trucking">${ truckingOptionsHtml(e.trucking) }</select></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:22px"><button class="btn ghost" data-action="close-modal">Anile</button><button class="btn teal" data-action="submit-modal">Konfime</button></div></div></div>`;
  }
  var n = e.mode === "verify" ? "Verifye Kontenè & Mete nan Depo" : "Transfere / Modifye Enfòmasyon";
  return `<div class="modal-overlay"><div class="modal-card"><div class="h3" style="margin-bottom:16px">${ n }</div><div style="display:flex;flex-direction:column;gap:12px"><div><span class="field-label">Depo</span><input class="input" id="modal-depo" value="${ escapeHtml(e.depo) }" placeholder="Egz. Depo Kòdòn" /></div><div><span class="field-label">Trucking</span><select class="input" id="modal-trucking">${ truckingOptionsHtml(e.trucking) }</select></div></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:22px"><button class="btn ghost" data-action="close-modal">Anile</button><button class="btn teal" data-action="submit-modal">Konfime</button></div></div></div>`;
}
