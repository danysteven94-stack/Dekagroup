// Small pure helpers: dates, escaping, container/bill status rules, localStorage wrappers.
import {
  DAILY_DKN_OPTIONS,
  DAILY_TRUCKING_BASE,
  MONTHS,
  URGENT_AFTER_DAYS,
  WEEKDAYS
} from "./constants.js";
import {
  monthName,
  weekdayName
} from "./i18n.js";

export function isUrgent(container) {
  var n = statusOf(container);
  return n === "full" || n === "pokoverifye" ? daysBetween(container.dateEntered, container.dateEmpty) > URGENT_AFTER_DAYS : n === "vid" ? daysBetween(container.dateEmpty) > URGENT_AFTER_DAYS : false;
}

export function daysLabel(container) {
  var n = statusOf(container);
  return n === "vid" ? daysBetween(container.dateEmpty) + " jou" : n === "kite" && container.dateEmpty ? daysBetween(container.dateEmpty, container.dateLeft) + " jou" : "\u2014";
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function escapeHtml(text) {
  return String(text == null ? "" : text).replace(/[&<>"']/g, function (n) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[n];
  });
}

// Shared <option> list for every trucking dropdown in the app: the base carriers plus a "DKN"
// group (DKN 001-015). Keeps an unknown/legacy value visible instead of silently dropping it
// (this also keeps old records still saved under the earlier "DNK" spelling selectable).
export function truckingOptionsHtml(current) {
  var known = DAILY_TRUCKING_BASE.indexOf(current) !== -1 || DAILY_DKN_OPTIONS.indexOf(current) !== -1;
  var customOpt = current && !known ? `<option value="${ escapeHtml(current) }" selected>${ escapeHtml(current) }</option>` : "";
  var baseOpts = DAILY_TRUCKING_BASE.map(function (o) {
    return `<option value="${ o }"${ current === o ? " selected" : "" }>${ o }</option>`;
  }).join("");
  var dknOpts = DAILY_DKN_OPTIONS.map(function (o) {
    return `<option value="${ o }"${ current === o ? " selected" : "" }>${ o }</option>`;
  }).join("");
  return `<option value=""${ current ? "" : " selected" }>\u2014 Chwazi \u2014</option>${ customOpt }${ baseOpts }<optgroup label="DKN">${ dknOpts }</optgroup>`;
}

export function formatDateShort(isoDate) {
  if (!isoDate) {
    return "\u2014";
  }
  var n = isoDate.split("-");
  return `${ n[2] }/${ n[1] }/${ n[0] }`;
}

export function daysBetween(from, to) {
  if (!from) {
    return 0;
  }
  var i = new Date(from + "T00:00:00");
  var o = new Date((to || today()) + "T00:00:00");
  var a = Math.round((o - i) / 86400000);
  return Math.max(1, a + 1);
}

export function statusOf(container) {
  return container.dateLeft ? "kite" : container.dateEmpty ? "vid" : container.dateEntered && container.dateVerified ? "full" : container.dateEntered ? "pokoverifye" : container.datePran ? "pran" : "disponib";
}

export function billStatus(bill, containers) {
  var i = containers.filter(function (o) {
    return o.billId === bill.id;
  });
  return i.length === 0 ? "vid" : i.every(function (o) {
    return !o.dateEntered;
  }) ? "planifye" : i.every(function (o) {
    return o.dateLeft;
  }) ? "fini" : "aktif";
}

// Containers assigned to a DKN trucking (DKN 001...) that have not left yet, most recent entry first.
// Also matches the earlier "DNK" spelling so older records already saved that way still show up.
export function dknContainers(containers, month) {
  return containers.filter(function (container) {
    return /^(DKN|DNK)\s?\d+/i.test(container.trucking || "") && statusOf(container) !== "kite" && inMonth(container.dateEntered, month);
  }).sort(byEntryDateDesc);
}

// Monthly DKN reports: month is "YYYY-MM"; an empty month means the complete report (no filter).
function inMonth(isoDate, month) {
  return !month || (isoDate || "").slice(0, 7) === month;
}

// The months that have at least one DKN container, newest first. kind: "trucking" | "all" (by entry date), "left" (by exit date).
export function dknMonthOptions(containers, kind) {
  var seen = {};
  containers.forEach(function (c) {
    if (!isDknTrucking(c.trucking)) {
      return;
    }
    var left = statusOf(c) === "kite";
    if (kind === "left" ? !left : kind === "trucking" && left) {
      return;
    }
    var key = ((kind === "left" ? c.dateLeft : c.dateEntered) || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(key)) {
      seen[key] = true;
    }
  });
  return Object.keys(seen).sort().reverse();
}

export function dknMonthLabel(key) {
  var p = (key || "").split("-");
  var i = parseInt(p[1], 10) - 1;
  return i >= 0 && i < 12 ? monthName(i, MONTHS[i]) + " " + p[0] : "";
}

// Most recent entry first, down to the container that has been there the longest; ties by trucking then number.
function byEntryDateDesc(a, b) {
  return (b.dateEntered || "").localeCompare(a.dateEntered || "") || (a.trucking || "").localeCompare(b.trucking || "") || (a.numewo < b.numewo ? -1 : 1);
}

// Every DKN container since it entered: the ones still here and the ones that already left (full DKN report).
export function dknAllContainers(containers, month) {
  return containers.filter(function (container) {
    return isDknTrucking(container.trucking) && inMonth(container.dateEntered, month);
  }).sort(byEntryDateDesc);
}

export function isDknTrucking(trucking) {
  return /^(DKN|DNK)\s?\d+/i.test(trucking || "");
}

// DKN containers that already left (kite), most recent first: the "sòti" report.
export function dknLeftContainers(containers, month) {
  return containers.filter(function (container) {
    return isDknTrucking(container.trucking) && statusOf(container) === "kite" && inMonth(container.dateLeft, month);
  }).sort(function (a, b) {
    return (b.dateLeft || "").localeCompare(a.dateLeft || "") || (a.numewo < b.numewo ? -1 : 1);
  });
}

export function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (n) {
    return null;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (i) {
    return false;
  }
}

export function storageRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (n) {
    return false;
  }
}

export function getDeviceId() {
  var d = storageGet("deka-log-device-id");
  if (!d) {
    d = newId();
    storageSet("deka-log-device-id", d);
  }
  return d;
}

export function formatLongDate(date) {
  date = date || new Date;
  return `${ weekdayName(date.getDay(), WEEKDAYS[date.getDay()]) } ${ date.getDate() } ${ monthName(date.getMonth(), MONTHS[date.getMonth()]) } ${ date.getFullYear() }`;
}

export function formatTime(date) {
  if (!date) {
    return "";
  }
  var n = date.getHours();
  var i = date.getMinutes();
  return `${ n < 10 ? "0" + n : n }:${ i < 10 ? "0" + i : i }`;
}

export function formatDateTimeShort(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) {
    return "";
  }
  var z = function (n) {
    return n < 10 ? "0" + n : n;
  };
  return `${ z(d.getDate()) }/${ z(d.getMonth() + 1) } ${ formatTime(d) }`;
}

export function roleLabel(role) {
  return {
    admin: "Administratè Lojistik",
    depot: "Depo",
    daily: "Daily Report",
    chofe: "Chofè",
    pointeur: "Pointeur",
    logistique: "Logistique Deka",
    administration: "Administration DEKA"
  }[role] || role;
}

// DKN is the same company as CTSA: a search for either word must find containers saved under both.
export function truckingSearchText(value) {
  var v = String(value || "");
  return /^\s*(CTSA|DKN|DNK)/i.test(v) ? v + " CTSA DKN" : v;
}

// "CFC 12" -> "CFC", "DKN 003" (or the old "DNK" spelling) -> "CTSA" (DKN is the same company as CTSA), nothing -> "__none".
export function truckingGroupOf(value) {
  var v = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!v) {
    return "__none";
  }
  if (/^(DKN|DNK)(\s|\d|$)/.test(v)) {
    return "CTSA";
  }
  return v.replace(/[\s._-]*\d+$/, "") || v;
}
