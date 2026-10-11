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
    ["Trucking", "Pou chak trucking (CFC, CTSA, MAD) wè konbyen kontenè Full, Vid ak Pran li genyen. DKN se menm bagay ak CTSA, kidonk yo konte ansanm. Peze sou yon trucking pou wè detay kontenè li yo, separe 40 pye ak 20 pye. Non chofè ak plak la parèt sèlman lè w peze sou yon kontenè."],
    ["Itilizatè", "Kreye yon kont pou chak moun, chanje wòl yo, oswa dezaktive yon kont si yon moun kite ekip la. Pou yon chofè, mete plak kamyon an ak trucking li travay ladan: li p ap bezwen chwazi l ankò."]
  ],
  depot: [
    ["Kontenè Full", "Lis kontenè ki antre epi verifye yo, triye pa divizyon. Chwazi yon divizyon pou wè kontenè li yo."],
    ["Vide yon kontenè", "Lè yon kontenè vide, klike sou li epi make «Vid». Li ap parèt pou chofè yo ka vin pran l."],
    ["Transfere Depo", "Si yon kontenè chanje kote li ye, ouvri l epi chwazi nouvo depo a (ak trucking si genyen)."]
  ],
  logistique: [
    ["Bill yo", "Ou wè bill yo ou antre yo, divizyon pa divizyon, ak estati peman chak youn: Pa peye, Chèk resevwa, Peye, Konfime. Done sa yo se pa Logistique Deka sèlman: okenn lòt entèfas pa wè yo."],
    ["Ajoute yon bill", "Peze «Nouvo bill», chwazi divizyon an (ou wè tout divizyon yo), mete nimewo bill la, pwodwi a ak montan an si ou konnen l."],
    ["Konfime yon peman", "Peze «Peman» sou yon bill. Mete ki monte bill la vo, epi dat chèk la rive, dat li peye (lè brokè a pote l ale), ak dat ou konfime. Ranpli sèlman etap ki fèt yo."],
    ["Plizyè bill yon sèl kou", "Koche plizyè bill, mete montan chak bill, epi konfime yon sèl peman pou yo tout ansanm."],
    ["Defèt yon etap", "Si w mete yon dat pa erè, peze «Defèt» sou bill la pou retire dènye etap la."],
    ["Rezime", "Tab «Rezime pa Divizyon» montre konbyen bill chak divizyon peye, konfime, ak montan yo."]
  ],
  administration: [
    ["Apèsi", "Se premye ekran an: konbyen kontenè ki Full, Vid ak Kite, konbyen Bill aktif, ak pwodwi ki ann estòk, k ap ekspire oswa ki ekspire deja. Peze sou yon kat pou louvri lis la."],
    ["Divizyon", "Chwazi yon divizyon anlè a pou wè sèlman li, oswa kite «Tout divizyon» pou wè yo tout ansanm. Nan Apèsi, peze sou yon liy pou wè yon divizyon."],
    ["Kontenè ak Pwodwi", "Tab «Kontenè» montre rejis konplè a (estati, bill, trucking, chofè, dat yo). Tab «Pwodwi» montre bill yo ak kontenè chak bill."],
    ["Estòk", "Sa ki rete nan depo a pou chak pwodwi: antre, livre, avarye, retounen, ak dat ekspirasyon. Li kalkile pou kont li."],
    ["Mouvman", "Antre Estòk, Fich Livrezon, Machandiz Retounen ak Avarye, ak Fakti yo. Peze «Telechaje (.csv)» pou jwenn lis la nan Excel."],
    ["Lekti sèlman", "Nan entèfas sa a ou ka sèlman gade. Pesonn pa ka chanje anyen isit la."]
  ],
  pointeur: [
    ["Kontenè pou debake", "Ou wè kontenè Full ki nan depo ou a. Se sa ou ap debake yo."],
    ["Debarquement", "Lè w kòmanse debake yon kontenè, peze «Debarquement». Administratè Lojistik la wè sa menm lè a, ak non ou."],
    ["Mete Vid", "Lè kontenè a fin vid, peze «Mete Vid». Non ou rete nan istorik kontenè a kòm moun ki debake l epi ki vide l."],
    ["Anile", "Si w peze «Debarquement» pa erè, peze «Anile» pou reprann li (sèlman sou kontenè pa w)."]
  ],
  chofe: [
    ["Chwazi Trucking ou", "Anlè paj la, chwazi non trucking ou (oswa nimewo li) anvan w kontinye. Si administratè a deja mete trucking ou sou kont ou, l ap parèt la otomatikman."],
    ["Chwazi Kontenè yo", "Kontenè ki vid epi ki disponib pou pran yo parèt anba a. Koche tout kontenè w ap pran yo."],
    ["Konfime Depa", "Lè w fin chwazi, klike «Konfime Depa» anba paj la. Sa make kontenè yo kòm kite."]
  ],
  daily: [
    ["Envantè Jounalye", "Menm lis konteneur ak Lojistik (Full, Poko Verifye, Vid), men chanjman ou fè isit yo rete apa — yo pa modifye Lojistik."],
    ["Verifye", "Si w wè yon kontenè ki verifye deja sou teren an men ki poko make «Verifye» nan sistèm nan, klike bouton Verifye a. Se sèl aksyon isit la ki ekri nan Lojistik."],
    ["Trucking ak Depo", "Chanje trucking (CFC ak yon nimewo, oswa DKN 001-015) ak depo a dirèkteman nan lis la."],
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
  return `<div class="gate-wrap" style="align-items:flex-start;padding:24px 14px"><div class="gate-card" style="max-width:520px;width:100%;text-align:left"><div class="gate-brand"><div class="gate-logo"><img src="${ LOGO_URL }" alt="Deka Group" /></div><div class="gate-title">Gid Rapid</div></div><div style="text-align:center;font-size:13px;color:var(--muted);margin:-6px 0 18px">${ escapeHtml(roleLabel(role)) }</div>${ guideFor(role) }<div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)">Gen yon kesyon sistèm nan pa reponn? Mande administratè a.</div><button type="button" class="btn ghost" data-action="tour-start" style="width:100%;justify-content:center;margin-top:16px">Rekòmanse gid kòmansman an</button><button type="button" class="btn navy" data-action="close-help" style="width:100%;justify-content:center;margin-top:10px">Fèmen</button></div></div>`;
}
