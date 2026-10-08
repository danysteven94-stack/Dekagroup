const { redis, getVapid, saveSubscription, removeSubscription, sendToAll, sendToRole } = require("./_lib/push");
const A = require("./_lib/auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const { publicKey } = await getVapid();
      res.status(200).json({ publicKey });
      return;
    }

    if (req.method === "POST") {
      const session = await A.requireAuth(req, res, ["admin", "depot", "daily", "chofe", "pointeur", "logistique"]);
      if (!session) return;
      const body = A.parseBody(req);

      if (body.action === "subscribe") {
        await saveSubscription(body.subscription, body.deviceId, req.headers["user-agent"], session.role);
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === "unsubscribe") {
        await removeSubscription(body.endpoint);
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === "test") {
        const lg = session.role === "logistique";
        if (session.role !== "admin" && !lg) {
          res.status(403).json({ error: "Ou pa gen dwa pou aksyon sa a.", code: "forbidden" });
          return;
        }
        // small lock so the test button can't be used to spam devices
        const free = await redis.set("deka-log-push-test-lock" + (lg ? "-lg" : ""), "1", { nx: true, ex: 15 });
        if (!free) {
          res.status(429).json({ error: "Tann kek segond anvan w eseye ank\u00f2." });
          return;
        }
        const msg = [{
          title: "DEKA LOG",
          body: "T\u00e8s notifikasyon \u2014 tout bagay ap mache \u2713",
          tag: "deka-test-" + Date.now(),
          url: lg ? "/" : "/?tab=notifs",
        }];
        const result = lg ? await sendToRole(req.headers.host, "logistique", msg) : await sendToAll(req.headers.host, msg);
        res.status(200).json(Object.assign({ ok: true }, result));
        return;
      }

      res.status(400).json({ error: "Aksyon pa valid" });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("push error:", err && err.message);
    res.status(500).json({ error: "Er\u00E8 s\u00E8v\u00E8. Eseye ank\u00F2." });
  }
};
