// Logistique Deka: PDF of the bills (what is on the screen after the filters): bill, product, division, amount,
// date the check arrived, date paid, date the payment was confirmed, step and broker. Always in French (formal document).
import { buildTablePdf } from "./pdf.js";
import { state } from "./state.js";
import {
  formatDateShort,
  today
} from "./utils.js";
import {
  daysSince,
  filteredBills,
  isOverdue,
  paymentOf,
  stageOf
} from "./views/logistique.js";

var STAGE_FR = { poko: "Non pay\u00E9", chek: "Ch\u00E8que re\u00E7u", peye: "Pay\u00E9", konfime: "Paiement confirm\u00E9" };

function amountText(n, currency) {
  if (n === null || n === undefined || !isFinite(Number(n))) return "\u2014";
  var parts = Number(n).toFixed(2).split(".");
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + parts[1] + " " + (currency || "HTG");
}

function dateText(d) {
  return d ? formatDateShort(d) : "\u2014";
}

function totalsText(label, list) {
  var sums = {};
  list.forEach(function (b) {
    if (b && b.amount > 0) sums[b.currency || "HTG"] = (sums[b.currency || "HTG"] || 0) + b.amount;
  });
  var keys = Object.keys(sums).sort();
  return keys.length ? label + " : " + keys.map(function (k) { return amountText(sums[k], k); }).join(" + ") : "";
}

export function buildLgBillsPdf() {
  var P = state.pay;
  var list = filteredBills();
  var rows = list.map(function (b) {
    var rec = paymentOf(b.id) || b;
    var st = STAGE_FR[stageOf(rec)];
    if (isOverdue(rec)) st += " (" + daysSince(rec.checkDate) + " j)";
    return {
      cells: [
        b.numewo,
        b.product || "\u2014",
        b.division || "\u2014",
        rec.amount > 0 ? amountText(rec.amount, rec.currency) : "\u2014",
        dateText(rec.checkDate),
        dateText(rec.paidDate),
        dateText(rec.confirmedDate),
        st,
        rec.broker || "\u2014"
      ]
    };
  });
  var title = "PAIEMENTS DES BILLS \u2014 LOGISTIQUE DEKA" + (P.filterDivision ? " \u2014 " + P.filterDivision : "");
  var confirmed = list.map(function (b) { return paymentOf(b.id) || b; }).filter(function (r) { return r.confirmedDate; });
  var open = list.map(function (b) { return paymentOf(b.id) || b; }).filter(function (r) { return !r.confirmedDate; });
  var extra = [totalsText("Confirm\u00E9", confirmed), totalsText("\u00C0 confirmer", open)].filter(Boolean).join(" \u2014 ");
  return buildTablePdf(rows, title, [
    "#",
    "Bill",
    "Produit",
    "Division",
    "Montant",
    "Ch\u00E8que re\u00E7u",
    "Pay\u00E9",
    "Confirm\u00E9",
    "Statut",
    "Courtier"
  ], [0.6, 2.2, 2, 1.7, 1.9, 1.5, 1.3, 1.5, 2.2, 1.6], extra);
}

export function downloadLgBillsPdf() {
  var bytes = buildLgBillsPdf();
  var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  var a = document.createElement("a");
  a.href = url;
  a.download = "deka-log-logistique-peman-" + today() + ".pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}
