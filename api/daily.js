const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();
// Separate key on purpose: the Daily Report interface never touches the logistic data ("deka-log-data").
const KEY = "deka-daily-report";

function clean(v, max) {
  return typeof v === "string" ? v.slice(0, max) : null;
}

function has(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const data = await redis.get(KEY);
      res.status(200).json({
        checks: (data && data.checks) || {},
        overrides: (data && data.overrides) || {},
      });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      body = body && typeof body === "object" ? body : {};

      let cur = null;
      try { cur = await redis.get(KEY); } catch (e) { cur = null; }
      const state = {
        checks: (cur && cur.checks && typeof cur.checks === "object") ? cur.checks : {},
        overrides: (cur && cur.overrides && typeof cur.overrides === "object") ? cur.overrides : {},
      };

      // Partial patches are merged, so two people saving at the same time do not overwrite each other.
      if (body.checks && typeof body.checks === "object") {
        Object.keys(body.checks).forEach(function (id) {
          if (id.length > 64) return;
          const v = body.checks[id];
          if (v === null) delete state.checks[id];
          else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) state.checks[id] = v;
        });
      }

      if (body.overrides && typeof body.overrides === "object") {
        Object.keys(body.overrides).forEach(function (id) {
          if (id.length > 64) return;
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

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
