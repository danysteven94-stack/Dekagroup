// Root render(): decides which screen to show and paints it into #root.
import { icon } from "./icons.js";
import { state } from "./state.js";
import { accountView } from "./views/account.js";
import { helpView } from "./views/help.js";
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
  } else if (state.authRole && state.help) {
    html = helpView();
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
  var offlineBanner = state.online ? "" : `<div class="offline-banner">${ icon("alert", 15, "#fff") }Ou pa gen entènèt kounye a. App la ap kontinye ak dènye done ki te sove a; li ap rekonekte otomatikman.</div>`;
  root.innerHTML = offlineBanner + html + modalView() + confirmModalView() + toastsView();
}
