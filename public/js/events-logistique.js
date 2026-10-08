// Logistique Deka screen: clicks, typing and the payment form. Everything the person types is kept in state
// as it is typed, so a refresh of the page (new data arriving) never wipes a half-filled form.
import {
  clearPaymentStage,
  createLgBill,
  deleteLgBill,
  loadPayments,
  savePayments
} from "./payments.js";
import { render } from "./render.js";
import { state } from "./state.js";
import { today } from "./utils.js";
import {
  filteredBills,
  prefillForm,
  selectedIds,
  totalText
} from "./views/logistique.js";

function afterSelectionChange(freshFrom) {
  var ids = selectedIds();
  if (!ids.length) {
    state.pay.form = null;
    state.pay.amounts = {};
  } else if (!state.pay.form || freshFrom) {
    state.pay.form = prefillForm(freshFrom || ids);
  }
  render();
}

document.addEventListener("click", function (event) {
  var n = event.target.closest("[data-action]");
  if (!n) return;
  var a = n.getAttribute("data-action");
  if (a.indexOf("pay-") !== 0) return;
  var id = n.getAttribute("data-id");
  var P = state.pay;
  if (a === "pay-tab") {
    P.tab = n.getAttribute("data-tab");
    state.navDrawerOpen = false;
    render();
  } else if (a === "pay-toggle") {
    // (the checkbox has already changed by the time the click arrives)
    if (n.checked) P.sel[id] = true;
    else delete P.sel[id];
    afterSelectionChange();
  } else if (a === "pay-open") {
    P.sel = {};
    P.sel[id] = true;
    P.amounts = {};
    afterSelectionChange([id]);
    if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
  } else if (a === "pay-confirm") {
    // confirm the payment of THIS bill only: the form opens for it alone, with today's date ready in "Dat ou konfime"
    P.sel = {};
    P.sel[id] = true;
    P.amounts = {};
    P.form = prefillForm([id]);
    if (!P.form.confirmedDate) P.form.confirmedDate = today();
    render();
    if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
  } else if (a === "pay-filter-overdue") {
    P.filterOverdue = !P.filterOverdue;
    render();
  } else if (a === "pay-select-all") {
    filteredBills().forEach(function (b) {
      var rec = b;
      if (!(rec && rec.confirmedDate)) P.sel[b.id] = true;
    });
    afterSelectionChange();
  } else if (a === "pay-select-none" || a === "pay-cancel") {
    P.sel = {};
    afterSelectionChange();
  } else if (a === "pay-today") {
    if (P.form) {
      P.form[n.getAttribute("data-field")] = today();
      render();
    }
  } else if (a === "pay-filter-stage") {
    var s = n.getAttribute("data-stage");
    P.filterStatus = P.filterStatus === s ? "" : s;
    render();
  } else if (a === "pay-view-division") {
    P.filterDivision = n.getAttribute("data-division") || "";
    P.filterStatus = "";
    P.tab = "bills";
    render();
  } else if (a === "pay-undo") {
    var stage = n.getAttribute("data-stage");
    var what = stage === "confirmed" ? "konfimasyon" : stage === "paid" ? "peman (ak konfimasyon an)" : "dat chèk la (ak sa ki vini apre li)";
    if (window.confirm("Defèt " + what + " ?")) clearPaymentStage(id, stage);
  } else if (a === "pay-retry") {
    loadPayments();
  } else if (a === "pay-new-open") {
    P.newForm = { division: P.filterDivision || "", numewo: "", product: "", amount: "", checkDate: "", currency: "HTG", err: "" };
    render();
  } else if (a === "pay-new-cancel") {
    P.newForm = null;
    render();
  } else if (a === "pay-delete") {
    if (window.confirm("Efase bill sa a ?")) deleteLgBill(id);
  }
});

document.addEventListener("submit", function (event) {
  if (event.target && event.target.id === "pay-form") {
    event.preventDefault();
    savePayments();
  } else if (event.target && event.target.id === "pay-new-form") {
    event.preventDefault();
    createLgBill();
  }
});

document.addEventListener("input", function (event) {
  var t = event.target;
  if (!t || !t.getAttribute) return;
  var P = state.pay;
  if (t.id === "pay-search") {
    P.search = t.value;
    render();
    var el = document.getElementById("pay-search");
    if (el) {
      el.focus();
      var v = el.value;
      el.value = "";
      el.value = v;
    }
    return;
  }
  var amt = t.getAttribute("data-payamt");
  if (amt) {
    P.amounts[amt] = t.value;
    var total = document.getElementById("pay-total");
    if (total) total.textContent = totalText();
    return;
  }
  var nf = t.getAttribute("data-newf");
  if (nf && P.newForm) {
    P.newForm[nf] = t.value;
    return;
  }
  var field = t.getAttribute("data-payf");
  if (field && P.form) {
    P.form[field] = t.value;
    if (field === "currency") {
      var tot = document.getElementById("pay-total");
      if (tot) tot.textContent = totalText();
    }
  }
});

document.addEventListener("change", function (event) {
  var t = event.target;
  if (!t) return;
  var nfc = t.getAttribute && t.getAttribute("data-newf");
  if (nfc && state.pay.newForm) {
    state.pay.newForm[nfc] = t.value;
    return;
  }
  if (t.id === "pay-filter-division") {
    state.pay.filterDivision = t.value;
    render();
  } else if (t.id === "pay-filter-status") {
    state.pay.filterStatus = t.value;
    render();
  }
});
