// Application start-up: polling, favicon, first session check.
import { pollData } from "./api.js";
import { initOffline } from "./offline.js";
import { LOGO_URL } from "./constants.js";
import { applyDocumentLang } from "./i18n.js";
import { pushInit } from "./push.js";
import { render } from "./render.js";
import { state } from "./state.js";
import "./events.js";
import "./events-account.js";
import "./events-archive.js";
import "./events-lang.js";

setInterval(pollData, 15000);

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

fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) {
  return r.json();
}).then(function (d) {
  state.authChecking = false;
  if (d && d.authenticated && d.role) {
    state.sessionRole = d.role;
    state.sessionUser = d.username;
    state.sessionName = d.name || "";
    state.sessionNeeds = d.needs || null;
    state.sessionPersonal = !!d.personal;
  }
  render();
}).catch(function () {
  state.authChecking = false;
  render();
});

pushInit();
