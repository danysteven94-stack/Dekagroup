// Working without network. The browser's online/offline events are not enough (a weak connection stays "online" while
// nothing gets through), so a failed request also switches the app to offline mode and a small probe watches for the
// network to come back. When it does, everything kept on the device is sent, in order.
import {
  loadGoodsIncidents,
  loadInvoices,
  loadSlips,
  loadStockEntries,
  refreshData,
  saveData,
  showToast
} from "./api.js";
import {
  countPending,
  flush,
  loadRejectedCount,
  timedFetch
} from "./outbox.js";
import { render } from "./render.js";
import { state } from "./state.js";
import { loadDailyState } from "./views/daily.js";

var probeTimer = null;

// Any answer from the server (even "not logged in") means the network is back.
function probe() {
  return timedFetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" }, 8000).then(function () {
    return true;
  }, function () {
    return false;
  });
}

export function markOffline() {
  if (state.online) {
    state.online = false;
    render();
  }
  if (!probeTimer) {
    probeTimer = setInterval(function () {
      probe().then(function (ok) {
        if (ok) {
          goOnline();
        }
      });
    }, 8000);
  }
}

export function goOnline() {
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
  var wasOffline = !state.online;
  state.online = true;
  if (wasOffline) {
    render();
  }
  syncNow();
}

function reloadAfterFlush(kinds) {
  if (kinds.stock) {
    loadStockEntries();
  }
  if (kinds.goods) {
    loadGoodsIncidents();
  }
  if (kinds.slip) {
    loadSlips();
  }
  if (kinds.invoice || kinds["invoice-finish"]) {
    loadInvoices();
  }
  if (kinds.daily || kinds.verify || kinds.leave) {
    loadDailyState();
  }
}

var syncing = false;

// Sends the unsent data set first (the admin's full save), then the waiting requests, then refreshes the screen.
export function syncNow() {
  if (syncing || !state.authRole || !state.online) {
    return Promise.resolve();
  }
  syncing = true;
  state.syncing = true;
  render();
  var hadUnsent = state.dirty;
  var first = state.dirty ? saveData() : Promise.resolve();
  return first.then(function () {
    return flush();
  }).then(function (res) {
    if (res.stop === "auth") {
      showToast("Sesyon an fini. Rekonekte pou voye chanjman ki rete yo.");
    }
    if (res.rejected) {
      showToast(res.rejected + " chanjman pa t pase. Gade lis la.");
    }
    if (res.sent) {
      reloadAfterFlush(res.kinds);
    }
    return loadRejectedCount().then(function () {
      if ((hadUnsent || res.sent || res.rejected) && !state.dirty && state.pendingCount === 0 && !res.stop) {
        return refreshData(true);
      }
    });
  }).catch(function () {
  }).then(function () {
    syncing = false;
    state.syncing = false;
    render();
  });
}

export function initOffline() {
  window.addEventListener("online", function () {
    goOnline();
  });
  window.addEventListener("offline", function () {
    state.online = false;
    render();
    markOffline();
  });
  countPending();
  loadRejectedCount();
  // Something may be waiting (sent later, or after a new login) even without a network event.
  setInterval(function () {
    if (state.authRole && state.online && (state.dirty || state.pendingCount > 0)) {
      syncNow();
    }
  }, 20000);
}
