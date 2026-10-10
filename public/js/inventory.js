// Inventory ("Inventè"): what is left in the depot for each product, worked out from the records themselves — nothing is typed twice.
//
//   Stock now = Entered (Antre Estòk) − Delivered (Fich Livrezon) − Damaged (Machandiz Avarye) + Returned (Machandiz Retounen)
//
// A "product" here is one Bill + one description + one unit, the same three things written on a stock entry. Delivery slip lines,
// returned goods and damaged goods are matched to the stock by that same key, so a delivery always takes goods off the right pile.
// Old deliveries registered before the slips existed (kind "livrezon" in the goods list) still count as delivered.
//
// Expiry: goods leave first-expiring-first. So the "next expiry" of a product is the earliest expiry date among what is really still
// in stock, not the date of a lot that has already been delivered.
export var EXPIRY_SOON_DAYS = 30;

function num(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function productKey(billId, description, unit) {
  return [
    String(billId || ""),
    String(description || "").trim().toLowerCase().replace(/\s+/g, " "),
    String(unit || "").trim().toLowerCase()
  ].join("|");
}

// Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is before `from`.
export function daysUntil(to, from) {
  var a = Date.parse(from + "T00:00:00Z");
  var b = Date.parse(to + "T00:00:00Z");
  if (isNaN(a) || isNaN(b)) {
    return null;
  }
  return Math.round((b - a) / 86400000);
}

// "ok" | "soon" | "expired" | "none" (no expiry date known)
export function expiryStatus(expiresOn, todayStr) {
  if (!expiresOn) {
    return "none";
  }
  var d = daysUntil(expiresOn, todayStr);
  if (d === null) {
    return "none";
  }
  if (d < 0) {
    return "expired";
  }
  return d <= EXPIRY_SOON_DAYS ? "soon" : "ok";
}

export function computeInventory(input, todayStr) {
  var bills = input.bills || [];
  var rows = {};
  var order = [];

  function row(billId, description, unit) {
    var key = productKey(billId, description, unit);
    if (!rows[key]) {
      var bill = bills.find(function (b) { return b.id === billId; });
      rows[key] = {
        key: key,
        billId: billId,
        billNumewo: bill ? bill.numewo : "",
        product: bill && bill.product ? bill.product : "",
        description: String(description || "").trim(),
        unit: String(unit || "").trim(),
        entered: 0,
        delivered: 0,
        damaged: 0,
        returned: 0,
        lots: []
      };
      order.push(key);
    }
    return rows[key];
  }

  (input.stockEntries || []).forEach(function (e) {
    var r = row(e.billId, e.description, e.unit);
    var q = num(e.quantity);
    r.entered += q;
    r.lots.push({ expiresOn: e.expiresOn || null, entryDate: e.entryDate || "", quantity: q });
  });

  (input.slips || []).forEach(function (s) {
    (s.items || []).forEach(function (it) {
      row(it.billId, it.description, it.unit).delivered += num(it.quantity);
    });
  });

  (input.goodsIncidents || []).forEach(function (g) {
    var r = row(g.billId, g.description, g.unit);
    var q = num(g.quantity);
    if (g.kind === "livrezon") {
      r.delivered += q;
    } else if (g.kind === "avarye") {
      r.damaged += q;
    } else if (g.kind === "retounen") {
      r.returned += q;
    }
  });

  var list = order.map(function (key) {
    var r = rows[key];
    r.entered = round2(r.entered);
    r.delivered = round2(r.delivered);
    r.damaged = round2(r.damaged);
    r.returned = round2(r.returned);
    r.current = round2(r.entered - r.delivered - r.damaged + r.returned);

    // First-expiring-first: take what left the depot off the lots that expire soonest (lots with no date go last).
    var lots = r.lots.slice().sort(function (a, b) {
      if (a.expiresOn && b.expiresOn) {
        return a.expiresOn.localeCompare(b.expiresOn) || (a.entryDate || "").localeCompare(b.entryDate || "");
      }
      if (a.expiresOn) {
        return -1;
      }
      if (b.expiresOn) {
        return 1;
      }
      return (a.entryDate || "").localeCompare(b.entryDate || "");
    }).map(function (l) {
      return { expiresOn: l.expiresOn, entryDate: l.entryDate, left: l.quantity };
    });
    var out = Math.max(0, r.delivered + r.damaged - r.returned);
    lots.forEach(function (l) {
      var take = Math.min(l.left, out);
      l.left = round2(l.left - take);
      out = round2(out - take);
    });
    r.lots = lots.filter(function (l) { return l.left > 0; });
    var dated = r.lots.filter(function (l) { return l.expiresOn; });
    r.nextExpiry = dated.length ? dated[0].expiresOn : null;
    r.nextExpiryQty = dated.length ? dated[0].left : 0;
    r.expiredQty = round2(dated.filter(function (l) { return expiryStatus(l.expiresOn, todayStr) === "expired"; }).reduce(function (s, l) { return s + l.left; }, 0));
    r.expiryStatus = r.current > 0 ? expiryStatus(r.nextExpiry, todayStr) : "none";
    r.negative = r.current < 0;
    return r;
  });

  list.sort(function (a, b) {
    return (a.billNumewo || "").localeCompare(b.billNumewo || "") || a.description.localeCompare(b.description);
  });
  return list;
}

// How much of one product is available right now (used by the delivery form, line by line).
export function availableFor(inventory, key) {
  var r = inventory.find(function (x) { return x.key === key; });
  return r ? r.current : 0;
}

// Quantities already asked for on a slip being filled in, per product key (so two lines of the same product are added up).
export function requestedByKey(items) {
  var out = {};
  (items || []).forEach(function (it) {
    if (!it.key) {
      return;
    }
    out[it.key] = round2((out[it.key] || 0) + num(it.quantity));
  });
  return out;
}
