// Login session bookkeeping: what happens after login / logout.
import { loadData, showToast } from "./api.js";
import { syncNow } from "./offline.js";
import {
  dropLastSession,
  dropSnapshot,
  saveLastSession
} from "./outbox.js";
import {
  LS_ADMIN_UNLOCKED,
  LS_DAILY_UNLOCKED,
  LS_DEPOT_UNLOCKED
} from "./constants.js";
import { pushCheck } from "./push.js";
import { render } from "./render.js";
import { state } from "./state.js";
import { storageRemove } from "./utils.js";
import { loadTwoFactor } from "./views/account.js";

export function switchDivision(pool) {
  if (!pool || pool === state.pool || state.divisionSwitching) return;
  if (state.dirty || state.pendingCount > 0) {
    // Work done without network belongs to the current division: send it before leaving.
    state.divisionSwitching = true;
    render();
    syncNow().then(function () {
      state.divisionSwitching = false;
      if (state.dirty || state.pendingCount > 0) {
        showToast("Voye chanjman ki poko voye yo anvan ou chanje divizyon.");
        render();
        return;
      }
      switchDivision(pool);
    });
    return;
  }
  state.divisionSwitching = true;
  render();
  fetch("/api/auth/division", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pool: pool })
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
  }).then(function (x) {
    state.divisionSwitching = false;
    if (x.ok && x.d && x.d.ok) {
      state.pool = x.d.pool;
      state.sessionPool = x.d.pool;
      state.rev = undefined;
      // the payments of the other division's database must not stay on screen
      state.lgBills = [];
      state.paymentsLoaded = false;
      state.paymentsErr = "";
      state.pay.sel = {};
      state.pay.amounts = {};
      state.pay.form = null;
      state.pay.filterDivision = "";
      loadData();
    } else {
      render();
    }
  }).catch(function () {
    state.divisionSwitching = false;
    render();
  });
}

export function logout() {
  // The cached data of this person is erased with the login, unless work is still waiting to be sent.
  if (!state.dirty) {
    dropSnapshot();
  }
  dropLastSession();
  state.dirty = false;
  state.base = null;
  state.pendingCount = 0;
  state.rejectedCount = 0;
  state.offlineData = false;
  state.stockEntries = [];
  state.stockLoaded = false;
  state.invoices = [];
  state.invoicesLoaded = false;
  state.goodsIncidents = [];
  state.goodsLoaded = false;
  state.depotDivision = null;
  state.navDrawerOpen = false;
  state.tab = "dashboard";
  state.lastSyncTime = null;
  state.name = "";
  state.needs = null;
  state.personal = false;
  state.acct = false;
  state.help = false;
  state.gate2fa = false;
  state.pendingGatePassword = "";
  state.gateCanEmail = false;
  state.gateEmailMsg = "";
  state.sessionName = "";
  state.sessionTrucking = "";
  state.sessionNeeds = null;
  state.sessionDivisions = [];
  state.sessionPools = ["default"];
  state.sessionPool = "default";
  state.divisions = [];
  state.pools = ["default"];
  state.pool = "default";
  state.rev = undefined;
  state.saving = false;
  state.savePending = false;
  state.sessionRole = null;
  fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  }).catch(function () {
  });
  state.authRole = null;
  state.username = "";
  state.tour = null;
  state.tourFor = "";
  state.containers = [];
  state.bills = [];
  state.notifications = [];
  state.inventoryChecks = {};
  state.unlocked = false;
  state.depotUnlocked = false;
  state.logistiqueUnlocked = false;
  state.lgBills = [];
  state.paymentsLoaded = false;
  state.paymentsErr = "";
  state.pay = { tab: "bills", sel: {}, amounts: {}, form: null, newForm: null, filterDivision: "", filterStatus: "", search: "" };
  state.drUnlocked = false;
  state.dr.loaded = false;
  storageRemove(LS_DAILY_UNLOCKED);
  state.role = null;
  state.gateError = false;
  state.driverSelected = {};
  state.driverTrucking = "";
  storageRemove(LS_ADMIN_UNLOCKED);
  storageRemove(LS_DEPOT_UNLOCKED);
  render();
}

export function applyAuth(role, username, name, needs, personal, divisions, pools, pool, trucking) {
  state.depotDivision = null;
  state.navDrawerOpen = false;
  state.tab = "dashboard";
  state.lastSyncTime = null;
  state.rev = undefined;
  state.saving = false;
  state.savePending = false;
  state.sessionRole = role;
  state.sessionUser = username || "";
  state.sessionName = name || "";
  // a driver account tied to a trucking by the administrator: the driver page shows it instead of a dropdown
  state.sessionTrucking = trucking || "";
  state.driverTrucking = trucking || "";
  state.sessionNeeds = needs || null;
  state.sessionPersonal = !!personal;
  state.authRole = role;
  state.username = username || "";
  state.unlocked = role === "admin";
  state.depotUnlocked = role === "depot";
  state.logistiqueUnlocked = role === "logistique";
  if (role === "logistique") {
    state.lgBills = [];
    state.paymentsLoaded = false;
    state.paymentsErr = "";
    state.pay = { tab: "bills", sel: {}, amounts: {}, form: null, newForm: null, filterDivision: "", filterStatus: "", search: "" };
  }
  state.drUnlocked = role === "daily";
  state.role = role === "chofe" ? "chofe" : null;
  state.gateError = false;
  state.gateMsg = "";
  state.gateBusy = false;
  state.authChecking = false;
  state.sessionEnded = false;
  state.dr.loaded = false;
  state.name = name || "";
  state.needs = needs || null;
  state.personal = !!personal;
  state.sessionDivisions = divisions || [];
  state.sessionPools = pools && pools.length ? pools : ["default"];
  state.sessionPool = pool || "default";
  state.divisions = state.sessionDivisions;
  state.pools = state.sessionPools;
  state.pool = state.sessionPool;
  state.acct = false;
  state.help = false;
  state.tf = null;
  state.pwf = null;
  state.gate2fa = false;
  state.pendingGatePassword = "";
  state.gateCanEmail = false;
  state.gateEmailMsg = "";
  saveLastSession({
    authenticated: true,
    role: role,
    username: username || "",
    name: name || "",
    needs: needs || null,
    personal: !!personal,
    divisions: divisions || [],
    pools: pools && pools.length ? pools : ["default"],
    pool: pool || "default",
    trucking: trucking || null
  });
  if (state.needs) {
    render();
    if (state.needs === "2fa") {
      loadTwoFactor();
    }
  } else {
    pushCheck();
    loadData();
  }
}
