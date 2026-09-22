"use strict";
// Legacy storage: the whole logistic data set as one JSON value in Redis (used until DATABASE_URL is configured).
// Same interface as pgrepo.js, so the API code does not care which one is active.
const crypto = require("crypto");
const { redis } = require("./redis");
const S = require("./store");
const { ApiError } = require("./errors");

const KEY = "deka-log-data";

async function loadBlob() {
  const d = await redis.get(KEY);
  if (!d || typeof d !== "object") return S.emptyData();
  return {
    containers: Array.isArray(d.containers) ? d.containers : [],
    bills: Array.isArray(d.bills) ? d.bills : [],
    notifications: Array.isArray(d.notifications) ? d.notifications : [],
    inventoryChecks: d.inventoryChecks && typeof d.inventoryChecks === "object" && !Array.isArray(d.inventoryChecks) ? d.inventoryChecks : {},
  };
}

// One writer at a time, so read-modify-write cycles cannot overwrite each other.
async function withLock(fn) {
  // The "t" prefix keeps the token from ever looking like a JSON number (Redis clients auto-parse JSON on read).
  const token = "t" + crypto.randomBytes(8).toString("hex");
  const lockKey = "dl:lock:data";
  let got = false;
  for (let i = 0; i < 40 && !got; i++) {
    got = !!(await redis.set(lockKey, token, { nx: true, ex: 10 }));
    if (!got) await new Promise(function (r) { setTimeout(r, 100); });
  }
  if (!got) throw new ApiError(503, "busy", "Sistèm nan okipe. Eseye ankò.");
  try {
    return await fn();
  } finally {
    try {
      if ((await redis.get(lockKey)) === token) await redis.del(lockKey);
    } catch (e) { /* the lock expires by itself after 10 s */ }
  }
}

function strip(rows) {
  return rows.map(function (r) {
    const o = Object.assign({}, r);
    delete o._h;
    return o;
  });
}

async function readAll() {
  return { blob: await loadBlob(), rev: null };
}

async function writeClient(clean) {
  return withLock(async function () {
    const prev = await loadBlob();
    // Safety net: never let an empty payload wipe existing data.
    if (clean.containers.length === 0 && prev.containers.length > 0) throw new ApiError(409, "empty_payload", "Sove a bloke: done yo vid. Rechaje paj la.");
    const next = { containers: strip(clean.containers), bills: strip(clean.bills), notifications: clean.notifications, inventoryChecks: clean.inventoryChecks };
    await redis.set(KEY, next);
    return { rev: null, prev: prev, blob: next, changed: true };
  });
}

async function mutate(fn) {
  return withLock(async function () {
    const prev = await loadBlob();
    const next = JSON.parse(JSON.stringify(prev));
    const info = await fn(next);
    const changed = JSON.stringify(prev) !== JSON.stringify(next);
    if (changed) await redis.set(KEY, next);
    return { info: info, prev: prev, blob: next, rev: null, changed: changed };
  });
}

async function health() {
  const b = await loadBlob();
  return { backend: "redis", ok: true, rev: null, containers: b.containers.length, bills: b.bills.length, notifications: b.notifications.length };
}

// Tests only: replace the stored data.
async function _testLoad(blob) {
  await redis.set(KEY, blob);
}

module.exports = { name: "redis", readAll, writeClient, mutate, health, _testLoad, KEY };
