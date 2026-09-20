"use strict";
const A = require("./_lib/auth");
const S = require("./_lib/store");

// The Daily Report can mark a "Poko Verifye" container as verified in the logistic data.
// This is the ONLY change it can make there, and it only touches that one container.
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, ["daily", "admin"]);
    if (!session) return;

    const body = A.parseBody(req);
    const id = typeof body.id === "string" ? body.id : "";
    const depo = typeof body.depo === "string" ? body.depo.trim().slice(0, 80) : "";
    const trucking = typeof body.trucking === "string" && body.trucking.trim() ? body.trucking.trim().slice(0, 40) : null;
    const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : S.today();

    if (!id) { res.status(400).json({ error: "Konteneur pa idantifye." }); return; }
    if (!depo) { res.status(400).json({ error: "Depo a obligatwa pou verifye." }); return; }

    const out = await S.withLock(async function () {
      const prev = await S.loadData();
      const idx = prev.containers.findIndex(function (c) { return c.id === id; });
      if (idx === -1) return { status: 404, error: "Pa jwenn konteneur la." };
      const cur = prev.containers[idx];
      if (cur.dateVerified) return { status: 200, body: { ok: true, already: true, container: cur } }; // already verified: untouched
      if (!cur.dateEntered || cur.dateEmpty || cur.dateLeft) return { status: 409, error: "Konteneur sa a pa nan estati Poko Verifye ank\u00F2." };

      const next = JSON.parse(JSON.stringify(prev));
      next.containers[idx] = Object.assign({}, cur, { dateVerified: date, depo: depo, trucking: trucking });
      await S.commit(prev, next, req);
      return { status: 200, body: { ok: true, container: next.containers[idx] }, verified: cur.numewo };
    });

    if (out.error) { res.status(out.status).json({ error: out.error }); return; }
    if (out.verified) await A.audit(req, "verify", { numewo: out.verified }, session);
    res.status(out.status).json(out.body);
  } catch (err) {
    console.error("verify error:", err && err.message);
    res.status(err && err.status ? err.status : 500).json({ error: err && err.status === 503 ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
