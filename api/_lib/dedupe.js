"use strict";
// Administration DEKA: no duplicated data. When the same container or the same bill is recorded more than once (typically a
// container entered by the depot AND again from the Achiv once it left), only the most reliable record is kept and the gaps
// are filled from the others. This is a read-only view: nothing is removed from any database.
//
// A container record is "more reliable" when it is further along its life (it left > it is empty > it is full > ...): a
// container that already left can never stay "Full". Then the one with more information wins.
//
// Two records with the same container number are the same trip unless they clearly are two trips: two different bills, or one
// trip started after the other one had already left (the container came back later).

const norm = (v) => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, " ");
const has = (v) => v !== null && v !== undefined && v !== "";

function rank(c) {
  return c.dateLeft ? 5 : c.dateEmpty ? 4 : c.dateEntered && c.dateVerified ? 3 : c.dateEntered ? 2 : c.datePran ? 1 : 0;
}
const FIELDS = ["division", "size", "dateExpected", "datePran", "dateEntered", "dateVerified", "depo", "trucking", "chofer", "plak", "dateEmpty", "dateLeft"];
function info(c) {
  return FIELDS.reduce(function (n, f) { return n + (has(c[f]) ? 1 : 0); }, 0) + (c.billId ? 1 : 0);
}
function start(c) {
  return c.dateEntered || c.datePran || c.dateExpected || c.dateLeft || "";
}
// a's trip began after b had already left
function after(a, b) {
  return !!(b.dateLeft && start(a) && start(a) > b.dateLeft);
}

// pools: the "pools" array of /api/overview (each with containers, bills, stock, goods, invoices, slips)
function dedupe(pools) {
  const recs = [];
  pools.forEach(function (p) {
    if (!p.ok) return;
    const billNum = {};
    p.bills.forEach(function (b) { billNum[b.id] = norm(b.numewo); });
    p.containers.forEach(function (c) { recs.push({ c: c, pool: p, bill: c.billId ? billNum[c.billId] || "" : "" }); });
  });

  // ---- containers: group by number, then split the groups into trips
  const byNum = {};
  recs.forEach(function (r) { const k = norm(r.c.numewo); (byNum[k] = byNum[k] || []).push(r); });
  const drop = new Set();
  const stats = new Map();
  pools.forEach(function (p) { stats.set(p, { dupContainers: 0, dupBills: 0, dupOther: 0 }); });
  const same = function (a, b) {
    if (a.bill && b.bill && a.bill !== b.bill) return false;
    return !after(a.c, b.c) && !after(b.c, a.c);
  };
  Object.keys(byNum).forEach(function (k) {
    const list = byNum[k];
    if (list.length < 2) return;
    const trips = [];
    list.forEach(function (r) {
      const t = trips.find(function (t) { return t.every(function (x) { return same(x, r); }); });
      if (t) t.push(r); else trips.push([r]);
    });
    trips.forEach(function (t) {
      if (t.length < 2) return;
      t.sort(function (a, b) { return rank(b.c) - rank(a.c) || info(b.c) - info(a.c) || (b.c.division ? 1 : 0) - (a.c.division ? 1 : 0); });
      const best = t[0];
      const merged = Object.assign({}, best.c);
      t.slice(1).forEach(function (o) {
        FIELDS.forEach(function (f) {
          // dates of a later stage are never copied onto an earlier one (that would invent a status)
          if (!has(merged[f]) && has(o.c[f]) && f !== "dateEmpty" && f !== "dateLeft" && f !== "dateVerified") merged[f] = o.c[f];
        });
        if (!merged.billId && o.c.billId && o.pool === best.pool) merged.billId = o.c.billId;
        drop.add(o.c);
        stats.get(o.pool).dupContainers++;
      });
      best.pool.containers[best.pool.containers.indexOf(best.c)] = merged;
    });
  });
  pools.forEach(function (p) {
    if (p.ok) p.containers = p.containers.filter(function (c) { return !drop.has(c); });
  });

  // ---- bills: the same bill number = the same bill. Keep the one with the most containers.
  const count = function (p, id) { return p.containers.filter(function (c) { return c.billId === id; }).length; };
  const used = function (p, id) {
    return count(p, id) + p.stock.concat(p.goods, p.invoices).filter(function (x) { return x.billId === id; }).length;
  };
  const groups = {};
  pools.forEach(function (p) {
    if (!p.ok) return;
    p.bills.forEach(function (b) {
      const k = norm(b.numewo);
      if (k) (groups[k] = groups[k] || []).push({ b: b, p: p });
    });
  });
  const goneBills = new Set();
  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    if (g.length < 2) return;
    g.sort(function (x, y) {
      return count(y.p, y.b.id) - count(x.p, x.b.id) || (has(y.b.product) ? 1 : 0) - (has(x.b.product) ? 1 : 0) || (y.b.completedAt ? 1 : 0) - (x.b.completedAt ? 1 : 0);
    });
    const best = g[0];
    g.slice(1).forEach(function (o) {
      if (o.p === best.p) {
        // same database: everything that pointed to the duplicate now points to the kept bill
        [o.p.containers, o.p.stock, o.p.goods, o.p.invoices].forEach(function (list) {
          list.forEach(function (x) { if (x.billId === o.b.id) x.billId = best.b.id; });
        });
        if (!best.b.product && o.b.product) best.b.product = o.b.product;
        goneBills.add(o.b);
        stats.get(o.p).dupBills++;
      } else if (used(o.p, o.b.id) === 0) {
        // another database holds an empty copy of this bill
        goneBills.add(o.b);
        stats.get(o.p).dupBills++;
      }
    });
  });
  pools.forEach(function (p) {
    if (p.ok) p.bills = p.bills.filter(function (b) { return !goneBills.has(b); });
  });

  // ---- stock entries, returned / damaged goods, invoices and slips that are the very same record twice
  const once = function (p, list, keyOf) {
    const seen = {};
    return list.filter(function (x) {
      const k = keyOf(x);
      if (seen[k]) { stats.get(p).dupOther++; return false; }
      seen[k] = true;
      return true;
    });
  };
  pools.forEach(function (p) {
    if (!p.ok) return;
    p.stock = once(p, p.stock, function (e) { return [e.billId, e.entryDate, e.description, e.quantity, e.unit, e.containerNumewo, e.expiresOn].map(norm).join("|"); });
    p.goods = once(p, p.goods, function (g) { return [g.kind, g.billId, g.entryDate, g.description, g.quantity, g.unit, g.reason].map(norm).join("|"); });
    p.invoices = once(p, p.invoices, function (i) { return [i.invoiceNumber, i.billId].map(norm).join("|"); });
    p.slips = once(p, p.slips, function (s) { return [s.slipNumber, s.division].map(norm).join("|"); });
  });

  pools.forEach(function (p) {
    const s = stats.get(p);
    p.dupContainers = s.dupContainers;
    p.dupBills = s.dupBills;
    p.dupOther = s.dupOther;
  });
  return pools;
}

module.exports = { dedupe, rank };
