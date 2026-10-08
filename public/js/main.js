// Application start-up: polling, favicon, first session check.
import { pollData } from "./api.js";
import { initOffline, markOffline } from "./offline.js";
import { LOGO_URL } from "./constants.js";
import { applyDocumentLang } from "./i18n.js";
import {
  dropLastSession,
  loadLastSession,
  saveLastSession,
  timedFetch
} from "./outbox.js";
import { pushInit } from "./push.js";
import { render } from "./render.js";
import { state } from "./state.js";
import "./events.js";
import "./events-account.js";
import "./events-archive.js";
import "./events-lang.js";
import "./events-logistique.js";
import { loadPayments } from "./payments.js";

setInterval(pollData, 15000);

// Logistique Deka: refresh the payments quietly, unless the person is typing or has a payment form open.
setInterval(function () {
  var a = document.activeElement;
  var typing = a && (a.tagName === "INPUT" || a.tagName === "SELECT" || a.tagName === "TEXTAREA");
  if (state.logistiqueUnlocked && state.paymentsLoaded && state.online && !typing && !state.pay.form && !state.pay.newForm && !state.modal) {
    loadPayments(true);
  }
}, 30000);

initOffline();
applyDocumentLang();

const faviconLink = document.getElementById("app-favicon");

if (faviconLink) {
  faviconLink.href = LOGO_URL;
}

if (/[?&]tab=notifs/.test(location.search)) {
  state.tab = "notifs";
}

render();

function useSession(d) {
  state.sessionRole = d.role;
  state.sessionUser = d.username;
  state.sessionName = d.name || "";
  state.sessionTrucking = d.trucking || "";
  state.sessionNeeds = d.needs || null;
  state.sessionPersonal = !!d.personal;
  state.sessionDivisions = d.divisions || [];
  state.sessionPools = d.pools && d.pools.length ? d.pools : ["default"];
  state.sessionPool = d.pool || "default";
}

timedFetch("/api/auth/me", { credentials: "same-origin" }, 8000).then(function (r) {
  return r.json();
}).then(function (d) {
  state.authChecking = false;
  if (d && d.authenticated && d.role) {
    useSession(d);
    saveLastSession(d);
  } else {
    dropLastSession();
  }
  render();
}).catch(function () {
  // No network: open with the last session seen on this device (the server checks it again as soon as it is reachable).
  loadLastSession().then(function (d) {
    state.authChecking = false;
    if (d && d.authenticated && d.role) {
      useSession(d);
      state.online = false;
      markOffline();
    }
    render();
  });
});

pushInit();
