"use strict";
// Web Push helpers for DEKA LOG (VAPID keys, subscription storage, sending).
const crypto = require("crypto");
const { Redis } = require("@upstash/redis");
const webpush = require("web-push");

const redis = Redis.fromEnv();
const SUBS_KEY = "deka-log-push-subs";
const VAPID_KEY = "deka-log-vapid";

function subId(endpoint) {
  return crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
}

// VAPID keys: use env vars if you set them, otherwise generate once and keep them in Redis.
async function getVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  let keys = await redis.get(VAPID_KEY);
  if (!keys || !keys.publicKey || !keys.privateKey) {
    await redis.set(VAPID_KEY, webpush.generateVAPIDKeys(), { nx: true });
    keys = await redis.get(VAPID_KEY); // whichever request won the race
  }
  return keys;
}

async function saveSubscription(sub, deviceId, userAgent) {
  if (
    !sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) ||
    !sub.keys || typeof sub.keys.p256dh !== "string" || typeof sub.keys.auth !== "string"
  ) {
    throw new Error("Subscription pa valid");
  }
  const id = subId(sub.endpoint);
  const device = String(deviceId || "").slice(0, 64);

  // A device only keeps one subscription: drop older endpoints from the same device.
  if (device) {
    const all = (await redis.hgetall(SUBS_KEY)) || {};
    const stale = Object.keys(all).filter((k) => k !== id && all[k] && all[k].deviceId === device);
    if (stale.length) await redis.hdel(SUBS_KEY, ...stale);
  }

  await redis.hset(SUBS_KEY, {
    [id]: {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      deviceId: device,
      ua: String(userAgent || "").slice(0, 200),
      updatedAt: new Date().toISOString(),
    },
  });
  return id;
}

async function removeSubscription(endpoint) {
  if (typeof endpoint === "string" && endpoint) await redis.hdel(SUBS_KEY, subId(endpoint));
}

// messages: [{ title, body, tag, url }]. Skips the device that triggered the change (it already sees a toast).
async function sendToAll(host, messages, opts) {
  const skipDeviceId = opts && opts.skipDeviceId;
  const all = (await redis.hgetall(SUBS_KEY)) || {};
  const entries = Object.entries(all).filter(
    ([, v]) => v && v.subscription && !(skipDeviceId && v.deviceId === skipDeviceId)
  );
  if (!entries.length || !messages.length) return { sent: 0, failed: 0, removed: 0 };

  const { publicKey, privateKey } = await getVapid();
  const subject = process.env.VAPID_SUBJECT || (host ? "https://" + host : "https://example.com");
  webpush.setVapidDetails(subject, publicKey, privateKey);

  let sent = 0;
  let failed = 0;
  const dead = [];
  await Promise.all(
    entries.map(async ([id, v]) => {
      for (const m of messages) {
        try {
          await webpush.sendNotification(v.subscription, JSON.stringify(m), {
            TTL: 60 * 60 * 24,
            urgency: "high",
            timeout: 8000,
          });
          sent++;
        } catch (err) {
          failed++;
          if (err && (err.statusCode === 404 || err.statusCode === 410)) {
            dead.push(id); // subscription expired / user revoked permission
            break;
          }
        }
      }
    })
  );
  if (dead.length) await redis.hdel(SUBS_KEY, ...dead);
  return { sent, failed, removed: dead.length };
}

// Compare what was stored with what is being saved and push only the notifications that are new.
async function notifyNew(prev, next, ctx) {
  const prevIds = new Set(((prev && prev.notifications) || []).map((n) => n && n.id));
  const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const fresh = ((next && next.notifications) || []).filter(
    (n) => n && n.id && typeof n.message === "string" && !prevIds.has(n.id) && (!n.date || n.date >= since)
  );
  if (!fresh.length) return null;

  const url = "/?tab=notifs";
  const clip = (s) => (s.length > 200 ? s.slice(0, 197) + "..." : s);
  let messages;
  if (fresh.length <= 3) {
    // newest notifications are stored first; send oldest first so the newest ends up on top
    messages = fresh.slice().reverse().map((n) => ({ title: "DEKA LOG", body: clip(n.message), tag: "deka-" + n.id, url }));
  } else {
    messages = [{
      title: "DEKA LOG",
      body: fresh.length + " nouvo notifikasyon \u2014 " + clip(fresh[0].message),
      tag: "deka-summary",
      url,
    }];
  }
  return sendToAll(ctx && ctx.host, messages, { skipDeviceId: ctx && ctx.deviceId });
}

module.exports = { redis, getVapid, saveSubscription, removeSubscription, sendToAll, notifyNew };
