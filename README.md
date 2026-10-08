# DEKA LOG

Aplikasyon jesyon konteneur (Lojistik, Depo, Chofè, Daily Report).

- `public/` — paj la (sèl dosye ki sou entènèt)
- `api/` — sèvè a (koneksyon, done, aksyon, kopi, jounal)
- `tools/`, `tests/` — zouti ak tès (pa deplwaye)
- Dokiman: [`DEPLOY.md`](DEPLOY.md) (deplwaman ak GitHub/Vercel) · [`SEKIRITE.md`](SEKIRITE.md) (sekirite ak baz done)

Kòmanse rapid: `npm install && npm run demo` epi louvri http://localhost:3000

## Logistique Deka (bill yo ak konfimasyon pèman yo)

Wòl **Logistique Deka** gen **pwòp done pa l**, apa de tout lòt entèfas yo (Lojistik, Depo, Chofè, Daily Report).
Administratè a kreye kont lan nan «Itilizatè» epi chwazi wòl «Logistique Deka». Pa gen divizyon pou chwazi: moun nan **wè tout divizyon yo**.

- Se moun Logistique Deka yo ki antre bill yo yo menm («Nouvo bill»: divizyon, nimewo, pwodwi, montan). Anyen pa soti nan kontenè oswa bill lòt entèfas yo, epi anyen pa ale la tou.
- **Sèl** wòl «Logistique Deka» ka wè ak modifye done sa yo (menm administratè a pa ka: li jis jere kont yo). Wòl sa a pa ka wè kontenè yo non plis (`/api/data` fèmen pou li).
- Chak bill swiv 4 etap: **Pa peye → Chèk resevwa → Peye → Peman konfime**. Chak dat antre men. Yon sèl peman ka kouvri plizyè bill, chak ak montan pa li.
- Done yo kenbe nan pwòp tab pa yo `lg_bills` (kreye otomatikman, san lyen ak lòt tab yo).
- Paj la: `public/js/views/logistique.js` (+ `payments.js`, `events-logistique.js`) · API: `api/payments.js`, estokaj: `api/_lib/lgbills.js`
- Tès: `tests/payments.test.js`, `tests/payments.client.test.mjs`
