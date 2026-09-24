// Archive of containers that already left: manual entry, paper scan (photo -> /api/scan), review and save.
import {
  apiJson,
  saveData,
  showToast
} from "./api.js";
import {
  containerCheckOk,
  containerFormatOk,
  normalizeBill,
  normalizeContainer,
  normalizePlate
} from "./iso6346.js";
import { render } from "./render.js";
import { state } from "./state.js";
import {
  billStatus,
  newId,
  statusOf,
  today
} from "./utils.js";

var MAX_SIDE = 1800;
var MAX_B64 = 3500000;
var MAX_PDF_BYTES = 2600000;

export function blankRow() {
  return {
    k: newId(),
    numewo: "",
    bill: "",
    product: "",
    size: "",
    dateEntered: "",
    dateLeft: "",
    plak: "",
    chofer: ""
  };
}

function isBlank(row) {
  return !(row.numewo || row.bill || row.product || row.size || row.dateEntered || row.dateLeft || row.plak || row.chofer);
}

function newModal(phase, rows, editId) {
  return {
    mode: "arch",
    phase: phase,
    editId: editId || null,
    err: "",
    preview: "",
    docType: "",
    notes: "",
    scans: 0,
    rows: rows
  };
}

export function openArchiveScan() {
  state.modal = newModal("pick", []);
  render();
}

export function openArchiveManual() {
  state.modal = newModal("review", [blankRow()]);
  render();
}

export function archiveManualFromPick() {
  if (state.modal && state.modal.mode === "arch") {
    state.modal.phase = "review";
    state.modal.err = "";
    if (!state.modal.rows.length) {
      state.modal.rows = [blankRow()];
    }
    render();
  }
}

export function openArchiveEdit(id) {
  var c = state.containers.find(function (x) {
    return x.id === id;
  });
  if (!c) {
    return;
  }
  var b = state.bills.find(function (x) {
    return x.id === c.billId;
  });
  var row = blankRow();
  row.numewo = c.numewo || "";
  row.bill = b ? b.numewo : "";
  row.product = b && b.product ? b.product : "";
  row.size = c.size || "";
  row.dateEntered = c.dateEntered || "";
  row.dateLeft = c.dateLeft || "";
  row.plak = c.plak || "";
  row.chofer = c.chofer || "";
  state.modal = newModal("review", [row], id);
  render();
}

export function addArchiveRow() {
  if (state.modal && state.modal.mode === "arch") {
    state.modal.rows.push(blankRow());
    render();
  }
}

export function removeArchiveRow(key) {
  var m = state.modal;
  if (m && m.mode === "arch") {
    m.rows = m.rows.filter(function (r) {
      return r.k !== key;
    });
    if (!m.rows.length && !m.editId) {
      m.rows = [];
      m.phase = "pick";
    }
    render();
  }
}

// ---- validation (used by the view and by save)
export function rowIssues(row, rows, editId) {
  var errors = [];
  var warns = [];
  var n = normalizeContainer(row.numewo);
  if (!n) {
    errors.push("Nimewo kontenè manke");
  } else if (!containerFormatOk(n)) {
    warns.push("Fòma nimewo a pa nòmal (4 lèt + 7 chif)");
  } else if (!containerCheckOk(n)) {
    warns.push("Chif kontwòl pa bon: verifye nimewo a sou papye a");
  }
  if (!normalizeBill(row.bill)) {
    errors.push("Bill manke");
  }
  if (!row.dateEntered) {
    errors.push("Dat antre manke");
  }
  if (!row.dateLeft) {
    errors.push("Dat kite manke");
  }
  if (row.dateEntered && row.dateLeft && row.dateLeft < row.dateEntered) {
    errors.push("Dat kite anvan dat antre");
  }
  if (!normalizePlate(row.plak)) {
    warns.push("Plak manke");
  }
  if (n && row.dateEntered) {
    var sameInSystem = state.containers.some(function (c) {
      return c.id !== editId && c.numewo === n && c.dateEntered === row.dateEntered;
    });
    var sameInBatch = rows.some(function (o) {
      return o !== row && normalizeContainer(o.numewo) === n && o.dateEntered === row.dateEntered;
    });
    if (sameInSystem) {
      errors.push("Deja nan rejis la (menm dat antre)");
    } else if (sameInBatch) {
      errors.push("Double nan lis sa a");
    }
  }
  return { errors: errors, warns: warns };
}

// ---- scanning
function loadViaImg(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("Pa ka louvri foto a. Eseye yon JPG oswa PNG."));
    };
    img.src = url;
  });
}

function loadBitmap(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file).catch(function () {
      return loadViaImg(file);
    });
  }
  return loadViaImg(file);
}

function afterComma(dataUrl) {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

// Shrinks a photo so the upload stays small (phones take 10+ MB pictures) but the print stays readable.
function prepareFile(file) {
  return new Promise(function (resolve, reject) {
    var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (isPdf) {
      if (file.size > MAX_PDF_BYTES) {
        reject(new Error("PDF a twò gwo (maksimòm 2.5 Mo). Pran yon foto pito."));
        return;
      }
      var fr = new FileReader();
      fr.onload = function () {
        resolve({ data: afterComma(String(fr.result)), mime: "application/pdf", thumb: "" });
      };
      fr.onerror = function () {
        reject(new Error("Pa ka li fichye a."));
      };
      fr.readAsDataURL(file);
      return;
    }
    if (!/^image\//.test(file.type)) {
      reject(new Error("Fichye a dwe se yon foto oswa yon PDF."));
      return;
    }
    loadBitmap(file).then(function (src) {
      var w = src.naturalWidth || src.width;
      var h = src.naturalHeight || src.height;
      var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      var q = 0.85;
      var url = canvas.toDataURL("image/jpeg", q);
      while (url.length > MAX_B64 && q > 0.45) {
        q -= 0.1;
        url = canvas.toDataURL("image/jpeg", q);
      }
      if (url.length > MAX_B64) {
        reject(new Error("Foto a twò gwo. Eseye ak yon foto ki pi piti."));
        return;
      }
      var t = document.createElement("canvas");
      var ts = Math.min(1, 160 / Math.max(canvas.width, canvas.height));
      t.width = Math.max(1, Math.round(canvas.width * ts));
      t.height = Math.max(1, Math.round(canvas.height * ts));
      t.getContext("2d").drawImage(canvas, 0, 0, t.width, t.height);
      resolve({ data: afterComma(url), mime: "image/jpeg", thumb: t.toDataURL("image/jpeg", 0.6) });
    }).catch(reject);
  });
}

export function handleScanFile(file) {
  var m = state.modal;
  if (!m || m.mode !== "arch" || !file) {
    return;
  }
  m.phase = "reading";
  m.err = "";
  m.preview = "";
  render();
  prepareFile(file).then(function (p) {
    m.preview = p.thumb;
    render();
    return apiJson("/api/scan", { image: p.data, mime: p.mime });
  }).then(function (d) {
    if (state.modal !== m) {
      return;
    }
    var found = (d.records || []).map(function (r) {
      var row = blankRow();
      ["numewo", "bill", "product", "size", "dateEntered", "dateLeft", "plak", "chofer"].forEach(function (f) {
        row[f] = r[f] || "";
      });
      return row;
    });
    m.docType = d.docType || "";
    m.notes = d.notes || "";
    m.scans += 1;
    m.rows = m.rows.filter(function (r) {
      return !isBlank(r);
    }).concat(found);
    if (found.length === 0) {
      m.err = "Pa jwenn kontenè sou papye sa a. Eseye ak yon foto ki pi klè, oswa antre l manyèlman.";
      m.phase = m.rows.length ? "review" : "pick";
    } else {
      m.phase = "review";
    }
    render();
  }).catch(function (e) {
    if (state.modal !== m) {
      return;
    }
    m.err = e && e.message ? e.message : "Skane a echwe. Eseye ankò.";
    m.phase = m.rows.length ? "review" : "pick";
    render();
  });
}

// ---- saving
function cleanRow(r) {
  return {
    k: r.k,
    numewo: normalizeContainer(r.numewo),
    bill: normalizeBill(r.bill),
    product: (r.product || "").trim().slice(0, 120),
    size: r.size === "20" || r.size === "40" ? r.size : "",
    dateEntered: r.dateEntered,
    dateLeft: r.dateLeft,
    plak: normalizePlate(r.plak),
    chofer: (r.chofer || "").trim().slice(0, 80)
  };
}

// Bills of archived containers are marked completed silently: no "bill fini" notification, no push, no email for old history.
function completeBillsQuietly(ids) {
  state.bills = state.bills.map(function (b) {
    if (ids.indexOf(b.id) === -1 || b.completedAt || billStatus(b, state.containers) !== "fini") {
      return b;
    }
    var last = state.containers.filter(function (c) {
      return c.billId === b.id;
    }).map(function (c) {
      return c.dateLeft || "";
    }).sort().pop();
    return Object.assign({}, b, { completedAt: last || today() });
  });
}

function billIdFor(r, touched) {
  var b = state.bills.find(function (x) {
    return normalizeBill(x.numewo) === r.bill;
  });
  if (!b) {
    b = {
      id: newId(),
      numewo: r.bill,
      product: r.product || null,
      completedAt: null
    };
    state.bills.push(b);
  } else if (!b.product && r.product) {
    state.bills = state.bills.map(function (x) {
      return x.id === b.id ? Object.assign({}, x, { product: r.product }) : x;
    });
  }
  touched.push(b.id);
  return b.id;
}

export function saveArchive() {
  var m = state.modal;
  if (!m || m.mode !== "arch" || !m.rows.length) {
    return;
  }
  var rows = m.rows.map(cleanRow);
  var bad = rows.some(function (r) {
    return rowIssues(r, rows, m.editId).errors.length > 0;
  });
  if (bad) {
    showToast("Korije erè yo anvan w sove.");
    return;
  }
  var touched = [];
  var editId = m.editId;
  rows.forEach(function (r) {
    var billId = billIdFor(r, touched);
    if (editId) {
      state.containers = state.containers.map(function (c) {
        return c.id === editId ? Object.assign({}, c, {
          numewo: r.numewo,
          billId: billId,
          size: r.size || c.size || "",
          dateEntered: r.dateEntered,
          dateLeft: r.dateLeft,
          plak: r.plak || null,
          chofer: r.chofer || null
        }) : c;
      });
    } else {
      state.containers.unshift({
        id: newId(),
        numewo: r.numewo,
        billId: billId,
        size: r.size,
        division: null,
        dateEntered: r.dateEntered,
        dateExpected: null,
        dateVerified: null,
        depo: null,
        trucking: null,
        chofer: r.chofer || null,
        plak: r.plak || null,
        dateEmpty: null,
        dateLeft: r.dateLeft
      });
    }
  });
  completeBillsQuietly(touched);
  state.modal = null;
  saveData();
  showToast(editId ? "Anrejistreman an modifye." : rows.length + " kontenè sove nan achiv la.");
  render();
}

export function archiveRecords() {
  return state.containers.filter(function (c) {
    return statusOf(c) === "kite";
  });
}
