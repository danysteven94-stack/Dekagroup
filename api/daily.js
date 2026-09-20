"use strict";
const A = require("./_lib/auth");
const { redis } = require("./_lib/redis");

// Separate key on purpose: the Daily Report interface keeps its own checks and edits.
const KEY = "deka-daily-report";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : null;
}

function has(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

module.exports = async function handler(req, res) {
  try {
    const session = await A.requireAuth(req, res, ["daily", "admin"]);
    if (!session) return;

    if (req.method === "GET") {
      const data = await redis.get(KEY);
      res.status(200).json({
        checks: (data && data.checks) || {},
        overrides: (data && data.overrides) || {},
      });
      return;
    }

    if (req.method === "POST") {
      const body = A.parseBody(req);
      const cur = await redis.get(KEY);
      const state = {
        checks: cur && cur.checks && typeof cur.checks === "object" ? cur.checks : {},
        overrides: cur && cur.overrides && typeof cur.overrides === "object" ? cur.overrides : {},
      };

      // Partial patches are merged, so two people saving at the same time do not overwrite each other.
      if (body.checks && typeof body.checks === "object") {
        Object.keys(body.checks).slice(0, 500).forEach(function (id) {
          if (!ID_RE.test(id)) return;
          const v = body.checks[id];
          if (v === null) delete state.checks[id];
          else if (typeof v === "string" && DATE_RE.test(v)) state.checks[id] = v;
        });
      }

      if (body.overrides && typeof body.overrides === "object") {
        Object.keys(body.overrides).slice(0, 500).forEach(function (id) {
          if (!ID_RE.test(id)) return;
          const p = body.overrides[id];
          if (!p || typeof p !== "object") return;
          const o = Object.assign({}, state.overrides[id]);
          if (has(p, "trucking")) o.trucking = p.trucking === null ? null : clean(p.trucking, 40);
          if (has(p, "depo")) o.depo = p.depo === null ? null : clean(p.depo, 80);
          state.overrides[id] = o;
        });
      }

      // Daily checks only matter for today: drop anything older than 3 days.
      const limit = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
      Object.keys(state.checks).forEach(function (k) {
        if (state.checks[k] < limit) delete state.checks[k];
      });

      await redis.set(KEY, state);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("daily error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
