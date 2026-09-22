// Daily Report interface.
import { apiFetch } from "../api.js";
import {
  COLORS,
  DAILY_DNK_OPTIONS,
  DAILY_TRUCKING_BASE,
  LOGO_URL,
  STATUS_LABELS,
  URGENT_AFTER_DAYS
} from "../constants.js";
import { icon } from "../icons.js";
import { buildTablePdf } from "../pdf.js";
import { render } from "../render.js";
import { state } from "../state.js";
import {
  daysBetween,
  escapeHtml,
  formatDateShort,
  formatLongDate,
  formatTime,
  getDeviceId,
  statusOf,
  today
} from "../utils.js";
import { accountButton } from "./account.js";
import { helpButton } from "./help.js";
import { loadingView } from "./gate.js";

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function effectiveDailyValues(cc) {
  var o = state.dr.overrides[cc.id] || {};
  return {
    depo: hasOwn(o, "depo") ? o.depo : cc.depo,
    trucking: hasOwn(o, "trucking") ? o.trucking : cc.trucking
  };
}

export function loadDailyState() {
  if (!state.drUnlocked) {
    return;
  }
  apiFetch("/api/daily").then(function (r) {
    if (!r.ok) {
      throw new Error("HTTP " + r.status);
    }
    return r.json();
  }).then(function (d) {
    state.dr.checks = d.checks || {};
    state.dr.overrides = d.overrides || {};
    state.dr.loaded = true;
    state.dr.err = "";
    render();
  }).catch(function (e) {
    if (!state.dr.loaded) {
      state.dr.err = e && e.message ? e.message : String(e);
      render();
    }
  });
}

function saveDailyPatch(patch) {
  apiFetch("/api/daily", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": getDeviceId()
    },
    body: JSON.stringify(patch)
  }).then(function (r) {
    if (!r.ok) {
      return r.text().then(function (x) {
        throw new Error(`HTTP ${ r.status }: ${ x || r.statusText }`);
      });
    }
    if (state.dr.saveErr) {
      state.dr.saveErr = false;
      state.dr.saveErrorDetail = "";
      render();
    }
  }).catch(function (e) {
    state.dr.saveErr = true;
    state.dr.saveErrorDetail = e && e.message ? e.message : String(e);
    render();
  });
}

export function toggleDailyCheck(id) {
  var d = today();
  var v = state.dr.checks[id] === d ? null : d;
  var ch = {};
  state.dr.checks[id] = v;
  ch[id] = v;
  saveDailyPatch({ checks: ch });
  render();
}

export function setDailyOverride(id, field, val) {
  var o = Object.assign({}, state.dr.overrides[id]);
  var pf = {};
  var ov = {};
  o[field] = val;
  state.dr.overrides[id] = o;
  pf[field] = val;
  ov[id] = pf;
  saveDailyPatch({ overrides: ov });
}

function dailyTruckingCell(cc, ef) {
  var tr = ef.trucking || "";
  var isCfc = /^CFC(\s|$)/.test(tr);
  var base = isCfc ? "CFC" : tr;
  var num = isCfc ? tr.replace(/^CFC\s*/, "") : "";
  var known = DAILY_TRUCKING_BASE.indexOf(base) !== -1 || DAILY_DNK_OPTIONS.indexOf(base) !== -1;
  var opts = `<option value=""${ tr ? "" : " selected" }>— Chwazi —</option>${ tr && !known ? `<option value="${ escapeHtml(tr) }" selected>${ escapeHtml(tr) }</option>` : "" }${ DAILY_TRUCKING_BASE.map(function (o) {
    return `<option value="${ o }"${ base === o ? " selected" : "" }>${ o }</option>`;
  }).join("") }<optgroup label="DNK">${ DAILY_DNK_OPTIONS.map(function (o) {
    return `<option value="${ o }"${ base === o ? " selected" : "" }>${ o }</option>`;
  }).join("") }</optgroup>`;
  return `<div style="width:190px;flex-shrink:0"><span class="field-label" style="font-size:9.5px">Trucking</span><div style="display:flex;gap:6px"><select class="input dr-trucking-select" data-id="${ cc.id }" style="padding:6px 8px;font-size:12.5px;flex:1;min-width:0">${ opts }</select>${ isCfc ? `<input class="input dr-cfc-num" data-id="${ cc.id }" inputmode="numeric" maxlength="6" placeholder="No." value="${ escapeHtml(num) }" style="padding:6px 8px;font-size:12.5px;width:62px;flex:none" />` : "" }</div></div>`;
}

export function downloadDailyReport(status) {
  var isFull = status === "full";
  var list = state.containers.filter(function (container) {
    var sx = statusOf(container);
    return isFull ? sx === "full" || sx === "pokoverifye" : sx === "vid";
  });
  var rows;
  var pdf;
  var fname;
  if (isFull) {
    list = list.slice().sort(function (a, l) {
      return daysBetween(l.dateEntered) - daysBetween(a.dateEntered);
    });
    rows = list.map(function (u) {
      var ef = effectiveDailyValues(u);
      var days = daysBetween(u.dateEntered);
      var urg = days > URGENT_AFTER_DAYS;
      var bl = state.bills.find(function (bill) {
        return bill.id === u.billId;
      });
      return {
        cells: [
          u.numewo,
          ef.depo ? ef.depo : "\u2014",
          ef.trucking ? ef.trucking : "\u2014",
          bl && bl.product ? bl.product : "\u2014",
          u.dateEntered ? formatDateShort(u.dateEntered) + (urg ? " (IJAN)" : "") : "\u2014",
          u.division || "\u2014",
          String(days) + (urg ? " (IJAN)" : "")
        ]
      };
    });
    pdf = buildTablePdf(rows, "DAILY REPORT - FULL", [
      "#",
      "Container",
      "Depot",
      "Trucking",
      "Produce",
      "DATE IN",
      "DIVISION",
      "DAYS IN"
    ]);
    fname = `daily-report-full-${ today() }.pdf`;
  } else {
    list = list.slice().sort(function (a, l) {
      return daysBetween(l.dateEmpty) - daysBetween(a.dateEmpty);
    });
    rows = list.map(function (u) {
      var ef = effectiveDailyValues(u);
      return {
        cells: [
          u.numewo,
          ef.depo ? ef.depo : "\u2014",
          ef.trucking ? ef.trucking : "\u2014",
          String(daysBetween(u.dateEntered)),
          String(daysBetween(u.dateEmpty)),
          u.size ? u.size + "'" : "\u2014",
          "EMPTY"
        ]
      };
    });
    pdf = buildTablePdf(rows, "DAILY REPORT - VID", [
      "#",
      "Container",
      "Depot",
      "Trucking",
      "DAYS IN",
      "DAYS EMPTY",
      "Size",
      "Status"
    ]);
    fname = `daily-report-vid-${ today() }.pdf`;
  }
  var blob = new Blob([pdf], { type: "application/pdf" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4000);
}

function dailyReportBar() {
  var nf = state.containers.filter(function (container) {
    var sx = statusOf(container);
    return sx === "full" || sx === "pokoverifye";
  }).length;
  var nv = state.containers.filter(function (container) {
    return statusOf(container) === "vid";
  }).length;
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px"><button class="btn teal" data-action="dr-report" data-status="full">${ icon("download", 15, "#fff") } Rapò Full — PDF (${ nf })</button><button class="btn" style="background:${ COLORS.vid };color:#0B2138;border-color:${ COLORS.vid }" data-action="dr-report" data-status="vid">${ icon("download", 15, "#0B2138") } Rapò Vid — PDF (${ nv })</button></div>`;
}

function showDailyNotice(msg, ok) {
  state.dr.notice = {
    msg: msg,
    ok: ok
  };
  render();
  clearTimeout(state.dr._nt);
  state.dr._nt = setTimeout(function () {
    state.dr.notice = null;
    var ae = document.activeElement;
    if (!(ae && (ae.tagName === "INPUT" || ae.tagName === "SELECT"))) {
      render();
    }
  }, 6000);
}

export function verifyFromDaily(id) {
  var cc = state.containers.find(function (container) {
    return container.id === id;
  });
  if (!cc || statusOf(cc) !== "pokoverifye" || state.dr.verifying) {
    return;
  }
  var ef = effectiveDailyValues(cc);
  var depo = (ef.depo || "").trim();
  var tr = ef.trucking || null;
  if (!depo) {
    showDailyNotice(`Mete depo a anvan w verifye ${ cc.numewo }.`, false);
    return;
  }
  if (!window.confirm(`Verifye ${ cc.numewo } ?\nDepo: ${ depo }\nTrucking: ${ tr || "\u2014" }\n\nChanjman sa a ap sove nan Lojistik tou.`)) {
    return;
  }
  state.dr.verifying = true;
  apiFetch("/api/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": getDeviceId()
    },
    body: JSON.stringify({
      id: id,
      date: today(),
      depo: depo,
      trucking: tr
    })
  }).then(function (r) {
    return r.json().catch(function () {
      return {};
    }).then(function (d) {
      if (!r.ok) {
        throw new Error(d && d.error ? d.error : "HTTP " + r.status);
      }
      return d;
    });
  }).then(function (d) {
    state.dr.verifying = false;
    var nc = d.container || {
      dateVerified: today(),
      depo: depo,
      trucking: tr
    };
    state.containers = state.containers.map(function (container) {
      return container.id === id ? Object.assign({}, container, nc) : container;
    });
    showDailyNotice(`${ cc.numewo } verifye epi sove nan Lojistik.`, true);
  }).catch(function (e) {
    state.dr.verifying = false;
    showDailyNotice(`Pa t kapab verifye ${ cc.numewo }: ${ e && e.message ? e.message : e }`, false);
  });
}

export function dailyReportView() {
  if (!state.dr.loaded) {
    return state.dr.err ? `<div class="gate-wrap"><div class="gate-card" style="text-align:center"><div class="gate-brand" style="justify-content:center">${ icon("alert", 22, "#D9531E") }</div><div style="font-weight:700;color:var(--rust-deep);margin-bottom:10px">Pa ka konekte ak baz done a</div><div style="font-family:var(--font-mono);font-size:11px;margin-bottom:14px;word-break:break-word">${ escapeHtml(state.dr.err) }</div><button class="gate-btn" data-action="dr-retry">Eseye Ankò</button></div></div>` : loadingView();
  }
  var d = today();
  var items = state.containers.filter(function (container) {
    var s = statusOf(container);
    return s === "full" || s === "vid" || s === "pokoverifye";
  });
  if (state.dr.search.trim()) {
    var q2 = state.dr.search.trim().toLowerCase();
    items = items.filter(function (cc) {
      var bl = state.bills.find(function (bill) {
        return bill.id === cc.billId;
      });
      var ef = effectiveDailyValues(cc);
      return cc.numewo.toLowerCase().indexOf(q2) !== -1 || cc.division && cc.division.toLowerCase().indexOf(q2) !== -1 || ef.depo && ef.depo.toLowerCase().indexOf(q2) !== -1 || ef.trucking && ef.trucking.toLowerCase().indexOf(q2) !== -1 || bl && bl.product && bl.product.toLowerCase().indexOf(q2) !== -1;
    });
  }
  items = items.sort(function (a, l) {
    var oa = {
      full: 0,
      pokoverifye: 1,
      vid: 2
    };
    var sa = statusOf(a);
    var sl = statusOf(l);
    return oa[sa] !== oa[sl] ? oa[sa] - oa[sl] : a.numewo < l.numewo ? -1 : 1;
  });
  var done = items.filter(function (cc) {
    return state.dr.checks[cc.id] === d;
  }).length;
  var rows = items.map(function (cc) {
    var ck = state.dr.checks[cc.id] === d;
    var sx = statusOf(cc);
    var col = sx === "full" ? COLORS.rust : sx === "vid" ? COLORS.vid : COLORS.pokoverifye;
    var bl = state.bills.find(function (bill) {
      return bill.id === cc.billId;
    });
    var ef = effectiveDailyValues(cc);
    return `<div class="row" style="border-left:4px solid ${ col }${ ck ? ";opacity:.5" : "" }"><div data-action="dr-toggle" data-id="${ cc.id }" style="cursor:pointer;width:24px;height:24px;border-radius:6px;border:2px solid ${ ck ? COLORS.green : "var(--border)" };background:${ ck ? COLORS.green : "transparent" };display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:10px">${ ck ? icon("check", 14, "#fff") : "" }</div><div class="row-min"><span class="plate" style="border-color:${ col }">${ escapeHtml(cc.numewo) }</span> <span style="display:inline-block;font-family:var(--font-mono);font-weight:700;font-size:11px;background:var(--navy);color:#fff;padding:2px 6px;border-radius:4px;vertical-align:middle">${ cc.size || "\u2014" }'</span><div class="row-sub">${ STATUS_LABELS[sx] } · ${ cc.division ? escapeHtml(cc.division) : "\u2014" }</div><div class="row-sub light">${ bl && bl.product ? `Pwodwi: <strong>${ escapeHtml(bl.product) }</strong>` : "" }</div></div><div style="width:150px;flex-shrink:0"><span class="field-label" style="font-size:9.5px">Depo</span><input class="input dr-depo-input" data-id="${ cc.id }" value="${ escapeHtml(ef.depo || "") }" placeholder="Egz. Depo Kòdòn" style="padding:6px 8px;font-size:12.5px" /></div>${ dailyTruckingCell(cc, ef) }${ sx === "pokoverifye" ? `<button class="btn" data-action="dr-verify" data-id="${ cc.id }" style="background:${ COLORS.pokoverifye };color:#fff;padding:8px 14px;font-size:12px;flex-shrink:0;align-self:flex-end">Verifye</button>` : "" }</div>`;
  }).join("");
  return `<div style="min-height:100vh;background:var(--bg)"><header style="background:var(--navy);padding:18px 20px;display:flex;align-items:center;gap:12px"><div class="sidebar-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div style="flex:1"><div style="color:#fff;font-weight:800;font-size:16px">DEKA LOG — Daily Report</div><div style="color:var(--steel-light);font-size:11.5px">Envantè jounalye · ${ formatLongDate() }</div></div>${ state.lastSyncTime ? `<div style="color:var(--steel-light);font-size:10.5px;text-align:right">Dènye sinkwonizasyon<br/>${ formatTime(state.lastSyncTime) }</div>` : "" }${ helpButton("#fff") + accountButton("#fff") }<button class="linklike" data-action="logout" style="color:#fff">${ icon("undo", 12) } Dekonekte</button></header><main class="content" style="max-width:1000px;margin:0 auto">${ state.dr.notice ? `<div class="alert" style="${ state.dr.notice.ok ? "background:#E4F3EC;color:#1D7A5A;border-color:#1D7A5A" : "" }">${ escapeHtml(state.dr.notice.msg) }</div>` : "" }${ state.dr.saveErr ? `<div class="alert">${ icon("alert", 14) }Pa t kapab sove chanjman an. Verifye epi eseye ankò.${ state.dr.saveErrorDetail ? ` (${ escapeHtml(state.dr.saveErrorDetail) })` : "" }</div>` : "" }<div class="section-head"><div><div class="eyebrow">${ done }/${ items.length } verifye jodi a</div><h2 class="h2">Envantè Jounalye</h2></div><div class="toolbar"><div class="search-wrap"><span class="search-icon">${ icon("search", 14) }</span><input class="input" id="f-dr-search" placeholder="Chèche kontenè, divizyon, depo oswa trucking..." value="${ escapeHtml(state.dr.search) }" /></div></div></div><p style="font-size:12.5px;color:var(--muted);margin-top:-10px;margin-bottom:16px">Kontenè Full, Poko Verifye ak Vid yo soti nan Lojistik. Sa w make oswa chanje isit la (verifikasyon, depo, trucking) rete nan Daily Report sèlman. Sèl bouton Verifye a ki sove nan Lojistik tou. Lis verifikasyon an re-mize a zèro chak jou.</p>${ dailyReportBar() }<div style="display:flex;flex-direction:column;gap:8px">${ items.length === 0 ? `<div class="empty">${ icon("circle", 22) }<div>Pa gen kontenè pou envantè kounye a.</div></div>` : rows }</div></main><div style="text-align:center;font-size:10px;color:var(--muted-light);padding:20px">© ${ new Date().getFullYear() } Deka Group · v1.0</div></div>`;
}
