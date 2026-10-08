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
- Paj la: `public/js/views/logistique.js` (+ `payments.js`, `events-logistique.js`) · API: `api/_lib/lgpayments.js` (rele via `/api/payments`, ki pataje fonksyon `api/daily.js` pou rete nan limit 12 fonksyon Vercel Hobby), estokaj: `api/_lib/lgbills.js`
- Tès: `tests/payments.test.js`, `tests/payments.client.test.mjs`

### Rapèl 3 jou (notifikasyon) ak konfimasyon pa bill

- Yon bill ki gen **3 jou oswa plis depi dat chèk la rive** epi ki **poko gen konfimasyon peman** voye yon notifikasyon push **sèlman bay aparèy kont Logistique Deka yo** (kont lòt wòl yo pa resevwa l, e kont Logistique pa resevwa notifikasyon kontenè yo). Yon sèl notifikasyon pa jou (lis bill an reta yo), epi li kontinye chak jou jiskaske bill la konfime.
- Li pati de fason: (1) **cron Vercel chak jou** (`vercel.json` → `/api/daily?action=reminders`, 13:00 UTC) ; (2) kòm sekou, **premye vizit jounen an** yon kont Logistique fè nan paj la. Yo pataje menm vèwou (lock) pa jou, donk pesonn pa resevwa l de fwa.
- Chak moun Logistique Deka dwe **aktive notifikasyon** sou aparèy li (kat «Notifikasyon sou aparèy ou» anlè paj Pèman Bill yo).
- Nan paj la: yon bannyè wouj + «N jou depi chèk la rive» sou chak bill an reta, ak yon bouton **Konfime** sou chak bill (konfime yon sèl bill, ak dat jodi a deja ranpli).
- Opsyonèl men rekòmande: mete `CRON_SECRET` nan Vercel (Settings → Environment Variables) pou sèlman cron Vercel la ka rele `/api/daily?action=reminders`.
- API: `api/_lib/lgreminders.js` · Tès: `tests/payments.test.js`
