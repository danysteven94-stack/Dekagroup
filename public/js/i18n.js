// Language switch (Kreyòl / Français). The app's source text is Kreyòl; in French mode every piece of text put on
// the page is translated after rendering (text nodes + placeholder/title/alt attributes) using i18n-fr.js.
// Data typed by users (container numbers, product names, depots...) never matches a dictionary entry, so it stays as is.
import {
  EXACT,
  PATTERNS
} from "./i18n-fr.js";

var LS_LANG = "deka-log-lang";
var lang = "ht";
try {
  lang = localStorage.getItem(LS_LANG) === "fr" ? "fr" : "ht";
} catch (e) {
  lang = "ht";
}

var cache = {};

export function getLang() {
  return lang;
}

export function isFr() {
  return lang === "fr";
}

export function setLang(next) {
  lang = next === "fr" ? "fr" : "ht";
  cache = {};
  try {
    localStorage.setItem(LS_LANG, lang);
  } catch (e) {
    // private mode: the choice just lasts until the page is closed
  }
  applyDocumentLang();
}

export function applyDocumentLang() {
  if (typeof document === "undefined" || !document.documentElement) {
    return;
  }
  document.documentElement.lang = lang;
  document.title = lang === "fr" ? "DEKA LOG — Gestion des conteneurs" : "DEKA LOG — Jesyon Kontenè";
}

var SEPARATORS = /( · | — |: |; )/;

function translateCore(s) {
  if (Object.prototype.hasOwnProperty.call(EXACT, s)) {
    return EXACT[s];
  }
  for (var i = 0; i < PATTERNS.length; i++) {
    var m = PATTERNS[i][0].exec(s);
    if (m) {
      return PATTERNS[i][1].apply(null, m.slice(1));
    }
  }
  return null;
}

// Translates one string of Kreyòl UI text. Unknown text is returned unchanged.
export function t(text) {
  if (lang !== "fr" || typeof text !== "string" || !text) {
    return text;
  }
  var lead = /^\s*/.exec(text)[0];
  var trail = /\s*$/.exec(text)[0];
  var core = text.trim();
  if (!core) {
    return text;
  }
  if (Object.prototype.hasOwnProperty.call(cache, core)) {
    return lead + cache[core] + trail;
  }
  var out = translateCore(core);
  if (out === null) {
    // "Label: value", "A · B", "A — B": translate the pieces we know
    var parts = core.split(SEPARATORS);
    if (parts.length > 1) {
      var changed = false;
      var joined = parts.map(function (p, i) {
        if (i % 2 === 1) {
          return p;
        }
        var r = translateCore(p.trim());
        if (r === null) {
          return p;
        }
        changed = true;
        return r;
      }).join("");
      out = changed ? joined : core;
    } else {
      out = core;
    }
  }
  cache[core] = out;
  return lead + out + trail;
}

var ATTRS = ["placeholder", "title", "alt", "aria-label"];

// Translates everything under `root` in place (text nodes and the attributes above).
export function translateDom(root) {
  if (lang !== "fr" || !root || typeof document === "undefined") {
    return;
  }
  var walker = document.createTreeWalker(root, 4);
  var nodes = [];
  var n = walker.nextNode();
  while (n) {
    nodes.push(n);
    n = walker.nextNode();
  }
  nodes.forEach(function (node) {
    var p = node.parentNode;
    if (p && (p.nodeName === "SCRIPT" || p.nodeName === "STYLE" || p.nodeName === "TEXTAREA")) {
      return;
    }
    var v = node.nodeValue;
    var r = t(v);
    if (r !== v) {
      node.nodeValue = r;
    }
  });
  // Words that mean different things in different places carry their French text: <button data-fr="Se connecter">Antre</button>
  Array.prototype.forEach.call(root.querySelectorAll("[data-fr]"), function (el) {
    if (!el.children.length) {
      el.textContent = el.getAttribute("data-fr");
    }
  });
  var els = root.querySelectorAll("[placeholder],[title],[alt],[aria-label]");
  Array.prototype.forEach.call(els, function (el) {
    ATTRS.forEach(function (a) {
      var v = el.getAttribute(a);
      if (v) {
        var r = t(v);
        if (r !== v) {
          el.setAttribute(a, r);
        }
      }
    });
  });
}

// Day and month names for dates written in the page.
var WEEKDAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
var MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function weekdayName(i, fallback) {
  return lang === "fr" ? WEEKDAYS_FR[i] : fallback;
}

export function monthName(i, fallback) {
  return lang === "fr" ? MONTHS_FR[i] : fallback;
}

// The small language button shown next to Help / Account (and on the login screen).
export function langButton(color) {
  var label = lang === "fr" ? "Kreyòl" : "Français";
  return `<button class="linklike" data-action="set-lang" data-lang="${ lang === "fr" ? "ht" : "fr" }" style="color:${ color || "var(--muted)" }">${ label }</button>`;
}
