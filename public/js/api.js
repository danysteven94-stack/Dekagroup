// Talking to the server: fetch wrapper, loading, saving (with conflict handling), polling, actions, toasts.
import { translateDom } from "./i18n.js";
import { render } from "./render.js";
import {
  TAB_ID,
  state
} from "./state.js";
import {
  escapeHtml,
  formatTime,
  getDeviceId,
  newId
} from "./utils.js";
import { accountButton } from "./views/account.js";
import { helpButton } from "./views/help.js";
import { loadDailyState } from "./views/daily.js";

export function loadData() {
  state.loadingData = true;
  state.loadError = false;
  state.loadErrorDetail = "";
  apiFetch("/api/data").then(function (e) {
    return e.ok ? e.json() : e.text().then(function (n) {
      throw new Error(`HTTP ${ e.status }: ${ n || e.statusText }`);
    });
  }).then(function (e) {
    applyData(e);
    state.loadingData = false;
    render();
    loadDailyState();
  }).catch(function (e) {
    state.loadingData = false;
    state.loadError = true;
    state.loadErrorDetail = e && e.message ? e.message : String(e);
    render();
  });
}

function renderSyncStatus() {
  var e = document.querySelector(".sidebar-foot");
  if (e) {
    e.innerHTML = `<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px"><span class="dot${ state.saveErr ? " err" : "" }"></span>${ state.saveErr ? "Erè pandan sovgad \u2014 chanjman an lokal sèlman" : "Done yo sove nan baz done pataje a" }</div>${ state.lastSyncTime ? `<div style="font-size:10.5px;color:var(--steel-light);margin-bottom:8px">Dènye sinkwonizasyon: ${ formatTime(state.lastSyncTime) }</div>` : "" }${ helpButton("var(--steel-light)") + accountButton("var(--steel-light)") }<button class="linklike" data-action="logout" style="color:var(--steel-light)">${ escapeHtml("undo", 12) } Dekonekte</button><div style="font-size:10px;color:var(--steel-light);margin-top:10px;opacity:.7">© ${ new Date().getFullYear() } Deka Group · v1.0</div>`;
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

export function saveData() {
  if (state.saving) {
    state.savePending = true;
    return;
  }
  state.saving = true;
  var e = JSON.stringify({
    containers: state.containers,
    bills: state.bills,
    notifications: state.notifications,
    inventoryChecks: state.inventoryChecks,
    rev: state.rev,
    cid: TAB_ID
  });
  apiFetch("/api/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": getDeviceId()
    },
    body: e
  }).then(function (n) {
    return n.json().catch(function () {
      return {};
    }).then(function (d) {
      return {
        n: n,
        d: d
      };
    });
  }).then(function (x) {
    var n = x.n;
    var d = x.d;
    if (state.saving = false, !n.ok) {
      if (n.status === 401) {
        return;
      }
      state.savePending = false;
      state.saveErr = true;
      state.saveErrorDetail = d && d.error ? d.error : "HTTP " + n.status;
      renderSyncStatus();
      showToast(`Chanjman an pa sove: ${ state.saveErrorDetail }`);
      if (n.status === 400 || n.status === 409) {
        refreshData();
      }
      return;
    }
    state.saveErr = false;
    state.saveErrorDetail = "";
    mergeRowFingerprints(d.hashes);
    renderSyncStatus();
    if (state.savePending) {
      state.savePending = false;
      saveData();
    }
  }).catch(function (n) {
    state.saving = false;
    state.savePending = false;
    state.saveErr = true;
    state.saveErrorDetail = n && n.message ? n.message : String(n);
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
  if (!state.modal) {
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
  return fetch(url, options).then(function (r) {
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
  showToast("Sesyon an fini. Konekte ankò.");
  render();
}

function applyData(data) {
  if (typeof data.rev === "number" && typeof state.rev === "number" && data.rev < state.rev) {
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
}

export function refreshData() {
  apiFetch("/api/data").then(function (r) {
    if (!r.ok) {
      throw new Error("HTTP " + r.status);
    }
    return r.json();
  }).then(function (d) {
    applyData(d);
    render();
  }).catch(function () {
  });
}

export function apiAct(body, onOk) {
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

export function loadStockEntries() {
  state.stockLoading = true;
  state.stockErr = "";
  render();
  apiGet("/api/stock").then(function (d) {
    state.stockEntries = d.entries || [];
    state.stockLoaded = true;
    state.stockLoading = false;
    render();
  }).catch(function (e) {
    state.stockLoading = false;
    state.stockErr = e && e.message ? e.message : String(e);
    render();
  });
}

export function createStockEntry(payload) {
  state.stockBusy = true;
  state.stockErr = "";
  render();
  apiJson("/api/stock", Object.assign({ action: "create" }, payload)).then(function (d) {
    state.stockBusy = false;
    if (d.entry) {
      state.stockEntries = [d.entry].concat(state.stockEntries);
    }
    showToast("Antre estòk la anrejistre.");
    render();
  }).catch(function (e) {
    state.stockBusy = false;
    state.stockErr = e && e.message ? e.message : String(e);
    render();
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
