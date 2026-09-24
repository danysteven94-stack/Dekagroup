"use strict";
// Relational storage (PostgreSQL). Tables: containers, bills, notifications, inventory_checks, meta.
//
// Concurrency model (so two people can never silently overwrite each other):
//  * every write transaction first bumps a global revision counter (this also locks writers one at a time);
//  * every row remembers the revision and the writer (browser tab) of its last change;
//  * rows are sent to the browser with a fingerprint "_h"; when the browser sends rows back, the server can tell which
//    rows it really edited (fingerprint changed) from rows it merely carried along, and refuses only real edit conflicts;
//  * deletions are soft (tombstones) so "someone deleted it" can be told apart from "you never saw it".
const crypto = require("crypto");
const { redis } = require("./redis");
const DB = require("./db");
const S = require("./store");
const { ApiError } = require("./errors");

const LEGACY_KEY = "deka-log-data";

const CMAP = [
  ["id", "id"], ["numewo", "numewo"], ["bill_id", "billId"], ["size", "size"], ["division", "division"],
  ["date_entered", "dateEntered"], ["date_expected", "dateExpected"], ["date_verified", "dateVerified"],
  ["depo", "depo"], ["trucking", "trucking"], ["chofer", "chofer"], ["date_empty", "dateEmpty"], ["date_left", "dateLeft"],
];
const BMAP = [["id", "id"], ["numewo", "numewo"], ["product", "product"], ["completed_at", "completedAt"]];

const TABLES = {
  containers: { map: CMAP, name: "containers" },
  bills: { map: BMAP, name: "bills" },
};

const ready = new WeakMap();

// ---------- row <-> object ----------
function isPrim(v) {
  return v === null || typeof v === "boolean" || typeof v === "number" || (typeof v === "string" && v.length <= 200);
}

function fromRow(row, map) {
  const o = {};
  map.forEach(function (m) {
    const v = row[m[0]];
    o[m[1]] = v === undefined ? null : v;
  });
  let ex = {};
  try { ex = JSON.parse(row.extra || "{}"); } catch (e) { ex = {}; }
  Object.keys(ex).forEach(function (k) { if (!(k in o)) o[k] = ex[k]; });
  return o;
}

function toRow(obj, map) {
  const row = {};
  const known = {};
  map.forEach(function (m) {
    known[m[1]] = true;
    const v = obj[m[1]];
    row[m[0]] = v === undefined || v === null ? null : typeof v === "string" ? v : String(v);
  });
  if (row.size === null && map === CMAP) row.size = "";
  const ex = {};
  Object.keys(obj).forEach(function (k) {
    if (known[k] || k.charAt(0) === "_") return;
    if (isPrim(obj[k])) ex[k] = obj[k];
  });
  row.extra = JSON.stringify(ex);
  return row;
}

function canon(o) {
  const r = {};
  Object.keys(o).filter(function (k) { return k.charAt(0) !== "_"; }).sort().forEach(function (k) { r[k] = o[k]; });
  return JSON.stringify(r);
}

function rowHash(o) {
  return crypto.createHash("sha1").update(canon(o)).digest("hex").slice(0, 16);
}

function num(v) {
  return v === null || v === undefined ? 0 : Number(v);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function stripHint(o) {
  const c = Object.assign({}, o);
  delete c._h;
  return c;
}

// ---------- loading ----------
function wrapRow(row, map) {
  const obj = fromRow(row, map);
  return { id: row.id, obj: obj, hash: rowHash(obj), rev: num(row.rev), writer: row.writer || null, deleted: num(row.deleted) === 1, ord: num(row.ord) };
}

async function loadRows(q) {
  // rev first: if anything commits meanwhile we would only ever look older than the rows, never newer (safe side).
  const meta = await q("SELECT value FROM meta WHERE name = 'rev'");
  const rev = meta[0] ? num(meta[0].value) : 0;
  const c = await q("SELECT * FROM containers ORDER BY ord DESC");
  const b = await q("SELECT * FROM bills ORDER BY ord DESC");
  const n = await q("SELECT * FROM notifications ORDER BY seq DESC");
  const k = await q("SELECT * FROM inventory_checks");
  return {
    rev: rev,
    containers: c.map(function (r) { return wrapRow(r, CMAP); }),
    bills: b.map(function (r) { return wrapRow(r, BMAP); }),
    notifs: n.map(function (r) {
      const o = { id: r.id, billNumewo: r.bill_numewo || "", date: r.notif_date, message: r.message };
      let ex = {};
      try { ex = JSON.parse(r.extra || "{}"); } catch (e) { ex = {}; }
      Object.keys(ex).forEach(function (key) { if (!(key in o)) o[key] = ex[key]; });
      return { id: r.id, obj: o, rev: num(r.rev), writer: r.writer || null, seq: num(r.seq) };
    }),
    checks: k.map(function (r) { return { id: r.container_id, val: r.checked_on, rev: num(r.rev), writer: r.writer || null }; }),
  };
}

function toBlob(cur) {
  const checks = {};
  cur.checks.forEach(function (c) { checks[c.id] = c.val; });
  return {
    containers: cur.containers.filter(function (r) { return !r.deleted; }).map(function (r) { return r.obj; }),
    bills: cur.bills.filter(function (r) { return !r.deleted; }).map(function (r) { return r.obj; }),
    notifications: cur.notifs.map(function (r) { return r.obj; }),
    inventoryChecks: checks,
  };
}

function withHashes(blob) {
  return Object.assign({}, blob, {
    containers: blob.containers.map(function (r) { return Object.assign({}, r, { _h: rowHash(r) }); }),
    bills: blob.bills.map(function (r) { return Object.assign({}, r, { _h: rowHash(r) }); }),
  });
}

// ---------- planning ----------
// mode "client": rows come from a browser (may be stale). mode "diff": rows come from server-side logic on fresh data.
function planRows(curList, incoming, ctx) {
  const curMap = new Map(curList.map(function (r) { return [r.id, r]; }));
  const up = [], del = [], conflicts = [], seen = new Set();

  incoming.forEach(function (row) {
    seen.add(row.id);
    const h = rowHash(row);
    const cr = curMap.get(row.id);
    if (!cr) { up.push({ obj: row, isNew: true }); return; }
    if (ctx.mode === "diff") {
      if (cr.deleted || cr.hash !== h) up.push({ obj: row, isNew: false });
      return;
    }
    const carried = row._h !== undefined && row._h === h; // the browser did not edit this row
    if (cr.deleted) {
      if (carried) return; // never resurrect what somebody deleted
      if (cr.rev > ctx.baseRev && cr.writer !== ctx.cid) conflicts.push({ id: row.id, numewo: row.numewo, why: "deleted" });
      else up.push({ obj: row, isNew: false });
      return;
    }
    if (cr.hash === h) return; // identical
    if (carried) return; // stale copy of a row the browser did not touch: keep the newer server version
    const ok = cr.writer === ctx.cid || (row._h !== undefined ? row._h === cr.hash : cr.rev <= ctx.baseRev);
    if (ok) up.push({ obj: row, isNew: false });
    else conflicts.push({ id: row.id, numewo: row.numewo || cr.obj.numewo, why: "changed" });
  });

  curList.forEach(function (cr) {
    if (cr.deleted || seen.has(cr.id)) return;
    // absent from the browser's copy: deleted by the browser, or simply never seen by it (created after its snapshot)?
    if (ctx.mode === "diff" || cr.rev <= ctx.baseRev || cr.writer === ctx.cid) del.push(cr.id);
  });
  return { up: up, del: del, conflicts: conflicts };
}

function planNotifs(cur, incoming, ctx) {
  const have = new Set(cur.map(function (r) { return r.id; }));
  const inSet = new Set(incoming.map(function (n) { return n.id; }));
  const ins = incoming.filter(function (n) { return !have.has(n.id); });
  const del = [];
  cur.forEach(function (r) {
    if (inSet.has(r.id)) return;
    if (ctx.mode === "diff" || r.rev <= ctx.baseRev || r.writer === ctx.cid) del.push(r.id);
  });
  // keep the newest 200 overall
  const delSet = new Set(del);
  const kept = cur.filter(function (r) { return !delSet.has(r.id); });
  const overflow = kept.length + ins.length - 200;
  if (overflow > 0) kept.slice(-overflow).forEach(function (r) { del.push(r.id); });
  return { ins: ins, del: del };
}

function planChecks(cur, incoming, ctx) {
  const curMap = new Map(cur.map(function (r) { return [r.id, r]; }));
  const up = [], del = [];
  const cutoff = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const want = {};
  Object.keys(incoming).forEach(function (k) {
    const v = incoming[k];
    if (typeof v === "string" && v >= cutoff) want[k] = v;
  });
  Object.keys(want).forEach(function (k) {
    const cr = curMap.get(k);
    if (!cr) up.push([k, want[k]]);
    else if (cr.val !== want[k] && (ctx.mode === "diff" || cr.rev <= ctx.baseRev || cr.writer === ctx.cid)) up.push([k, want[k]]);
  });
  cur.forEach(function (cr) {
    if (cr.val < cutoff) { del.push(cr.id); return; }
    if (Object.prototype.hasOwnProperty.call(want, cr.id)) return;
    if (ctx.mode === "diff" || cr.rev <= ctx.baseRev || cr.writer === ctx.cid) del.push(cr.id);
  });
  return { up: up, del: del };
}

function isEmptyPlan(p) {
  return !p.c.up.length && !p.c.del.length && !p.b.up.length && !p.b.del.length && !p.n.ins.length && !p.n.del.length && !p.k.up.length && !p.k.del.length;
}

function buildPlan(cur, target, ctx) {
  const c = planRows(cur.containers, target.containers, ctx);
  const b = planRows(cur.bills, target.bills, ctx);
  const n = planNotifs(cur.notifs, target.notifications, ctx);
  const k = planChecks(cur.checks, target.inventoryChecks, ctx);
  return { c: c, b: b, n: n, k: k, conflicts: c.conflicts.concat(b.conflicts) };
}

// ---------- applying ----------
function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertMany(q, table, pk, cols, updateCols, rows, touch) {
  for (const part of chunks(rows, 200)) {
    const params = [];
    const tuples = part.map(function (r) {
      return "(" + cols.map(function (c) { params.push(r[c]); return "$" + params.length; }).join(",") + ")";
    });
    await q(
      "INSERT INTO " + table + " (" + cols.join(",") + ") VALUES " + tuples.join(",") +
      " ON CONFLICT (" + pk + ") DO UPDATE SET " + updateCols.map(function (c) { return c + " = excluded." + c; }).join(",") + (touch ? ", updated_at = CURRENT_TIMESTAMP" : ""),
      params
    );
  }
}

async function removeMany(q, sqlPrefix, ids, lead, sqlSuffix) {
  for (const part of chunks(ids, 400)) {
    const params = lead.slice();
    const ph = part.map(function (id) { params.push(id); return "$" + params.length; });
    await q(sqlPrefix + "(" + ph.join(",") + ")" + (sqlSuffix || ""), params);
  }
}

async function applyPlan(q, cur, plan, rev, writer) {
  const hashes = { containers: {}, bills: {} };

  for (const key of ["containers", "bills"]) {
    const t = TABLES[key];
    const part = key === "containers" ? plan.c : plan.b;
    const list = key === "containers" ? cur.containers : cur.bills;
    const maxOrd = list.reduce(function (m, r) { return Math.max(m, r.ord); }, 0);
    const news = part.up.filter(function (u) { return u.isNew; }).length;
    let idx = 0;
    const rows = part.up.map(function (u) {
      const r = toRow(u.obj, t.map);
      r.rev = rev; r.writer = writer; r.deleted = 0;
      r.ord = u.isNew ? maxOrd + (news - idx++) : 0; // ord is only written for new rows (the upsert never updates it)
      hashes[key][u.obj.id] = rowHash(u.obj);
      return r;
    });
    const cols = t.map.map(function (m) { return m[0]; }).concat(["extra", "ord", "rev", "writer", "deleted"]);
    const upd = t.map.map(function (m) { return m[0]; }).filter(function (c) { return c !== "id"; }).concat(["extra", "rev", "writer", "deleted"]);
    await upsertMany(q, t.name, "id", cols, upd, rows, true);
    if (part.del.length) {
      await removeMany(q, "UPDATE " + t.name + " SET deleted = 1, rev = $1, writer = $2, updated_at = CURRENT_TIMESTAMP WHERE id IN ", part.del, [rev, writer]);
    }
  }

  // notifications
  if (plan.n.ins.length) {
    const maxSeq = cur.notifs.reduce(function (m, r) { return Math.max(m, r.seq); }, 0);
    const total = plan.n.ins.length;
    const rows = plan.n.ins.map(function (n, i) {
      const ex = {};
      Object.keys(n).forEach(function (k) { if (["id", "billNumewo", "date", "message"].indexOf(k) === -1 && k.charAt(0) !== "_" && isPrim(n[k])) ex[k] = n[k]; });
      return { id: n.id, seq: maxSeq + (total - i), bill_numewo: n.billNumewo || "", notif_date: n.date || null, message: String(n.message), extra: JSON.stringify(ex), rev: rev, writer: writer };
    });
    await upsertMany(q, "notifications", "id", ["id", "seq", "bill_numewo", "notif_date", "message", "extra", "rev", "writer"], ["message"], rows, false);
  }
  if (plan.n.del.length) await removeMany(q, "DELETE FROM notifications WHERE id IN ", plan.n.del, []);

  // inventory checks
  if (plan.k.up.length) {
    const rows = plan.k.up.map(function (u) { return { container_id: u[0], checked_on: u[1], rev: rev, writer: writer }; });
    await upsertMany(q, "inventory_checks", "container_id", ["container_id", "checked_on", "rev", "writer"], ["checked_on", "rev", "writer"], rows, false);
  }
  if (plan.k.del.length) await removeMany(q, "DELETE FROM inventory_checks WHERE container_id IN ", plan.k.del, []);
  return hashes;
}

// ---------- schema + one-time import from Redis ----------
async function bump(q) {
  const r = await q("UPDATE meta SET value = value + 1 WHERE name = 'rev' RETURNING value");
  if (!r.length) throw new Error("meta.rev manke");
  return num(r[0].value);
}

function lenient(blob) {
  const seen = new Set();
  const fix = function (arr, prefix) {
    return (Array.isArray(arr) ? arr : []).filter(function (o) { return o && typeof o === "object" && !Array.isArray(o); }).map(function (o) {
      const c = Object.assign({}, o);
      if (typeof c.id !== "string" || !c.id) c.id = prefix + crypto.randomBytes(5).toString("hex");
      return c;
    }).filter(function (o) { if (seen.has(prefix + o.id)) return false; seen.add(prefix + o.id); return true; });
  };
  const notifs = fix(blob.notifications, "n").map(function (n) { return Object.assign({}, n, { message: String(n.message === undefined ? "" : n.message) }); });
  const containers = fix(blob.containers, "c").map(function (c) { return Object.assign({}, c, { numewo: String(c.numewo === undefined ? "" : c.numewo) }); });
  const bills = fix(blob.bills, "b").map(function (b) { return Object.assign({}, b, { numewo: String(b.numewo === undefined ? "" : b.numewo) }); });
  const checks = {};
  if (blob.inventoryChecks && typeof blob.inventoryChecks === "object") {
    Object.keys(blob.inventoryChecks).forEach(function (k) { if (typeof blob.inventoryChecks[k] === "string") checks[k] = blob.inventoryChecks[k]; });
  }
  return { containers: containers, bills: bills, notifications: notifs, inventoryChecks: checks };
}

// Inserts a whole data set (first item = newest). Used by the one-time import and by the tests.
async function importBlob(q, blob, rev, writer) {
  const cur = { containers: [], bills: [], notifs: [], checks: [] };
  const plan = buildPlan(cur, blob, { mode: "diff" });
  // notifications: the plan caps at 200; the import keeps them all (<=200 anyway)
  await applyPlan(q, cur, plan, rev, writer);
}

async function migrateFromRedis(d) {
  const flag = await d.query("SELECT value FROM meta WHERE name = 'migrated'");
  if (flag[0] && num(flag[0].value) === 1) return;
  const legacy = await redis.get(LEGACY_KEY); // if Redis is down this throws and the import is retried on the next request
  await d.tx(async function (q) {
    const won = await q("UPDATE meta SET value = 1 WHERE name = 'migrated' AND value = 0 RETURNING value");
    if (!won.length) return; // another instance already did it
    const rev = await bump(q);
    if (legacy && typeof legacy === "object") await importBlob(q, lenient(legacy), rev, "migration");
  });
}

async function ensure(d) {
  if (ready.has(d)) return ready.get(d);
  const p = (async function () {
    let ok = false;
    try {
      const r = await d.query("SELECT value FROM meta WHERE name = 'schema'");
      ok = !!(r[0] && num(r[0].value) >= DB.SCHEMA_VERSION);
    } catch (e) { ok = false; }
    if (!ok) {
      for (const sql of DB.DDL) await d.query(sql);
      await d.query("INSERT INTO meta (name, value) VALUES ('schema', " + DB.SCHEMA_VERSION + ") ON CONFLICT (name) DO UPDATE SET value = excluded.value");
    }
    await migrateFromRedis(d);
  })();
  ready.set(d, p);
  p.catch(function () { ready.delete(d); });
  return p;
}

// ---------- public API ----------
class NoChange extends Error {
  constructor(payload) { super("no change"); this.payload = payload; }
}

async function driver() {
  const d = DB.getDriver();
  await ensure(d);
  return d;
}

async function readAll() {
  const d = await driver();
  const cur = await d.tx(function (q) { return loadRows(q); }, { readOnly: true });
  const blob = toBlob(cur);
  return { blob: blob, rev: cur.rev, view: withHashes(blob) };
}

function conflictMessage(conflicts) {
  const names = conflicts.slice(0, 5).map(function (c) { return c.numewo || c.id; }).join(", ");
  return "Yon lòt moun te chanje oswa efase menm done yo pandan w t ap travay (" + names + (conflicts.length > 5 ? ", ..." : "") + "). Done yo rafrechi; refè chanjman ou.";
}

async function writeClient(clean, opts) {
  if (!Number.isInteger(opts.baseRev) || opts.baseRev < 0) {
    throw new ApiError(409, "stale_client", "Vèsyon aplikasyon an vye. Rafrechi paj la (fèmen epi louvri l ankò).");
  }
  const d = await driver();
  try {
    return await d.tx(async function (q) {
      const rev = await bump(q);
      const cur = await loadRows(q);
      const activeC = cur.containers.filter(function (r) { return !r.deleted; }).length;
      if (clean.containers.length === 0 && activeC > 0) throw new ApiError(409, "empty_payload", "Sove a bloke: done yo vid. Rechaje paj la.");
      const plan = buildPlan(cur, clean, { mode: "client", baseRev: Math.min(opts.baseRev, rev - 1), cid: opts.cid });
      if (plan.conflicts.length) throw new ApiError(409, "conflict", conflictMessage(plan.conflicts), { conflicts: plan.conflicts.slice(0, 20) });
      const prev = toBlob(cur);
      if (isEmptyPlan(plan)) throw new NoChange({ rev: rev - 1, prev: prev, blob: prev, changed: false, hashes: { containers: {}, bills: {} } });
      const hashes = await applyPlan(q, cur, plan, rev, opts.cid);
      const after = await loadRows(q);
      const blob = toBlob(after);
      return { rev: rev, prev: prev, blob: blob, changed: true, hashes: hashes };
    });
  } catch (e) {
    if (e instanceof NoChange) return e.payload;
    throw e;
  }
}

async function mutate(fn, opts) {
  const d = await driver();
  const writer = (opts && opts.cid) || "server";
  try {
    return await d.tx(async function (q) {
      const rev = await bump(q);
      const cur = await loadRows(q);
      const prev = toBlob(cur);
      const next = clone(prev);
      const info = await fn(next);
      const plan = buildPlan(cur, next, { mode: "diff" });
      if (isEmptyPlan(plan)) throw new NoChange({ info: info, rev: rev - 1, prev: prev, blob: prev, view: withHashes(prev), changed: false });
      await applyPlan(q, cur, plan, rev, writer);
      const after = toBlob(await loadRows(q));
      return { info: info, rev: rev, prev: prev, blob: after, view: withHashes(after), changed: true };
    });
  } catch (e) {
    if (e instanceof NoChange) return e.payload;
    throw e;
  }
}

async function health() {
  const d = await driver();
  const cur = await d.tx(function (q) { return loadRows(q); }, { readOnly: true });
  const mig = await d.query("SELECT value FROM meta WHERE name = 'migrated'");
  return {
    backend: "postgres", ok: true, rev: cur.rev,
    containers: cur.containers.filter(function (r) { return !r.deleted; }).length,
    bills: cur.bills.filter(function (r) { return !r.deleted; }).length,
    notifications: cur.notifs.length,
    migrated: !!(mig[0] && num(mig[0].value) === 1),
  };
}

// Tests only: replace everything with the given data set.
async function _testLoad(blob) {
  const d = await driver();
  await d.tx(async function (q) {
    const rev = await bump(q);
    for (const t of ["containers", "bills", "notifications", "inventory_checks"]) await q("DELETE FROM " + t);
    await importBlob(q, blob, rev, "test");
  });
}

module.exports = { name: "postgres", driver, readAll, writeClient, mutate, health, _testLoad, withHashes, rowHash, stripHint };
