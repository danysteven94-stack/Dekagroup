// The global event listeners (clicks, submits, changes, input) that route data-action attributes to functions.
import {
  createGoodsIncident,
  createInvoice,
  createStockEntry,
  finishInvoice,
  loadData,
  loadGoodsIncidents,
  loadInvoices,
  loadStockEntries,
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
import {
  downloadDailyDelivery,
  downloadDeliveryReport,
  downloadDnkReport,
  downloadGoodsReport,
  downloadInvoice,
  downloadLandingSheet,
  downloadReport
} from "./pdf.js";
import { normalizePlate } from "./iso6346.js";
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

function readInvoiceItemsFromDom() {
  return Array.prototype.map.call(document.querySelectorAll(".inv-item-row"), function (row) {
    return {
      description: row.querySelector(".inv-item-desc").value.trim(),
      qty: row.querySelector(".inv-item-qty").value,
      unitPrice: row.querySelector(".inv-item-price").value
    };
  });
}

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
  if (event.target && event.target.id === "stock-entry-form") {
    event.preventDefault();
    if (state.stockBusy) {
      return;
    }
    createStockEntry({
      billId: document.getElementById("stock-f-bill").value,
      entryDate: document.getElementById("stock-f-date").value,
      quantity: document.getElementById("stock-f-qty").value,
      unit: document.getElementById("stock-f-unit").value.trim(),
      containerNumewo: document.getElementById("stock-f-container").value.trim(),
      description: document.getElementById("stock-f-desc").value.trim(),
      remarks: document.getElementById("stock-f-remarks").value.trim()
    });
  }
  if (event.target && event.target.id === "goods-form") {
    event.preventDefault();
    if (state.goodsBusy) {
      return;
    }
    createGoodsIncident({
      kind: event.target.getAttribute("data-kind"),
      billId: document.getElementById("goods-f-bill").value,
      entryDate: document.getElementById("goods-f-date").value,
      quantity: document.getElementById("goods-f-qty").value,
      unit: document.getElementById("goods-f-unit").value.trim(),
      description: document.getElementById("goods-f-desc").value.trim(),
      reason: document.getElementById("goods-f-reason").value.trim(),
      remarks: document.getElementById("goods-f-remarks").value.trim()
    });
  }
  if (event.target && event.target.id === "delivery-form") {
    event.preventDefault();
    if (state.goodsBusy) {
      return;
    }
    createGoodsIncident({
      kind: "livrezon",
      billId: document.getElementById("delivery-f-bill").value,
      entryDate: document.getElementById("delivery-f-date").value,
      quantity: document.getElementById("delivery-f-qty").value,
      unit: document.getElementById("delivery-f-unit").value.trim(),
      description: document.getElementById("delivery-f-desc").value.trim(),
      reason: document.getElementById("delivery-f-client").value.trim(),
      remarks: document.getElementById("delivery-f-remarks").value.trim()
    });
  }
  if (event.target && event.target.id === "invoice-form") {
    event.preventDefault();
    if (state.invoiceBusy) {
      return;
    }
    createInvoice({
      billId: document.getElementById("inv-f-bill").value,
      clientName: document.getElementById("inv-f-client").value.trim(),
      clientAddress: document.getElementById("inv-f-address").value.trim(),
      invoiceNumber: document.getElementById("inv-f-number").value.trim(),
      invoiceDate: document.getElementById("inv-f-date").value,
      dueDate: document.getElementById("inv-f-due").value,
      notes: document.getElementById("inv-f-notes").value.trim(),
      items: readInvoiceItemsFromDom()
    });
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
      if ((state.depotTab === "stock" || state.depotTab === "landing") && !state.stockLoaded && !state.stockLoading) {
        loadStockEntries();
      }
      if ((state.depotTab === "invreg" || state.depotTab === "invfin") && !state.invoicesLoaded && !state.invoicesLoading) {
        loadInvoices();
      }
      if ((state.depotTab === "returned" || state.depotTab === "damaged" || state.depotTab === "delivery" || state.depotTab === "dailydelivery") && !state.goodsLoaded && !state.goodsLoading) {
        loadGoodsIncidents();
      }
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
    } else if (i === "toggle-inventory-confirmed") {
      state.inventoryShowConfirmed = !state.inventoryShowConfirmed;
      render();
    } else if (i === "dr-toggle-confirmed") {
      state.dr.showConfirmed = !state.dr.showConfirmed;
      render();
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
    } else if (i === "print-dnk") {
      downloadDnkReport();
    } else if (i === "download-landing-sheet") {
      downloadLandingSheet(o);
    } else if (i === "invoice-add-item") {
      state.invoiceDraft.items = readInvoiceItemsFromDom();
      state.invoiceDraft.items.push({ description: "", qty: "", unitPrice: "" });
      render();
    } else if (i === "invoice-remove-item") {
      var removeIdx = parseInt(n.getAttribute("data-index"), 10);
      state.invoiceDraft.items = readInvoiceItemsFromDom();
      if (state.invoiceDraft.items.length > 1) {
        state.invoiceDraft.items.splice(removeIdx, 1);
      }
      render();
    } else if (i === "finish-invoice") {
      finishInvoice(o);
    } else if (i === "download-invoice") {
      downloadInvoice(o);
    } else if (i === "download-goods-report") {
      downloadGoodsReport(n.getAttribute("data-kind"));
    } else if (i === "download-delivery-report") {
      downloadDeliveryReport();
    } else if (i === "download-daily-delivery") {
      downloadDailyDelivery();
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
  if (event.target && event.target.id === "stock-filter-bill") {
    state.stockFilterBill = event.target.value;
    render();
    return;
  }
  if (event.target && event.target.id === "stock-landing-bill") {
    state.landingBillId = event.target.value;
    render();
    return;
  }
  if (event.target && event.target.id === "invoice-filter-bill") {
    state.invoiceFilterBill = event.target.value;
    render();
    return;
  }
  if (event.target && event.target.id === "goods-filter-bill") {
    state.goodsFilterBill = event.target.value;
    render();
    return;
  }
  if (event.target && event.target.id === "delivery-filter-bill") {
    state.deliveryFilterBill = event.target.value;
    render();
    return;
  }
  if (event.target && event.target.id === "delivery-filter-from") {
    state.deliveryFrom = event.target.value;
    render();
    return;
  }
  if (event.target && event.target.id === "delivery-filter-to") {
    state.deliveryTo = event.target.value;
    render();
    return;
  }
  if (event.target && event.target.id === "daily-delivery-date") {
    state.dailyDeliveryDate = event.target.value;
    render();
    return;
  }
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
  if (event.target && event.target.classList && event.target.classList.contains("dkn-plak-input")) {
    var pkId = event.target.getAttribute("data-id");
    var pkVal = normalizePlate(event.target.value);
    state.containers = state.containers.map(function (container) {
      return container.id === pkId ? Object.assign({}, container, { plak: pkVal || null }) : container;
    });
    saveData();
    render();
    return;
  }
  if (event.target && event.target.classList && event.target.classList.contains("dkn-chofer-input")) {
    var chId = event.target.getAttribute("data-id");
    var chVal = event.target.value.trim();
    state.containers = state.containers.map(function (container) {
      return container.id === chId ? Object.assign({}, container, { chofer: chVal || null }) : container;
    });
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
