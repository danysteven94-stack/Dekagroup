# DEKA LOG

Aplikasyon jesyon konteneur (Lojistik, Depo, Chofè, Daily Report).

- `public/` — paj la (sèl dosye ki sou entènèt)
- `api/` — sèvè a (koneksyon, done, aksyon, kopi, jounal)
- `tools/`, `tests/` — zouti ak tès (pa deplwaye)
- Dokiman: [`DEPLOY.md`](DEPLOY.md) (deplwaman ak GitHub/Vercel) · [`SEKIRITE.md`](SEKIRITE.md) (sekirite ak baz done)

Kòmanse rapid: `npm install && npm run demo` epi louvri http://localhost:3000

## Administration DEKA (vi konplè an lekti sèlman)

Wòl **Administration DEKA** wè **tout sa ki nan entèfas Lojistik la ak entèfas Depo a**, pou **tout divizyon yo ansanm**: kontenè, pwodwi (bill), estòk, antre estòk, fich livrezon, machandiz retounen ak avarye, fakti.
Administratè a kreye kont lan nan «Itilizatè» epi chwazi wòl «Administration DEKA». Pa gen divizyon pou chwazi: moun nan **wè tout divizyon yo**.

- **Lekti sèlman**: pesonn pa ka chanje anyen ladan l. Wòl la pa ka ekri okenn done, ni li `/api/data`, `/api/payments` oswa jere kont yo.
- Paj la: `public/js/views/administration.js` (+ `overview.js`, `events-administration.js`) · API: `api/_lib/overview.js` (rele via `/api/overview`, ki pataje fonksyon `api/admin.js` pou rete anba limit 12 fonksyon Vercel Hobby a).
- Chak divizyon gen pwòp baz done li: API a li yo youn apre lòt. Si yon baz done pa konfigire oswa li pa reponn, paj la montre yon avètisman epi rès la kontinye afiche.
- Estòk la kalkile pou kont li (menm règ ak Inventè Depo a), baz done pa baz done, paske nimewo bill yo pa inik ant de baz done.
- Sèvè demo lokal la (`node tools/dev-server.js`) gen yon kont `administration` / `demo-administration-1234`. Li gen yon sèl baz done, kidonk lòt divizyon yo make «pa disponib».

## Logistique Deka (bill yo ak konfimasyon pèman yo)

Wòl **Logistique Deka** gen **pwòp done pa l**, apa de tout lòt entèfas yo (Lojistik, Depo, Chofè, Daily Report).
Administratè a kreye kont lan nan «Itilizatè» epi chwazi wòl «Logistique Deka». Pa gen divizyon pou chwazi: moun nan **wè tout divizyon yo**.

- Se moun Logistique Deka yo ki antre bill yo yo menm («Nouvo bill»: divizyon, nimewo, pwodwi, montan). Anyen pa soti nan kontenè oswa bill lòt entèfas yo, epi anyen pa ale la tou.
- **Sèl** wòl «Logistique Deka» ka wè ak modifye done sa yo (menm administratè a pa ka: li jis jere kont yo). Wòl sa a pa ka wè kontenè yo non plis (`/api/data` fèmen pou li).
- Chak bill swiv 4 etap: **Pa peye → Chèk resevwa → Peye → Peman konfime**. Chak dat antre men. Yon sèl peman ka kouvri plizyè bill, chak ak montan pa li.
- Done yo kenbe nan pwòp tab pa yo `lg_bills` (kreye otomatikman, san lyen ak lòt tab yo).
- Paj la: `public/js/views/logistique.js` (+ `payments.js`, `events-logistique.js`) · API: `api/_lib/lgpayments.js` (rele via `/api/payments`, ki pataje fonksyon `api/daily.js` pou rete nan limit 12 fonksyon Vercel Hobby), estokaj: `api/_lib/lgbills.js`
- Tès: `tests/payments.test.js`, `tests/payments.client.test.mjs`

## Depo: Fich Livrezon, Rapò Jounalye, Inventè

- **Fich Livrezon** (`views/delivery.js`, API `/api/slips` → `api/_lib/slips.js`, rele via `api/goods.js` pou rete nan limit 12 fonksyon): fich papye Deka Group (konpayi, Bon #, kliyan, Fakti #, liy pwodwi, magazinye/chofè/resevwa pa, «Livre le»). Chak liy chwazi yon pwodwi ki nan estòk la.
- **Rapò Livrezon Jounalye**: tout fich yon jou + total pa pwodwi (PDF).
- **Inventè** (`js/inventory.js`, `views/inventory.js`): estòk = Antre Estòk − Fich Livrezon − Avarye + Retounen, kalkile pou kont li. Pwodwi = Bill + deskripsyon + inite. Sa ki soti premye se sa ki ekspire pi bonè.
- **Antre Estòk** gen kounye a yon **Dat Ekspirasyon** opsyonèl (`stock_entries.expires_on`).
- Baz done: tab `delivery_slips` + kolòn `expires_on` kreye otomatikman (SCHEMA_VERSION 14).
- Tès: `tests/slips.test.js`, `tests/inventory.client.test.mjs`.
