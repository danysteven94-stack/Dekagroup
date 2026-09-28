// Offline work: requests made without network wait in an outbox (IndexedDB) and are sent, in order, when the network is
// back; the last data seen is cached so the app opens and works without network. Nothing is dropped silently: a request
// the server definitively refuses is kept in a "rejected" list the person can read.
import * as DB from "./offlinedb.js";
import { state } from "./state.js";
import { getDeviceId } from "./utils.js";

var seq = 0;

export function makeId() {
  var a = new Uint8Array(10);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(a);
  } else {
    for (var i = 0; i < a.length; i++) {
      a[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.prototype.map.call(a, function (b) {
    return (b < 16 ? "0" : "") + b.toString(16);
  }).join("");
}

export function who() {
  return state.username || state.sessionUser || "";
}

export function scope() {
  return who() + "|" + (state.pool || "default");
}

// ---------- network helpers ----------
export function isNetworkError(e) {
  return !!e && (e.name === "TypeError" || e.name === "AbortError" || e.isNetwork === true);
}

// fetch that gives up after `ms` (a weak connection can hang for minutes instead of failing).
export function timedFetch(url, options, ms) {
  options = Object.assign({}, options || {});
  if (typeof AbortController === "undefined" || options.signal) {
    return fetch(url, options);
  }
  var ctl = new AbortController();
  options.signal = ctl.signal;
  var timer = setTimeout(function () {
    ctl.abort();
  }, ms || 20000);
  return fetch(url, options).then(function (r) {
    clearTimeout(timer);
    return r;
  }, function (e) {
    clearTimeout(timer);
    throw e;
  });
}

// ---------- outbox ----------
function mine(item) {
  return item.user === who();
}

export function enqueue(kind, url, body, label, extra) {
  var item = Object.assign({
    id: makeId(),
    seq: Date.now() * 1000 + (seq++ % 1000),
    user: who(),
    pool: state.pool || "default",
    kind: kind,
    url: url,
    body: body,
    label: label || kind,
    createdAt: new Date().toISOString()
  }, extra || {});
  return DB.outboxPut(item).then(function () {
    return countPending();
  }).then(function () {
    return item;
  });
}

export function countPending() {
  return DB.outboxAll().then(function (items) {
    state.pendingCount = items.filter(mine).length;
    return state.pendingCount;
  });
}

function rejectedKey() {
  return "rejected:" + who();
}

export function rejectedList() {
  return DB.kvGet(rejectedKey()).then(function (l) {
    return Array.isArray(l) ? l : [];
  });
}

export function addRejected(entry) {
  return rejectedList().then(function (l) {
    l.unshift(Object.assign({ id: makeId(), at: new Date().toISOString() }, entry));
    l = l.slice(0, 50);
    state.rejectedCount = l.length;
    return DB.kvSet(rejectedKey(), l);
  });
}

export function dismissRejected(id) {
  return rejectedList().then(function (l) {
    l = id ? l.filter(function (x) {
      return x.id !== id;
    }) : [];
    state.rejectedCount = l.length;
    return DB.kvSet(rejectedKey(), l);
  });
}

export function loadRejectedCount() {
  return rejectedList().then(function (l) {
    state.rejectedCount = l.length;
    return l.length;
  });
}

var flushing = false;

// Sends the waiting requests of the person and division currently active, oldest first.
// Stops at the first network / server / login problem (retry later); a definitive refusal (4xx) goes to the rejected list.
export function flush() {
  if (flushing) {
    return Promise.resolve({ sent: 0, rejected: 0, stop: "busy", kinds: {} });
  }
  flushing = true;
  var out = { sent: 0, rejected: 0, stop: "", kinds: {} };
  return DB.outboxAll().then(function (items) {
    var todo = items.filter(function (i) {
      return mine(i) && i.pool === (state.pool || "default");
    });
    function next(idx) {
      if (idx >= todo.length) {
        return Promise.resolve();
      }
      var item = todo[idx];
      return timedFetch(item.url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": getDeviceId(),
          "X-Idempotency-Key": item.id
        },
        body: JSON.stringify(item.body)
      }, 30000).then(function (r) {
        if (r.ok) {
          out.sent++;
          out.kinds[item.kind] = true;
          return DB.outboxDel(item.id).then(function () {
            return next(idx + 1);
          });
        }
        return r.json().catch(function () {
          return {};
        }).then(function (d) {
          if (r.status === 401) {
            out.stop = "auth";
            return;
          }
          if (r.status === 408 || r.status === 429 || r.status >= 500) {
            out.stop = "server";
            return;
          }
          // The request was already applied before the connection dropped (act replayed): nothing to report.
          if (item.maybeDone && r.status === 409 && d && d.code === "wrong_status") {
            return DB.outboxDel(item.id).then(function () {
              out.sent++;
              return next(idx + 1);
            });
          }
          out.rejected++;
          return addRejected({
            kind: item.kind,
            label: item.label,
            error: d && d.error ? d.error : "HTTP " + r.status,
            body: item.body
          }).then(function () {
            return DB.outboxDel(item.id);
          }).then(function () {
            return next(idx + 1);
          });
        });
      }, function () {
        out.stop = "network";
      });
    }
    return next(0);
  }).then(function () {
    return countPending();
  }).then(function () {
    flushing = false;
    return out;
  }, function (e) {
    flushing = false;
    throw e;
  });
}

// ---------- cached data ----------
function snapKey() {
  return "snap:" + scope();
}

export function rowsIndex(list) {
  var m = {};
  (list || []).forEach(function (r) {
    m[r.id] = JSON.stringify(r);
  });
  return m;
}

// What the server last told us, to tell later which rows the person changed offline.
export function makeBase(data) {
  var checks = {};
  Object.keys(data.inventoryChecks || {}).forEach(function (k) {
    checks[k] = JSON.stringify(data.inventoryChecks[k]);
  });
  return { containers: rowsIndex(data.containers), bills: rowsIndex(data.bills), checks: checks };
}

export function saveSnapshot() {
  if (!who()) {
    return Promise.resolve();
  }
  var snap = {
    v: 1,
    savedAt: Date.now(),
    rev: state.rev === undefined ? null : state.rev,
    dirty: !!state.dirty,
    containers: state.containers,
    bills: state.bills,
    notifications: state.notifications,
    inventoryChecks: state.inventoryChecks,
    base: state.base || null,
    stock: state.stockLoaded ? state.stockEntries : null,
    invoices: state.invoicesLoaded ? state.invoices : null,
    goods: state.goodsLoaded ? state.goodsIncidents : null,
    dr: state.dr && state.dr.loaded ? { checks: state.dr.checks, overrides: state.dr.overrides } : null
  };
  return DB.kvSet(snapKey(), snap);
}

var snapTimer = null;

export function saveSnapshotSoon() {
  if (snapTimer) {
    return;
  }
  snapTimer = setTimeout(function () {
    snapTimer = null;
    saveSnapshot();
  }, 400);
}

export function loadSnapshot() {
  return DB.kvGet(snapKey());
}

export function dropSnapshot() {
  return DB.kvDel(snapKey());
}

export function saveLastSession(me) {
  return DB.kvSet("me:last", me);
}

export function loadLastSession() {
  return DB.kvGet("me:last");
}

export function dropLastSession() {
  return DB.kvDel("me:last");
}

// Copy of local work that could not be applied, kept so it is never lost.
export function keepRecovery(reason) {
  var key = "recovery:" + scope() + ":" + Date.now();
  return DB.kvSet(key, {
    reason: reason,
    savedAt: new Date().toISOString(),
    containers: state.containers,
    bills: state.bills,
    notifications: state.notifications,
    inventoryChecks: state.inventoryChecks
  });
}

// ---------- three-way merge after a conflict ----------
// Keeps the rows the person changed (or added / deleted) since `base`, takes everything else from the server copy,
// and gives the server's version for the rows in conflict.
export function mergeRows(local, baseIndex, fresh, conflictIds) {
  baseIndex = baseIndex || {};
  var freshMap = {};
  fresh.forEach(function (r) {
    freshMap[r.id] = r;
  });
  var localMap = {};
  local.forEach(function (r) {
    localMap[r.id] = r;
  });
  var out = [];
  local.forEach(function (r) {
    if (!freshMap[r.id] && baseIndex[r.id] === undefined) {
      out.push(r); // added by the person, unknown to the server
    }
  });
  fresh.forEach(function (f) {
    if (conflictIds[f.id]) {
      out.push(f);
      return;
    }
    var l = localMap[f.id];
    if (!l) {
      if (baseIndex[f.id] === undefined) {
        out.push(f); // created by somebody else after our snapshot
      }
      return; // deleted by the person
    }
    var edited = baseIndex[f.id] === undefined || JSON.stringify(l) !== baseIndex[f.id];
    out.push(edited ? l : f);
  });
  return out;
}

export function mergeState(local, base, fresh, conflictIds) {
  base = base || {};
  var conflicts = {};
  (conflictIds || []).forEach(function (id) {
    conflicts[id] = true;
  });
  var have = {};
  (fresh.notifications || []).forEach(function (n) {
    have[n.id] = true;
  });
  var mine2 = (local.notifications || []).filter(function (n) {
    return !have[n.id];
  });
  var checks = Object.assign({}, fresh.inventoryChecks || {});
  Object.keys(local.inventoryChecks || {}).forEach(function (k) {
    var changed = !base.checks || base.checks[k] === undefined || JSON.stringify(local.inventoryChecks[k]) !== base.checks[k];
    if (changed) {
      checks[k] = local.inventoryChecks[k];
    }
  });
  return {
    containers: mergeRows(local.containers || [], base.containers, fresh.containers || [], conflicts),
    bills: mergeRows(local.bills || [], base.bills, fresh.bills || [], conflicts),
    notifications: mine2.concat(fresh.notifications || []).slice(0, 200),
    inventoryChecks: checks,
    rev: fresh.rev
  };
}
