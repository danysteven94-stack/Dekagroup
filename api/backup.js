"use strict";
// Admin only: list the automatic snapshots of the logistic data, or download one.
//   /api/backup            -> list (index, date, counts)
//   /api/backup?i=0        -> download snapshot 0 (0 = most recent) as a JSON file
const A = require("./_lib/auth");
const S = require("./_lib/store");
const { redis } = require("./_lib/redis");

function parse(r) {
  if (typeof r !== "string") return r;
  try { return JSON.parse(r); } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, ["admin"]);
    if (!session) return;

    const rows = (await redis.lrange(S.BACKUP_KEY, 0, 11)) || [];
    const snaps = rows.map(parse);
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
  } catch (err) {
    console.error("backup error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè.", code: "server_error" });
  }
};
