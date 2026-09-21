"use strict";
// Targeted actions for the non-admin roles. Each action changes only what that role may change,
// on the freshest data (under a lock), so a stale screen can never overwrite someone else's work.
const A = require("./_lib/auth");
const S = require("./_lib/store");
const repo = require("./_lib/repo");
const { ApiError } = require("./_lib/errors");

class ActionError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const ACTIONS = {
  // Depot (or admin): a Full container is now empty.
  markEmpty: { roles: ["depot", "admin"], run: function (data, body) {
    const c = data.containers.find(function (x) { return x.id === body.id; });
    if (!c) throw new ActionError(404, "Pa jwenn konteneur la.", "not_found");
    if (S.statusOf(c) !== "full") throw new ActionError(409, "Konteneur sa a pa Full ankò. Done yo rafrechi.", "wrong_status");
    const bill = data.bills.find(function (b) { return b.id === c.billId; });
    data.containers = data.containers.map(function (x) { return x.id === c.id ? Object.assign({}, x, { dateEmpty: S.today() }) : x; });
    S.addNotification(data, bill ? bill.numewo : "", "Konten\u00E8 " + c.numewo + " vid kounye a" + (bill ? " (Bill " + bill.numewo + ")" : "") + ".");
    return { id: c.id };
  } },

  // Depot (or admin): move a container to another depo / trucking.
  transfer: { roles: ["depot", "admin"], run: function (data, body) {
    const depo = text(body.depo, 80);
    const trucking = text(body.trucking, 40) || null;
    if (!depo) throw new ActionError(400, "Depo a obligatwa.", "invalid");
    const c = data.containers.find(function (x) { return x.id === body.id; });
    if (!c) throw new ActionError(404, "Pa jwenn konteneur la.", "not_found");
    if (c.dateLeft) throw new ActionError(409, "Konteneur sa a deja kite.", "wrong_status");
    const changedDepo = depo !== (c.depo || "");
    const changedTruck = (trucking || "") !== (c.trucking || "");
    data.containers = data.containers.map(function (x) { return x.id === c.id ? Object.assign({}, x, { depo: depo, trucking: trucking }) : x; });
    if (changedDepo || changedTruck) {
      S.addNotification(data, "", "Konten\u00E8 " + c.numewo + " transfere nan depo " + depo + " (te nan " + (c.depo || "\u2014") + ")" + (trucking ? " \u2014 trucking: " + trucking : "") + ".");
    }
    return { id: c.id };
  } },

  // Driver (or admin): confirm that empty containers have left with a trucking.
  depart: { roles: ["chofe", "admin"], run: function (data, body) {
    const trucking = text(body.trucking, 40);
    if (!trucking || !/^[A-Za-z0-9 ._-]+$/.test(trucking)) throw new ActionError(400, "Trucking la obligatwa.", "invalid");
    const ids = Array.isArray(body.ids) ? body.ids.filter(function (i) { return typeof i === "string"; }).slice(0, 200) : [];
    if (ids.length === 0) throw new ActionError(400, "Chwazi omwen yon konteneur.", "invalid");

    const left = [];
    data.containers = data.containers.map(function (x) {
      if (ids.indexOf(x.id) === -1 || S.statusOf(x) !== "vid") return x;
      left.push(x.numewo);
      return Object.assign({}, x, { dateLeft: S.today() });
    });
    if (left.length === 0) throw new ActionError(409, "Konteneur sa yo pa disponib ankò. Done yo rafrechi.", "wrong_status");
    left.slice().reverse().forEach(function (n) { S.addNotification(data, "", "Konten\u00E8 " + n + " kite ak chof\u00E8 " + trucking + "."); });
    S.recomputeBills(data);
    return { left: left.length, requested: ids.length };
  } },
};

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, ["admin", "depot", "chofe"]);
    if (!session) return;

    const body = A.parseBody(req);
    const def = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!def) { res.status(400).json({ error: "Aksyon pa valid.", code: "invalid_action" }); return; }
    if (def.roles.indexOf(session.role) === -1) {
      await A.audit(req, "forbidden", { action: body.action }, session);
      res.status(403).json({ error: "Ou pa gen dwa pou aksyon sa a.", code: "forbidden" });
      return;
    }

    const out = await repo.mutate(async function (data) {
      return def.run(data, body);
    }, { cid: session.username });
    if (out.changed) await S.afterCommit(out.prev, out.blob, req);

    await A.audit(req, "act_" + body.action, out.info, session);
    res.status(200).json({ ok: true, result: out.info, data: Object.assign({}, S.viewFor(session.role, out.view || out.blob), { rev: out.rev }) });
  } catch (err) {
    if (err instanceof ActionError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error("act error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
