// Login session bookkeeping: what happens after login / logout.
import { loadData } from "./api.js";
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

export function logout() {
  state.depotDivision = null;
  state.tab = "dashboard";
  state.lastSyncTime = null;
  state.name = "";
  state.needs = null;
  state.personal = false;
  state.acct = false;
  state.help = false;
  state.gate2fa = false;
  state.pendingGatePassword = "";
  state.sessionName = "";
  state.sessionNeeds = null;
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
  state.containers = [];
  state.bills = [];
  state.notifications = [];
  state.inventoryChecks = {};
  state.unlocked = false;
  state.depotUnlocked = false;
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

export function applyAuth(role, username, name, needs, personal) {
  state.depotDivision = null;
  state.tab = "dashboard";
  state.lastSyncTime = null;
  state.rev = undefined;
  state.saving = false;
  state.savePending = false;
  state.sessionRole = role;
  state.sessionUser = username || "";
  state.sessionName = name || "";
  state.sessionNeeds = needs || null;
  state.sessionPersonal = !!personal;
  state.authRole = role;
  state.username = username || "";
  state.unlocked = role === "admin";
  state.depotUnlocked = role === "depot";
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
  state.acct = false;
  state.help = false;
  state.tf = null;
  state.pwf = null;
  state.gate2fa = false;
  state.pendingGatePassword = "";
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
