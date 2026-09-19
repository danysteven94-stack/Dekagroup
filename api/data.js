const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();
const KEY = "deka-log-data";

// Push notifications are optional: if anything goes wrong loading them, saving data still works.
let notifyNew = async function () {};
try {
  notifyNew = require("./_lib/push").notifyNew;
} catch (e) {
  console.error("push disabled:", e && e.message);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const data = await redis.get(KEY);
      res.status(200).json(data || { containers: [], bills: [], notifications: [], inventoryChecks: {} });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      const safe = {
        containers: Array.isArray(body.containers) ? body.containers : [],
        bills: Array.isArray(body.bills) ? body.bills : [],
        notifications: Array.isArray(body.notifications) ? body.notifications : [],
        inventoryChecks: (body.inventoryChecks && typeof body.inventoryChecks === "object" && !Array.isArray(body.inventoryChecks)) ? body.inventoryChecks : {},
      };
      let prev = null;
      try { prev = await redis.get(KEY); } catch (e) { prev = null; }
      await redis.set(KEY, safe);

      // Send a push to the other devices for every notification that did not exist before this save.
      try {
        if (prev) await notifyNew(prev, safe, { host: req.headers.host, deviceId: req.headers["x-device-id"] });
      } catch (e) {
        console.error("push error:", e && e.message);
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
