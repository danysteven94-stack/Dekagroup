"use strict";
// In-memory stand-in for Upstash Redis (tests and the local demo server). Values are stored as JSON like Upstash does.
function createMockRedis(now) {
  const store = new Map(); // key -> { v, exp }
  const clock = now || Date.now;

  const alive = (k) => {
    const e = store.get(k);
    if (!e) return null;
    if (e.exp && e.exp <= clock()) { store.delete(k); return null; }
    return e;
  };
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
      store.set(k, { v: clone(v), exp: o.ex ? clock() + o.ex * 1000 : 0 });
      return "OK";
    },
    async del(k) { return store.delete(k) ? 1 : 0; },
    async incr(k) { const e = alive(k); const n = (e ? Number(e.v) : 0) + 1; store.set(k, { v: n, exp: e ? e.exp : 0 }); return n; },
    async expire(k, s) { const e = alive(k); if (!e) return 0; e.exp = clock() + s * 1000; return 1; },
    async ttl(k) { const e = alive(k); if (!e) return -2; return e.exp ? Math.ceil((e.exp - clock()) / 1000) : -1; },
    async lpush(k, ...items) { const e = alive(k); const l = e ? e.v : []; items.forEach((i) => l.unshift(i)); store.set(k, { v: l, exp: 0 }); return l.length; },
    async ltrim(k, a, b) { const e = alive(k); if (e) e.v = e.v.slice(a, b + 1); return "OK"; },
    async lrange(k, a, b) { const e = alive(k); return e ? e.v.slice(a, b + 1).map(out) : []; },
    async hgetall(k) { const e = alive(k); return e ? clone(e.v) : null; },
    async hset(k, o) { const e = alive(k); const h = e ? e.v : {}; Object.assign(h, clone(o)); store.set(k, { v: h, exp: 0 }); return 1; },
    async hdel(k, ...f) { const e = alive(k); if (e) f.forEach((x) => delete e.v[x]); return 1; },
  };
  return { redis, store };
}

module.exports = { createMockRedis };
