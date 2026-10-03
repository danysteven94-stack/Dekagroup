// First-login guide: a short step-by-step tour of the screen for the person's role.
// It opens by itself the first time an account signs in on a device, then never again unless
// the person reopens it from "Èd" -> "Rekòmanse gid la". Nothing here calls the server.
import { state } from "../state.js";
import {
  escapeHtml,
  roleLabel,
  storageGet,
  storageSet
} from "../utils.js";

const WELCOME = "Gid sa a ap montre w, etap pa etap, kijan pou itilize paj ou a. Li pran mwens pase yon minit. Ou ka sote l epi louvri l ankò nenpòt ki lè ak bouton «Èd» la.";

const TOURS = {
  admin: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Meni an", "Peze bouton meni an (twa ba) anlè a pou chanje tab: Tablo Kontwòl, Ajoute, Kontenè, Trucking, Pwodwi, Envantè, Bills, Rapò ak lòt yo."],
    ["Tablo Kontwòl", "Se premye ekran ou wè a. Kat yo montre konbyen kontenè ki Full, Vid ak Sorti, konbyen ki poko verifye, epi konbyen ki ijan (plis pase 5 jou)."],
    ["Ajoute ak jere kontenè", "Tab «Ajoute» sèvi pou antre yon kontenè ak bill li. Nan tab «Kontenè», chèche yon kontenè pa nimewo, bill, pwodwi, trucking, chofè oswa plak. Peze «Detay» pou wè ki chofè ak ki plak ki te vini avè l, oswa «Modifye» pou korije l."],
    ["Trucking ak Pwodwi", "Tab Trucking ak tab Pwodwi montre yon kat pou chak trucking ak chak pwodwi. Peze yon kat pou wè kontenè li yo. DKN konte ansanm ak CTSA, paske se menm konpayi."],
    ["Envantè, Bills ak Rapò", "Chak jou, kòche kontenè yo nan Envantè pou konfime yo toujou la. Bills montre estati chak bill. Rapò telechaje rapò PDF oswa yon fichye Excel."],
    ["Kont ak sekirite", "Nan Itilizatè ou kreye yon kont pou chak moun. Sekirite montre ki moun ki konekte. Bouton «Kont mwen» sèvi pou chanje modpas ou, epi «Èd» la louvri gid sa a ankò."]
  ],
  depot: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Chwazi yon divizyon", "Kontenè yo separe pa divizyon. Chwazi yon divizyon pou wè kontenè li yo."],
    ["Vide yon kontenè", "Lè yon kontenè vide, peze sou li epi make «Vid». Apre sa li parèt pou chofè yo ka vin pran l."],
    ["Transfere depo", "Si yon kontenè chanje kote li ye, ouvri l epi chwazi nouvo depo a (ak trucking si gen youn)."],
    ["Èd ak kont ou", "Bouton «Èd» la louvri gid sa a ankò. Bouton «Kont mwen» sèvi pou chanje modpas ou."]
  ],
  chofe: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Trucking ou", "Anlè paj la, chwazi non trucking ou anvan w kontinye. Si administratè a deja mete trucking ou sou kont ou, li parèt la otomatikman."],
    ["Chwazi kontenè yo", "Kontenè ki vid epi ki disponib pou pran yo parèt anba a. Koche chak kontenè w ap pran."],
    ["Konfime depa", "Lè w fin chwazi, peze «Konfime Depa» anba paj la. Sa make kontenè yo kòm kite."],
    ["Èd ak kont ou", "Bouton «Èd» la louvri gid sa a ankò. Bouton «Kont mwen» sèvi pou chanje modpas ou."]
  ],
  daily: [
    ["Byenvini nan Deka Log", WELCOME],
    ["Envantè jounalye", "Se menm lis kontenè ak Lojistik (Full, Poko Verifye, Vid), men chanjman ou fè isit yo rete apa. Yo pa modifye Lojistik."],
    ["Verifye", "Si yon kontenè deja verifye sou teren men li poko make «Verifye» nan sistèm nan, peze bouton Verifye a. Se sèl aksyon isit la ki ekri nan Lojistik."],
    ["Trucking ak depo", "Chanje trucking (CFC ak yon nimewo, oswa DKN 001 a 015) ak depo a dirèkteman nan lis la."],
    ["Rapò PDF", "Telechaje rapò Full oswa Vid an PDF. Bouton «Èd» la louvri gid sa a ankò."]
  ]
};

function stepsFor(role) {
  return TOURS[role] || [];
}

export function tourKey() {
  return "deka_tour_seen:" + (state.authRole || "") + ":" + (state.username || "");
}

// Called on every render: starts the tour once, on the first main screen shown after a sign in.
export function maybeStartTour() {
  if (state.tour !== null && state.tour !== undefined) {
    return;
  }
  var onMain = state.unlocked || state.depotUnlocked || state.drUnlocked || state.authRole === "chofe";
  if (!state.authRole || !onMain || state.needs || state.acct || state.help || state.authChecking || state.loadingData || state.loadError) {
    return;
  }
  if (!stepsFor(state.authRole).length) {
    return;
  }
  var key = tourKey();
  if (state.tourFor === key || storageGet(key)) {
    return;
  }
  state.tourFor = key;
  state.tour = 0;
}

export function startTour() {
  state.help = false;
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
  storageSet(tourKey(), "1");
  state.tour = null;
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
  var eyebrow = i === 0 ? escapeHtml(roleLabel(state.authRole)) : "Gid kòmansman";
  var back = i > 0 ? `<button type="button" class="btn ghost" data-action="tour-prev">Retounen</button>` : "";
  var skip = last ? "" : `<button type="button" class="linklike" data-action="tour-skip" style="color:var(--muted);margin-right:auto">Sote gid la</button>`;
  var next = `<button type="button" class="btn navy" data-action="tour-next">${ last ? "Konprann, kòmanse" : "Swivan" }</button>`;
  return `<div class="modal-overlay" style="z-index:90" role="dialog" aria-modal="true"><div class="modal-card" style="max-width:420px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div class="eyebrow">${ eyebrow }</div><div style="font-size:12px;color:var(--muted);font-family:var(--font-mono)">${ i + 1 } / ${ steps.length }</div></div><div class="h3" style="margin-bottom:8px">${ escapeHtml(s[0]) }</div><div style="font-size:13.5px;color:var(--ink);line-height:1.6;min-height:84px">${ escapeHtml(s[1]) }</div><div style="display:flex;gap:5px;align-items:center;margin:16px 0">${ dots }</div><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end">${ skip }${ back }${ next }</div></div></div>`;
}

export function tourStrings() {
  var out = [];
  Object.keys(TOURS).forEach(function (r) {
    TOURS[r].forEach(function (t) {
      out.push(t[0], t[1]);
    });
  });
  return out;
}
