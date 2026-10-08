// Logistique Deka: talking to /api/payments (its own bills: load, create, delete, pay one or several at once, undo a step).
import {
  apiGet,
  apiJson,
  showToast
} from "./api.js";
import { render } from "./render.js";
import { state } from "./state.js";
import { selectedIds } from "./views/logistique.js";

function message(e) {
  if (e && e.message && /failed to fetch|network|timeout|abort/i.test(e.message)) {
    return "Ou pa gen entènèt. Eseye ankò lè koneksyon an tounen.";
  }
  return e && e.message ? e.message : String(e);
}

function merge(records) {
  var byId = {};
  records.forEach(function (r) { byId[r.id] = r; });
  state.lgBills = records.concat(state.lgBills.filter(function (p) { return !byId[p.id]; }));
}

export function loadPayments(silent) {
  if (state.paymentsLoading) return;
  state.paymentsLoading = true;
  if (!silent) {
    state.paymentsErr = "";
    render();
  }
  apiGet("/api/payments").then(function (d) {
    state.lgBills = d.bills || [];
    state.paymentsLoaded = true;
    state.paymentsLoading = false;
    if (!silent) state.paymentsErr = "";
    render();
  }).catch(function (e) {
    state.paymentsLoading = false;
    if (!silent) state.paymentsErr = message(e);
    render();
  });
}

// Reads what the person typed (the amounts and the shared fields) and sends it for every chosen Bill.
export function savePayments() {
  var P = state.pay;
  var ids = selectedIds();
  var f = P.form;
  if (!ids.length || !f || state.paymentsBusy) return;
  var payload = { action: "save", currency: f.currency, items: ids.map(function (id) {
    var v = P.amounts[id];
    var item = { billId: id };
    if (v !== undefined && String(v).trim() !== "") item.amount = v;
    return item;
  }) };
  // an empty field is not sent: the step stays as it is (use "Defèt" to undo a step)
  ["checkDate", "paidDate", "confirmedDate", "broker", "reference", "notes"].forEach(function (k) {
    if (String(f[k] || "").trim() !== "") payload[k] = String(f[k]).trim();
  });
  // the amount is needed for a Bill that has none yet, once it is confirmed (the server says so too)
  state.paymentsBusy = true;
  f.err = "";
  render();
  apiJson("/api/payments", payload).then(function (d) {
    state.paymentsBusy = false;
    merge(d.bills || []);
    var n = ids.length;
    P.sel = {};
    P.amounts = {};
    P.form = null;
    showToast(n > 1 ? "Peman an anrejistre pou " + n + " bill." : "Peman an anrejistre.");
    render();
  }).catch(function (e) {
    state.paymentsBusy = false;
    f.err = message(e);
    render();
  });
}

export function clearPaymentStage(billId, stage) {
  if (state.paymentsBusy) return;
  state.paymentsBusy = true;
  render();
  apiJson("/api/payments", { action: "clear", billId: billId, stage: stage }).then(function (d) {
    state.paymentsBusy = false;
    merge(d.bills || []);
    showToast("Dènye etap la defèt.");
    render();
  }).catch(function (e) {
    state.paymentsBusy = false;
    showToast("Erè: " + message(e));
    render();
  });
}

// Creates a new Logistique Deka bill from the "Nouvo bill" form.
export function createLgBill() {
  var f = state.pay.newForm;
  if (!f || state.paymentsBusy) return;
  if (!f.division) { f.err = "Chwazi yon divizyon valid."; render(); return; }
  if (String(f.numewo || "").trim().length < 2) { f.err = "Ekri nimewo bill la."; render(); return; }
  state.paymentsBusy = true;
  f.err = "";
  render();
  apiJson("/api/payments", Object.assign({ action: "create", division: f.division, numewo: f.numewo, product: f.product, amount: f.amount, currency: f.currency }, f.checkDate ? { checkDate: f.checkDate } : {})).then(function (d) {
    state.paymentsBusy = false;
    merge(d.bills || []);
    state.pay.newForm = null;
    showToast("Bill la anrejistre.");
    render();
  }).catch(function (e) {
    state.paymentsBusy = false;
    f.err = message(e);
    render();
  });
}

export function deleteLgBill(billId) {
  if (state.paymentsBusy) return;
  state.paymentsBusy = true;
  render();
  apiJson("/api/payments", { action: "delete", billId: billId }).then(function (d) {
    state.paymentsBusy = false;
    state.lgBills = state.lgBills.filter(function (b) { return b.id !== d.deleted; });
    delete state.pay.sel[billId];
    if (!Object.keys(state.pay.sel).some(function (k) { return state.pay.sel[k]; })) { state.pay.form = null; state.pay.amounts = {}; }
    showToast("Bill la efase.");
    render();
  }).catch(function (e) {
    state.paymentsBusy = false;
    showToast("Erè: " + message(e));
    render();
  });
}
