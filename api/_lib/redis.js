"use strict";
// One shared Upstash Redis client for every API function.
const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();

module.exports = { redis };
