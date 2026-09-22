// Root render(): decides which screen to show and paints it into #root.
import { state } from "./state.js";
import { accountView } from "./views/account.js";
import { adminContent } from "./views/admin.js";
import { dailyReportView } from "./views/daily.js";
import { depotView } from "./views/depot.js";
import { driverView } from "./views/driver.js";
import {
  loadErrorView,
  loadingView,
  loginView,
  twoFactorLoginView
} from "./views/gate.js";
import {
  confirmModalView,
  modalView,
  toastsView
} from "./views/modals.js";

export function render() {
  var root = document.getElementById("root");
  var html;
  if (state.authChecking) {
    html = loadingView();
  } else if (state.authRole && (state.needs || state.acct)) {
    html = accountView();
  } else if (state.gate2fa && !state.authRole) {
    html = twoFactorLoginView();
  } else if (state.unlocked) {
    if (state.loadingData) {
      html = loadingView();
    } else if (state.loadError) {
      html = loadErrorView();
    } else {
      html = adminContent();
    }
  } else if (state.depotUnlocked) {
    if (state.loadingData) {
      html = loadingView();
    } else if (state.loadError) {
      html = loadErrorView();
    } else {
      html = depotView();
    }
  } else if (state.drUnlocked) {
    if (state.loadingData) {
      html = loadingView();
    } else if (state.loadError) {
      html = loadErrorView();
    } else {
      html = dailyReportView();
    }
  } else if (state.authRole === "chofe") {
    if (state.loadingData) {
      html = loadingView();
    } else if (state.loadError) {
      html = loadErrorView();
    } else {
      html = driverView();
    }
  } else {
    html = loginView();
  }
  root.innerHTML = html + modalView() + confirmModalView() + toastsView();
}
