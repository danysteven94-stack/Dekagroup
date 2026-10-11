// Administration DEKA: loads /api/overview (read-only) and turns it into one flat model: every container, bill (product),
// stock entry, delivery slip, returned / damaged goods and invoice of EVERY division, each tagged with its division.
//
// The divisions live in several databases ("pools"). Bill ids are only unique inside one database, so the inventory is
// worked out database by database (the same rule as the depot's Inventè, see inventory.js) and only then put together.
import {
  apiGet,
  showToast
} from "./api.js";
import { ALL_DIVISIONS } from "./constants.js";
import { computeInventory } from "./inventory.js";
import { render } from "./render.js";
import { state } from "./state.js";
import {
  billStatus,
  isUrgent,
  statusOf,
  today
} from "./utils.js";

// Division of a bill: the one written on its containers; else the only division of its database.
function billDivision(bill, containers, poolDivisions) {
  var c = containers.find(function (x) {
    return x.billId === bill.id && x.division;
  });
  if (c) {
    return c.division;
  }
  return poolDivisions.length === 1 ? poolDivisions[0] : "";
}

// pools: the "pools" array of /api/overview. Returns the flat model used by every Administration DEKA screen.
export function buildOverview(pools, todayStr) {
  todayStr = todayStr || today();
  var m = {
    containers: [],
    bills: [],
    inventory: [],
    stock: [],
    slips: [],
    goods: [],
    invoices: [],
    poolStatus: []
  };
  (pools || []).forEach(function (p) {
    m.poolStatus.push({
      pool: p.pool, divisions: p.divisions || [], ok: !!p.ok, error: p.error || "",
      total: (p.containers || []).length,
      noDivision: (p.containers || []).filter(function (c) { return !c.division; }).length,
      left: (p.containers || []).filter(function (c) { return !!c.dateLeft; }).length,
      copyOf: p.copyOf || "",
      copyCount: p.copyCount || 0
    });
    if (!p.ok) {
      return;
    }
    var containers = p.containers || [];
    var divisions = p.divisions || [];
    var billById = {};
    var bills = (p.bills || []).map(function (b) {
      var row = Object.assign({}, b, {
        _pool: p.pool,
        division: billDivision(b, containers, divisions),
        status: billStatus(b, containers),
        containers: containers.filter(function (c) { return c.billId === b.id; })
      });
      billById[b.id] = row;
      return row;
    });
    m.bills = m.bills.concat(bills);
    m.containers = m.containers.concat(containers.map(function (c) {
      var bill = c.billId ? billById[c.billId] : null;
      return Object.assign({}, c, {
        _pool: p.pool,
        status: statusOf(c),
        billNumewo: bill ? bill.numewo : "",
        product: bill ? bill.product || "" : ""
      });
    }));
    var divOfBill = function (id) {
      return billById[id] ? billById[id].division : divisions.length === 1 ? divisions[0] : "";
    };
    m.stock = m.stock.concat((p.stock || []).map(function (e) {
      var b = billById[e.billId];
      return Object.assign({}, e, { _pool: p.pool, division: divOfBill(e.billId), billNumewo: b ? b.numewo : "", product: b ? b.product || "" : "" });
    }));
    m.slips = m.slips.concat((p.slips || []).map(function (s) {
      return Object.assign({}, s, { _pool: p.pool, division: s.division || (divisions.length === 1 ? divisions[0] : "") });
    }));
    m.goods = m.goods.concat((p.goods || []).map(function (g) {
      var b = billById[g.billId];
      return Object.assign({}, g, { _pool: p.pool, division: divOfBill(g.billId), billNumewo: b ? b.numewo : "", product: b ? b.product || "" : "" });
    }));
    m.invoices = m.invoices.concat((p.invoices || []).map(function (i) {
      var b = billById[i.billId];
      return Object.assign({}, i, { _pool: p.pool, division: divOfBill(i.billId), billNumewo: b ? b.numewo : "" });
    }));
    var inv = computeInventory({
      bills: bills,
      stockEntries: p.stock || [],
      slips: p.slips || [],
      goodsIncidents: p.goods || []
    }, todayStr);
    m.inventory = m.inventory.concat(inv.map(function (r) {
      return Object.assign({}, r, { _pool: p.pool, division: divOfBill(r.billId) });
    }));
  });
  return m;
}

// What the picker calls "no division": containers that already left and were added from the archive have none.
export var NO_DIVISION = "__none__";

// Keeps what belongs to one division ("" = every division, NO_DIVISION = the ones without a division).
export function forDivision(list, division) {
  if (!division) {
    return list;
  }
  if (division.indexOf("pool:") === 0) {
    // one whole database, exactly as the logistic administrator sees it (archived containers with no division included)
    var pool = division.slice(5);
    return list.filter(function (x) {
      return x._pool === pool;
    });
  }
  if (division === NO_DIVISION) {
    return list.filter(function (x) {
      return !x.division;
    });
  }
  return list.filter(function (x) {
    return x.division === division;
  });
}

// Every division of the group, in the usual order, plus any unknown one found in the data.
export function divisionsInData(model) {
  var seen = {};
  ALL_DIVISIONS.forEach(function (d) { seen[d] = true; });
  var extra = [];
  model.containers.concat(model.slips).forEach(function (x) {
    if (x.division && !seen[x.division]) {
      seen[x.division] = true;
      extra.push(x.division);
    }
  });
  return ALL_DIVISIONS.concat(extra);
}

// Numbers shown on the overview, for the chosen division.
export function summarize(model, division, todayStr) {
  todayStr = todayStr || today();
  var cs = forDivision(model.containers, division);
  var count = function (s) {
    return cs.filter(function (c) { return c.status === s; }).length;
  };
  var inv = forDivision(model.inventory, division);
  var bills = forDivision(model.bills, division);
  return {
    containers: cs.length,
    disponib: count("disponib"),
    pran: count("pran"),
    pokoverifye: count("pokoverifye"),
    full: count("full"),
    vid: count("vid"),
    kite: count("kite"),
    pran: count("pran"),
    fullAll: count("full") + count("pokoverifye"),
    urgent: cs.filter(isUrgent).length,
    billsAktif: bills.filter(function (b) { return b.status === "aktif"; }).length,
    billsPlanifye: bills.filter(function (b) { return b.status === "planifye"; }).length,
    billsFini: bills.filter(function (b) { return b.status === "fini"; }).length,
    products: inv.length,
    inStock: inv.filter(function (r) { return r.current > 0; }).length,
    expired: inv.filter(function (r) { return r.expiryStatus === "expired"; }).length,
    soon: inv.filter(function (r) { return r.expiryStatus === "soon"; }).length,
    negative: inv.filter(function (r) { return r.negative; }).length,
    slipsToday: forDivision(model.slips, division).filter(function (s) { return s.slipDate === todayStr; }).length,
    unitsIn: Math.round(inv.reduce(function (t, r) { return t + (r.current > 0 ? r.current : 0); }, 0) * 100) / 100
  };
}

function message(e) {
  if (e && e.message && /failed to fetch|network|timeout|abort/i.test(e.message)) {
    return "Ou pa gen entènèt. Eseye ankò lè koneksyon an tounen.";
  }
  return e && e.message ? e.message : String(e);
}

export function loadOverview(silent) {
  var A = state.adm;
  if (A.loading) {
    return;
  }
  A.loading = true;
  if (!silent) {
    A.err = "";
    render();
  }
  apiGet("/api/overview").then(function (d) {
    A.model = buildOverview(d.pools || [], today());
    A.at = d.at ? new Date(d.at) : new Date();
    A.loaded = true;
    A.loading = false;
    A.err = "";
    render();
  }).catch(function (e) {
    A.loading = false;
    if (!silent) {
      A.err = message(e);
    }
    render();
    if (silent && A.loaded) {
      showToast("Pa t kapab rafrechi done yo.");
    }
  });
}
