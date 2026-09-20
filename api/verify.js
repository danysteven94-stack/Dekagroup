const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();
// Same key as api/data.js: this is the ONE place where the Daily Report writes into the logistic data.
const KEY = "deka-log-data";

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body && typeof body === "object" ? body : {};

    const id = typeof body.id === "string" ? body.id : "";
    const depo = typeof body.depo === "string" ? body.depo.trim().slice(0, 80) : "";
    const trucking = typeof body.trucking === "string" && body.trucking.trim() ? body.trucking.trim().slice(0, 40) : null;
    const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10);

    if (!id) { res.status(400).json({ error: "Konteneur pa idantifye." }); return; }
    if (!depo) { res.status(400).json({ error: "Depo a obligatwa pou verifye." }); return; }

    // Read the latest logistic data and change ONLY this container, so nothing else is overwritten.
    const data = await redis.get(KEY);
    if (!data || !Array.isArray(data.containers)) {
      res.status(404).json({ error: "Pa jwenn done Lojistik yo." });
      return;
    }
    const idx = data.containers.findIndex(function (c) { return c.id === id; });
    if (idx === -1) { res.status(404).json({ error: "Pa jwenn konteneur la." }); return; }

    const cur = data.containers[idx];
    if (cur.dateVerified) {
      // Already verified (for example from Logistic): leave it untouched.
      res.status(200).json({ ok: true, already: true, container: cur });
      return;
    }
    if (!cur.dateEntered || cur.dateEmpty || cur.dateLeft) {
      res.status(409).json({ error: "Konteneur sa a pa nan estati Poko Verifye ank\u00F2." });
      return;
    }

    const next = Object.assign({}, cur, { dateVerified: date, depo: depo, trucking: trucking });
    data.containers[idx] = next;
    await redis.set(KEY, data);

    res.status(200).json({ ok: true, container: next });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
