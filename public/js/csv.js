// Generates and downloads CSV files (open directly in Excel, Google Sheets, LibreOffice) — no library needed.
import { state } from "./state.js";
import {
  formatDateShort,
  statusOf
} from "./utils.js";

function csvCell(value) {
  var s = value === null || value === undefined ? "" : String(value);
  return /["\n,;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function downloadCsv(filename, headers, rows) {
  var lines = [headers.map(csvCell).join(",")].concat(rows.map(function (r) {
    return r.map(csvCell).join(",");
  }));
  // A UTF-8 BOM so Excel shows accented Kreyòl letters (è, ò, à...) correctly instead of garbled text.
  var csv = "\uFEFF" + lines.join("\r\n");
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
}

// One row per container, every container regardless of the current screen's filter — the full register.
export function exportContainersCsv() {
  var headers = ["Numewo", "Divizyon", "Estati", "Depo", "Trucking", "Bill", "Pwodwi", "Dat Antre", "Dat Verifye", "Dat Vid", "Dat Kite"];
  var statusLabel = { disponib: "Disponib", pokoverifye: "Poko Verifye", full: "Full", vid: "Vid", kite: "Kite" };
  var rows = state.containers.slice().sort(function (a, b) {
    return a.numewo < b.numewo ? -1 : 1;
  }).map(function (c) {
    var bill = state.bills.find(function (b) {
      return b.id === c.billId;
    });
    return [
      c.numewo,
      c.division || "",
      statusLabel[statusOf(c)] || "",
      c.depo || "",
      c.trucking || "",
      bill ? bill.numewo : "",
      bill && bill.product ? bill.product : "",
      formatDateShort(c.dateEntered),
      formatDateShort(c.dateVerified),
      formatDateShort(c.dateEmpty),
      formatDateShort(c.dateLeft)
    ];
  });
  downloadCsv("deka-log-kontene-" + new Date().toISOString().slice(0, 10) + ".csv", headers, rows);
}
