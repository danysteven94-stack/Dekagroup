// Every user action that changes containers/bills, plus the modals' open/close/submit logic.
import {
  apiAct,
  saveData,
  showToast
} from "./api.js";
import { ALL_DIVISIONS } from "./constants.js";
import { render } from "./render.js";
import { state } from "./state.js";
import {
  billStatus,
  newId,
  today
} from "./utils.js";

export function syncBillCompletion() {
  state.bills = state.bills.map(function (bill) {
    var n = billStatus(bill, state.containers);
    if (n === "fini" && !bill.completedAt) {
      var i = {
        id: newId(),
        billNumewo: bill.numewo,
        date: today(),
        message: `Bill ${ bill.numewo } fini — tout kontenè li yo kite.`
      };
      state.notifications = [i].concat(state.notifications).slice(0, 200);
      showToast(i.message);
      return Object.assign({}, bill, { completedAt: today() });
    }
    return n !== "fini" && bill.completedAt ? Object.assign({}, bill, { completedAt: null }) : bill;
  });
}

export function addContainer(form) {
  var n = (form.numewo || "").trim().toUpperCase();
  if (n) {
    var i = form.size === "20" || form.size === "40" ? form.size : "";
    if (!i) {
      return;
    }
    var o = ALL_DIVISIONS.indexOf(form.division) !== -1 ? form.division : "";
    if (!o) {
      return;
    }
    if (i) {
      var a = "";
      if (form.billMode === "nouvo") {
        var l = (form.billNumewo || "").trim().toUpperCase();
        if (!l) {
          return;
        }
        var s = state.bills.find(function (bill) {
          return bill.numewo === l;
        });
        if (s) {
          a = s.id;
        } else {
          var f = (form.product || "").trim();
          if (!f) {
            return;
          }
          var g = {
            id: newId(),
            numewo: l,
            product: f,
            completedAt: null
          };
          state.bills.push(g);
          a = g.id;
        }
      } else {
        if (!form.billId) {
          return;
        }
        a = form.billId;
      }
      var v = null;
      var A = null;
      if (form.entryMode === "planifye") {
        v = null;
        A = form.dateExpected || null;
      } else {
        v = form.dateEntered || today();
        A = null;
      }
      state.containers.unshift({
        id: newId(),
        numewo: n,
        billId: a,
        size: i,
        division: o,
        dateEntered: v,
        dateExpected: A,
        dateVerified: null,
        depo: null,
        trucking: form.trucking || null,
        dateEmpty: null,
        dateLeft: null
      });
      syncBillCompletion();
      saveData();
      state.billMode = "nouvo";
      state.entryMode = "antre";
      render();
    }
  }
}

function confirmContainerEntered(id, trucking) {
  state.containers = state.containers.map(function (container) {
    return container.id === id ? Object.assign({}, container, {
      dateEntered: today(),
      trucking: trucking !== undefined ? trucking || null : container.trucking
    }) : container;
  });
  syncBillCompletion();
  saveData();
  render();
}

export function openConfirmEnterModal(id) {
  var n = state.containers.find(function (container) {
    return container.id === id;
  });
  if (n) {
    state.modal = {
      mode: "confirm-enter",
      id: id,
      trucking: n.trucking || ""
    };
    render();
  }
}

export function toggleInventoryCheck(id) {
  var d = today();
  state.inventoryChecks[id] = state.inventoryChecks[id] === d ? null : d;
  saveData();
  render();
}

export function undoContainerEntered(id) {
  state.containers = state.containers.map(function (container) {
    return container.id === id ? Object.assign({}, container, {
      dateEntered: null,
      dateVerified: null
    }) : container;
  });
  syncBillCompletion();
  saveData();
  render();
}

export function openVerifyModal(id) {
  var n = state.containers.find(function (container) {
    return container.id === id;
  });
  if (n) {
    state.modal = {
      mode: "verify",
      id: id,
      depo: n.depo || "",
      trucking: n.trucking || ""
    };
    render();
  }
}

export function openTransferModal(id) {
  var n = state.containers.find(function (container) {
    return container.id === id;
  });
  if (n) {
    state.modal = {
      mode: "transfer",
      id: id,
      depo: n.depo || "",
      trucking: n.trucking || ""
    };
    render();
  }
}

export function openCorrectDateModal(id) {
  var n = state.containers.find(function (container) {
    return container.id === id;
  });
  if (n) {
    state.modal = {
      mode: "correct",
      id: id,
      date: n.dateEntered || today()
    };
    render();
  }
}

export function closeModal() {
  state.modal = null;
  render();
}

export function submitModal() {
  if (state.modal) {
    if (state.modal.mode === "correct") {
      var e = document.getElementById("modal-correct-date");
      var n = e ? e.value : "";
      if (n) {
        var i = state.modal.id;
        state.containers = state.containers.map(function (container) {
          return container.id === i ? Object.assign({}, container, { dateEntered: n }) : container;
        });
        state.modal = null;
        syncBillCompletion();
        saveData();
        render();
      }
      return;
    }
    if (state.modal.mode === "confirm-enter") {
      var ck = document.getElementById("modal-trucking");
      var cv = ck ? ck.value : "";
      var cid = state.modal.id;
      state.modal = null;
      confirmContainerEntered(cid, cv);
      return;
    }
    var o = document.getElementById("modal-depo");
    var a = document.getElementById("modal-trucking");
    var l = o ? o.value.trim() : "";
    var s = a ? a.value : "";
    if (l) {
      var f = state.modal.id;
      var g = state.modal.mode;
      var v = state.containers.find(function (container) {
        return container.id === f;
      });
      if (!v) {
        state.modal = null;
        render();
        return;
      }
      if (g === "verify") {
        state.containers = state.containers.map(function (container) {
          return container.id === f ? Object.assign({}, container, {
            dateVerified: today(),
            depo: l,
            trucking: s || null
          }) : container;
        });
        state.modal = null;
        syncBillCompletion();
        saveData();
        render();
      } else {
        if (state.authRole === "depot") {
          state.modal = null;
          apiAct({
            action: "transfer",
            id: f,
            depo: l,
            trucking: s || null
          }, function (r) {
            var nm = r.data && r.data.notifications && r.data.notifications[0];
            if (nm) {
              showToast(nm.message);
            }
          });
          render();
          return;
        }
        var A = v.depo || "\u2014";
        var r = l !== (v.depo || "");
        var d = s !== (v.trucking || "");
        if (state.containers = state.containers.map(function (container) {
            return container.id === f ? Object.assign({}, container, {
              depo: l,
              trucking: s || null
            }) : container;
          }), state.modal = null, r || d) {
          var u = `Kontenè ${ v.numewo } transfere nan depo ${ l } (te nan ${ A })${ s ? ` — trucking: ${ s }` : "" }.`;
          var E = {
            id: newId(),
            billNumewo: "",
            date: today(),
            message: u
          };
          state.notifications = [E].concat(state.notifications).slice(0, 200);
          showToast(E.message);
        }
        saveData();
        render();
      }
    }
  }
}

export function markContainerEmpty(id) {
  if (state.authRole === "depot") {
    state.confirmModal = null;
    apiAct({
      action: "markEmpty",
      id: id
    }, function (r) {
      var nm = r.data && r.data.notifications && r.data.notifications[0];
      if (nm) {
        showToast(nm.message);
      }
    });
    return;
  }
  var n = state.containers.find(function (container) {
    return container.id === id;
  });
  if (state.containers = state.containers.map(function (container) {
      return container.id === id ? Object.assign({}, container, { dateEmpty: today() }) : container;
    }), n) {
    var i = state.bills.find(function (bill) {
      return bill.id === n.billId;
    });
    var o = {
      id: newId(),
      billNumewo: i ? i.numewo : "",
      date: today(),
      message: `Kontenè ${ n.numewo } vid kounye a${ i ? ` (Bill ${ i.numewo })` : "" }.`
    };
    state.notifications = [o].concat(state.notifications).slice(0, 200);
    showToast(o.message);
  }
  syncBillCompletion();
  saveData();
  render();
}

export function undoContainerEmpty(id) {
  state.containers = state.containers.map(function (container) {
    return container.id === id ? Object.assign({}, container, {
      dateEmpty: null,
      dateLeft: null
    }) : container;
  });
  syncBillCompletion();
  saveData();
  render();
}

export function markContainerLeft(id) {
  state.containers = state.containers.map(function (container) {
    return container.id === id ? Object.assign({}, container, { dateLeft: today() }) : container;
  });
  syncBillCompletion();
  saveData();
  render();
}

export function undoContainerLeft(id) {
  state.containers = state.containers.map(function (container) {
    return container.id === id ? Object.assign({}, container, { dateLeft: null }) : container;
  });
  syncBillCompletion();
  saveData();
  render();
}

export function deleteContainer(id) {
  state.containers = state.containers.filter(function (container) {
    return container.id !== id;
  });
  syncBillCompletion();
  saveData();
  render();
}

export function deleteBillIfUnused(billId) {
  var n = state.containers.some(function (container) {
    return container.billId === billId;
  });
  if (!n) {
    state.bills = state.bills.filter(function (bill) {
      return bill.id !== billId;
    });
    saveData();
    render();
  }
}

export function confirmDeparture() {
  var e = state.driverTrucking;
  var n = Object.keys(state.driverSelected).filter(function (a) {
    return state.driverSelected[a];
  });
  if (!(!e || n.length === 0)) {
    if (state.authRole === "chofe") {
      apiAct({
        action: "depart",
        ids: n,
        trucking: e
      }, function (r) {
        state.driverSelected = {};
        showToast(`${ r.result.left } kontenè konfime kite ak ${ e }.`);
      });
      return;
    }
    var i = [];
    state.containers = state.containers.map(function (container) {
      return n.indexOf(container.id) === -1 ? container : (i.push(container.numewo), Object.assign({}, container, { dateLeft: today() }));
    });
    var o = n.map(function (a, l) {
      return {
        id: newId(),
        billNumewo: "",
        date: today(),
        message: `Kontenè ${ i[l] } kite ak chofè ${ e }.`
      };
    });
    state.notifications = o.concat(state.notifications).slice(0, 200);
    syncBillCompletion();
    saveData();
    state.driverSelected = {};
    showToast(`${ n.length } kontenè konfime kite ak ${ e }.`);
    render();
  }
}
