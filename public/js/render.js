// Root render(): decides which screen to show and paints it into #root.
import { translateDom } from "./i18n.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { accountView } from "./views/account.js";
import { helpView } from "./views/help.js";
import { maybeStartTour, tourView } from "./views/tour.js";
import { adminContent } from "./views/admin.js";
import { dailyReportView } from "./views/daily.js";
import { depotView } from "./views/depot.js";
import { logistiqueView } from "./views/logistique.js";
import { loadPayments } from "./payments.js";
import { driverView } from "./views/driver.js";
import { pointeurView } from "./views/pointeur.js";
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
  maybeStartTour();
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
  } else if (state.logistiqueUnlocked) {
    if (state.loadingData) {
      html = loadingView();
    } else if (state.loadError) {
      html = loadErrorView();
    } else {
      html = logistiqueView();
      if (!state.paymentsLoaded && !state.paymentsLoading && !state.paymentsErr) {
        setTimeout(loadPayments, 0);
      }
    }
  } else if (state.drUnlocked) {
    if (state.loadingData) {
      html = loadingView();
    } else if (state.loadError) {
      html = loadErrorView();
    } else {
      html = dailyReportView();
    }
  } else if (state.authRole === "pointeur") {
    if (state.loadingData) {
      html = loadingView();
    } else if (state.loadError) {
      html = loadErrorView();
    } else {
      html = pointeurView();
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
  var waiting = state.pendingCount + (state.dirty ? 1 : 0);
  var offlineBanner = "";
  if (!state.online) {
    offlineBanner = `<div class="offline-banner">${ icon("alert", 15, "#fff") }Ou pa gen entènèt. Ou ka kontinye travay: chanjman yo sove sou aparèy la epi y ap voye otomatikman lè entènèt la tounen.${ waiting ? ` <b>${ waiting } an atant.</b>` : "" }</div>`;
  } else if (state.syncing && waiting) {
    offlineBanner = `<div class="offline-banner sync">K ap voye chanjman ki te sove sou aparèy la...</div>`;
  } else if (waiting && state.authRole) {
    offlineBanner = `<div class="offline-banner sync">${ waiting } chanjman ap tann pou voye.</div>`;
  }
  var rejectedBanner = state.rejectedCount && state.authRole ? `<div class="offline-banner warn" data-action="rejected-open" style="cursor:pointer">${ icon("alert", 15, "#fff") }${ state.rejectedCount } chanjman pa t pase. Peze la a pou w wè yo.</div>` : "";
  root.innerHTML = offlineBanner + rejectedBanner + html + modalView() + confirmModalView() + tourView() + toastsView();
  translateDom(root);
}
