// Talking to the server: fetch wrapper, loading, saving (with conflict handling), polling, actions, toasts.
import { translateDom } from "./i18n.js";
import { markOffline, syncNow } from "./offline.js";
import {
  addRejected,
  countPending,
  dropLastSession,
  dropSnapshot,
  enqueue,
  isNetworkError,
  keepRecovery,
  loadRejectedCount,
  loadSnapshot,
  makeBase,
  makeId,
  mergeState,
  saveSnapshot,
  saveSnapshotSoon,
  timedFetch
} from "./outbox.js";
import { render } from "./render.js";
import {
  TAB_ID,
  state
} from "./state.js";
import {
  escapeHtml,
  formatTime,
  getDeviceId,
  newId,
  statusOf,
  today
} from "./utils.js";
import { accountButton } from "./views/account.js";
import { helpButton } from "./views/help.js";
import { loadDailyState } from "./views/daily.js";

function restoreSnapshot(snap) {
  state.containers = snap.containers || [];
  state.bills = snap.bills || [];
  state.notifications = snap.notifications || [];
  state.inventoryChecks = snap.inventoryChecks || {};
  state.rev = typeof snap.rev === "number" ? snap.rev : undefined;
  state.base = snap.base || null;
  if (snap.stock) {
    state.stockEntries = snap.stock;
    state.stockLoaded = true;
  }
  if (snap.invoices) {
    state.invoices = snap.invoices;
    state.invoicesLoaded = true;
  }
  if (snap.goods) {
    state.goodsIncidents = snap.goods;
    state.goodsLoaded = true;
  }
  if (snap.dr) {
    state.dr.checks = snap.dr.checks || {};
    state.dr.overrides = snap.dr.overrides || {};
    state.dr.loaded = true;
  }
  state.lastSyncTime = snap.savedAt ? new Date(snap.savedAt) : null;
}

export function loadData() {
  state.loadingData = true;
  state.loadError = false;
  state.loadErrorDetail = "";
  state.offlineData = false;
  Promise.all([countPending(), loadRejectedCount(), loadSnapshot()]).then(function (r) {
    var snap = r[2];
    if (snap && snap.dirty && typeof snap.rev === "number") {
      // Work done without network and not sent yet: it stays the truth on this screen until it is sent.
      restoreSnapshot(snap);
      state.dirty = true;
      state.loadingData = false;
      render();
      loadDailyState();
      syncNow();
      return;
    }
    return apiFetch("/api/data").then(function (e) {
      return e.ok ? e.json() : e.text().then(function (n) {
        throw new Error(`HTTP ${ e.status }: ${ n || e.statusText }`);
      });
    }).then(function (e) {
      applyData(e, true);
      state.loadingData = false;
      render();
      loadDailyState();
      syncNow();
    }).catch(function (e) {
      if (isNetworkError(e) && snap) {
        restoreSnapshot(snap);
        state.offlineData = true;
        state.loadingData = false;
        markOffline();
        render();
        return;
      }
      state.loadingData = false;
      state.loadError = true;
      state.loadErrorDetail = e && e.message ? e.message : String(e);
      render();
    });
  });
}

function localPending() {
  return !state.online && (state.dirty || state.pendingCount > 0);
}

function renderSyncStatus() {
  var e = document.querySelector(".sidebar-foot");
  if (e) {
    e.innerHTML = `<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px"><span class="dot${ state.saveErr && !localPending() ? " err" : "" }"></span>${ localPending() ? "Chanjman yo sove sou aparèy la \u2014 y ap voye lè entènèt la tounen" : state.saveErr ? "Erè pandan sovgad \u2014 chanjman an lokal sèlman" : "Done yo sove nan baz done pataje a" }</div>${ state.lastSyncTime ? `<div style="font-size:10.5px;color:var(--steel-light);margin-bottom:8px">Dènye sinkwonizasyon: ${ formatTime(state.lastSyncTime) }</div>` : "" }${ helpButton("var(--steel-light)") + accountButton("var(--steel-light)") }<button class="linklike" data-action="logout" style="color:var(--steel-light)">${ escapeHtml("undo", 12) } Dekonekte</button><div style="font-size:10px;color:var(--steel-light);margin-top:10px;opacity:.7">© ${ new Date().getFullYear() } Deka Group · v1.0</div>`;
    translateDom(e);
    if (state.saveErr && state.saveErrorDetail) {
      e.title = state.saveErrorDetail;
    }
  }
}

function mergeRowFingerprints(fingerprints) {
  if (!fingerprints) {
    return;
  }
  var f = function (list, m) {
    return m ? list.map(function (x) {
      return m[x.id] ? Object.assign({}, x, { _h: m[x.id] }) : x;
    }) : list;
  };
  state.containers = f(state.containers, fingerprints.containers);
  state.bills = f(state.bills, fingerprints.bills);
}

function localCopy() {
  return {
    containers: state.containers,
    bills: state.bills,
    notifications: state.notifications,
    inventoryChecks: state.inventoryChecks
  };
}

function parseResponse(n) {
  return n.json().catch(function () {
    return {};
  }).then(function (d) {
    return {
      n: n,
      d: d
    };
  });
}

// The admin's changes travel as a whole data set. Every call marks the local copy as "not sent yet" and keeps it on the
// device; the mark is removed only when the server confirmed. Returns a promise that ends when everything is sent.
export function saveData() {
  state.dirty = true;
  saveSnapshot();
  if (!state.online) {
    renderSyncStatus();
    return Promise.resolve();
  }
  if (state.saving) {
    state.savePending = true;
    return state.savePromise || Promise.resolve();
  }
  state.saving = true;
  state.savePromise = doSave(false).then(function () {
    state.savePromise = null;
  });
  return state.savePromise;
}

function doSave(retried) {
  var e = JSON.stringify({
    containers: state.containers,
    bills: state.bills,
    notifications: state.notifications,
    inventoryChecks: state.inventoryChecks,
    rev: state.rev,
    cid: TAB_ID
  });
  return apiFetch("/api/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": getDeviceId()
    },
    body: e
  }).then(parseResponse).then(function (x) {
    var n = x.n;
    var d = x.d;
    if (n.ok) {
      state.saving = false;
      state.saveErr = false;
      state.saveErrorDetail = "";
      mergeRowFingerprints(d.hashes);
      if (state.savePending) {
        state.savePending = false;
        state.saving = true;
        return doSave(false);
      }
      state.dirty = false;
      state.base = makeBase(localCopy());
      saveSnapshot();
      renderSyncStatus();
      return;
    }
    if (n.status === 401) {
      // Session ended: the work stays on the device (still marked "not sent") and goes out after the next login.
      state.saving = false;
      return;
    }
    if (n.status === 409 && d && d.code === "conflict" && d.conflicts && d.conflicts.length && !retried) {
      return resolveConflicts(d);
    }
    state.saving = false;
    state.savePending = false;
    state.saveErr = true;
    state.saveErrorDetail = d && d.error ? d.error : "HTTP " + n.status;
    renderSyncStatus();
    showToast(`Chanjman an pa sove: ${ state.saveErrorDetail }`);
    if (n.status === 400 || n.status === 409) {
      // The server refuses this copy: keep it aside (never lost), then show the server's data.
      return keepRecovery(state.saveErrorDetail).then(function () {
        state.dirty = false;
        return refreshData(true);
      });
    }
  }).catch(function (n) {
    state.saving = false;
    state.savePending = false;
    state.saveErr = true;
    state.saveErrorDetail = n && n.message ? n.message : String(n);
    if (isNetworkError(n)) {
      markOffline();
    }
    renderSyncStatus();
  });
}

// Somebody else changed some of the same rows while this device was offline: keep every other change, give the
// server's version for the rows in conflict, tell the person which ones, and send again.
function resolveConflicts(d) {
  var ids = d.conflicts.map(function (c) {
    return c.id;
  });
  return apiFetch("/api/data").then(function (r) {
    if (!r.ok) {
      throw new Error("HTTP " + r.status);
    }
    return r.json();
  }).then(function (fresh) {
    var merged = mergeState(localCopy(), state.base, fresh, ids);
    state.containers = merged.containers;
    state.bills = merged.bills;
    state.notifications = merged.notifications;
    state.inventoryChecks = merged.inventoryChecks;
    state.rev = merged.rev;
    var names = d.conflicts.slice(0, 8).map(function (c) {
      return c.numewo || c.id;
    }).join(", ");
    return addRejected({
      kind: "data",
      label: names,
      error: "Yon lòt moun te chanje kontenè sa yo anvan chanjman ou yo rive. Se vèsyon sèvè a ki rete."
    }).then(function () {
      return loadRejectedCount();
    }).then(function () {
      showToast("Kèk chanjman pa t ka pase (konfli). Gade nan lis la.");
      render();
      state.saving = true;
      return doSave(true);
    });
  }).catch(function (e) {
    state.saving = false;
    state.savePending = false;
    state.saveErr = true;
    state.saveErrorDetail = e && e.message ? e.message : String(e);
    if (isNetworkError(e)) {
      markOffline();
    }
    renderSyncStatus();
  });
}

export function showToast(message) {
  var n = newId();
  state.toasts.push({
    id: n,
    message: message
  });
  render();
  setTimeout(function () {
    state.toasts = state.toasts.filter(function (i) {
      return i.id !== n;
    });
    render();
  }, 5000);
}

export function pollData() {
  if (state.online && !state.modal) {
    var active = document.activeElement;
    if (!(active && (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA") || !state.authRole || state.loadingData || state.loadError)) {
      apiFetch("/api/data").then(function (n) {
        if (!n.ok) {
          throw new Error("bad response");
        }
        return n.json();
      }).then(function (n) {
        applyData(n);
        render();
        loadDailyState();
      }).catch(function () {
      });
    }
  }
}

export function apiFetch(url, options) {
  options = options || {};
  options.credentials = "same-origin";
  var limit = url.indexOf("/api/scan") === 0 ? 90000 : 20000;
  return timedFetch(url, options, limit).then(function (r) {
    if (r.status === 401 && state.authRole) {
      var c = r.clone ? r.clone() : r;
      c.json().then(function (d) {
        if (d && d.code === "unauthenticated") {
          sessionExpired();
        }
      }).catch(function () {
      });
    }
    return r;
  }, function (e) {
    if (isNetworkError(e)) {
      markOffline();
    }
    throw e;
  });
}

function sessionExpired() {
  if (state.sessionEnded) {
    return;
  }
  state.sessionEnded = true;
  state.lastSyncTime = null;
  state.name = "";
  state.needs = null;
  state.personal = false;
  state.acct = false;
  state.help = false;
  state.rev = undefined;
  state.saving = false;
  state.savePending = false;
  state.sessionRole = null;
  state.authRole = null;
  state.username = "";
  state.unlocked = false;
  state.depotUnlocked = false;
  state.drUnlocked = false;
  state.dr.loaded = false;
  state.role = null;
  state.containers = [];
  state.bills = [];
  state.notifications = [];
  state.inventoryChecks = {};
  dropLastSession();
  if (!state.dirty) {
    dropSnapshot();
  }
  showToast("Sesyon an fini. Konekte ankò.");
  render();
}

function applyData(data, force) {
  if (!force && (state.dirty || state.saving || state.pendingCount > 0)) {
    return;
  }
  if (!force && typeof data.rev === "number" && typeof state.rev === "number" && data.rev < state.rev) {
    return;
  }
  if (typeof data.rev === "number") {
    state.rev = data.rev;
  }
  state.containers = data.containers || [];
  state.bills = data.bills || [];
  state.notifications = data.notifications || [];
  state.inventoryChecks = data.inventoryChecks || {};
  state.lastSyncTime = new Date;
  state.offlineData = false;
  state.base = makeBase(data);
  saveSnapshotSoon();
}

export function refreshData(force) {
  return apiFetch("/api/data").then(function (r) {
    if (!r.ok) {
      throw new Error("HTTP " + r.status);
    }
    return r.json();
  }).then(function (d) {
    applyData(d, force === true);
    render();
  }).catch(function () {
  });
}

// Same rules as the server's actions, applied on the screen while the request waits for the network.
function applyActLocally(b) {
  var t = today();
  function note(message) {
    state.notifications = [{ id: newId(), billNumewo: "", date: t, message: message }].concat(state.notifications).slice(0, 200);
  }
  var find = function (id) {
    return state.containers.find(function (c) {
      return c.id === id;
    });
  };
  if (b.action === "markEmpty") {
    var c = find(b.id);
    if (c && statusOf(c) === "full") {
      state.containers = state.containers.map(function (x) {
        return x.id === c.id ? Object.assign({}, x, { dateEmpty: t }) : x;
      });
      note("Kontenè " + c.numewo + " vid kounye a.");
    }
  } else if (b.action === "transfer") {
    var d = find(b.id);
    if (d && !d.dateLeft) {
      state.containers = state.containers.map(function (x) {
        return x.id === d.id ? Object.assign({}, x, { depo: b.depo, trucking: b.trucking || null }) : x;
      });
      note("Kontenè " + d.numewo + " transfere nan depo " + b.depo + ".");
    }
  } else if (b.action === "depart") {
    var ids = b.ids || [];
    state.containers = state.containers.map(function (x) {
      if (ids.indexOf(x.id) === -1 || statusOf(x) !== "vid") {
        return x;
      }
      note("Kontenè " + x.numewo + " kite ak chofè " + b.trucking + ".");
      return Object.assign({}, x, { dateLeft: t });
    });
  }
}

function actLabel(b) {
  var c = b.id ? state.containers.find(function (x) {
    return x.id === b.id;
  }) : null;
  if (b.action === "markEmpty") {
    return "Vid: " + (c ? c.numewo : "");
  }
  if (b.action === "transfer") {
    return "Transfè: " + (c ? c.numewo : "") + " \u2192 " + b.depo;
  }
  return "Depa: " + (b.ids || []).length + " kontenè (" + b.trucking + ")";
}

// Waits in the outbox; the screen already shows the result.
export function queueRequest(kind, url, body, label, maybeDone, quiet) {
  state.pendingCount++;
  return enqueue(kind, url, body, label, { maybeDone: !!maybeDone }).then(function () {
    saveSnapshotSoon();
    if (!quiet) {
      showToast("Sove sou aparèy la. L ap voye lè entènèt la tounen.");
    }
    render();
  });
}

function queueAct(body, onOk, maybeDone) {
  applyActLocally(body);
  queueRequest("act", "/api/act", body, actLabel(body), maybeDone);
  if (onOk && body.action === "depart") {
    onOk({ queued: true, result: { left: (body.ids || []).length } });
  }
  render();
}

export function apiAct(body, onOk) {
  if (!state.online || state.pendingCount > 0) {
    queueAct(body, onOk, false);
    return;
  }
  apiFetch("/api/act", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": getDeviceId()
    },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().catch(function () {
      return {};
    }).then(function (d) {
      if (!r.ok) {
        var er = new Error(d && d.error ? d.error : "HTTP " + r.status);
        er.status = r.status;
        throw er;
      }
      return d;
    });
  }).then(function (d) {
    if (d.data) {
      applyData(d.data);
    }
    state.saveErr = false;
    if (onOk) {
      onOk(d);
    }
    render();
  }).catch(function (e) {
    if (e && e.status === 401) {
      return;
    }
    if (isNetworkError(e)) {
      // The request may or may not have arrived: keep it, it is safe to send again.
      queueAct(body, onOk, true);
      return;
    }
    state.saveErr = true;
    state.saveErrorDetail = e && e.message ? e.message : String(e);
    if (state.online) {
      showToast("Erè: " + state.saveErrorDetail);
      refreshData();
    } else {
      render();
    }
  });
}

export function apiJson(url, body2) {
  return apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body2)
  }).then(function (r) {
    return r.json().catch(function () {
      return {};
    }).then(function (d) {
      if (!r.ok) {
        var e = new Error(d && d.error ? d.error : "HTTP " + r.status);
        e.status = r.status;
        e.code = d && d.code;
        throw e;
      }
      return d;
    });
  });
}

// Same checks as the server's, used only when the request has to wait for the network.
function validateOffline(kind, p) {
  if (!p.billId || !state.bills.some(function (b) {
      return b.id === p.billId;
    })) {
    return "Chwazi yon Bill.";
  }
  if (kind === "stock" || kind === "goods") {
    if (!String(p.description || "").trim()) {
      return "Deskripsyon an obligatwa.";
    }
    if (!String(p.unit || "").trim()) {
      return "Inite a (egz. sak, kolo) obligatwa.";
    }
    var q = String(p.quantity || "").trim();
    if (!q || !/^\d+(\.\d{1,2})?$/.test(q) || Number(q) <= 0) {
      return "Kantite a dwe yon nonm ki pi gran pase 0.";
    }
    if (kind === "goods" && !String(p.reason || "").trim()) {
      return p.kind === "livrezon" ? "Non kliyan an obligatwa." : "Rezon an obligatwa.";
    }
  }
  if (kind === "invoice") {
    if (!String(p.clientName || "").trim()) {
      return "Non kliyan an obligatwa.";
    }
    var items = p.items || [];
    var bad = !items.length || items.some(function (it) {
      var qty = parseFloat(it.qty);
      var price = parseFloat(it.unitPrice);
      return !String(it.description || "").trim() || !isFinite(qty) || qty <= 0 || !isFinite(price) || price < 0;
    });
    if (bad) {
      return "Ajoute omwen yon liy ak deskripsyon, kantite ak pri ki valid.";
    }
  }
  return "";
}

// Creates a record on the server, or (no network) keeps it in the outbox and shows it right away marked as waiting.
// The record's id is chosen here, so sending it twice can never create two.
function createOrQueue(spec) {
  var payload = Object.assign({ action: "create", clientId: makeId() }, spec.payload);
  state[spec.busy] = true;
  state[spec.err] = "";
  render();
  function queue(maybeDone) {
    var problem = validateOffline(spec.kind, payload);
    if (problem) {
      state[spec.busy] = false;
      state[spec.err] = problem;
      render();
      return;
    }
    var rec = spec.build(payload);
    rec._pending = true;
    state[spec.list] = [rec].concat(state[spec.list]);
    if (spec.after) {
      spec.after();
    }
    state[spec.busy] = false;
    queueRequest(spec.kind, spec.url, payload, spec.label(payload), maybeDone);
  }
  if (!state.online || state.pendingCount > 0) {
    queue(false);
    return;
  }
  apiJson(spec.url, payload).then(function (d) {
    state[spec.busy] = false;
    if (d[spec.field]) {
      state[spec.list] = [d[spec.field]].concat(state[spec.list].filter(function (x) {
        return x.id !== d[spec.field].id;
      }));
      if (spec.after) {
        spec.after();
      }
    }
    showToast(spec.done(payload));
    saveSnapshotSoon();
    render();
  }).catch(function (e) {
    if (isNetworkError(e)) {
      queue(true);
      return;
    }
    state[spec.busy] = false;
    state[spec.err] = e && e.message ? e.message : String(e);
    render();
  });
}

// Loads a list from the server; without network, keeps the copy already on the device.
function loadList(spec) {
  state[spec.loading] = true;
  state[spec.err] = "";
  render();
  apiGet(spec.url).then(function (d) {
    if (state.pendingCount === 0) {
      state[spec.list] = d[spec.field] || [];
    }
    state[spec.loaded] = true;
    state[spec.loading] = false;
    saveSnapshotSoon();
    render();
  }).catch(function (e) {
    state[spec.loading] = false;
    if (isNetworkError(e) && state[spec.loaded]) {
      render();
      return;
    }
    state[spec.err] = e && e.message ? e.message : String(e);
    render();
  });
}

export function loadStockEntries() {
  loadList({ url: "/api/stock", field: "entries", list: "stockEntries", loaded: "stockLoaded", loading: "stockLoading", err: "stockErr" });
}

export function createStockEntry(payload) {
  createOrQueue({
    kind: "stock",
    url: "/api/stock",
    payload: payload,
    busy: "stockBusy",
    err: "stockErr",
    list: "stockEntries",
    field: "entry",
    label: function (p) {
      return "Antre estòk: " + p.description;
    },
    done: function () {
      return "Antre estòk la anrejistre.";
    },
    build: function (p) {
      return {
        id: p.clientId,
        billId: p.billId,
        entryDate: p.entryDate || today(),
        description: p.description,
        quantity: p.quantity,
        unit: p.unit,
        containerNumewo: p.containerNumewo || null,
        remarks: p.remarks || null,
        registeredBy: state.username,
        createdAt: new Date().toISOString()
      };
    }
  });
}

export function loadInvoices() {
  loadList({ url: "/api/invoices", field: "invoices", list: "invoices", loaded: "invoicesLoaded", loading: "invoicesLoading", err: "invoicesErr" });
}

export function createInvoice(payload) {
  createOrQueue({
    kind: "invoice",
    url: "/api/invoices",
    payload: payload,
    busy: "invoiceBusy",
    err: "invoicesErr",
    list: "invoices",
    field: "invoice",
    label: function (p) {
      return "Fakti: " + (p.invoiceNumber || p.clientName);
    },
    done: function () {
      return "Fakti a anrejistre.";
    },
    after: function () {
      state.invoiceDraft = {
        billId: "",
        invoiceNumber: "",
        invoiceDate: "",
        dueDate: "",
        clientName: "",
        clientAddress: "",
        notes: "",
        items: [{ description: "", qty: "", unitPrice: "" }]
      };
    },
    build: function (p) {
      var bill = state.bills.find(function (b) {
        return b.id === p.billId;
      });
      var date = p.invoiceDate || today();
      return {
        id: p.clientId,
        billId: p.billId,
        invoiceNumber: p.invoiceNumber || "FACT-" + String(bill ? bill.numewo : "").replace(/[^A-Za-z0-9]/g, "") + "-" + date.replace(/-/g, ""),
        invoiceDate: date,
        dueDate: p.dueDate || null,
        clientName: p.clientName,
        clientAddress: p.clientAddress || null,
        items: (p.items || []).map(function (it) {
          return { description: it.description, qty: parseFloat(it.qty), unitPrice: parseFloat(it.unitPrice) };
        }),
        notes: p.notes || null,
        status: "anrejistre",
        createdBy: state.username,
        createdAt: new Date().toISOString(),
        finishedBy: null,
        finishedAt: null
      };
    }
  });
}

export function finishInvoice(id) {
  function markLocal() {
    state.invoices = state.invoices.map(function (inv) {
      return inv.id === id ? Object.assign({}, inv, { status: "fini", finishedBy: state.username, finishedAt: new Date().toISOString(), _pending: true }) : inv;
    });
  }
  function queue() {
    markLocal();
    queueRequest("invoice-finish", "/api/invoices", { action: "finish", id: id }, "Fakti fini", false);
  }
  if (!state.online || state.pendingCount > 0) {
    queue();
    return;
  }
  state.invoiceBusy = true;
  render();
  apiJson("/api/invoices", { action: "finish", id: id }).then(function (d) {
    state.invoiceBusy = false;
    if (d.invoice) {
      state.invoices = state.invoices.map(function (inv) {
        return inv.id === d.invoice.id ? d.invoice : inv;
      });
    }
    showToast("Fakti a make Fini.");
    saveSnapshotSoon();
    render();
  }).catch(function (e) {
    state.invoiceBusy = false;
    if (isNetworkError(e)) {
      queue();
      return;
    }
    showToast("Erè: " + (e && e.message ? e.message : String(e)));
    render();
  });
}

export function loadGoodsIncidents() {
  loadList({ url: "/api/goods", field: "incidents", list: "goodsIncidents", loaded: "goodsLoaded", loading: "goodsLoading", err: "goodsErr" });
}

export function createGoodsIncident(payload) {
  createOrQueue({
    kind: "goods",
    url: "/api/goods",
    payload: payload,
    busy: "goodsBusy",
    err: "goodsErr",
    list: "goodsIncidents",
    field: "incident",
    label: function (p) {
      return (p.kind === "livrezon" ? "Livrezon: " : p.kind === "avarye" ? "Avarye: " : "Retou: ") + p.description;
    },
    done: function (p) {
      return p.kind === "avarye" ? "Machandiz avarye a anrejistre." : p.kind === "livrezon" ? "Livrezon an anrejistre." : "Retou a anrejistre.";
    },
    build: function (p) {
      return {
        id: p.clientId,
        kind: p.kind,
        billId: p.billId,
        entryDate: p.entryDate || today(),
        description: p.description,
        quantity: p.quantity,
        unit: p.unit,
        reason: p.reason,
        remarks: p.remarks || null,
        registeredBy: state.username,
        createdAt: new Date().toISOString()
      };
    }
  });
}

export function apiGet(url) {
  return apiFetch(url).then(function (r) {
    return r.json().catch(function () {
      return {};
    }).then(function (d) {
      if (!r.ok) {
        var e = new Error(d && d.error ? d.error : "HTTP " + r.status);
        e.status = r.status;
        e.code = d && d.code;
        throw e;
      }
      return d;
    });
  });
}
