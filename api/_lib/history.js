"use strict";
// Container history ("Istorik"): an append-only log of what happened to each container, who did it and when.
// Events are worked out by comparing the data before and after every save (see store.afterCommit), so it
// covers the admin, depot, driver and Daily Report screens without touching any of their code.
// Stored in PostgreSQL when the pool has a database, otherwise in Redis (same dual-backend pattern as stockentries.js).
const crypto = require("crypto");
const DB = require("./db");
const pg = require("./pgrepo");
const { redis } = require("./redis");

const REDIS_PREFIX = "dl:chist:";
const KEEP_PER_CONTAINER = 200;

// Ids sort in the order events happened (time, then position inside one save), so same-millisecond saves keep their order.
function newId(base, i) {
  return base.toString(36).padStart(10, "0") + i.toString(36).padStart(3, "0") + crypto.randomBytes(3).toString("hex");
}

function clip(v, n) {
  return String(v === undefined || v === null ? "" : v).slice(0, n);
}

function who(c) {
  const parts = [];
  if (c.trucking) parts.push(c.trucking);
  if (c.chofer) parts.push(c.chofer + (c.plak ? " (" + c.plak + ")" : ""));
  else if (c.plak) parts.push(c.plak);
  return parts.join(" \u00B7 ");
}

const FIELD_LABEL = {
  dateExpected: "Dat ki te espere",
  dateEntered: "Dat antre",
  dateVerified: "Dat verifikasyon",
  dateEmpty: "Dat vid",
  dateLeft: "Dat sòti",
};

// Compares two container lists and returns the events (without actor/time) that explain the difference.
function diff(prevList, nextList) {
  const before = {};
  (prevList || []).forEach(function (c) { before[c.id] = c; });
  const seen = {};
  const out = [];
  (nextList || []).forEach(function (c) {
    seen[c.id] = true;
    const p = before[c.id];
    const ev = function (kind, info) { out.push({ containerId: c.id, numewo: c.numewo, kind: kind, info: clip(info, 300) }); };
    if (!p) {
      ev("created", [c.division, c.size ? c.size + "'" : ""].filter(Boolean).join(" \u00B7 "));
    }
    const a = p || {};
    // milestones: first time a date is set
    if (!a.dateExpected && c.dateExpected) ev("expected", c.dateExpected);
    if (!a.dateEntered && c.dateEntered) ev("entered", c.dateEntered);
    if (!a.dateVerified && c.dateVerified) ev("verified", [c.dateVerified, c.depo, c.trucking].filter(Boolean).join(" \u00B7 "));
    if (!a.dateDebarq && c.dateDebarq) ev("debarq", c.debarqName || c.debarqBy || "");
    if (a.dateDebarq && !c.dateDebarq) ev("debarq_undo", a.debarqName || a.debarqBy || "");
    // who unloaded it travels with the "empty" event, so the timeline says who unloaded and emptied the container
    if (!a.dateEmpty && c.dateEmpty) ev("empty", [c.dateEmpty, c.debarqName ? "Pointeur: " + c.debarqName : ""].filter(Boolean).join(" \u00B7 "));
    if (!a.datePran && c.datePran) ev("pran", who(c));
    if (a.datePran && !c.datePran) ev("pran_undo", who(a));
    if (!a.dateLeft && c.dateLeft) ev("left", who(c));
    if (a.dateLeft && !c.dateLeft) ev("reopened", "");
    // corrections: a date that was already there and now says something else (or was cleared)
    if (p) {
      Object.keys(FIELD_LABEL).forEach(function (f) {
        if (a[f] && a[f] !== c[f] && !(f === "dateLeft" && !c.dateLeft)) {
          ev("corrected", FIELD_LABEL[f] + ": " + a[f] + " \u2192 " + (c[f] || "\u2014"));
        }
      });
      const movedDepo = (a.depo || "") !== (c.depo || "");
      const movedTruck = (a.trucking || "") !== (c.trucking || "");
      const stampedByTake = (!a.dateLeft && c.dateLeft) || (!a.datePran && c.datePran) || (a.datePran && !c.datePran);
      if ((movedDepo || movedTruck) && !stampedByTake && a.dateVerified && c.dateVerified && a.dateVerified === c.dateVerified) {
        ev("transfer", [movedDepo ? (a.depo || "\u2014") + " \u2192 " + (c.depo || "\u2014") : "", movedTruck ? (a.trucking || "\u2014") + " \u2192 " + (c.trucking || "\u2014") : ""].filter(Boolean).join(" \u00B7 "));
      } else if ((movedDepo || movedTruck) && !stampedByTake && !(!a.dateVerified && c.dateVerified)) {
        ev("edited", [movedDepo ? "Depo: " + (a.depo || "\u2014") + " \u2192 " + (c.depo || "\u2014") : "", movedTruck ? "Trucking: " + (a.trucking || "\u2014") + " \u2192 " + (c.trucking || "\u2014") : ""].filter(Boolean).join(" \u00B7 "));
      }
    }
  });
  (prevList || []).forEach(function (p) {
    if (!seen[p.id]) out.push({ containerId: p.id, numewo: p.numewo, kind: "deleted", info: "" });
  });
  return out;
}

function guardSkip(poolKey) {
  // a preview deployment without its own database must not write into production data
  return !DB.getDriver(poolKey) && process.env.VERCEL_ENV === "preview";
}

async function append(events, session) {
  if (!events.length) return;
  const poolKey = session && session.pool;
  if (guardSkip(poolKey)) return;
  const base = Date.now();
  const actor = clip(session && session.username, 60);
  const actorName = clip(session && session.name, 80);
  const role = clip(session && session.role, 20);
  const rows = events.map(function (e, i) {
    return { id: newId(base, i), containerId: e.containerId, numewo: clip(e.numewo, 40), ts: new Date(base + i).toISOString(), kind: e.kind, info: e.info, actor: actor, actorName: actorName, role: role };
  });
  const d = DB.getDriver(poolKey);
  if (d) {
    await pg.driver(poolKey);
    for (const r of rows) {
      await d.query(
        "INSERT INTO container_history (id, container_id, numewo, ts, kind, info, actor, actor_name, role) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING",
        [r.id, r.containerId, r.numewo, r.ts, r.kind, r.info, r.actor, r.actorName, r.role]
      );
    }
    return;
  }
  for (const r of rows) {
    const key = REDIS_PREFIX + r.containerId;
    await redis.lpush(key, JSON.stringify(r));
    await redis.ltrim(key, 0, KEEP_PER_CONTAINER - 1);
  }
}

// Called after every successful save. Never throws: a failure here must not undo or block the save.
async function recordDiff(prev, next, session) {
  try {
    await append(diff(prev && prev.containers, next && next.containers), session);
  } catch (e) {
    console.error("history error:", e && e.message);
  }
}

async function list(containerId, poolKey) {
  if (guardSkip(poolKey)) return [];
  const d = DB.getDriver(poolKey);
  if (d) {
    await pg.driver(poolKey);
    const rows = await d.query("SELECT * FROM container_history WHERE container_id = $1 ORDER BY ts DESC, id DESC LIMIT " + KEEP_PER_CONTAINER, [containerId]);
    return rows.map(function (r) {
      return { id: r.id, ts: r.ts, kind: r.kind, info: r.info || "", actor: r.actor || "", actorName: r.actor_name || "", role: r.role || "" };
    });
  }
  const rows = (await redis.lrange(REDIS_PREFIX + containerId, 0, KEEP_PER_CONTAINER - 1)) || [];
  return rows.map(function (r) {
    if (typeof r !== "string") return r;
    try { return JSON.parse(r); } catch (e) { return null; }
  }).filter(Boolean).map(function (r) {
    return { id: r.id, ts: r.ts, kind: r.kind, info: r.info || "", actor: r.actor || "", actorName: r.actorName || "", role: r.role || "" };
  });
}

module.exports = { diff, recordDiff, list };
