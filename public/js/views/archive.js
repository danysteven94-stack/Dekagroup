// Archive tab (containers that already left) and the scan / entry dialog.
import { COLORS } from "../constants.js";
import {
  archiveRecords,
  rowIssues
} from "../archive.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  daysBetween,
  escapeHtml,
  formatDateShort
} from "../utils.js";

var MAX_SHOWN = 200;

function findBill(c) {
  return state.bills.find(function (b) {
    return b.id === c.billId;
  });
}

export function archiveView() {
  var q = state.search.trim().toLowerCase();
  var all = archiveRecords();
  var list = all.filter(function (c) {
    if (!q) {
      return true;
    }
    var b = findBill(c);
    return [c.numewo, b && b.numewo, b && b.product, c.plak, c.chofer].some(function (v) {
      return v && String(v).toLowerCase().indexOf(q) !== -1;
    });
  }).sort(function (a, b) {
    return (b.dateLeft || "") < (a.dateLeft || "") ? -1 : (b.dateLeft || "") > (a.dateLeft || "") ? 1 : a.numewo < b.numewo ? -1 : 1;
  });
  var head = `<div class="section-head"><div><div class="eyebrow">${ list.length } rezilta · ${ all.length } nan achiv</div><h2 class="h2">Achiv Kontenè Kite</h2></div><div class="toolbar"><div class="search-wrap"><span class="search-icon">${ icon("search", 14) }</span><input class="input" id="f-search" placeholder="Kontenè, bill, plak, chofè..." value="${ escapeHtml(state.search) }" /></div><button class="btn teal" data-action="arch-scan">${ icon("filetext", 15, "#fff") } Skane papye</button><button class="btn navy" data-action="arch-new">${ icon("plus", 15, "#fff") } Antre manyèlman</button><button class="btn ghost" data-action="arch-export-csv">${ icon("download", 15) } CSV</button></div></div>`;
  if (list.length === 0) {
    return `${ head }<div class="empty">${ icon("circle", 22) }<div>${ all.length ? "Pa gen anyen ki koresponn." : "Achiv la vid. Skane yon papye oswa antre yon kontenè ki deja kite." }</div></div>`;
  }
  var rows = list.slice(0, MAX_SHOWN).map(function (c) {
    var b = findBill(c);
    return `<tr><td><span class="plate" style="border-color:${ COLORS.kite }">${ escapeHtml(c.numewo) }</span></td><td>${ b ? escapeHtml(b.numewo) : "\u2014" }</td><td>${ b && b.product ? escapeHtml(b.product) : "\u2014" }</td><td>${ formatDateShort(c.dateEntered) }</td><td>${ formatDateShort(c.dateLeft) }</td><td>${ c.dateEntered && c.dateLeft ? daysBetween(c.dateEntered, c.dateLeft) + " jou" : "\u2014" }</td><td><strong>${ c.plak ? escapeHtml(c.plak) : "\u2014" }</strong></td><td>${ c.chofer ? escapeHtml(c.chofer) : "" }</td><td class="arch-actions"><button class="btn small ghost" data-action="arch-edit" data-id="${ c.id }">Modifye</button><button class="btn small danger" data-action="delete-container" data-id="${ c.id }">${ icon("trash", 12) }</button></td></tr>`;
  }).join("");
  var more = list.length > MAX_SHOWN ? `<div style="font-size:12px;color:var(--muted-light);margin-top:8px">Montre ${ MAX_SHOWN } sou ${ list.length }. Itilize rechèch la pou rafine.</div>` : "";
  return `${ head }<div class="arch-table-wrap"><table class="arch-table"><thead><tr><th data-fr="Conteneur">Kontenè</th><th>Bill</th><th>Pwodwi</th><th>Dat Antre</th><th>Dat Kite</th><th>Dire</th><th>Plak</th><th>Chofè</th><th></th></tr></thead><tbody>${ rows }</tbody></table></div>${ more }`;
}

// Chips shown on each record: red = blocks saving, amber = check it, green = ok.
export function issuesHtml(row, rows, editId) {
  var r = rowIssues(row, rows, editId);
  var out = r.errors.map(function (t) {
    return `<span class="arch-chip err">${ escapeHtml(t) }</span>`;
  }).concat(r.warns.map(function (t) {
    return `<span class="arch-chip warn">${ escapeHtml(t) }</span>`;
  }));
  return out.length ? out.join("") : `<span class="arch-chip ok">OK</span>`;
}

function blockingCount(m) {
  return m.rows.filter(function (r) {
    return rowIssues(r, m.rows, m.editId).errors.length > 0;
  }).length;
}

// Updates chips and the Save button in place, without re-rendering (a re-render would drop the focus while typing).
export function refreshArchiveIssues() {
  var m = state.modal;
  if (!m || m.mode !== "arch") {
    return;
  }
  m.rows.forEach(function (r) {
    var el = document.getElementById("arch-iss-" + r.k);
    if (el) {
      el.innerHTML = issuesHtml(r, m.rows, m.editId);
    }
  });
  var btn = document.getElementById("arch-save");
  if (btn) {
    btn.disabled = blockingCount(m) > 0 || !m.rows.length;
  }
}

function field(label, key, row, extra) {
  return `<div><span class="field-label">${ label }</span><input class="input arch-in" data-arch="${ key }" data-key="${ row.k }" value="${ escapeHtml(row[key]) }" ${ extra || "" } /></div>`;
}

function recordCard(row, idx, m) {
  var removable = !m.editId;
  return `<div class="arch-rec"><div class="arch-rec-head"><span class="arch-rec-n">#${ idx + 1 }</span><div class="arch-issues" id="arch-iss-${ row.k }">${ issuesHtml(row, m.rows, m.editId) }</div>${ removable ? `<button class="btn small danger" data-action="arch-row-remove" data-key="${ row.k }" title="Retire">${ icon("trash", 12) }</button>` : "" }</div><div class="arch-grid">${ field("Nimewo Kontenè", "numewo", row, 'placeholder="MSKU1234567" autocapitalize="characters" autocomplete="off" spellcheck="false" style="font-family:var(--font-mono)"') }${ field("Bill", "bill", row, 'autocomplete="off"') }${ field("Dat Antre", "dateEntered", row, 'type="date"') }${ field("Dat Kite", "dateLeft", row, 'type="date"') }${ field("Plak Kamyon", "plak", row, 'placeholder="Egz. AA 1234" autocapitalize="characters" autocomplete="off"') }${ field("Non Chofè (opsyonèl)", "chofer", row, 'autocomplete="off"') }${ field("Pwodwi (opsyonèl)", "product", row, 'autocomplete="off"') }<div><span class="field-label">Gwosè (opsyonèl)</span><select class="input arch-in" data-arch="size" data-key="${ row.k }"><option value=""${ row.size ? "" : " selected" }>\u2014</option><option value="20"${ row.size === "20" ? " selected" : "" }>20 Pye</option><option value="40"${ row.size === "40" ? " selected" : "" }>40 Pye</option></select></div></div></div>`;
}

function scanButtons(label) {
  return `<div class="arch-scan-btns"><label class="btn teal" for="arch-file-cam">${ icon("filetext", 15, "#fff") } ${ label || "Pran foto papye a" }</label><label class="btn ghost" for="arch-file-pick">${ icon("download", 15) } Chwazi foto / PDF</label><input type="file" id="arch-file-cam" class="arch-file hidden" accept="image/*" capture="environment" /><input type="file" id="arch-file-pick" class="arch-file hidden" accept="image/*,application/pdf" /></div>`;
}

export function archiveModalView(m) {
  var title = m.editId ? "Modifye Anrejistreman" : m.scans ? "Verifye sa m li a" : m.phase === "pick" ? "Skane yon Papye" : "Nouvo Anrejistreman";
  var body;
  if (m.phase === "reading") {
    body = `<div class="arch-reading">${ m.preview ? `<img src="${ m.preview }" alt="" class="arch-thumb" />` : "" }<div class="h3">M ap li papye a...</div><div style="font-size:12.5px;color:var(--muted)">Sa ka pran 5 a 20 segonn. Pa fèmen paj la.</div></div>`;
  } else if (m.phase === "pick") {
    body = `<p style="font-size:13px;color:var(--muted);margin-top:0">Pran yon foto papye a (bill, bon sortie, fich chofè...). App la ap li nimewo kontenè, bill, dat ak plak la, epi w ap verifye anvan w sove. Mete papye a plat, ak bon limyè.</p>${ scanButtons() }<div style="margin-top:14px"><button class="linklike" data-action="arch-manual" style="color:var(--teal)">Oswa antre l manyèlman</button></div>`;
  } else {
    var meta = m.docType || m.notes ? `<div class="arch-note">${ m.docType ? `<strong>${ escapeHtml(m.docType) }</strong>` : "" }${ m.docType && m.notes ? " \u2014 " : "" }${ escapeHtml(m.notes) }</div>` : "";
    var cards = m.rows.map(function (r, i) {
      return recordCard(r, i, m);
    }).join("");
    body = `${ m.scans ? `<p style="font-size:12.5px;color:var(--muted);margin-top:0">Verifye chak liy ak papye a. Pa fè konfyans a nimewo yo avèg: koreksyon w yo pa gen pwoblèm.</p>` : "" }${ meta }${ cards }<div class="arch-more"><button class="btn small ghost" data-action="arch-row-add">${ icon("plus", 12) } Ajoute yon kontenè</button></div>${ m.editId ? "" : `<div class="arch-more">${ scanButtons("Skane yon lòt papye") }</div>` }`;
  }
  var err = m.err ? `<div class="alert" style="margin-bottom:12px">${ icon("alert", 14) }${ escapeHtml(m.err) }</div>` : "";
  var footer = m.phase === "review" ? `<div class="arch-foot"><span style="font-size:12px;color:var(--muted)">${ m.rows.length } kontenè</span><div style="display:flex;gap:8px"><button class="btn ghost" data-action="close-modal">Anile</button><button class="btn teal" id="arch-save" data-action="arch-save"${ blockingCount(m) > 0 || !m.rows.length ? " disabled" : "" }>${ m.editId ? "Sove chanjman" : "Sove nan Achiv" }</button></div></div>` : m.phase === "pick" ? `<div class="arch-foot"><span></span><button class="btn ghost" data-action="close-modal">Anile</button></div>` : "";
  return `<div class="modal-overlay"><div class="modal-card wide"><div class="h3" style="margin-bottom:14px">${ title }</div>${ err }<div class="arch-body">${ body }</div>${ footer }</div></div>`;
}
