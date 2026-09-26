// PDF report generation (hand-written PDF writer, no library).
import {
  DIVISIONS_GROUP_1,
  DIVISIONS_GROUP_2,
  URGENT_AFTER_DAYS
} from "./constants.js";
import { state } from "./state.js";
import {
  daysBetween,
  dnkContainers,
  formatDateShort,
  statusOf,
  today
} from "./utils.js";
import { STATUS_LABELS } from "./constants.js";
import {
  isFr,
  t
} from "./i18n.js";

function toWinAnsiCode(char) {
  var n = char.charCodeAt(0);
  return n === 8212 ? 151 : n === 8211 ? 150 : n === 8216 ? 145 : n === 8217 ? 146 : n === 8220 ? 147 : n === 8221 ? 148 : n <= 255 ? n : 63;
}

function pdfEscape(text) {
  for (var n = "", i = 0; i < text.length; i++) {
    var o = toWinAnsiCode(text[i]);
    if (o === 40 || o === 41 || o === 92) {
      n += "\\";
    }
    n += String.fromCharCode(o);
  }
  return n;
}

export function buildTablePdf(rows, title, headers) {
  var o = 842;
  var a = 595;
  var l = 30;
  var s = 20;
  function f(k, O, z, w, h) {
    return `BT /${ k } ${ O } Tf 1 0 0 1 ${ z } ${ w } Tm (${ pdfEscape(h) }) Tj ET\n`;
  }
  function g(k, O, z) {
    var w = k.length * O * (z ? 0.62 : 0.52);
    return Math.max(l, (o - w) / 2);
  }
  function v(k, O, z, w, h, F, G) {
    return `${ h } ${ F } ${ G } rg ${ k } ${ O } ${ z } ${ w } re f\n`;
  }
  var A = today();
  var r = isFr() ? `Généré le ${ formatDateShort(A) } — Total : ${ rows.length } conteneur${ rows.length > 1 ? "s" : "" }` : `Jenere ${ formatDateShort(A) } — Total: ${ rows.length } kontenè`;
  var d = headers;
  var _nc = d.length;
  var _tw = 812 - l;
  var u = [];
  for (var _ci = 0; _ci < _nc; _ci++) {
    u.push(l + Math.round(_ci * _tw / _nc));
  }
  var E = [];
  for (var _ci2 = 0; _ci2 < _nc; _ci2++) {
    var _cw = (_ci2 < _nc - 1 ? u[_ci2 + 1] : 812) - u[_ci2];
    E.push(Math.max(4, Math.floor(_cw / 4.7) - 1));
  }
  var y = 812 - l;
  var U = Math.max(1, Math.floor(445 / s));
  var Q = Math.max(1, Math.floor(495 / s));
  var Z = [];
  var tt = 0;
  var pt = true;
  for (rows.length === 0 && Z.push([]); tt < rows.length;) {
    var Y = pt ? U : Q;
    Z.push(rows.slice(tt, tt + Y));
    tt += Y;
    pt = false;
  }
  function et(k, O, z) {
    var w = "";
    var h;
    if (O) {
      w += `0 0 0 rg
`;
      w += f("F2", 14, g(title, 14, true), 555, title);
      w += f("F1", 9, g(r, 9, false), 538, r);
      h = 505;
    } else {
      h = 555;
    }
    w += v(l, h - 16, y, 20, 0.043, 0.129, 0.22);
    w += `1 1 1 rg
`;
    for (var F = 0; F < d.length; F++) {
      w += f("F2", 9, u[F] + 4, h - 10, d[F]);
    }
    h -= 22;
    for (var G = 0; G < k.length; G++) {
      var ut = k[G];
      if (G % 2 === 1) {
        w += v(l, h - 15, y, s, 0.8, 0.88, 0.97);
      }
      w += `0 0 0 rg
`;
      for (var lt = [String(z + G)].concat(ut.cells), j = 0; j < lt.length; j++) {
        var D = lt[j] || "";
        if (E[j] && D.length > E[j]) {
          D = D.slice(0, E[j] - 1) + ".";
        }
        w += f("F1", 9, u[j] + 4, h - 10, D);
      }
      h -= s;
    }
    if (k.length === 0) {
      w += f("F1", 10, l, h - 10, t("Pa gen kontenè."));
    }
    return w;
  }
  for (var _ = Z.length, S = [], K = 0; K < _; K++) {
    S.push(`${ 5 + K * 2 } 0 R`);
  }
  var V = [];
  V.push({
    dict: true,
    body: "<< /Type /Catalog /Pages 2 0 R >>"
  });
  V.push({
    dict: true,
    body: `<< /Type /Pages /Kids [${ S.join(" ") }] /Count ${ _ } >>`
  });
  V.push({
    dict: true,
    body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  });
  V.push({
    dict: true,
    body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  });
  for (var nt = 1, T = 0; T < _; T++) {
    var it = T === 0;
    var N = et(Z[T], it, nt);
    nt += Z[T].length;
    V.push({
      dict: true,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ o } ${ a }] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${ 6 + T * 2 } 0 R >>`
    });
    V.push({
      stream: true,
      body: N
    });
  }
  for (var J = `%PDF-1.4
%\xE2\xE3\xCF\xD3
`, R = [], ot = 0; ot < V.length; ot++) {
    R.push(J.length);
    var ct = ot + 1;
    var $ = V[ot];
    J += $.dict ? `${ ct } 0 obj\n${ $.body }\nendobj\n` : `${ ct } 0 obj\n<< /Length ${ $.body.length } >>\nstream\n${ $.body }\nendstream\nendobj\n`;
  }
  var M = J.length;
  var at = V.length + 1;
  J += `xref\n0 ${ at }\n0000000000 65535 f \n`;
  for (var H = 0; H < R.length; H++) {
    for (var P = String(R[H]); P.length < 10;) {
      P = "0" + P;
    }
    J += `${ P } 00000 n \n`;
  }
  J += `trailer\n<< /Size ${ at } /Root 1 0 R >>\nstartxref\n${ M }\n%%EOF`;
  for (var B = new Uint8Array(J.length), C = 0; C < J.length; C++) {
    B[C] = J.charCodeAt(C) & 255;
  }
  return B;
}

export function downloadReport(status, group) {
  var i = [
    "JANVIER",
    "FÉVRIER",
    "MARS",
    "AVRIL",
    "MAI",
    "JUIN",
    "JUILLET",
    "AOÛT",
    "SEPTEMBRE",
    "OCTOBRE",
    "NOVEMBRE",
    "DÉCEMBRE"
  ];
  function o(u) {
    var E = u.split("-");
    return `${ +E[2] } ${ i[+E[1] - 1] } ${ E[0] }`;
  }
  var a = group === "1" ? DIVISIONS_GROUP_1 : group === "2" ? DIVISIONS_GROUP_2 : null;
  var l = state.containers.filter(function (container) {
    var E = status === "full" ? statusOf(container) === "full" || statusOf(container) === "pokoverifye" : statusOf(container) === status;
    return !(!E || a && a.indexOf(container.division) === -1);
  });
  var s;
  var f;
  if (status === "full") {
    l = l.slice().sort(function (u1, u2) {
      return daysBetween(u2.dateEntered) - daysBetween(u1.dateEntered);
    });
    var g = l.map(function (u) {
      var E = daysBetween(u.dateEntered);
      var y = E > URGENT_AFTER_DAYS;
      var bl = state.bills.find(function (bill) {
        return bill.id === u.billId;
      });
      var pr = bl && bl.product ? bl.product : "\u2014";
      var dstr = u.dateEntered ? o(u.dateEntered) + (y ? " (IJAN)" : "") : "\u2014";
      return {
        cells: [
          u.numewo,
          u.depo ? u.depo : "\u2014",
          pr,
          dstr,
          u.division || "\u2014",
          String(E) + (y ? " (IJAN)" : "")
        ]
      };
    });
    s = buildTablePdf(g, "DAILY REPORT - FULL - LOGISTIC", [
      "#",
      "Container",
      "Depot",
      "Produce",
      "DATE IN",
      "DIVISION",
      "DAYS IN"
    ]);
    f = `deka-log-rapo-full-gwoup${ group }-${ today() }.pdf`;
  } else {
    var v = l.map(function (u) {
      return {
        cells: [
          u.numewo,
          u.depo ? u.depo : "\u2014",
          u.trucking ? u.trucking : "\u2014",
          String(daysBetween(u.dateEntered)),
          String(daysBetween(u.dateEmpty)),
          u.size ? u.size + "'" : "\u2014",
          "EMPTY"
        ]
      };
    });
    s = buildTablePdf(v, "DAILY REPORT - LOGISTIC", [
      "#",
      "Container",
      "Depot",
      "Trucking",
      "DAYS IN",
      "DAYS EMPTY",
      "Size",
      "Status"
    ]);
    f = `deka-log-rapo-vid-${ today() }.pdf`;
  }
  var A = new Blob([s], { type: "application/pdf" });
  var r = URL.createObjectURL(A);
  var d = document.createElement("a");
  d.href = r;
  d.download = f;
  document.body.appendChild(d);
  d.click();
  document.body.removeChild(d);
  setTimeout(function () {
    URL.revokeObjectURL(r);
  }, 4000);
}

// DNK trucking report: every container on a DNK trucking that has not left, with driver name and truck plate.
export function dnkReportRows(containers) {
  return dnkContainers(containers).map(function (c) {
    return {
      cells: [
        c.numewo,
        c.trucking || "\u2014",
        t(STATUS_LABELS[statusOf(c)] || ""),
        c.depo || "\u2014",
        c.chofer || "\u2014",
        c.plak || "\u2014"
      ]
    };
  });
}

export function downloadDnkReport() {
  var bytes = buildTablePdf(dnkReportRows(state.containers), isFr() ? "RAPPORT TRUCKING DNK" : "RAPO TRUCKING DNK", [
    "#",
    "Container",
    "Trucking",
    "Status",
    "Depot",
    isFr() ? "Chauffeur" : "Chofè",
    isFr() ? "Plaque" : "Plak"
  ]);
  var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  var a = document.createElement("a");
  a.href = url;
  a.download = "deka-log-rapo-dnk-" + today() + ".pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
}

// Simple landscape table report of returned or damaged goods ("Machandiz Retounen" / "Avarye").
export function downloadGoodsReport(kind) {
  var list = state.goodsIncidents.filter(function (e) { return e.kind === kind; });
  var isDamaged = kind === "avarye";
  var rows = list.map(function (item, i) {
    var bill = state.bills.find(function (b) { return b.id === item.billId; });
    return {
      cells: [
        String(i + 1),
        bill ? bill.numewo : "\u2014",
        item.description,
        String(item.quantity) + " " + (item.unit || ""),
        item.reason || "\u2014",
        item.containerNumewo || "\u2014",
        formatDateShort(item.entryDate)
      ]
    };
  });
  var title = isDamaged ? "RAPO MACHANDIZ AVARYE" : "RAPO MACHANDIZ RETOUNEN";
  var bytes = buildTablePdf(rows, title, [
    "#",
    "Bill",
    "Deskripsyon",
    "Kantite",
    isDamaged ? "K\u00F2z" : "Rezon",
    "Konten\u00E8",
    "Dat"
  ]);
  var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  var a = document.createElement("a");
  a.href = url;
  a.download = "deka-log-rapo-" + kind + "-" + today() + ".pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
}

// "Rapò Livrezon": deliveries made out of the depot within a date range.
export function downloadDeliveryReport(from, to) {
  var list = state.deliveries.slice();
  if (from) list = list.filter(function (e) { return (e.entryDate || "") >= from; });
  if (to) list = list.filter(function (e) { return (e.entryDate || "") <= to; });
  list = list.slice().sort(function (a, b) { return (a.entryDate || "").localeCompare(b.entryDate || ""); });
  var rows = list.map(function (item, i) {
    var bill = state.bills.find(function (b) { return b.id === item.billId; });
    return {
      cells: [
        String(i + 1),
        formatDateShort(item.entryDate),
        bill ? bill.numewo : "\u2014",
        item.clientName || "\u2014",
        item.description,
        String(item.quantity) + " " + (item.unit || ""),
        item.containerNumewo || "\u2014",
        [item.trucking, item.chofer].filter(Boolean).join(" \u2014 ") || "\u2014"
      ]
    };
  });
  var bytes = buildTablePdf(rows, "RAPO LIVREZON", [
    "#",
    "Dat",
    "Bill",
    "Kliyan",
    "Deskripsyon",
    "Kantite",
    "Konten\u00E8",
    "Trucking/Chof\u00E8"
  ]);
  var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  var a = document.createElement("a");
  a.href = url;
  a.download = "deka-log-rapo-livrezon-" + today() + ".pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
}

// ============================================================================
// Fich Debakman (landing sheet): a formal per-Bill document combining the
// containers and the stock entries ("Antre Estòk") registered against a Bill.
// Portrait A4, its own self-contained PDF object tree (same low-level PDF
// dialect as buildTablePdf above), with a company header, an info box, a
// data table and a signature block on the closing page.
// ============================================================================

var LS_PAGE_W = 595;
var LS_PAGE_H = 842;
var LS_MARGIN = 40;
var LS_ROW_H = 15;
var LS_HEAD_H = 20;
var LS_NAVY = [0.043, 0.129, 0.22];
var LS_GRAY = [0.93, 0.94, 0.96];
var LS_COLS = [
  { label: "#", w: 25 },
  { label: "Tip", w: 55 },
  { label: "Detay", w: 175 },
  { label: "Kantite / Gwosè", w: 90 },
  { label: "Dat", w: 65 },
  { label: "Depo / N\u00F2t", w: 105 }
];

function lsText(font, size, x, y, str, rgb) {
  var color = rgb ? `${ rgb[0] } ${ rgb[1] } ${ rgb[2] } rg\n` : "0 0 0 rg\n";
  return color + `BT /${ font } ${ size } Tf 1 0 0 1 ${ x } ${ y } Tm (${ pdfEscape(str) }) Tj ET\n`;
}

function lsRect(x, y, w, h, rgb) {
  return `${ rgb[0] } ${ rgb[1] } ${ rgb[2] } rg ${ x } ${ y } ${ w } ${ h } re f\n`;
}

function lsLine(x1, y1, x2, y2) {
  return `0.55 0.6 0.66 RG 0.6 w ${ x1 } ${ y1 } m ${ x2 } ${ y2 } l S\n`;
}

function lsColX() {
  var x = LS_MARGIN;
  var out = [x];
  for (var i = 0; i < LS_COLS.length - 1; i++) {
    x += LS_COLS[i].w;
    out.push(x);
  }
  return out;
}

function lsClip(str, w, size) {
  var budget = Math.max(3, Math.floor(w / (size * 0.52)) - 1);
  if (!str) return "";
  return str.length > budget ? str.slice(0, budget - 1) + "." : str;
}

function lsHeaderRow(y, colX) {
  var w = lsRect(LS_MARGIN, y - LS_HEAD_H + 4, LS_PAGE_W - 2 * LS_MARGIN, LS_HEAD_H, LS_NAVY);
  LS_COLS.forEach(function (c, i) {
    w += lsText("F2", 8.5, colX[i] + 4, y - LS_HEAD_H + 10, c.label, [1, 1, 1]);
  });
  return w;
}

function lsDataRow(y, colX, cells, shaded) {
  var w = "";
  if (shaded) w += lsRect(LS_MARGIN, y - LS_ROW_H + 4, LS_PAGE_W - 2 * LS_MARGIN, LS_ROW_H, LS_GRAY);
  cells.forEach(function (cell, i) {
    w += lsText("F1", 8, colX[i] + 4, y - LS_ROW_H + 9, lsClip(String(cell == null ? "" : cell), LS_COLS[i].w, 8));
  });
  return w;
}

function lsSignatureBlock(y, note) {
  var w = "";
  var labels = ["Anrejistre pa (Depo)", "Siyati responsab Depo", "Dat ak L\u00E8"];
  var colW = (LS_PAGE_W - 2 * LS_MARGIN) / 3;
  labels.forEach(function (label, i) {
    var x = LS_MARGIN + i * colW;
    w += lsLine(x, y, x + colW - 20, y);
    w += lsText("F1", 8, x, y - 12, label, [0.3, 0.35, 0.4]);
  });
  if (note) w += lsText("F1", 7.5, LS_MARGIN, y - 40, note, [0.5, 0.55, 0.6]);
  return w;
}

export function buildLandingSheetPdf(opts) {
  var title = opts.title || "FICH DEBAKMAN";
  var docNumber = opts.docNumber || "";
  var meta = opts.meta || [];
  var rows = opts.rows || [];

  var colX = lsColX();
  var metaRows = Math.max(1, Math.ceil(meta.length / 2));
  var metaBoxH = 18 + metaRows * 15;

  // ---- page 1: company band, title, info box ----
  var p1 = lsRect(0, LS_PAGE_H - 56, LS_PAGE_W, 56, LS_NAVY);
  p1 += lsText("F2", 17, LS_MARGIN, LS_PAGE_H - 30, "DEKA GROUP", [1, 1, 1]);
  p1 += lsText("F1", 9, LS_MARGIN, LS_PAGE_H - 45, "Jesyon Depo ak Lojistik", [0.85, 0.88, 0.92]);
  var titleW = title.length * 13 * 0.62;
  p1 += lsText("F2", 13, LS_PAGE_W - LS_MARGIN - titleW, LS_PAGE_H - 30, title, [1, 1, 1]);
  if (docNumber) {
    var docW = docNumber.length * 8 * 0.52;
    p1 += lsText("F1", 8, LS_PAGE_W - LS_MARGIN - docW, LS_PAGE_H - 45, docNumber, [0.85, 0.88, 0.92]);
  }
  var metaTop = LS_PAGE_H - 56 - 22;
  p1 += lsRect(LS_MARGIN, metaTop - metaBoxH, LS_PAGE_W - 2 * LS_MARGIN, metaBoxH, [0.95, 0.96, 0.97]);
  var halfW = (LS_PAGE_W - 2 * LS_MARGIN) / 2;
  var my = metaTop - 14;
  for (var mi = 0; mi < meta.length; mi++) {
    var mx = LS_MARGIN + 10 + (mi % 2) * halfW;
    var lineY = my - Math.floor(mi / 2) * 15;
    p1 += lsText("F2", 8, mx, lineY, meta[mi][0] + ":", [0.25, 0.3, 0.35]);
    p1 += lsText("F1", 8, mx + 80, lineY, String(meta[mi][1] === null || meta[mi][1] === undefined || meta[mi][1] === "" ? "\u2014" : meta[mi][1]), [0.1, 0.13, 0.18]);
  }
  var tableTop1 = metaTop - metaBoxH - 16;

  function capacityFor(topY) {
    return Math.max(1, Math.floor((topY - LS_HEAD_H - LS_MARGIN) / LS_ROW_H));
  }
  var cap1 = capacityFor(tableTop1);
  var capN = capacityFor(LS_PAGE_H - LS_MARGIN - 24);

  var chunks = [];
  if (rows.length === 0) {
    chunks.push([]);
  } else {
    var idx = 0;
    var first = true;
    while (idx < rows.length) {
      var cap = first ? cap1 : capN;
      chunks.push(rows.slice(idx, idx + cap));
      idx += cap;
      first = false;
    }
  }

  var pages = [];
  var rowNumber = 0;
  chunks.forEach(function (chunk, pageIdx) {
    var content = "";
    var top;
    if (pageIdx === 0) {
      content += p1;
      top = tableTop1;
    } else {
      content += lsRect(0, LS_PAGE_H - 30, LS_PAGE_W, 30, LS_NAVY);
      content += lsText("F2", 10, LS_MARGIN, LS_PAGE_H - 20, title + " (swit)", [1, 1, 1]);
      top = LS_PAGE_H - LS_MARGIN - 24;
    }
    content += lsHeaderRow(top, colX);
    var y = top - LS_HEAD_H;
    chunk.forEach(function (cells, i) {
      rowNumber++;
      content += lsDataRow(y, colX, [String(rowNumber)].concat(cells), i % 2 === 1);
      y -= LS_ROW_H;
    });
    if (chunk.length === 0) {
      content += lsText("F1", 9, LS_MARGIN, y - 6, "Pa gen liy pou dokiman sa a.", [0.4, 0.4, 0.4]);
      y -= LS_ROW_H;
    }
    pages.push({ content: content, lastY: y });
  });

  // ---- signature block: on the last page if there's room, else its own page ----
  var lastPage = pages[pages.length - 1];
  if (lastPage.lastY - LS_MARGIN >= 110) {
    lastPage.content += lsSignatureBlock(lastPage.lastY - 14, opts.generatedNote || "");
  } else {
    var sigContent = lsRect(0, LS_PAGE_H - 30, LS_PAGE_W, 30, LS_NAVY) + lsText("F2", 10, LS_MARGIN, LS_PAGE_H - 20, title + " \u2014 Siyati", [1, 1, 1]);
    sigContent += lsSignatureBlock(LS_PAGE_H - 70, opts.generatedNote || "");
    pages.push({ content: sigContent, lastY: LS_PAGE_H - 70 });
  }

  // ---- serialize (same PDF object / xref scheme as buildTablePdf above) ----
  var V = [];
  V.push({ dict: true, body: "<< /Type /Catalog /Pages 2 0 R >>" });
  V.push({ dict: true, body: `<< /Type /Pages /Kids [${ pages.map(function (_p, i) { return (5 + i * 2) + " 0 R"; }).join(" ") }] /Count ${ pages.length } >>` });
  V.push({ dict: true, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>" });
  V.push({ dict: true, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>" });
  pages.forEach(function (pg) {
    V.push({ dict: true, body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ LS_PAGE_W } ${ LS_PAGE_H }] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${ V.length + 2 } 0 R >>` });
    V.push({ stream: true, body: pg.content });
  });

  var out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  var offsets = [];
  for (var oi = 0; oi < V.length; oi++) {
    offsets.push(out.length);
    var objNum = oi + 1;
    var obj = V[oi];
    out += obj.dict ? `${ objNum } 0 obj\n${ obj.body }\nendobj\n` : `${ objNum } 0 obj\n<< /Length ${ obj.body.length } >>\nstream\n${ obj.body }\nendstream\nendobj\n`;
  }
  var xrefStart = out.length;
  var total = V.length + 1;
  out += `xref\n0 ${ total }\n0000000000 65535 f \n`;
  for (var h = 0; h < offsets.length; h++) {
    var p = String(offsets[h]);
    while (p.length < 10) p = "0" + p;
    out += `${ p } 00000 n \n`;
  }
  out += `trailer\n<< /Size ${ total } /Root 1 0 R >>\nstartxref\n${ xrefStart }\n%%EOF`;

  var bytes = new Uint8Array(out.length);
  for (var c = 0; c < out.length; c++) bytes[c] = out.charCodeAt(c) & 255;
  return bytes;
}

// Builds and downloads the Fich Debakman PDF for one Bill: its containers plus its stock entries.
export function downloadLandingSheet(billId) {
  var bill = state.bills.find(function (b) { return b.id === billId; });
  if (!bill) return;
  var containers = state.containers.filter(function (c) { return c.billId === billId; });
  var entries = (state.stockEntries || []).filter(function (e) { return e.billId === billId; });

  var rows = [];
  containers.forEach(function (c) {
    rows.push(["Konten\u00E8", c.numewo, c.size ? c.size + "'" : "\u2014", formatDateShort(c.dateEntered), c.depo || "\u2014"]);
  });
  entries.forEach(function (e) {
    rows.push([
      "Est\u00F2k",
      e.description,
      e.quantity !== null && e.quantity !== undefined ? e.quantity + " " + (e.unit || "") : "\u2014",
      formatDateShort(e.entryDate),
      e.containerNumewo || e.remarks || "\u2014"
    ]);
  });

  var docNumber = "FD-" + (bill.numewo || "").replace(/[^A-Za-z0-9]/g, "") + "-" + today().replace(/-/g, "");
  var bytes = buildLandingSheetPdf({
    title: "FICH DEBAKMAN",
    docNumber: docNumber,
    meta: [
      ["Bill", bill.numewo || "\u2014"],
      ["Pwodwi", bill.product || "\u2014"],
      ["Kantite Konten\u00E8", String(containers.length)],
      ["Kantite Atik Est\u00F2k", String(entries.length)],
      ["Dat Fich", formatDateShort(today())],
      ["Nimewo Dokiman", docNumber]
    ],
    rows: rows,
    generatedNote: "Deka Group \u00B7 Dokiman jenere otomatikman \u00B7 " + formatDateShort(today())
  });

  var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  var a = document.createElement("a");
  a.href = url;
  a.download = "deka-log-fich-debakman-" + (bill.numewo || billId) + "-" + today() + ".pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
}

// ============================================================================
// Fakti (invoice): a professional, portrait, itemized invoice PDF for one
// Bill, generated once an invoice has been registered ("anrejistre") and is
// downloaded once it is marked "fini". Reuses the low-level PDF helpers
// above (LS_PAGE_W/H, lsText, lsRect, lsLine, lsClip) but with its own
// column layout and a bold TOTAL row instead of a signature block.
// ============================================================================

var IV_COLS = [
  { label: "#", w: 25 },
  { label: "Deskripsyon", w: 255 },
  { label: "Kantite", w: 70 },
  { label: "Pri Inite (HTG)", w: 80 },
  { label: "Total (HTG)", w: 85 }
];

function pdfMoney(n) {
  var v = Math.round((Number(n) || 0) * 100) / 100;
  var parts = v.toFixed(2).split(".");
  var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return intPart + "." + parts[1];
}

function ivColX() {
  var x = LS_MARGIN;
  var out = [x];
  for (var i = 0; i < IV_COLS.length - 1; i++) {
    x += IV_COLS[i].w;
    out.push(x);
  }
  return out;
}

function ivHeaderRow(y, colX) {
  var w = lsRect(LS_MARGIN, y - LS_HEAD_H + 4, LS_PAGE_W - 2 * LS_MARGIN, LS_HEAD_H, LS_NAVY);
  IV_COLS.forEach(function (c, i) {
    var align = i >= 2 ? colX[i] + IV_COLS[i].w - 8 - c.label.length * 8.5 * 0.62 : colX[i] + 4;
    w += lsText("F2", 8.5, i >= 2 ? align : colX[i] + 4, y - LS_HEAD_H + 10, c.label, [1, 1, 1]);
  });
  return w;
}

function ivDataRow(y, colX, cells, shaded) {
  var w = "";
  if (shaded) w += lsRect(LS_MARGIN, y - LS_ROW_H + 4, LS_PAGE_W - 2 * LS_MARGIN, LS_ROW_H, LS_GRAY);
  cells.forEach(function (cell, i) {
    var str = lsClip(String(cell == null ? "" : cell), IV_COLS[i].w, 8);
    var x = colX[i] + 4;
    if (i >= 2) {
      x = colX[i] + IV_COLS[i].w - 8 - str.length * 8 * 0.52;
    }
    w += lsText("F1", 8, x, y - LS_ROW_H + 9, str, [0.1, 0.13, 0.18]);
  });
  return w;
}

function ivTotalRow(y, colX, totalLabel, totalValue) {
  var w = lsRect(LS_MARGIN, y - LS_HEAD_H + 4, LS_PAGE_W - 2 * LS_MARGIN, LS_HEAD_H, LS_NAVY);
  var labelStr = totalLabel;
  var labelX = colX[3] + IV_COLS[3].w - 8 - labelStr.length * 9 * 0.62;
  w += lsText("F2", 9, labelX, y - LS_HEAD_H + 10, labelStr, [1, 1, 1]);
  var valX = colX[4] + IV_COLS[4].w - 8 - totalValue.length * 9 * 0.62;
  w += lsText("F2", 9, valX, y - LS_HEAD_H + 10, totalValue, [1, 1, 1]);
  return w;
}

export function buildInvoicePdf(opts) {
  var title = opts.title || "FAKTI";
  var docNumber = opts.docNumber || "";
  var meta = opts.meta || [];
  var rows = opts.rows || [];
  var totalValue = opts.totalValue || "0.00";

  var colX = ivColX();
  var metaRows = Math.max(1, Math.ceil(meta.length / 2));
  var metaBoxH = 18 + metaRows * 15;

  // ---- page 1: company band, title, info box ----
  var p1 = lsRect(0, LS_PAGE_H - 56, LS_PAGE_W, 56, LS_NAVY);
  p1 += lsText("F2", 17, LS_MARGIN, LS_PAGE_H - 30, "DEKA GROUP", [1, 1, 1]);
  p1 += lsText("F1", 9, LS_MARGIN, LS_PAGE_H - 45, "Jesyon Depo ak Lojistik", [0.85, 0.88, 0.92]);
  var titleW = title.length * 13 * 0.62;
  p1 += lsText("F2", 13, LS_PAGE_W - LS_MARGIN - titleW, LS_PAGE_H - 30, title, [1, 1, 1]);
  if (docNumber) {
    var docW = docNumber.length * 8 * 0.52;
    p1 += lsText("F1", 8, LS_PAGE_W - LS_MARGIN - docW, LS_PAGE_H - 45, docNumber, [0.85, 0.88, 0.92]);
  }
  var metaTop = LS_PAGE_H - 56 - 22;
  p1 += lsRect(LS_MARGIN, metaTop - metaBoxH, LS_PAGE_W - 2 * LS_MARGIN, metaBoxH, [0.95, 0.96, 0.97]);
  var halfW = (LS_PAGE_W - 2 * LS_MARGIN) / 2;
  var my = metaTop - 14;
  for (var mi = 0; mi < meta.length; mi++) {
    var mx = LS_MARGIN + 10 + (mi % 2) * halfW;
    var lineY = my - Math.floor(mi / 2) * 15;
    p1 += lsText("F2", 8, mx, lineY, meta[mi][0] + ":", [0.25, 0.3, 0.35]);
    p1 += lsText("F1", 8, mx + 80, lineY, String(meta[mi][1] === null || meta[mi][1] === undefined || meta[mi][1] === "" ? "\u2014" : meta[mi][1]), [0.1, 0.13, 0.18]);
  }
  var tableTop1 = metaTop - metaBoxH - 16;

  function capacityFor(topY) {
    return Math.max(1, Math.floor((topY - LS_HEAD_H - LS_MARGIN) / LS_ROW_H));
  }
  var cap1 = capacityFor(tableTop1);
  var capN = capacityFor(LS_PAGE_H - LS_MARGIN - 24);

  var chunks = [];
  if (rows.length === 0) {
    chunks.push([]);
  } else {
    var idx = 0;
    var first = true;
    while (idx < rows.length) {
      var cap = first ? cap1 : capN;
      chunks.push(rows.slice(idx, idx + cap));
      idx += cap;
      first = false;
    }
  }

  var pages = [];
  var rowNumber = 0;
  chunks.forEach(function (chunk, pageIdx) {
    var content = "";
    var top;
    if (pageIdx === 0) {
      content += p1;
      top = tableTop1;
    } else {
      content += lsRect(0, LS_PAGE_H - 30, LS_PAGE_W, 30, LS_NAVY);
      content += lsText("F2", 10, LS_MARGIN, LS_PAGE_H - 20, title + " (swit)", [1, 1, 1]);
      top = LS_PAGE_H - LS_MARGIN - 24;
    }
    content += ivHeaderRow(top, colX);
    var y = top - LS_HEAD_H;
    chunk.forEach(function (cells, i) {
      rowNumber++;
      content += ivDataRow(y, colX, [String(rowNumber)].concat(cells), i % 2 === 1);
      y -= LS_ROW_H;
    });
    if (chunk.length === 0) {
      content += lsText("F1", 9, LS_MARGIN, y - 6, "Pa gen liy sou fakti sa a.", [0.4, 0.4, 0.4]);
      y -= LS_ROW_H;
    }
    pages.push({ content: content, lastY: y });
  });

  // ---- TOTAL row + notes + footer: on the last page if there's room, else its own page ----
  var lastPage = pages[pages.length - 1];
  var closingH = 90;
  function closingBlock(y) {
    var w = ivTotalRow(y, colX, "TOTAL", totalValue);
    var noteY = y - LS_HEAD_H - 16;
    if (opts.notes) {
      w += lsText("F1", 8, LS_MARGIN, noteY, "Remak: " + opts.notes, [0.3, 0.35, 0.4]);
      noteY -= 16;
    }
    w += lsLine(LS_MARGIN, noteY, LS_PAGE_W - LS_MARGIN, noteY);
    w += lsText("F1", 7.5, LS_MARGIN, noteY - 14, opts.footerNote || "", [0.5, 0.55, 0.6]);
    return w;
  }
  if (lastPage.lastY - LS_MARGIN >= closingH) {
    lastPage.content += closingBlock(lastPage.lastY - 6);
  } else {
    var closingContent = lsRect(0, LS_PAGE_H - 30, LS_PAGE_W, 30, LS_NAVY) + lsText("F2", 10, LS_MARGIN, LS_PAGE_H - 20, title + " \u2014 Total", [1, 1, 1]);
    closingContent += closingBlock(LS_PAGE_H - 60);
    pages.push({ content: closingContent, lastY: LS_PAGE_H - 60 });
  }

  // ---- serialize (same PDF object / xref scheme as buildTablePdf / buildLandingSheetPdf above) ----
  var V = [];
  V.push({ dict: true, body: "<< /Type /Catalog /Pages 2 0 R >>" });
  V.push({ dict: true, body: `<< /Type /Pages /Kids [${ pages.map(function (_p, i) { return (5 + i * 2) + " 0 R"; }).join(" ") }] /Count ${ pages.length } >>` });
  V.push({ dict: true, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>" });
  V.push({ dict: true, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>" });
  pages.forEach(function (pg) {
    V.push({ dict: true, body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ LS_PAGE_W } ${ LS_PAGE_H }] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${ V.length + 2 } 0 R >>` });
    V.push({ stream: true, body: pg.content });
  });

  var out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  var offsets = [];
  for (var oi = 0; oi < V.length; oi++) {
    offsets.push(out.length);
    var objNum = oi + 1;
    var obj = V[oi];
    out += obj.dict ? `${ objNum } 0 obj\n${ obj.body }\nendobj\n` : `${ objNum } 0 obj\n<< /Length ${ obj.body.length } >>\nstream\n${ obj.body }\nendstream\nendobj\n`;
  }
  var xrefStart = out.length;
  var total = V.length + 1;
  out += `xref\n0 ${ total }\n0000000000 65535 f \n`;
  for (var h = 0; h < offsets.length; h++) {
    var p = String(offsets[h]);
    while (p.length < 10) p = "0" + p;
    out += `${ p } 00000 n \n`;
  }
  out += `trailer\n<< /Size ${ total } /Root 1 0 R >>\nstartxref\n${ xrefStart }\n%%EOF`;

  var bytes = new Uint8Array(out.length);
  for (var c = 0; c < out.length; c++) bytes[c] = out.charCodeAt(c) & 255;
  return bytes;
}

// Builds and downloads the invoice PDF for one invoice id.
export function downloadInvoice(invoiceId) {
  var inv = state.invoices.find(function (i) { return i.id === invoiceId; });
  if (!inv) return;
  var bill = state.bills.find(function (b) { return b.id === inv.billId; });

  var total = 0;
  var rows = (inv.items || []).map(function (it) {
    var qty = Number(it.qty) || 0;
    var price = Number(it.unitPrice) || 0;
    var lineTotal = qty * price;
    total += lineTotal;
    return [it.description, String(qty), pdfMoney(price), pdfMoney(lineTotal)];
  });

  var bytes = buildInvoicePdf({
    title: "FAKTI",
    docNumber: inv.invoiceNumber,
    meta: [
      ["Nimewo Fakti", inv.invoiceNumber],
      ["Bill", bill ? bill.numewo : "\u2014"],
      ["Kliyan", inv.clientName || "\u2014"],
      ["Adrès", inv.clientAddress || "\u2014"],
      ["Dat Fakti", formatDateShort(inv.invoiceDate)],
      ["Dat Delè", inv.dueDate ? formatDateShort(inv.dueDate) : "\u2014"]
    ],
    rows: rows,
    totalValue: pdfMoney(total),
    notes: inv.notes || "",
    footerNote: "Deka Group \u00B7 Fakti sa a jenere otomatikman \u00B7 " + formatDateShort(today())
  });

  var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  var a = document.createElement("a");
  a.href = url;
  a.download = "deka-log-fakti-" + (inv.invoiceNumber || invoiceId) + ".pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
}
