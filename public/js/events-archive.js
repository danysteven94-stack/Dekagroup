// Event listeners of the archive tab and its scan / entry dialog.
import {
  addArchiveRow,
  archiveManualFromPick,
  handleScanFile,
  openArchiveEdit,
  openArchiveManual,
  openArchiveScan,
  removeArchiveRow,
  saveArchive
} from "./archive.js";
import { exportArchiveCsv } from "./csv.js";
import {
  normalizeBill,
  normalizeContainer,
  normalizePlate
} from "./iso6346.js";
import { state } from "./state.js";
import { refreshArchiveIssues } from "./views/archive.js";

function rowByKey(key) {
  var m = state.modal;
  return m && m.mode === "arch" ? m.rows.find(function (r) {
    return r.k === key;
  }) : null;
}

document.addEventListener("click", function (event) {
  var n = event.target.closest("[data-action]");
  if (!n) {
    return;
  }
  var a = n.getAttribute("data-action");
  if (a === "arch-scan") {
    openArchiveScan();
  } else if (a === "arch-new") {
    openArchiveManual();
  } else if (a === "arch-manual") {
    archiveManualFromPick();
  } else if (a === "arch-edit") {
    openArchiveEdit(n.getAttribute("data-id"));
  } else if (a === "arch-row-add") {
    addArchiveRow();
  } else if (a === "arch-row-remove") {
    removeArchiveRow(n.getAttribute("data-key"));
  } else if (a === "arch-save") {
    saveArchive();
  } else if (a === "arch-export-csv") {
    exportArchiveCsv();
  }
});

// Typing updates the state only (no re-render), then the red/amber chips are refreshed in place.
document.addEventListener("input", function (event) {
  var t = event.target;
  if (!t || !t.getAttribute || !t.getAttribute("data-arch")) {
    return;
  }
  var row = rowByKey(t.getAttribute("data-key"));
  if (row) {
    row[t.getAttribute("data-arch")] = t.value;
    refreshArchiveIssues();
  }
});

document.addEventListener("change", function (event) {
  var t = event.target;
  if (!t || !t.classList) {
    return;
  }
  if (t.classList.contains("arch-file")) {
    var file = t.files && t.files[0];
    t.value = "";
    handleScanFile(file);
    return;
  }
  var field = t.getAttribute && t.getAttribute("data-arch");
  if (!field) {
    return;
  }
  var row = rowByKey(t.getAttribute("data-key"));
  if (!row) {
    return;
  }
  var v = t.value;
  if (field === "numewo") {
    v = normalizeContainer(v);
  } else if (field === "plak") {
    v = normalizePlate(v);
  } else if (field === "bill") {
    v = normalizeBill(v);
  }
  t.value = v;
  row[field] = v;
  refreshArchiveIssues();
});
