"use strict";
// Principal account only: create and manage every other personal account.
const A = require("./_lib/auth");
const Users = require("./_lib/users");
const Secret = require("./_lib/secret");
const Email = require("./_lib/email");
const Div = require("./_lib/divisions");
const { ApiError } = require("./_lib/errors");

function safe(u) {
  return {
    username: u.username, name: u.name, role: u.role, active: u.active, mustChange: u.mustChange, totpEnabled: u.totpEnabled,
    email: u.email || null, plate: u.plate || null, trucking: u.trucking || null, depotOf: u.depotOf || null, principal: u.username === A.principalUsername(), divisions: u.divisions || [],
    lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, createdBy: u.createdBy, passChangedAt: u.passChangedAt,
  };
}

// Only real, known division names may be assigned to an account, and duplicates are dropped.
function cleanDivisions(list) {
  if (!Array.isArray(list)) return [];
  const seen = {};
  const out = [];
  list.forEach(function (d) {
    if (typeof d === "string" && Div.isValid(d) && !seen[d]) { seen[d] = true; out.push(d); }
  });
  return out;
}

// Usernames of the shared accounts (environment variables) are reserved.
function reserved() {
  const set = {};
  A.ROLE_DEFS.forEach(function (d) {
    set[d.defaultUser] = true;
    const o = process.env["AUTH_" + d.key + "_USER"];
    if (o) set[String(o).trim().toLowerCase()] = true;
  });
  return set;
}

function clean(v, max) {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

// Truck licence plate for a driver account: letters, digits, spaces and dashes only.
function cleanPlate(v) {
  const s = typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 20) : "";
  return /^[A-Z0-9 -]*$/.test(s) ? s : "";
}

// Trucking company a driver works for: same characters the "pran" / "depart" actions accept (CFC, CTSA, MAD, DKN 001...).
function cleanTrucking(v) {
  const s = typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 40) : "";
  return /^[A-Z0-9 ._-]*$/.test(s) ? s : "";
}

// A pointeur (the person who unloads containers at a depot) always belongs to one personal, active depot account.
async function depotOwner(username) {
  const name = typeof username === "string" ? username.trim().toLowerCase() : "";
  const owner = name ? await Users.get(name) : null;
  if (!owner || owner.role !== "depot" || !owner.active) throw new ApiError(400, "invalid_depot", "Chwazi yon kont Depo ki aktif pou pointeur la.");
  return owner;
}

// Refuse a change that would leave nobody able to administer the app.
async function wouldLockOut(target, afterActive, afterRole) {
  const users = await Users.list();
  const admins = users.filter(function (u) {
    const active = u.username === target ? afterActive : u.active;
    const role = u.username === target ? afterRole : u.role;
    return active && role === "admin";
  }).length;
  const legacyAdmin = A.accounts().some(function (a) { return a.role === "admin"; });
  return admins === 0 && !legacyAdmin;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, ["admin"]);
    if (!session) return;
    if (!A.isPrincipal(session)) {
      res.status(403).json({ error: "Sèl kont prensipal la ka jere itilizatè yo.", code: "principal_required" });
      return;
    }

    if (req.method === "GET") {
      const users = await Users.list();
      res.status(200).json({
        users: users.map(safe),
        legacy: A.accounts().map(function (a) { return { username: a.username, role: a.role }; }),
        legacyDisabled: process.env.AUTH_LEGACY_DISABLED === "1",
        twoFactorAvailable: Secret.available(),
        me: session.username,
        divisionGroups: [
          { pool: "default", divisions: Div.GROUP_1 },
        ].concat(Object.keys(Div.GROUP_2_POOLS).map(function (name) { return { pool: Div.GROUP_2_POOLS[name], divisions: [name] }; })),
      });
      return;
    }

    const body = A.parseBody(req);
    const action = body.action;
    const target = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";

    if (action === "create") {
      const role = body.role;
      const name = clean(body.name, 60);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!Users.USERNAME_RE.test(target)) throw new ApiError(400, "invalid_username", "Non itilizatè a dwe gen 3 a 32 karaktè (lèt ki piti, chif, pwen, tirè).");
      if (reserved()[target]) throw new ApiError(400, "reserved", "Non sa a rezève pou yon kont pataje. Chwazi yon lòt.");
      if (Users.ROLES.indexOf(role) === -1) throw new ApiError(400, "invalid_role", "Wòl la pa valid.");
      if (name.length < 2) throw new ApiError(400, "invalid_name", "Ekri non konplè moun nan.");
      if (email && !Email.EMAIL_RE.test(email)) throw new ApiError(400, "invalid_email", "Adrès imèl la pa valid.");
      if (role === "admin" && !Secret.available()) throw new ApiError(503, "no_app_secret", "Pou kreye yon administratè, APP_SECRET dwe konfigire sou sèvè a (2FA obligatwa). Gade SEKIRITE.md.");
      const divisions = cleanDivisions(body.divisions);
      const plate = cleanPlate(body.plate);
      // A driver's plate and trucking are stamped on every container he handles, so the plate is mandatory for a driver.
      if (role === "chofe" && !plate) throw new ApiError(400, "plate_required", "Plak kamyon an obligatwa pou yon chofè.");
      if (body.trucking && !cleanTrucking(body.trucking)) throw new ApiError(400, "invalid_trucking", "Trucking la pa valid.");
      const trucking = role === "chofe" ? cleanTrucking(body.trucking) : "";
      // A pointeur is attached to a depot account and sees exactly what that depot account sees (same divisions).
      const owner = role === "pointeur" ? await depotOwner(body.depotOf) : null;
      const temp = Users.tempPassword();
      const u = await Users.create({ username: target, name: name, role: role, email: email || null, plate: plate || null, trucking: trucking || null, depotOf: owner ? owner.username : null, passHash: await A.hashPassword(temp), mustChange: true, divisions: owner ? owner.divisions || [] : role === "logistique" ? [] : divisions, createdBy: session.username });
      await A.audit(req, "user_create", { username: target, role: role, divisions: u.divisions, trucking: trucking || null, depotOf: u.depotOf }, session);
      res.status(200).json({ ok: true, user: safe(u), tempPassword: temp });
      return;
    }

    const user = await Users.get(target);
    if (!user) throw new ApiError(404, "not_found", "Pa jwenn itilizatè a.");
    const self = user.username === session.username;

    if (action === "reset_password") {
      if (self) throw new ApiError(400, "self", "Chanje pwòp modpass ou nan \"Kont mwen\".");
      const temp = Users.tempPassword();
      await Users.update(user.username, { passHash: await A.hashPassword(temp), mustChange: true, passChangedAt: null });
      const closed = await A.killUserSessions(user.username);
      await A.audit(req, "user_reset_password", { username: user.username, sessionsClosed: closed }, session);
      res.status(200).json({ ok: true, tempPassword: temp });
      return;
    }

    if (action === "set_active") {
      const active = body.active === true;
      if (self) throw new ApiError(400, "self", "Ou pa ka dezaktive pwòp kont ou.");
      if (!active && user.username === A.principalUsername()) throw new ApiError(400, "principal", "Ou pa ka dezaktive kont prensipal la.");
      if (!active && (await wouldLockOut(user.username, false, user.role))) throw new ApiError(409, "last_admin", "Sa ta kite pa gen okenn administratè aktif.");
      await Users.update(user.username, { active: active });
      if (!active) await A.killUserSessions(user.username);
      await A.audit(req, "user_set_active", { username: user.username, active: active }, session);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "set_role") {
      const role = body.role;
      if (Users.ROLES.indexOf(role) === -1) throw new ApiError(400, "invalid_role", "Wòl la pa valid.");
      if (self) throw new ApiError(400, "self", "Ou pa ka chanje pwòp wòl ou.");
      if (user.username === A.principalUsername() && role !== "admin") throw new ApiError(400, "principal", "Ou pa ka retire wòl administratè kont prensipal la.");
      if (role === "admin" && !Secret.available()) throw new ApiError(503, "no_app_secret", "APP_SECRET dwe konfigire pou fè yon administratè (2FA obligatwa).");
      if (user.role === "admin" && role !== "admin" && (await wouldLockOut(user.username, user.active, role))) throw new ApiError(409, "last_admin", "Sa ta kite pa gen okenn administratè aktif.");
      const patch = { role: role };
      if (role === "logistique") {
        // Logistique Deka works on every division: no division is assigned to this kind of account.
        patch.divisions = [];
      }
      if (role === "pointeur") {
        const owner = await depotOwner(body.depotOf);
        patch.depotOf = owner.username;
        patch.divisions = owner.divisions || [];
      } else if (user.role === "pointeur") {
        patch.depotOf = null;
      }
      if (user.role === "depot" && role !== "depot") {
        const all = await Users.list();
        if (all.some(function (x) { return x.role === "pointeur" && x.depotOf === user.username; })) throw new ApiError(409, "has_pointeurs", "Kont Depo sa a gen pointeur ki rantre ladan. Deplase yo anvan.");
      }
      await Users.update(user.username, patch);
      await A.killUserSessions(user.username);
      await A.audit(req, "user_set_role", { username: user.username, from: user.role, to: role, depotOf: patch.depotOf || null }, session);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "set_email") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (email && !Email.EMAIL_RE.test(email)) throw new ApiError(400, "invalid_email", "Adrès imèl la pa valid.");
      await Users.update(user.username, { email: email || null });
      await A.audit(req, "user_set_email", { username: user.username, hasEmail: !!email }, session);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "reset_2fa") {
      await Users.update(user.username, { totpEnabled: false, totpSecretEnc: null, totpLast: 0, recovery: [] });
      await A.killUserSessions(user.username, self ? session.key : undefined);
      await A.audit(req, "user_reset_2fa", { username: user.username }, session);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "set_plate") {
      const plate = cleanPlate(body.plate);
      if (user.role === "chofe" && !plate) throw new ApiError(400, "plate_required", "Plak kamyon an obligatwa pou yon chofè (lèt, chif, espas ak tirè sèlman).");
      await Users.update(user.username, { plate: plate || null });
      await A.audit(req, "user_set_plate", { username: user.username, hasPlate: !!plate }, session);
      res.status(200).json({ ok: true, plate: plate || null });
      return;
    }

    if (action === "set_trucking") {
      if (user.role !== "chofe") throw new ApiError(400, "not_driver", "Se sèlman yon chofè ki gen trucking.");
      if (body.trucking && !cleanTrucking(body.trucking)) throw new ApiError(400, "invalid_trucking", "Trucking la pa valid.");
      const trucking = cleanTrucking(body.trucking);
      await Users.update(user.username, { trucking: trucking || null });
      await A.audit(req, "user_set_trucking", { username: user.username, trucking: trucking || null }, session);
      res.status(200).json({ ok: true, trucking: trucking || null });
      return;
    }

    if (action === "set_depot_of") {
      if (user.role !== "pointeur") throw new ApiError(400, "not_pointeur", "Se sèlman yon pointeur ki gen yon depo.");
      const owner = await depotOwner(body.depotOf);
      await Users.update(user.username, { depotOf: owner.username, divisions: owner.divisions || [] });
      await A.killUserSessions(user.username);
      await A.audit(req, "user_set_depot_of", { username: user.username, depotOf: owner.username }, session);
      res.status(200).json({ ok: true, depotOf: owner.username });
      return;
    }

    if (action === "set_divisions") {
      if (user.role === "pointeur") throw new ApiError(400, "inherited", "Divizyon yon pointeur se sa kont Depo li an gen.");
      if (user.role === "logistique") throw new ApiError(400, "all_divisions", "Kont Logistique Deka a wè tout divizyon yo otomatikman.");
      const divisions = cleanDivisions(body.divisions);
      await Users.update(user.username, { divisions: divisions });
      if (user.role === "depot") {
        // the pointeurs of this depot account follow its divisions
        const all = await Users.list();
        for (const x of all) {
          if (x.role === "pointeur" && x.depotOf === user.username) {
            await Users.update(x.username, { divisions: divisions });
            await A.killUserSessions(x.username);
          }
        }
      }
      await A.audit(req, "user_set_divisions", { username: user.username, divisions: divisions }, session);
      res.status(200).json({ ok: true, divisions: divisions });
      return;
    }

    throw new ApiError(400, "invalid_action", "Aksyon pa valid.");
  } catch (err) {
    if (err instanceof ApiError) { res.status(err.status).json({ error: err.message, code: err.code }); return; }
    console.error("users error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
