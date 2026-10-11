// First-login guide: a short step-by-step tour of the screen for the person's role.
// Each account sees it ONCE, on whatever device: the number of the guide version already seen is kept on the server
// (and in this browser as a copy). Signing in again never opens it again. When the interface gets an update, the guide
// opens one more time and shows ONLY the new steps of that role (see UPDATES), then marks the new version as seen.
// A person can always replay the whole guide from "Èd" -> "Rekòmanse gid la".
import { state } from "../state.js";
import {
  escapeHtml,
  roleLabel,
  storageGet,
  storageSet
} from "../utils.js";

// Version of the guide. 1 = the guide as it was before updates were tracked (every account that already saw it counts as 1).
// Raise it by one each time an UPDATES entry is added below.
export const TOUR_VERSION = 2;

const WELCOME = "Gid sa a ap montre w, etap pa etap, kijan pou itilize paj ou a. Li pran mwens pase yon minit. Ou ka sote l epi louvri l ankò nenpòt ki lè ak bouton «Èd» la.";

const TOURS = {
  admin: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Meni an", "Peze bouton meni an (twa ba) anlè a pou chanje tab: Tablo Kontwòl, Ajoute, Kontenè, Trucking, Pwodwi, Envantè, Bills, Rapò ak lòt yo."],
    ["Tablo Kontwòl", "Se premye ekran ou wè a. Kat yo montre konbyen kontenè ki Full, Vid ak Sorti, konbyen ki poko verifye, epi konbyen ki ijan (plis pase 5 jou)."],
    ["Ajoute ak jere kontenè", "Tab «Ajoute» sèvi pou antre yon kontenè ak bill li. Nan tab «Kontenè», chèche yon kontenè pa nimewo, bill, pwodwi, trucking, chofè oswa plak. Peze «Detay» pou wè ki chofè ak ki plak ki te vini avè l, ak istorik kontenè a (kiyès ki fè kisa, ak kilè). Peze «Modifye» pou korije l."],
    ["Trucking ak Pwodwi", "Tab Trucking ak tab Pwodwi montre yon kat pou chak trucking ak chak pwodwi. Peze yon kat pou wè kontenè li yo. DKN konte ansanm ak CTSA, paske se menm konpayi."],
    ["Envantè, Bills ak Rapò", "Chak jou, kòche kontenè yo nan Envantè pou konfime yo toujou la. Bills montre estati chak bill. Rapò telechaje rapò PDF oswa yon fichye Excel."],
    ["Kont ak sekirite", "Nan Itilizatè ou kreye yon kont pou chak moun. Sekirite montre ki moun ki konekte. Bouton «Kont mwen» sèvi pou chanje modpas ou, epi «Èd» la louvri gid sa a ankò."]
  ],
  depot: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Chwazi yon divizyon", "Kontenè yo separe pa divizyon. Chwazi yon divizyon pou wè kontenè li yo."],
    ["Vide yon kontenè", "Lè yon kontenè vide, peze sou li epi make «Vid». Apre sa li parèt pou chofè yo ka vin pran l."],
    ["Transfere depo", "Si yon kontenè chanje kote li ye, ouvri l epi chwazi nouvo depo a (ak trucking si gen youn)."],
    ["Fich Livrezon", "Lè yon kliyan pran machandiz, ranpli yon Fich Livrezon tankou fich papye a (konpayi, Bon #, kliyan, fakti, pwodwi ak kantite), epi telechaje l an PDF. Tab «Rapò Livrezon Jounalye» montre tout fich yon jou."],
    ["Inventè ak dat ekspirasyon", "Tab «Inventè» montre sa ki rete nan depo a pou chak pwodwi. Li kalkile pou kont li: Antre Estòk, mwens Fich Livrezon yo. Nan «Antre Estòk», ou ka mete yon dat ekspirasyon."],
    ["Èd ak kont ou", "Bouton «Èd» la louvri gid sa a ankò. Bouton «Kont mwen» sèvi pou chanje modpas ou."]
  ],
  logistique: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Ajoute yon bill", "Peze «Nouvo bill», chwazi divizyon an, mete nimewo bill la, pwodwi a ak montan an si ou konnen l."],
    ["Bill yo ak estati yo", "Ou wè tout divizyon yo. Chak bill ou antre gen yon estati: Pa peye, Chèk resevwa, Peye, oswa Konfime. Peze yon kat anlè a pou filtre pa estati."],
    ["Konfime yon peman", "Peze «Peman» sou yon bill. Mete ki monte li vo, epi dat ou resevwa chèk la, dat li peye (lè brokè a pote l ale), ak dat ou konfime."],
    ["Plizyè bill yon sèl kou", "Koche plizyè bill epi konfime yon sèl peman pou yo tout. Ou mete montan chak bill separeman."],
    ["Èd ak kont ou", "Bouton «Èd» la louvri gid sa a ankò. Bouton «Kont mwen» sèvi pou chanje modpas ou."]
  ],
  pointeur: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Kontenè pou debake", "Ou wè kontenè Full ki nan depo ou a. Chèche youn ak nimewo li, bill la oswa pwodwi a."],
    ["Debarquement", "Lè w kòmanse debake yon kontenè, peze «Debarquement». Administratè a wè l sou-le-champ, ak non ou."],
    ["Mete Vid", "Lè kontenè a fin vid, peze «Mete Vid». Non ou antre nan istorik la kòm moun ki debake l epi vide l."],
    ["Èd ak kont ou", "Bouton «Èd» la louvri gid sa a ankò. Bouton «Kont mwen» sèvi pou chanje modpas ou."]
  ],
  chofe: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Trucking ou", "Anlè paj la, chwazi non trucking ou anvan w kontinye. Si administratè a deja mete trucking ou sou kont ou, li parèt la otomatikman."],
    ["Chwazi kontenè yo", "Kontenè ki vid epi ki disponib pou pran yo parèt anba a. Koche chak kontenè w ap pran."],
    ["Konfime depa", "Lè w fin chwazi, peze «Konfime Depa» anba paj la. Sa make kontenè yo kòm kite."],
    ["Èd ak kont ou", "Bouton «Èd» la louvri gid sa a ankò. Bouton «Kont mwen» sèvi pou chanje modpas ou."]
  ],
  administration: [
    ["Byenvini nan Administration DEKA", WELCOME],
    ["Tout divizyon yo", "Anlè a, chwazi yon divizyon pou wè sèlman li, oswa kite «Tout divizyon» pou wè yo tout ansanm. Done yo soti nan entèfas Lojistik la ak entèfas Depo a."],
    ["Apèsi", "Kat yo montre kontenè Full, Vid ak Kite, Bill aktif, ak pwodwi ann estòk, k ap ekspire oswa ki ekspire. Peze sou yon kat pou louvri lis la."],
    ["Kontenè ak Pwodwi", "«Kontenè» se rejis konplè a. «Pwodwi» montre bill yo ak konbyen kontenè chak bill gen."],
    ["Estòk ak Mouvman", "«Estòk» montre sa ki rete nan depo a pou chak pwodwi. «Mouvman» montre antre estòk, fich livrezon, machandiz retounen oswa avarye, ak fakti yo."],
    ["Lekti sèlman", "Ou ka sèlman gade ak telechaje lis yo (.csv). Pesonn pa ka chanje anyen nan entèfas sa a. Bouton «Èd» la louvri gid sa a ankò."]
  ],
  daily: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Envantè jounalye", "Se menm lis kontenè ak Lojistik (Full, Poko Verifye, Vid), men chanjman ou fè isit yo rete apa. Yo pa modifye Lojistik."],
    ["Verifye", "Si yon kontenè deja verifye sou teren men li poko make «Verifye» nan sistèm nan, peze bouton Verifye a. Se sèl aksyon isit la ki ekri nan Lojistik."],
    ["Trucking ak depo", "Chanje trucking (CFC ak yon nimewo, oswa DKN 001 a 015) ak depo a dirèkteman nan lis la."],
    ["Rapò PDF", "Telechaje rapò Full oswa Vid an PDF. Bouton «Èd» la louvri gid sa a ankò."]
  ]
};

// What is new in each version of the interface, per role. An account that already saw an older version of the guide is shown
// only the entries whose `since` is higher than the version it has seen. Add an entry here AND raise TOUR_VERSION.
const UPDATES = [
  {
    since: 2,
    roles: {
      depot: [
        ["Nouvo: Fich Livrezon", "Tab «Fich Livrezon» ranplase rapò livrezon an. Ranpli fich la tankou fich papye a (konpayi, Bon #, kliyan, fakti, pwodwi ak kantite), epi telechaje l an PDF. Tab «Rapò Livrezon Jounalye» montre tout fich yon jou."],
        ["Nouvo: Inventè", "Tab «Inventè» montre sa ki rete nan depo a pou chak pwodwi. Li kalkile pou kont li: Antre Estòk, mwens Fich Livrezon yo."],
        ["Nouvo: Dat ekspirasyon", "Nan «Antre Estòk», ou ka mete yon dat ekspirasyon. Inventè a montre ki pwodwi k ap ekspire oswa ki ekspire deja."]
      ]
    }
  }
];

function fullSteps(role) {
  return TOURS[role] || [];
}

// What to show an account that has already seen guide version `seen` (0 = never):
//   never seen -> the whole guide of its role; seen an older version -> only the new steps; up to date -> nothing.
export function tourPlan(role, seen) {
  seen = Number(seen) || 0;
  if (seen >= TOUR_VERSION) {
    return { mode: "none", steps: [] };
  }
  if (seen <= 0) {
    var all = fullSteps(role);
    return all.length ? { mode: "full", steps: all } : { mode: "none", steps: [] };
  }
  var news = [];
  UPDATES.forEach(function (u) {
    if (u.since > seen && u.roles[role]) {
      news = news.concat(u.roles[role]);
    }
  });
  return news.length ? { mode: "update", steps: news } : { mode: "none", steps: [] };
}

function stepsFor(role) {
  return Array.isArray(state.tourSteps) ? state.tourSteps : fullSteps(role);
}

export function tourKey() {
  return "deka_tour_seen:" + (state.authRole || "") + ":" + (state.username || "");
}

// The copy kept in this browser. Older versions of the app stored "1" here, which is exactly "guide version 1 seen".
function localSeen() {
  return parseInt(storageGet(tourKey()), 10) || 0;
}

function postSeen(version) {
  try {
    return fetch("/api/auth/tour", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: version })
    }).catch(function () {});
  } catch (e) {
    return Promise.resolve();
  }
}

// Asks the server which guide version this account has already seen. Called once after each sign in; the guide waits for the answer
// (so it never flashes up for someone who already saw it on another device). If the server cannot be reached, the copy in this browser decides.
export function loadTourSeen() {
  var who = tourKey();
  state.tourSeen = null;
  state.tourSeenFailed = false;
  var done = function () {
    return state.authRole && tourKey() === who;
  };
  try {
    return fetch("/api/auth/tour", { credentials: "same-origin" }).then(function (r) {
      return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status));
    }).then(function (d) {
      if (!done()) return;
      state.tourSeen = Number(d && d.version) || 0;
      // this browser knows of a newer version than the server (it could not be told earlier): tell it now
      if (localSeen() > state.tourSeen) {
        postSeen(localSeen());
      }
    }).catch(function () {
      if (done()) state.tourSeenFailed = true;
    });
  } catch (e) {
    state.tourSeenFailed = true;
    return Promise.resolve();
  }
}

function markSeen() {
  storageSet(tourKey(), String(TOUR_VERSION));
  state.tourSeen = TOUR_VERSION;
  postSeen(TOUR_VERSION);
}

// Called on every render: starts the tour once, on the first main screen shown after a sign in.
export function maybeStartTour() {
  if (state.tour !== null && state.tour !== undefined) {
    return;
  }
  var onMain = state.unlocked || state.depotUnlocked || state.logistiqueUnlocked || state.drUnlocked || state.authRole === "chofe" || state.authRole === "pointeur";
  if (!state.authRole || !onMain || state.needs || state.acct || state.help || state.authChecking || state.loadingData || state.loadError) {
    return;
  }
  if (!stepsFor(state.authRole).length) {
    return;
  }
  var key = tourKey();
  if (state.tourFor === key) {
    return;
  }
  // wait for the server's answer (or its failure) before deciding
  if ((state.tourSeen === null || state.tourSeen === undefined) && !state.tourSeenFailed) {
    return;
  }
  var seen = Math.max(localSeen(), Number(state.tourSeen) || 0);
  var plan = tourPlan(state.authRole, seen);
  state.tourFor = key;
  if (plan.mode === "none") {
    // nothing new for this role: remember that the account is up to date, without showing anything
    if (seen > 0 && seen < TOUR_VERSION) {
      markSeen();
    }
    return;
  }
  state.tourSteps = plan.steps;
  state.tourMode = plan.mode;
  state.tour = 0;
}

export function startTour() {
  state.help = false;
  state.tourSteps = fullSteps(state.authRole);
  state.tourMode = "full";
  state.tour = 0;
}

export function tourNext() {
  var total = stepsFor(state.authRole).length;
  if (state.tour === null || state.tour + 1 >= total) {
    finishTour();
  } else {
    state.tour += 1;
  }
}

export function tourPrev() {
  if (state.tour > 0) {
    state.tour -= 1;
  }
}

export function finishTour() {
  markSeen();
  state.tour = null;
  state.tourSteps = null;
  state.tourMode = "";
}

export function tourView() {
  if (state.tour === null || state.tour === undefined || !state.authRole) {
    return "";
  }
  var steps = stepsFor(state.authRole);
  if (!steps.length) {
    return "";
  }
  var i = Math.min(Math.max(state.tour, 0), steps.length - 1);
  var last = i === steps.length - 1;
  var s = steps[i];
  var dots = steps.map(function (x, k) {
    return `<span style="width:${ k === i ? 18 : 7 }px;height:7px;border-radius:4px;background:${ k === i ? "var(--navy)" : "var(--border)" };display:inline-block"></span>`;
  }).join("");
  var isUpdate = state.tourMode === "update";
  var eyebrow = isUpdate ? "Nouvo nan paj ou a" : i === 0 ? escapeHtml(roleLabel(state.authRole)) : "Gid kòmansman";
  var back = i > 0 ? `<button type="button" class="btn ghost" data-action="tour-prev">Retounen</button>` : "";
  var skip = last ? "" : `<button type="button" class="linklike" data-action="tour-skip" style="color:var(--muted);margin-right:auto">Sote gid la</button>`;
  var next = `<button type="button" class="btn navy" data-action="tour-next">${ last ? (isUpdate ? "Konprann" : "Konprann, kòmanse") : "Swivan" }</button>`;
  return `<div class="modal-overlay" style="z-index:90" role="dialog" aria-modal="true"><div class="modal-card" style="max-width:420px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div class="eyebrow">${ eyebrow }</div><div style="font-size:12px;color:var(--muted);font-family:var(--font-mono)">${ i + 1 } / ${ steps.length }</div></div><div class="h3" style="margin-bottom:8px">${ escapeHtml(s[0]) }</div><div style="font-size:13.5px;color:var(--ink);line-height:1.6;min-height:84px">${ escapeHtml(s[1]) }</div><div style="display:flex;gap:5px;align-items:center;margin:16px 0">${ dots }</div><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">${ skip }${ back }${ next }</div></div></div>`;
}

export function tourStrings() {
  var out = [];
  UPDATES.forEach(function (u) {
    Object.keys(u.roles).forEach(function (r) {
      u.roles[r].forEach(function (t) {
        out.push(t[0], t[1]);
      });
    });
  });
  Object.keys(TOURS).forEach(function (r) {
    TOURS[r].forEach(function (t) {
      out.push(t[0], t[1]);
    });
  });
  return out;
}
