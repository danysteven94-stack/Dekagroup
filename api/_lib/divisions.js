"use strict";
// Which divisions may share a database, and which must each have their own.
// GROUP_1 divisions have always shared one database (this does not change).
// GROUP_2 divisions each get a separate, isolated database ("pool").
//
// The values here are exactly public/js/constants.js DIVISIONS_GROUP_1 / DIVISIONS_GROUP_2,
// so a container's "division" field, a user's assigned divisions, and a database pool key
// all agree on the same names.

const GROUP_1 = ["CRISTO AL", "CRISTO COMM", "CONFIDEKA", "DEKAV"]; // one shared database ("default" pool)

// Each of these has its own database. The pool key is what _lib/db.js uses to pick the
// right environment variable (DATABASE_URL_ACS, DATABASE_URL_MIKADO, ...).
const GROUP_2_POOLS = {
  "ACS": "acs",
  "MIKADO": "mikado",
  "LA COLLECTION": "lacollection",
  "DEKA TIRES": "dekatires",
};

const POOL_OF = {};
GROUP_1.forEach(function (d) { POOL_OF[d] = "default"; });
Object.keys(GROUP_2_POOLS).forEach(function (d) { POOL_OF[d] = GROUP_2_POOLS[d]; });

const ALL = GROUP_1.concat(Object.keys(GROUP_2_POOLS));

function isValid(division) {
  return Object.prototype.hasOwnProperty.call(POOL_OF, division);
}

function poolOf(division) {
  return POOL_OF[division] || null;
}

// Unique, ordered list of pools that a set of divisions touches.
function poolsOf(divisionList) {
  const seen = {};
  const out = [];
  (divisionList || []).forEach(function (d) {
    const p = poolOf(d);
    if (p && !seen[p]) { seen[p] = true; out.push(p); }
  });
  return out;
}

// Every division that lives in a given pool (used to label the picker: "CRISTO AL, CRISTO COMM, ...").
function divisionsInPool(pool) {
  return ALL.filter(function (d) { return POOL_OF[d] === pool; });
}

module.exports = { GROUP_1, GROUP_2_POOLS, ALL, isValid, poolOf, poolsOf, divisionsInPool };
