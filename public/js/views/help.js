// In-app help ("Èd"): a quick guide per role, reachable from every screen next to "Kont mwen".
// This is the onboarding document for a new person — nothing here calls the server.
import { LOGO_URL } from "../constants.js";
import { langButton } from "../i18n.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import {
  escapeHtml,
  roleLabel
} from "../utils.js";

export function helpButton(color) {
  return `<button class="linklike" data-action="open-help" style="color:${ color }">${ icon("clipboard", 13) } Èd</button> ${ langButton(color) } `;
}

function step(title, body) {
  return `<div style="margin-bottom:16px"><div style="font-weight:700;color:var(--navy);font-size:13.5px;margin-bottom:3px">${ title }</div><div style="font-size:13px;color:var(--ink);line-height:1.55">${ body }</div></div>`;
}

const GUIDES = {
  admin: [
    ["Tablo Kontwòl", "Premye ekran ou wè a. Li montre konbyen kontenè Full, konteneur ki poko verifye, ak alèt pou kontenè ki rete twò lontan."],
    ["Ajoute yon Kontenè", "Tab «Ajoute» — mete nimewo kontenè a, gwosè (20' oswa 40'), divizyon, epi swa kreye yon nouvo bill oswa chwazi youn ki egziste deja."],
    ["Rejis Kontenè", "Lis tout kontenè yo. Klike sou yon kontenè pou verifye l, transfere l nan yon depo, oswa korije dat antre a si te gen yon erè."],
    ["Envantè Jounalye", "Chak jou, kòche kontenè yo pou konfime yo toujou la — sa ede detekte si yon kontenè disparèt san eksplikasyon."],
    ["Rejis Bill", "Tout bill yo ak estati yo (planifye, aktif, fini). Yon bill fini otomatikman lè tout kontenè li yo kite."],
    ["Rapò", "Telechaje rapò PDF pa gwoup divizyon, oswa tout rejis kontenè a nan yon fichye Excel (.csv)."],
    ["Sekirite", "Gade ki moun ki konekte, kilè, ak kopi otomatik done yo — itil si yon bagay pa sanble kòrèk."],
    ["Itilizatè", "Kreye yon kont pou chak moun, chanje wòl yo, oswa dezaktive yon kont si yon moun kite ekip la."]
  ],
  depot: [
    ["Kontenè Full", "Lis kontenè ki antre epi verifye yo, triye pa divizyon. Chwazi yon divizyon pou wè kontenè li yo."],
    ["Vide yon kontenè", "Lè yon kontenè vide, klike sou li epi make «Vid». Li ap parèt pou chofè yo ka vin pran l."],
    ["Transfere Depo", "Si yon kontenè chanje kote li ye, ouvri l epi chwazi nouvo depo a (ak trucking si genyen)."]
  ],
  chofe: [
    ["Chwazi Trucking ou", "Anlè paj la, chwazi non trucking ou (oswa nimewo li) anvan w kontinye."],
    ["Chwazi Kontenè yo", "Kontenè ki vid epi ki disponib pou pran yo parèt anba a. Koche tout kontenè w ap pran yo."],
    ["Konfime Depa", "Lè w fin chwazi, klike «Konfime Depa» anba paj la. Sa make kontenè yo kòm kite."]
  ],
  daily: [
    ["Envantè Jounalye", "Menm lis konteneur ak Lojistik (Full, Poko Verifye, Vid), men chanjman ou fè isit yo rete apa — yo pa modifye Lojistik."],
    ["Verifye", "Si w wè yon kontenè ki verifye deja sou teren an men ki poko make «Verifye» nan sistèm nan, klike bouton Verifye a. Se sèl aksyon isit la ki ekri nan Lojistik."],
    ["Trucking ak Depo", "Chanje trucking (CFC ak yon nimewo, oswa DNK 001-015) ak depo a dirèkteman nan lis la."],
    ["Rapò PDF", "Telechaje rapò Full oswa Vid an PDF, ak done jan yo ye nan Daily Report kounye a."]
  ]
};

function guideFor(role) {
  return (GUIDES[role] || []).map(function (g) {
    return step(escapeHtml(g[0]), escapeHtml(g[1]));
  }).join("");
}

export function helpView() {
  var role = state.authRole;
  return `<div class="gate-wrap" style="align-items:flex-start;padding:24px 14px"><div class="gate-card" style="max-width:520px;width:100%;text-align:left"><div class="gate-brand"><div class="gate-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div class="gate-title">Gid Rapid</div></div><div style="text-align:center;font-size:13px;color:var(--muted);margin:-6px 0 18px">${ escapeHtml(roleLabel(role)) }</div>${ guideFor(role) }<div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)">Gen yon kesyon sistèm nan pa reponn? Mande administratè a.</div><button type="button" class="btn navy" data-action="close-help" style="width:100%;justify-content:center;margin-top:16px">Fèmen</button></div></div>`;
}
