// Container-number helpers (ISO 6346) and small normalizers used by the archive screens.
// Same rules as api/_lib/scanlib.js on the server.
var LETTER_VALUE = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20, K: 21, L: 23, M: 24,
  N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38
};

export function normalizeContainer(value) {
  return String(value == null ? "" : value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

export function containerFormatOk(n) {
  return /^[A-Z]{4}\d{7}$/.test(n);
}

// A wrong check digit almost always means one character was misread.
export function containerCheckOk(n) {
  if (!containerFormatOk(n)) {
    return false;
  }
  var sum = 0;
  for (var i = 0; i < 10; i++) {
    var ch = n.charAt(i);
    sum += (i < 4 ? LETTER_VALUE[ch] : Number(ch)) * Math.pow(2, i);
  }
  return (sum % 11) % 10 === Number(n.charAt(10));
}

export function normalizePlate(value) {
  return String(value == null ? "" : value).toUpperCase().replace(/[^A-Z0-9 -]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
}

export function normalizeBill(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().toUpperCase().slice(0, 60);
}
