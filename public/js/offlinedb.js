// Small IndexedDB wrapper for offline work: a key/value store (cached data, last session info, recovery copies) and an
// outbox (requests made without network, waiting to be sent). If IndexedDB is not available (some private modes, tests)
// everything falls back to memory, so the app keeps working for the current session but nothing survives a reload.
var DB_NAME = "deka-log-offline";
var mem = { kv: new Map(), outbox: new Map() };
var dbPromise = null;

function open() {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise(function (resolve) {
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) {
        resolve(null);
        return;
      }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        resolve(null);
      };
      req.onblocked = function () {
        resolve(null);
      };
    } catch (e) {
      resolve(null);
    }
  });
  return dbPromise;
}

// Runs one request on a store; resolves with its result. Any failure falls back to the memory copy.
function run(store, mode, make, fallback) {
  return open().then(function (db) {
    if (!db) {
      return fallback();
    }
    return new Promise(function (resolve) {
      try {
        var t = db.transaction(store, mode);
        var r = make(t.objectStore(store));
        t.oncomplete = function () {
          resolve(r && "result" in r ? r.result : undefined);
        };
        t.onerror = t.onabort = function () {
          resolve(fallback());
        };
      } catch (e) {
        resolve(fallback());
      }
    });
  });
}

export function kvGet(key) {
  return run("kv", "readonly", function (s) {
    return s.get(key);
  }, function () {
    return mem.kv.get(key);
  }).then(function (v) {
    return v === undefined ? null : v;
  });
}

export function kvSet(key, value) {
  return run("kv", "readwrite", function (s) {
    return s.put(value, key);
  }, function () {
    mem.kv.set(key, value);
  });
}

export function kvDel(key) {
  return run("kv", "readwrite", function (s) {
    return s.delete(key);
  }, function () {
    mem.kv.delete(key);
  });
}

export function kvKeys(prefix) {
  return run("kv", "readonly", function (s) {
    return s.getAllKeys();
  }, function () {
    return Array.from(mem.kv.keys());
  }).then(function (keys) {
    return (keys || []).filter(function (k) {
      return String(k).indexOf(prefix) === 0;
    });
  });
}

export function outboxAll() {
  return run("outbox", "readonly", function (s) {
    return s.getAll();
  }, function () {
    return Array.from(mem.outbox.values());
  }).then(function (items) {
    return (items || []).slice().sort(function (a, b) {
      return a.seq - b.seq;
    });
  });
}

export function outboxPut(item) {
  return run("outbox", "readwrite", function (s) {
    return s.put(item);
  }, function () {
    mem.outbox.set(item.id, item);
  });
}

export function outboxDel(id) {
  return run("outbox", "readwrite", function (s) {
    return s.delete(id);
  }, function () {
    mem.outbox.delete(id);
  });
}

// Tests only: forget the connection and the memory copy.
export function _reset() {
  mem.kv.clear();
  mem.outbox.clear();
  dbPromise = null;
}
