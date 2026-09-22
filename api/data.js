"use strict";
const A = require("./_lib/auth");
const S = require("./_lib/store");
const repo = require("./_lib/repo");
const { ApiError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const session = await A.requireAuth(req, res, ["admin", "depot", "daily", "chofe"]);
      if (!session) return;
      const r = await repo.readAll();
      res.status(200).json(Object.assign({}, S.viewFor(session.role, r.view || r.blob), { rev: r.rev }));
      return;
    }

    if (req.method === "POST") {
      // Only the administrator can save the whole data set. Other roles use the targeted actions in /api/act.
      const session = await A.requireAuth(req, res, ["admin"]);
      if (!session) return;

      const body = A.parseBody(req);
      let clean;
      try {
        clean = S.sanitizeState(body);
      } catch (e) {
        if (e instanceof S.ValidationError) {
          res.status(400).json({ error: e.message, code: "invalid_data" });
          return;
        }
        throw e;
      }
      const baseRev = Number.isInteger(body.rev) ? body.rev : null;
      const cid = typeof body.cid === "string" && /^[A-Za-z0-9]{6,40}$/.test(body.cid) ? body.cid : "u:" + session.username;

      let out;
      try {
        out = await repo.writeClient(clean, { baseRev: baseRev, cid: cid });
      } catch (e) {
        if (e instanceof ApiError) {
          await A.audit(req, "data_write_blocked", { reason: e.code }, session);
          res.status(e.status).json(Object.assign({ error: e.message, code: e.code }, e.extra || {}));
          return;
        }
        throw e;
      }

      if (out.changed) {
        await S.afterCommit(out.prev, out.blob, req);
        await A.audit(req, "data_write", { containers: clean.containers.length, bills: clean.bills.length, before: out.prev.containers.length }, session);
      }
      res.status(200).json({ ok: true, rev: out.rev === undefined ? null : out.rev, hashes: out.hashes || null });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("data error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
