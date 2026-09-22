// The global event listeners (clicks, submits, changes, input) that route data-action attributes to functions.
import {
  loadData,
  saveData,
  showToast
} from "./api.js";
import { LS_LAST_SEEN_NOTIFS } from "./constants.js";
import {
  addContainer,
  closeModal,
  confirmDeparture,
  deleteBillIfUnused,
  deleteContainer,
  markContainerEmpty,
  markContainerLeft,
  openConfirmEnterModal,
  openCorrectDateModal,
  openTransferModal,
  openVerifyModal,
  submitModal,
  syncBillCompletion,
  toggleInventoryCheck,
  undoContainerEmpty,
  undoContainerEntered,
  undoContainerLeft
} from "./mutations.js";
import { exportContainersCsv } from "./csv.js";
import { downloadReport } from "./pdf.js";
import { render } from "./render.js";
import {
  applyAuth,
  logout
} from "./session.js";
import { state } from "./state.js";
import { storageSet } from "./utils.js";
import {
  downloadDailyReport,
  loadDailyState,
  setDailyOverride,
  toggleDailyCheck,
  verifyFromDaily
} from "./views/daily.js";
import {
  emailAction,
  loadSecurityTab
} from "./views/security.js";
import { loadUsers } from "./views/users.js";

document.addEventListener("submit", function (event) {
  if (event.target && event.target.id === "gate-form") {
    event.preventDefault();
    if (state.gateBusy) {
      return;
    }
    var n = state.gate2fa ? state.gateUser : document.getElementById("gate-user").value.trim();
    var i = state.gate2fa ? state.pendingGatePassword : document.getElementById("gate-pw").value;
    var cd = state.gate2fa ? document.getElementById("gate-code").value.trim() : "";
    state.gateUser = n;
    state.gateBusy = true;
    state.gateError = false;
    state.gateMsg = "";
    render();
    fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: n,
        password: i,
        code: cd
      })
    }).then(function (r) {
      return r.json().catch(function () {
        return {};
      }).then(function (d) {
        return {
          ok: r.ok,
          d: d
        };
      });
    }).then(function (x) {
      state.gateBusy = false;
      if (x.ok && x.d && x.d.role) {
        state.gateUser = "";
        state.gate2fa = false;
        state.pendingGatePassword = "";
        applyAuth(x.d.role, x.d.username, x.d.name, x.d.needs, x.d.personal);
      } else if (x.ok && x.d && x.d.needs2fa) {
        state.gate2fa = true;
        state.pendingGatePassword = i;
        state.gateError = false;
        state.gateMsg = "";
        state.gateCanEmail = !!x.d.canEmail;
        state.gateEmailMsg = x.d.emailSent ? "Kòd la voye sou imèl ou." : "";
        render();
      } else {
        state.gateError = true;
        state.gateMsg = x.d && x.d.error ? x.d.error : "Erè koneksyon.";
        render();
      }
    }).catch(function () {
      state.gateBusy = false;
      state.gateError = true;
      state.gateMsg = "Pa ka konekte ak sèvè a. Verifye entènèt ou.";
      render();
    });
  }
  if (event.target && event.target.id === "add-form") {
    event.preventDefault();
    var o = {
      numewo: document.getElementById("f-numewo").value,
      size: document.getElementById("f-size").value,
      division: document.getElementById("f-division").value,
      trucking: document.getElementById("f-trucking") ? document.getElementById("f-trucking").value : "",
      billMode: state.billMode,
      entryMode: state.entryMode
    };
    if (state.entryMode === "planifye") {
      var a = document.getElementById("f-date-expected");
      o.dateExpected = a ? a.value : "";
    } else {
      var l = document.getElementById("f-date");
      o.dateEntered = l ? l.value : "";
    }
    if (state.billMode === "nouvo") {
      o.billNumewo = document.getElementById("f-billnumewo").value;
      var s = document.getElementById("f-product");
      o.product = s ? s.value : "";
    } else {
      var f = document.getElementById("f-billid");
      o.billId = f ? f.value : "";
    }
    addContainer(o);
  }
  if (event.target && event.target.id === "sec-email-add-form") {
    event.preventDefault();
    var S = state.sec;
    var email = document.getElementById("sec-email-input").value.trim();
    S.emailForm = { email: email, err: "" };
    render();
    emailAction({ action: "add", email: email }, function () {
      state.sec.emailForm = { email: "", err: "" };
    });
  }
});

document.addEventListener("click", function (event) {
  var n = event.target.closest("[data-action]");
  if (n) {
    var i = n.getAttribute("data-action");
    var o = n.getAttribute("data-id");
    if (i === "view-depot-division") {
      state.depotDivision = n.getAttribute("data-division");
      render();
    } else if (i === "back-depot-division") {
      state.depotDivision = null;
      render();
    } else if (i === "set-depot-tab") {
      state.depotTab = n.getAttribute("data-tab");
      state.depotDivision = null;
      render();
    } else if (i === "clear-bill-filter") {
      state.filterBillStatus = "";
      render();
    } else if (i === "sec-refresh") {
      loadSecurityTab();
    } else if (i === "sec-filter") {
      state.sec.filter = n.getAttribute("data-filter");
      render();
    } else if (i === "sec-email-remove") {
      emailAction({ action: "remove", email: n.getAttribute("data-email") });
    } else if (i === "sec-email-test") {
      showToast("K ap voye tès la...");
      emailAction({ action: "test" }, function () {
        showToast("Tès la voye.");
      });
    } else if (i === "dr-toggle") {
      toggleDailyCheck(o);
    } else if (i === "dr-verify") {
      verifyFromDaily(o);
    } else if (i === "dr-report") {
      downloadDailyReport(n.getAttribute("data-status"));
    } else if (i === "dr-retry") {
      state.dr.err = "";
      loadDailyState();
    } else if (i === "toggle-inventory") {
      toggleInventoryCheck(o);
    } else if (i === "view-kpi") {
      state.tab = n.getAttribute("data-tab");
      state.search = "";
      state.filterStatus = n.getAttribute("data-filter") || "tout";
      state.filterBillStatus = n.getAttribute("data-billfilter") || "";
      render();
    } else if (i === "set-tab") {
      state.tab = n.getAttribute("data-tab");
      state.search = "";
      state.filterStatus = "tout";
      state.filterBillStatus = "";
      if (state.tab === "notifs" && state.lastSeenNotifCount < state.notifications.length) {
        state.lastSeenNotifCount = state.notifications.length;
        storageSet(LS_LAST_SEEN_NOTIFS, String(state.lastSeenNotifCount));
      }
      if (state.tab === "sekirite") {
        loadSecurityTab();
      }
      if (state.tab === "itilizate") {
        loadUsers();
      }
      render();
    } else if (i === "set-filter") {
      state.filterStatus = n.getAttribute("data-filter");
      render();
    } else if (i === "confirm-enter") {
      openConfirmEnterModal(o);
    } else if (i === "unconfirm-enter") {
      undoContainerEntered(o);
    } else if (i === "verify-container") {
      openVerifyModal(o);
    } else if (i === "transfer-depo") {
      openTransferModal(o);
    } else if (i === "correct-date") {
      openCorrectDateModal(o);
    } else if (i === "close-modal") {
      closeModal();
    } else if (i === "submit-modal") {
      submitModal();
    } else if (i === "print-report") {
      downloadReport(n.getAttribute("data-status"), n.getAttribute("data-group"));
    } else if (i === "export-containers-csv") {
      exportContainersCsv();
    } else if (i === "retry-load") {
      loadData();
    } else if (i === "resume-session") {
      if (state.sessionRole) {
        applyAuth(state.sessionRole, state.sessionUser, state.sessionName, state.sessionNeeds, state.sessionPersonal);
      }
    } else if (i === "choose-role") {
      state.role = n.getAttribute("data-role");
      render();
    } else if (i === "reset-role") {
      state.role = null;
      state.driverSelected = {};
      state.driverTrucking = "";
      state.gateError = false;
      render();
    } else if (i === "logout") {
      logout();
    } else if (i === "driver-toggle-select") {
      state.driverSelected[o] = !state.driverSelected[o];
      render();
    } else if (i === "driver-confirm") {
      confirmDeparture();
    } else if (i === "mark-empty") {
      markContainerEmpty(o);
    } else if (i === "undo-empty") {
      undoContainerEmpty(o);
    } else if (i === "mark-left") {
      markContainerLeft(o);
    } else if (i === "undo-left") {
      undoContainerLeft(o);
    } else if (i === "delete-container") {
      state.confirmModal = {
        message: "Efase kontenè sa a nèt? Ou pap ka anile sa.",
        action: "delete-container",
        id: o
      };
      render();
    } else if (i === "delete-bill") {
      state.confirmModal = {
        message: "Efase bill sa a nèt? Ou pap ka anile sa.",
        action: "delete-bill",
        id: o
      };
      render();
    } else if (i === "close-confirm") {
      state.confirmModal = null;
      render();
    } else if (i === "execute-confirm") {
      (function () {
        if (state.confirmModal) {
          var a = state.confirmModal;
          state.confirmModal = null;
          if (a.action === "delete-container") {
            deleteContainer(a.id);
          } else if (a.action === "delete-bill") {
            deleteBillIfUnused(a.id);
          }
        }
      }());
    }
  }
});

document.addEventListener("change", function (event) {
  if (event.target && event.target.classList) {
    var drC = event.target.classList;
    var drId = event.target.getAttribute("data-id");
    if (drC.contains("dr-depo-input")) {
      setDailyOverride(drId, "depo", event.target.value.trim() || null);
      render();
      return;
    }
    if (drC.contains("dr-trucking-select")) {
      var drV = event.target.value;
      setDailyOverride(drId, "trucking", drV || null);
      render();
      if (drV === "CFC") {
        var drF = document.querySelector(`.dr-cfc-num[data-id="${ drId }"]`);
        if (drF) {
          drF.focus();
        }
      }
      return;
    }
    if (drC.contains("dr-cfc-num")) {
      var drN = event.target.value.replace(/\D/g, "");
      setDailyOverride(drId, "trucking", "CFC" + (drN ? " " + drN : ""));
      render();
      return;
    }
  }
  if (event.target && event.target.classList && event.target.classList.contains("inv-trucking-select")) {
    var tid = event.target.getAttribute("data-id");
    var tval = event.target.value;
    var tc = state.containers.find(function (container) {
      return container.id === tid;
    });
    if (tc && (tc.trucking || "") !== tval) {
      var told = tc.trucking || "\u2014";
      state.containers = state.containers.map(function (container) {
        return container.id === tid ? Object.assign({}, container, { trucking: tval || null }) : container;
      });
      showToast(`Trucking kontenè ${ tc.numewo } chanje: ${ told } → ${ tval || "\u2014" }.`);
      saveData();
    }
    render();
    return;
  }
  if (event.target && event.target.classList && event.target.classList.contains("inv-depo-input")) {
    var did = event.target.getAttribute("data-id");
    var dval = event.target.value.trim();
    state.containers = state.containers.map(function (container) {
      return container.id === did ? Object.assign({}, container, { depo: dval || null }) : container;
    });
    syncBillCompletion();
    saveData();
    render();
    return;
  }
  if (event.target && event.target.id === "driver-trucking-select" && (state.driverTrucking = event.target.value, render()), event.target && event.target.id === "f-billmode") {
    var n = document.getElementById("f-numewo") ? document.getElementById("f-numewo").value : "";
    var i = document.getElementById("f-date") ? document.getElementById("f-date").value : "";
    var o = document.getElementById("f-date-expected") ? document.getElementById("f-date-expected").value : "";
    state.billMode = event.target.value;
    render();
    var a = document.getElementById("f-numewo");
    if (a) {
      a.value = n;
    }
    var l = document.getElementById("f-date");
    if (l && i) {
      l.value = i;
    }
    var s = document.getElementById("f-date-expected");
    if (s && o) {
      s.value = o;
    }
    var f = document.getElementById("f-billnumewo") || document.getElementById("f-billid");
    if (f) {
      f.focus();
    }
  }
  if (event.target && event.target.id === "f-entrymode") {
    var g = document.getElementById("f-numewo") ? document.getElementById("f-numewo").value : "";
    var v = document.getElementById("f-billnumewo") ? document.getElementById("f-billnumewo").value : "";
    var A = document.getElementById("f-product") ? document.getElementById("f-product").value : "";
    var r = document.getElementById("f-billid") ? document.getElementById("f-billid").value : "";
    state.entryMode = event.target.value;
    render();
    var d = document.getElementById("f-numewo");
    if (d) {
      d.value = g;
    }
    var u = document.getElementById("f-billnumewo");
    if (u) {
      u.value = v;
    }
    var E = document.getElementById("f-product");
    if (E) {
      E.value = A;
    }
    var y = document.getElementById("f-billid");
    if (y) {
      y.value = r;
    }
  }
});

document.addEventListener("input", function (event) {
  if (event.target && event.target.id === "f-dr-search") {
    state.dr.search = event.target.value;
    render();
    var drS = document.getElementById("f-dr-search");
    if (drS) {
      drS.focus();
      var drVal = drS.value;
      drS.value = "";
      drS.value = drVal;
    }
  }
  if (event.target && event.target.id === "f-search") {
    state.search = event.target.value;
    render();
    var n = document.getElementById("f-search");
    if (n) {
      n.focus();
      var i = n.value;
      n.value = "";
      n.value = i;
    }
  }
  if (event.target && event.target.id === "f-inv-search") {
    state.inventorySearch = event.target.value;
    render();
    var s = document.getElementById("f-inv-search");
    if (s) {
      s.focus();
      var r = s.value;
      s.value = "";
      s.value = r;
    }
  }
});
