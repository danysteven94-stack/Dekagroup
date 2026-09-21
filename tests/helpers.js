"use strict";
// Test helpers: in-memory Redis (Upstash-like), stubs for web-push, and a tiny HTTP-like harness for the API handlers.
const Module = require("module");
const path = require("path");

let clock = Date.now();
const store = new Map(); // key -> { v, exp }

function alive(k) {
  const e = store.get(k);
  if (!e) return null;
  if (e.exp && e.exp <= clock) { store.delete(k); return null; }
  return e;
}
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
// Upstash parses JSON automatically when reading
const out = (v) => {
  if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return v; } }
  return clone(v);
};

const redis = {
  async get(k) { const e = alive(k); return e ? out(e.v) : null; },
  async set(k, v, o) {
    o = o || {};
    if (o.nx && alive(k)) return null;
    store.set(k, { v: clone(v), exp: o.ex ? clock + o.ex * 1000 : 0 });
    return "OK";
  },
  async del(k) { return store.delete(k) ? 1 : 0; },
  async incr(k) { const e = alive(k); const n = (e ? Number(e.v) : 0) + 1; store.set(k, { v: n, exp: e ? e.exp : 0 }); return n; },
  async expire(k, s) { const e = alive(k); if (!e) return 0; e.exp = clock + s * 1000; return 1; },
  async ttl(k) { const e = alive(k); if (!e) return -2; return e.exp ? Math.ceil((e.exp - clock) / 1000) : -1; },
  async lpush(k, ...items) { const e = alive(k); const l = e ? e.v : []; items.forEach((i) => l.unshift(i)); store.set(k, { v: l, exp: 0 }); return l.length; },
  async ltrim(k, a, b) { const e = alive(k); if (e) e.v = e.v.slice(a, b + 1); return "OK"; },
  async lrange(k, a, b) { const e = alive(k); return e ? e.v.slice(a, b + 1).map(out) : []; },
  async hgetall(k) { const e = alive(k); return e ? clone(e.v) : null; },
  async hset(k, o) { const e = alive(k); const h = e ? e.v : {}; Object.assign(h, clone(o)); store.set(k, { v: h, exp: 0 }); return 1; },
  async hdel(k, ...f) { const e = alive(k); if (e) f.forEach((x) => delete e.v[x]); return 1; },
};

const orig = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@upstash/redis") return { Redis: { fromEnv: () => redis } };
  if (request === "web-push") {
    return { generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }), setVapidDetails() {}, async sendNotification() {} };
  }
  return orig.call(this, request, ...rest);
};

const api = (p) => require(path.join(__dirname, "..", "api", p));

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
