"use strict";
const A = require("./_lib/auth");
const S = require("./_lib/store");
const repo = require("./_lib/repo");
const { ApiError } = require("./_lib/errors");

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

    const out = await repo.mutate(async function (data) {
      const c = data.containers.find(function (x) { return x.id === id; });
      if (!c) throw new ApiError(404, "not_found", "Pa jwenn konteneur la.");
      if (c.dateVerified) return { already: true, container: Object.assign({}, c) }; // already verified: untouched
      if (!c.dateEntered || c.dateEmpty || c.dateLeft) throw new ApiError(409, "wrong_status", "Konteneur sa a pa nan estati Poko Verifye ank\u00F2.");
      c.dateVerified = date;
      c.depo = depo;
      c.trucking = trucking;
      return { container: Object.assign({}, c), verified: c.numewo };
    }, { cid: session.username });

    if (out.changed) {
      await S.afterCommit(out.prev, out.blob, req);
      await A.audit(req, "verify", { numewo: out.info.verified }, session);
    }
    const body2 = { ok: true, container: out.info.container };
    if (out.info.already) body2.already = true;
    res.status(200).json(body2);
  } catch (err) {
    if (err instanceof ApiError && err.status !== 503) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error("verify error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
