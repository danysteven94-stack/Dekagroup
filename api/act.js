"use strict";
// Targeted actions for the non-admin roles. Each action changes only what that role may change,
// on the freshest data (under a lock), so a stale screen can never overwrite someone else's work.
const A = require("./_lib/auth");
const S = require("./_lib/store");
const Users = require("./_lib/users");
const repo = require("./_lib/repo");
const Div = require("./_lib/divisions");
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

// A pointeur only works on containers of the divisions his depot account was given (same rule as the depot screen).
function assertDivision(session, c) {
  const visible = Div.visibleDivisions(session.src, session.divisions);
  if (visible && (!c.division || visible.indexOf(c.division) === -1)) throw new ActionError(403, "Ou pa gen aksè ak divizyon konteneur sa a.", "forbidden_division");
}

const ACTIONS = {
  // Depot (or admin, or the pointeur who unloaded it): a Full container is now empty.
  // A pointeur can only empty a container he started unloading himself ("debarq"); his name stays on the container
  // (debarqName) so the history says who unloaded it and who emptied it.
  markEmpty: { roles: ["depot", "admin", "pointeur"], run: function (data, body, ctx) {
    const c = data.containers.find(function (x) { return x.id === body.id; });
    if (!c) throw new ActionError(404, "Pa jwenn konteneur la.", "not_found");
    if (S.statusOf(c) !== "full") throw new ActionError(409, "Konteneur sa a pa Full ankò. Done yo rafrechi.", "wrong_status");
    const isPointeur = ctx && ctx.session && ctx.session.role === "pointeur";
    if (isPointeur) {
      assertDivision(ctx.session, c);
      if (!c.dateDebarq) throw new ActionError(409, "Fè debarkman an anvan w make konteneur la vid.", "not_unloading");
      if (c.debarqBy !== ctx.session.username) throw new ActionError(403, "Se yon lòt pointeur ki ap debake konteneur sa a.", "not_yours");
    }
    const bill = data.bills.find(function (b) { return b.id === c.billId; });
    data.containers = data.containers.map(function (x) { return x.id === c.id ? Object.assign({}, x, { dateEmpty: S.today() }) : x; });
    const by = c.debarqName ? " \u2014 debake pa pointeur " + c.debarqName : "";
    S.addNotification(data, bill ? bill.numewo : "", "Konten\u00E8 " + c.numewo + " vid kounye a" + (bill ? " (Bill " + bill.numewo + ")" : "") + by + ".");
    return { id: c.id };
  } },

  // Pointeur: started unloading a Full container. Shows up at once for the administrator (notification + "ap debake" badge)
  // and in the history. The pointeur's own name is stamped automatically; he never types it.
  debarq: { roles: ["pointeur"], run: function (data, body, ctx) {
    const c = data.containers.find(function (x) { return x.id === body.id; });
    if (!c) throw new ActionError(404, "Pa jwenn konteneur la.", "not_found");
    if (S.statusOf(c) !== "full") throw new ActionError(409, "Konteneur sa a pa Full ankò. Done yo rafrechi.", "wrong_status");
    assertDivision(ctx.session, c);
    const me = ctx.session.username;
    if (c.dateDebarq && c.debarqBy && c.debarqBy !== me) throw new ActionError(409, "Yon lòt pointeur deja ap debake konteneur sa a.", "already_taken");
    if (c.dateDebarq && c.debarqBy === me) return { id: c.id, already: true };
    const name = (ctx.pointeur && ctx.pointeur.name) || ctx.session.name || me;
    const depot = ctx.owner && ctx.owner.name ? " (depo: " + ctx.owner.name + ")" : "";
    const bill = data.bills.find(function (b) { return b.id === c.billId; });
    data.containers = data.containers.map(function (x) {
      return x.id === c.id ? Object.assign({}, x, { dateDebarq: S.today(), debarqBy: me, debarqName: name }) : x;
    });
    S.addNotification(data, bill ? bill.numewo : "", "Konten\u00E8 " + c.numewo + " ap debake pa pointeur " + name + depot + ".");
    return { id: c.id };
  } },

  // Pointeur: un-tick a debarquement he started by mistake (only his own, only while the container is still Full).
  undoDebarq: { roles: ["pointeur"], run: function (data, body, ctx) {
    const c = data.containers.find(function (x) { return x.id === body.id; });
    if (!c) throw new ActionError(404, "Pa jwenn konteneur la.", "not_found");
    if (!c.dateDebarq) return { id: c.id, already: true };
    if (S.statusOf(c) !== "full") throw new ActionError(409, "Konteneur sa a pa Full ankò. Done yo rafrechi.", "wrong_status");
    if (c.debarqBy !== ctx.session.username) throw new ActionError(403, "Se yon lòt pointeur ki ap debake konteneur sa a.", "not_yours");
    data.containers = data.containers.map(function (x) {
      if (x.id !== c.id) return x;
      const y = Object.assign({}, x);
      delete y.dateDebarq; delete y.debarqBy; delete y.debarqName;
      return y;
    });
    S.addNotification(data, "", "Pointeur " + (c.debarqName || ctx.session.username) + " anile debarkman konteneur " + c.numewo + ".");
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
  // When a driver (not admin) does this, their own account's name and plate are stamped onto
  // the containers automatically — the driver never has to type them in.
  depart: { roles: ["chofe", "admin"], run: function (data, body, ctx) {
    // a driver account tied to a trucking by the administrator always works for that trucking (what the browser sent is ignored)
    const trucking = ctx && ctx.driver && ctx.driver.trucking ? ctx.driver.trucking : text(body.trucking, 40);
    if (!trucking || !/^[A-Za-z0-9 ._-]+$/.test(trucking)) throw new ActionError(400, "Trucking la obligatwa.", "invalid");
    const ids = Array.isArray(body.ids) ? body.ids.filter(function (i) { return typeof i === "string"; }).slice(0, 200) : [];
    if (ids.length === 0) throw new ActionError(400, "Chwazi omwen yon konteneur.", "invalid");
    const driver = ctx && ctx.driver;
    const chofer = driver && driver.name ? driver.name : null;
    const plak = driver && driver.plate ? driver.plate : null;

    const left = [];
    data.containers = data.containers.map(function (x) {
      if (ids.indexOf(x.id) === -1 || S.statusOf(x) !== "vid") return x;
      left.push(x.numewo);
      // the container leaves under the trucking that took it (so the Trucking tab counts it in the right place)
      const patch = { dateLeft: S.today(), trucking: trucking };
      if (chofer) patch.chofer = chofer;
      if (plak) patch.plak = plak;
      return Object.assign({}, x, patch);
    });
    if (left.length === 0) throw new ActionError(409, "Konteneur sa yo pa disponib ankò. Done yo rafrechi.", "wrong_status");
    const tag = chofer ? " (" + chofer + (plak ? ", " + plak : "") + ")" : "";
    left.slice().reverse().forEach(function (n) { S.addNotification(data, "", "Konten\u00E8 " + n + " kite ak chof\u00E8 " + trucking + tag + "."); });
    S.recomputeBills(data);
    return { left: left.length, requested: ids.length };
  } },

  // Driver: tick a container that is still on its way (not entered yet) to say "I took it".
  // The driver's own name and plate, and the trucking he picked, are stamped onto the container automatically.
  pran: { roles: ["chofe"], run: function (data, body, ctx) {
    const trucking = ctx.driver && ctx.driver.trucking ? ctx.driver.trucking : text(body.trucking, 40);
    if (!trucking || !/^[A-Za-z0-9 ._-]+$/.test(trucking)) throw new ActionError(400, "Trucking la obligatwa.", "invalid");
    const c = data.containers.find(function (x) { return x.id === body.id; });
    if (!c) throw new ActionError(404, "Pa jwenn konteneur la.", "not_found");
    const st = S.statusOf(c);
    if (st !== "disponib" && st !== "pran") throw new ActionError(409, "Konteneur sa a deja antre. Done yo rafrechi.", "wrong_status");
    // a driver sees every container (only the depot interface is split by division), so no division check here
    const me = ctx.session.username;
    if (c.datePran && c.pranBy && c.pranBy !== me) throw new ActionError(409, "Yon lot chof\u00E8 deja pran konteneur sa a.", "already_taken");
    const driver = ctx.driver;
    const chofer = driver && driver.name ? driver.name : null;
    const plak = driver && driver.plate ? driver.plate : null;
    if (c.datePran && c.pranBy === me) return { id: c.id, already: true };
    data.containers = data.containers.map(function (x) {
      return x.id === c.id ? Object.assign({}, x, { datePran: S.today(), pranBy: me, trucking: trucking, chofer: chofer, plak: plak }) : x;
    });
    const tag = chofer ? " (" + chofer + (plak ? ", " + plak : "") + ")" : "";
    S.addNotification(data, "", "Konten\u00E8 " + c.numewo + " pran pa chof\u00E8 " + trucking + tag + ".");
    return { id: c.id };
  } },

  // Driver: un-tick a container he ticked by mistake (only his own).
  defePran: { roles: ["chofe"], run: function (data, body, ctx) {
    const c = data.containers.find(function (x) { return x.id === body.id; });
    if (!c) throw new ActionError(404, "Pa jwenn konteneur la.", "not_found");
    if (!c.datePran) return { id: c.id, already: true };
    if (S.statusOf(c) !== "pran") throw new ActionError(409, "Konteneur sa a deja antre. Done yo rafrechi.", "wrong_status");
    if (c.pranBy !== ctx.session.username) throw new ActionError(403, "Se yon lot chof\u00E8 ki pran konteneur sa a.", "not_yours");
    data.containers = data.containers.map(function (x) {
      if (x.id !== c.id) return x;
      const y = Object.assign({}, x, { trucking: null, chofer: null, plak: null });
      delete y.datePran; delete y.pranBy;
      return y;
    });
    S.addNotification(data, "", "Chof\u00E8 a retire konteneur " + c.numewo + " nan sa li te pran yo.");
    return { id: c.id };
  } },
};

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, ["admin", "depot", "chofe", "pointeur"]);
    if (!session) return;

    const body = A.parseBody(req);
    const def = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!def) { res.status(400).json({ error: "Aksyon pa valid.", code: "invalid_action" }); return; }
    if (def.roles.indexOf(session.role) === -1) {
      await A.audit(req, "forbidden", { action: body.action }, session);
      res.status(403).json({ error: "Ou pa gen dwa pou aksyon sa a.", code: "forbidden" });
      return;
    }

    let driver = null;
    if ((body.action === "depart" || body.action === "pran") && session.role === "chofe") {
      driver = await Users.get(session.username);
    }
    // a pointeur works for one depot account: its name goes on the notification
    let pointeur = null;
    let owner = null;
    if (session.role === "pointeur") {
      pointeur = await Users.get(session.username);
      owner = pointeur && pointeur.depotOf ? await Users.get(pointeur.depotOf) : null;
    }
    const out = await repo.mutate(async function (data) {
      return def.run(data, body, { session: session, driver: driver, pointeur: pointeur, owner: owner });
    }, { cid: session.username, pool: session.pool });
    if (out.changed) await S.afterCommit(out.prev, out.blob, req, session);

    await A.audit(req, "act_" + body.action, out.info, session);
    res.status(200).json({ ok: true, result: out.info, data: Object.assign({}, S.viewFor(session, out.view || out.blob), { rev: out.rev }) });
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
