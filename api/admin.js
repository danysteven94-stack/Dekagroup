"use strict";
// Sèl pwen antre pou 3 wout admin ki senp (audit, health, backup).
// Vercel Hobby plan limite a 12 Serverless Functions pou chak Deployment, se poutèt sa
// nou gwoupe 3 fonksyon (audit, health, backup) an yon sèl, menm jan ak /api/auth.
// Wout la (/api/audit, /api/health, /api/backup) rekonèt gras a "rewrites" nan vercel.json,
// ki ajoute ?action=... nan demann lan (backup gade ?i= tou, li rive san pwoblèm).

const A = require("./_lib/auth");
const { redis } = require("./_lib/redis");
const S = require("./_lib/store");
const repo = require("./_lib/repo");

function parseJson(r) {
  if (typeof r !== "string") return r;
  try { return JSON.parse(r); } catch (e) { return null; }
}

async function audit(req, res, session) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const rows = await redis.lrange("dl:audit", 0, 299);
  const events = (rows || []).map(function (r) {
    if (typeof r !== "string") return r;
    try { return JSON.parse(r); } catch (e) { return { raw: r }; }
  });
  res.status(200).json({ count: events.length, events: events });
}

async function health(req, res, session) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    res.status(200).json(await repo.health());
  } catch (e) {
    console.error("health error:", e && e.message);
    res.status(200).json({ backend: repo.name(), ok: false, error: "Baz done a pa reponn." });
  }
}

async function backup(req, res, session) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const rows = (await redis.lrange(S.BACKUP_KEY, 0, 11)) || [];
  const snaps = rows.map(parseJson);
  const q = req.query && req.query.i;

  if (q !== undefined) {
    const i = Number(q);
    const snap = Number.isInteger(i) ? snaps[i] : null;
    if (!snap || !snap.data) { res.status(404).json({ error: "Pa jwenn kopi sa a." }); return; }
    await A.audit(req, "backup_download", { i: i, ts: snap.ts }, session);
    res.setHeader("Content-Disposition", 'attachment; filename="deka-log-backup-' + String(snap.ts).slice(0, 16).replace(/[:T]/g, "-") + '.json"');
    res.status(200).json(snap.data);
    return;
  }

  res.status(200).json({
    count: snaps.length,
    backups: snaps.map(function (s, i) {
      return s && s.data ? { i: i, ts: s.ts, containers: s.data.containers.length, bills: s.data.bills.length } : { i: i, broken: true };
    }),
  });
}

const handlers = { audit: audit, health: health, backup: backup };

module.exports = async function handler(req, res) {
  try {
    const action = req.query && req.query.action;
    const fn = handlers[action];
    if (!fn) {
      res.status(404).json({ error: "Wout la pa egziste.", code: "not_found" });
      return;
    }
    const session = await A.requireAuth(req, res, ["admin"]);
    if (!session) return;
    await fn(req, res, session);
  } catch (err) {
    console.error("admin error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè.", code: "server_error" });
  }
};
