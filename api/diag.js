"use strict";
// Vercel Hobby plan limits a Deployment to 12 Serverless Functions, so the three small
// admin-only diagnostic endpoints (audit log, health check, backups) share one file here.
// /api/audit, /api/health and /api/backup are routed to this file via rewrites in vercel.json,
// so the browser paths and behavior are unchanged.
const A = require("./_lib/auth");
const repo = require("./_lib/repo");
const S = require("./_lib/store");
const { redis } = require("./_lib/redis");

function parseSnap(r) {
  if (typeof r !== "string") return r;
  try { return JSON.parse(r); } catch (e) { return null; }
}

// Admin only: latest security/activity events (logins, failures, writes...).
async function handleAudit(req, res) {
  const rows = await redis.lrange("dl:audit", 0, 299);
  const events = (rows || []).map(function (r) {
    if (typeof r !== "string") return r;
    try { return JSON.parse(r); } catch (e) { return { raw: r }; }
  });
  res.status(200).json({ count: events.length, events: events });
}

// Admin only: which storage is active and whether it answers (shown in the Sekirite tab).
async function handleHealth(req, res) {
  try {
    res.status(200).json(await repo.health());
  } catch (e) {
    console.error("health error:", e && e.message);
    res.status(200).json({ backend: repo.name(), ok: false, error: "Baz done a pa reponn." });
  }
}

// Admin only: list the automatic snapshots of the logistic data, or download one.
//   /api/backup            -> list (index, date, counts)
//   /api/backup?i=0        -> download snapshot 0 (0 = most recent) as a JSON file
async function handleBackup(req, res, session) {
  const rows = (await redis.lrange(S.BACKUP_KEY, 0, 11)) || [];
  const snaps = rows.map(parseSnap);
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

const VIEWS = { audit: handleAudit, health: handleHealth, backup: handleBackup };

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const view = req.query && req.query.view;
    const fn = VIEWS[view];
    if (!fn) { res.status(404).json({ error: "Not found" }); return; }
    const session = await A.requireAuth(req, res, ["admin"]);
    if (!session) return;
    await fn(req, res, session);
  } catch (err) {
    console.error("diag error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè.", code: "server_error" });
  }
};
