#!/usr/bin/env node
"use strict";
// LOCAL demo / test server: the real app (public/) and the real API handlers, but with an in-memory Redis and an
// in-memory SQL database, so nothing outside your computer is touched. Data is lost when you stop it.
//     node tools/dev-server.js           -> http://localhost:3000
// NEVER deployed (tools/ is excluded by .vercelignore).
const http = require("http");
const https = require("https");
const os = require("os");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..");
const { createMockRedis } = require("./mock-redis");

const mock = createMockRedis(Date.now);
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@upstash/redis") return { Redis: { fromEnv: () => mock.redis } };
  if (request === "web-push") return { generateVAPIDKeys: () => ({ publicKey: "demo", privateKey: "demo" }), setVapidDetails() {}, async sendNotification() {} };
  return originalLoad.call(this, request, ...rest);
};

const CREDS = {
  admin: { user: "logistic", pass: process.env.DEMO_ADMIN_PASS || "demo-admin-1234" },
  depot: { user: "depotnord", pass: process.env.DEMO_DEPOT_PASS || "demo-depot-1234" },
  daily: { user: "logisticdepot", pass: process.env.DEMO_DAILY_PASS || "demo-daily-1234" },
  chofe: { user: "chofe", pass: process.env.DEMO_CHOFE_PASS || "demo-chofe-1234" },
};
process.env.APP_SECRET = process.env.APP_SECRET || "demo-app-secret-not-for-production-0123456789";
process.env.AUTH_ADMIN_PASS = CREDS.admin.pass;
process.env.AUTH_DEPOT_PASS = CREDS.depot.pass;
process.env.AUTH_DAILY_PASS = CREDS.daily.pass;
process.env.AUTH_CHOFE_PASS = CREDS.chofe.pass;

const DB = require("../api/_lib/db");
const { makeSqliteDriver } = require("../tests/sqlite-driver");
DB.setDriver(makeSqliteDriver()); // SQLite stands in for PostgreSQL

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg" };

function demoData() {
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const c = (id, num, bill, div, o) => Object.assign({ id, numewo: num, billId: bill, size: "40", division: div, dateEntered: d(5), dateExpected: null, dateVerified: d(4), depo: "Depo Nord", trucking: "CFC", dateEmpty: null, dateLeft: null }, o || {});
  return {
    containers: [
      c("d1", "MSCU7001001", "b1", "ACS", {}),
      c("d2", "MSCU7001002", "b1", "ACS", { size: "20", dateEmpty: d(2) }),
      c("d3", "TGHU7002001", "b2", "DEKAV", { dateVerified: null, depo: null, trucking: null }),
      c("d4", "TGHU7002002", "b2", "DEKAV", { size: "20", dateEmpty: d(3), depo: "Depo Sid", trucking: "MAD" }),
      c("d5", "CAXU7003001", "b3", "ACS", { dateEntered: null, dateVerified: null, depo: null, trucking: null, dateExpected: d(-3) }),
    ],
    bills: [
      { id: "b1", numewo: "BL-1001", product: "Diri", completedAt: null },
      { id: "b2", numewo: "BL-1002", product: "Sik", completedAt: null },
      { id: "b3", numewo: "BL-1003", product: "Sel", completedAt: null },
    ],
    notifications: [{ id: "n1", billNumewo: "BL-1001", date: d(1), message: "Demo: konteneur MSCU7001002 vid kounye a." }],
    inventoryChecks: {},
  };
}

function headersFor(pathname) {
  const out = {};
  (vercel.headers || []).forEach((h) => {
    const re = new RegExp("^" + h.source.replace("(.*)", ".*") + "$");
    if (re.test(pathname)) h.headers.forEach((x) => { out[x.key] = x.value; });
  });
  return out;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function serveApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, "");
  if (!/^[a-z0-9/-]+$/i.test(name) || name.split("/").some((p) => p.startsWith("_"))) { res.statusCode = 404; res.end("Not found"); return; }
  const file = path.join(root, "api", name + ".js");
  if (!fs.existsSync(file)) { res.statusCode = 404; res.end("Not found"); return; }
  const raw = await readBody(req);
  req.body = undefined;
  if (raw && String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    try { req.body = JSON.parse(raw); } catch (e) { req.body = undefined; }
  }
  req.query = Object.fromEntries(url.searchParams);
  req.headers["x-real-ip"] = req.headers["x-real-ip"] || "127.0.0.1";
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(o)); return res; };
  await require(file)(req, res);
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(root, "public", p);
  if (!file.startsWith(path.join(root, "public") + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end("Not found"); return; }
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  res.end(fs.readFileSync(file));
}

// Browsers refuse "__Host-" + Secure cookies over plain http, so on http the demo renames the cookie (dev only).
// With { https: true } (self-signed certificate) nothing is changed and the cookie behaves exactly as in production.
function cookieShim(req, res) {
  if (req.headers.cookie) req.headers.cookie = req.headers.cookie.replace(/(^|;\s*)dl_sid_dev=/g, "$1__Host-dl_sid=");
  const set = res.setHeader.bind(res);
  res.setHeader = function (k, v) {
    if (String(k).toLowerCase() === "set-cookie") v = String(v).replace("__Host-dl_sid=", "dl_sid_dev=").replace("; Secure", "");
    return set(k, v);
  };
}

function selfSigned() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deka-cert-"));
  const key = path.join(dir, "key.pem"), cert = path.join(dir, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

async function start(port, opts) {
  opts = opts || {};
  await require("../api/_lib/repo")._testLoad(demoData()); // creates the tables and loads the demo data
  const handler = async (req, res) => {
    try {
      if (!opts.https) cookieShim(req, res);
      const url = new URL(req.url, "http://localhost");
      const h = headersFor(url.pathname);
      Object.keys(h).forEach((k) => res.setHeader(k, h[k]));
      if (url.pathname.startsWith("/api/")) await serveApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end("Server error");
    }
  };
  const server = opts.https ? https.createServer(selfSigned(), handler) : http.createServer(handler);
  await new Promise((r) => server.listen(port === undefined ? 3000 : port, "127.0.0.1", r));
  return { server, port: server.address().port, creds: CREDS, https: !!opts.https };
}

module.exports = { start, CREDS };

if (require.main === module) {
  start(Number(process.env.PORT) || 3000).then(function (s) {
    console.log("DEKA LOG demo server: http://localhost:" + s.port + "  (data is in memory only)");
    Object.keys(CREDS).forEach(function (k) { console.log("  " + k.padEnd(6) + CREDS[k].user.padEnd(15) + CREDS[k].pass); });
  });
}
