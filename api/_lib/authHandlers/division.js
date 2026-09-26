"use strict";
// Switches which database ("pool") the current session works in. Only meaningful for personal
// accounts assigned more than one division whose divisions live in different databases (see
// _lib/divisions.js) — for everyone else there is only ever one pool, so this is a no-op.
const A = require("../auth");
const Div = require("../divisions");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireSession(req, res);
    if (!session) return;

    const body = A.parseBody(req);
    const pool = typeof body.pool === "string" ? body.pool : "";
    const updated = await A.setSessionPool(session, pool);
    if (!updated) {
      res.status(400).json({ error: "Divizyon sa a pa disponib pou kont ou.", code: "invalid_pool" });
      return;
    }
    await A.audit(req, "session_switch_pool", { pool: pool }, session);
    res.status(200).json({
      ok: true, pool: updated.pool, pools: updated.pools,
      divisions: Div.divisionsInPool(updated.pool),
    });
  } catch (err) {
    console.error("division error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè.", code: "server_error" });
  }
};
