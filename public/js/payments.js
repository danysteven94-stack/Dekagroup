// Logistique Deka: talking to /api/payments (its own bills: load, create, delete, pay one or several at once, undo a step).
import {
  apiGet,
  apiJson,
  showToast
} from "./api.js";
import { shrinkImage } from "./photo.js";
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
  var had = {};
  state.lgBills.forEach(function (o) { had[o.id] = o.hasPhoto; });
  // the server answers a payment/edit without the "has a photo" flag: keep the one we already know
  records = records.map(function (r) { return r.hasPhoto === undefined && had[r.id] ? Object.assign({}, r, { hasPhoto: true }) : r; });
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

function setPhotoFlag(ids, value) {
  state.lgBills = state.lgBills.map(function (b) { return ids.indexOf(b.id) !== -1 ? Object.assign({}, b, { hasPhoto: value }) : b; });
}

// Photo of the check: shrink it, then keep it for every Bill chosen in the form.
export function uploadCheckPhoto(file) {
  var P = state.pay;
  var ids = selectedIds();
  if (!ids.length || !file || P.photoBusy) return;
  P.photoBusy = true;
  P.photoMsg = "";
  render();
  shrinkImage(file).then(function (image) {
    return apiJson("/api/payments", { action: "photo", billIds: ids, image: image });
  }).then(function (d) {
    P.photoBusy = false;
    setPhotoFlag(d.billIds || ids, true);
    P.photoMsg = "Foto chèk la anrejistre.";
    render();
  }).catch(function (e) {
    P.photoBusy = false;
    P.photoMsg = message(e);
    render();
  });
}

export function viewCheckPhoto(billId) {
  var P = state.pay;
  P.photoView = { id: billId, src: "", loading: true, err: "" };
  render();
  apiJson("/api/payments", { action: "photo-get", billId: billId }).then(function (d) {
    if (P.photoView && P.photoView.id === billId) { P.photoView.src = d.image; P.photoView.loading = false; }
    render();
  }).catch(function (e) {
    if (P.photoView && P.photoView.id === billId) { P.photoView.loading = false; P.photoView.err = message(e); }
    render();
  });
}

export function deleteCheckPhoto(billId) {
  var P = state.pay;
  if (P.photoBusy) return;
  P.photoBusy = true;
  render();
  apiJson("/api/payments", { action: "photo-delete", billId: billId }).then(function () {
    P.photoBusy = false;
    P.photoView = null;
    P.photoMsg = "";
    setPhotoFlag([billId], false);
    showToast("Foto a efase.");
    render();
  }).catch(function (e) {
    P.photoBusy = false;
    showToast("Erè: " + message(e));
    render();
  });
}
