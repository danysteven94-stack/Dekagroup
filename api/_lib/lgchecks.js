"use strict";
// Logistique Deka: the photo of the check of a bill. The browser shrinks the picture before sending it (about
// 1200 px, JPEG), the server only accepts small JPEG images and keeps one picture per bill under its own Redis key
// (the bills themselves are not touched). A small hash tells which bills have a picture, without loading them.
const { redis } = require("./redis");

const META_KEY = "dl:lgcheckmeta";
const photoKey = function (id) { return "dl:lgcheck:" + id; };
const MAX_CHARS = 380000; // about 280 KB of image: the app sends ~100-200 KB
const PREFIX = "data:image/jpeg;base64,";
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Returns the clean data URL, or "" when it is not an acceptable (small) JPEG.
function clean(image) {
  if (typeof image !== "string" || image.indexOf(PREFIX) !== 0 || image.length > MAX_CHARS) return "";
  const b64 = image.slice(PREFIX.length);
  if (b64.length < 100 || b64.indexOf("/9j/") !== 0 || !B64.test(b64)) return "";
  return image;
}

async function flags() {
  const m = await redis.hgetall(META_KEY);
  return m && typeof m === "object" ? m : {};
}

async function put(billId, image, by) {
  await redis.set(photoKey(billId), image);
  await redis.hset(META_KEY, { [billId]: { at: new Date().toISOString(), by: by || "", size: image.length } });
}

async function get(billId) {
  const v = await redis.get(photoKey(billId));
  return typeof v === "string" ? v : null;
}

async function remove(billId) {
  await redis.del(photoKey(billId));
  await redis.hdel(META_KEY, billId);
}

module.exports = { clean, flags, put, get, remove, MAX_CHARS };
