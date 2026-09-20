"use strict";
const A = require("./_lib/auth");
const S = require("./_lib/store");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const session = await A.requireAuth(req, res, ["admin", "depot", "daily", "chofe"]);
      if (!session) return;
      const data = await S.loadData();
      res.status(200).json(S.viewFor(session.role, data));
      return;
    }

    if (req.method === "POST") {
      // Only the administrator can replace the whole data set. Other roles use the targeted actions in /api/act.
      const session = await A.requireAuth(req, res, ["admin"]);
      if (!session) return;

      let clean;
      try {
        clean = S.sanitizeState(A.parseBody(req));
      } catch (e) {
        if (e instanceof S.ValidationError) {
          res.status(400).json({ error: e.message, code: "invalid_data" });
          return;
        }
        throw e;
      }

      const result = await S.withLock(async function () {
        const prev = await S.loadData();
        // Safety net: never let an empty payload wipe existing data.
        if (clean.containers.length === 0 && prev.containers.length > 0) return { blocked: true };
        await S.commit(prev, clean, req);
        return { blocked: false, before: prev.containers.length };
      });

      if (result.blocked) {
        await A.audit(req, "data_write_blocked", { reason: "empty_payload" }, session);
        res.status(409).json({ error: "Sove a bloke: done yo vid. Rechaje paj la.", code: "empty_payload" });
        return;
      }
      await A.audit(req, "data_write", { containers: clean.containers.length, bills: clean.bills.length, before: result.before }, session);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("data error:", err && err.message);
    res.status(err && err.status ? err.status : 500).json({ error: err && err.status === 503 ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
