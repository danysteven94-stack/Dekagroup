"use strict";
// Test helpers: in-memory Redis (Upstash-like), stubs for web-push, and a tiny HTTP-like harness for the API handlers.
const Module = require("module");
const path = require("path");

let clock = Date.now();
const { createMockRedis } = require("../tools/mock-redis");
const { redis, store } = createMockRedis(() => clock);

const orig = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@upstash/redis") return { Redis: { fromEnv: () => redis } };
  if (request === "web-push") {
    return { generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }), setVapidDetails() {}, async sendNotification() {} };
  }
  return orig.call(this, request, ...rest);
};

// api/auth.js, api/admin.js and api/daily.js are single router files that dispatch on ?action=... (kept
// that way to stay under Vercel's Hobby-plan function limit) — tests call the old, pre-consolidation
// path names, so route those through the real file with the right action already set.
const ADMIN_ACTIONS = { audit: "audit", health: "health", backup: "backup", history: "history", overview: "overview" };
const DAILY_ACTIONS = { verify: "verify", leave: "leave", payments: "payments" };
const GOODS_ACTIONS = { slips: "slips" };
function withAction(modulePath, action) {
  const real = require(modulePath);
  return (req, res) => real(Object.assign({}, req, { query: Object.assign({}, req.query, { action: action }) }), res);
}
const api = (p) => {
  const authM = /^auth\/(.+)$/.exec(p);
  if (authM) return require(path.join(__dirname, "..", "api", "_lib", "authHandlers", authM[1]));
  if (ADMIN_ACTIONS[p]) return withAction(path.join(__dirname, "..", "api", "admin"), ADMIN_ACTIONS[p]);
  if (DAILY_ACTIONS[p]) return withAction(path.join(__dirname, "..", "api", "daily"), DAILY_ACTIONS[p]);
  if (GOODS_ACTIONS[p]) return withAction(path.join(__dirname, "..", "api", "goods"), GOODS_ACTIONS[p]);
  return require(path.join(__dirname, "..", "api", p));
};

// TEST_BACKEND=pg runs every test on the relational (PostgreSQL) layer, backed by SQLite; default is the legacy Redis storage.
const BACKEND = process.env.TEST_BACKEND === "pg" ? "pg" : "redis";
const DB = api("_lib/db");
const { makeSqliteDriver } = require("./sqlite-driver");
const useBackend = () => DB.setDriver(BACKEND === "pg" ? makeSqliteDriver() : undefined);
useBackend();

const HOST = "app.example.com";

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

// A "browser": keeps cookies, sends Origin + JSON like the real app does.
function browser(ip) {
  const jar = {};
  return {
    jar,
    ip: ip || "203.0.113.10",
    async call(handler, o) {
      o = o || {};
      const headers = Object.assign({
        host: HOST,
        origin: "https://" + HOST,
        "content-type": "application/json",
        "x-real-ip": this.ip,
        "user-agent": "test-browser",
      }, o.headers || {});
      Object.keys(headers).forEach((k) => { if (headers[k] === null) delete headers[k]; });
      const c = Object.keys(jar).map((k) => k + "=" + jar[k]).join("; ");
      if (c && !("cookie" in headers)) headers.cookie = c;
      const req = { method: o.method || "GET", url: o.url || "/api/x", headers, body: o.body, query: o.query || {}, socket: { remoteAddress: this.ip } };
      const res = makeRes();
      await handler(req, res);
      const sc = res.headers["set-cookie"];
      if (sc) {
        const first = String(sc).split(";")[0];
        const i = first.indexOf("=");
        const name = first.slice(0, i), val = first.slice(i + 1);
        if (/Max-Age=0/i.test(sc) || val === "") delete jar[name]; else jar[name] = val;
        res.cookieAttrs = String(sc);
      }
      return res;
    },
  };
}

module.exports = {
  redis, store, api, browser, HOST, BACKEND,
  async setData(blob) { await api("_lib/repo")._testLoad(blob); },
  async getData() { return (await api("_lib/repo").readAll()).blob; },
  async rev() { return (await api("_lib/repo").readAll()).rev; },
  advance(ms) { clock += ms; },
  now() { return clock; },
  reset() { store.clear(); useBackend(); },
};
// keep Date.now() in sync with the fake clock
const realNow = Date.now;
Date.now = () => clock;
module.exports.restoreClock = () => { Date.now = realNow; };
