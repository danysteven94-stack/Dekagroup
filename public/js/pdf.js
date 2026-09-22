// PDF report generation (hand-written PDF writer, no library).
import {
  DIVISIONS_GROUP_1,
  DIVISIONS_GROUP_2,
  URGENT_AFTER_DAYS
} from "./constants.js";
import { state } from "./state.js";
import {
  daysBetween,
  formatDateShort,
  statusOf,
  today
} from "./utils.js";

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
  var r = `Jenere ${ formatDateShort(A) } — Total: ${ rows.length } kontenè`;
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
      w += f("F1", 10, l, h - 10, "Pa gen kontenè.");
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
