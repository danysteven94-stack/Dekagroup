"use strict";
// Sèl pwen antre pou tout wout /api/auth/* (login, logout, me, password, 2fa).
// Vercel Hobby plan limite a 12 Serverless Functions pou chak Deployment, se poutèt sa
// nou gwoupe 5 fonksyon (login, logout, me, password, 2fa) an yon sèl.
// Wout la (/api/auth/login, /api/auth/2fa, elatriye) rekonèt gras a "rewrites" nan vercel.json,
// ki ajoute ?action=... nan demann lan.

const handlers = {
  login: require("./_lib/authHandlers/login"),
  logout: require("./_lib/authHandlers/logout"),
  me: require("./_lib/authHandlers/me"),
  password: require("./_lib/authHandlers/password"),
  "2fa": require("./_lib/authHandlers/2fa"),
};

module.exports = async function handler(req, res) {
  const action = req.query && req.query.action;
  const fn = handlers[action];
  if (!fn) {
    res.status(404).json({ error: "Wout la pa egziste.", code: "not_found" });
    return;
  }
  return fn(req, res);
};
