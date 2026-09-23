# DEKA LOG — Sekirite (gid rapid)

## Sa ki nan plas
- **Koneksyon bò sèvè**: modpass yo pa nan kòd paj la ankò. Sèvè a verifye yo (hash `scrypt`) epi bay yon sesyon (cookie `HttpOnly`, `Secure`, `SameSite=Strict`).
- **Yon sèl paj koneksyon**: non itilizatè + modpass. Kont lan deside ki interface k ap louvri: `logistic` (admin), `depotnord` (depo), `logisticdepot` (daily report), `chofe` (chofè). Si yon sesyon deja louvri sou aparèy la, paj la ofri bouton "Kontinye kòm ...".
- **Dwa pa wòl (sèvè a fòse yo)**:
  - admin: li ak ekri tout done yo.
  - depo: li done yo; sèlman "vid" ak "transfè" via `/api/act`.
  - chofè: li sèlman konteneur Vid yo; sèlman "depa" via `/api/act`.
  - daily report: li done yo; ekri nan pa li (`/api/daily`) + bouton Verifye (`/api/verify`).
- **Pwoteksyon**: limit esè koneksyon (5 echèk / 15 min pou non+IP), sesyon ki ekspire (12 è san aktivite, admin max 24 è), CSRF (Origin + JSON), validasyon done, sekirite anti-efase (pa ka sove done vid), verou pou ekriti, kopi otomatik (`/api/backup`), jounal aktivite (`/api/audit`), header sekirite + CSP (`vercel.json`).

## Konfigirasyon (yon sèl fwa)
1. Vercel > pwojè a > **Settings > Environment Variables**.
2. Ajoute `AUTH_ADMIN_HASH`, `AUTH_DEPOT_HASH`, `AUTH_DAILY_HASH`, `AUTH_CHOFE_HASH` (valè yo nan fichye `SEKRE-PRIVE-deka-log.txt`).
3. **Redeploy**. Si variab yo manke, pesonn pa ka konekte (sa a se nòmal: sistèm nan fèmen pa defo).

Opsyonèl: `AUTH_<WÒL>_USER` pou chanje non itilizatè a; `AUTH_SESSION_EPOCH` (chanje valè a pou dekonekte tout moun).

## Chanje yon modpass
`node tools/hash-password.js "nouvo-modpass-long"` → mete rezilta a nan `AUTH_<WÒL>_HASH` → Redeploy.
Pou fòse tout sesyon yo fini: chanje `AUTH_SESSION_EPOCH`.

## Gade jounal aktivite / kopi
Konekte kòm admin, epi klike sou **Sekirite** nan meni a: ou wè jounal aktivite a (koneksyon, echèk, aksyon refize...) ak kopi otomatik yo (bouton Telechaje). Done yo tou disponib sou `/api/audit` ak `/api/backup`.

## Kòd la (public/js)
Pa gen script "inline" ditou nan paj la — CSP a se `script-src 'self'` san eksepsyon, epi li pa bezwen chanje lè kòd la chanje. Tout kòd JavaScript la se fichye separe anba `public/js/` (modil ES: `import`/`export`), chaje ak `<script type="module" src="/js/main.js">`. Estrikti a: `constants.js`, `utils.js`, `state.js`, `api.js`, `session.js`, `push.js`, `mutations.js`, `pdf.js`, `render.js`, `events.js`, `events-account.js`, ak `views/*.js` (yon fichye pa ekran: `gate`, `admin`, `depot`, `driver`, `daily`, `account`, `security`, `users`, `modals`). Chak fichye gen yon kòmantè anlè ki di sa li fè. `app.css` gen tout style yo apa.

## Tès
```
npm test                 # tout tès yo, sou de kalite baz done
npm run test:browser     # vrè Chrome (bezwen puppeteer)
```

## Baz done PostgreSQL (rekòmande)
Tout done yo (konteneur, bill, notifikasyon, verifikasyon) ka viv nan yon vrè baz PostgreSQL, ak yon tab pou chak bagay.
Si `DATABASE_URL` pa konfigire, aplikasyon an kontinye sèvi ak Redis tankou anvan (anyen pa kase).

**Pou aktive l (yon sèl fwa):**
1. Vercel > pwojè a > **Storage > Create Database > Neon (Postgres)** > konekte l ak pwojè a. Vercel ajoute `DATABASE_URL` otomatikman. Chwazi menm rejyon ak fonksyon yo.
2. **Redeploy** pwojè a.
3. Konekte kòm admin, klike **Sekirite**: ou dwe wè "Baz done: PostgreSQL · ap mache · N konteneur". Tab yo kreye pou kont yo, epi done Redis yo kopye otomatikman yon sèl fwa (kopi Redis la rete entak kòm sekou).

**Sa ki chanje:**
- Chak ranje gen yon nimewo vèsyon. Si de moun modifye MENM konteneur an menm tan, dezyèm nan resevwa yon mesaj klè epi paj la rafrechi; lòt chanjman yo pa janm efase.
- Yon paj vye (kache) yo mande pou rafrechi paj la.
- Redis kontinye sèvi pou sesyon, jounal aktivite, kopi ak notifikasyon push.

**Retounen sou Redis:** retire `DATABASE_URL` epi Redeploy. Atansyon: chanjman ki fèt apre migrasyon an rete nan PostgreSQL sèlman.

**Tès:** `npm test` (kouri tout tès yo sou de kalite baz done; PostgreSQL la simile ak SQLite nan tès yo).

## Kont pèsonèl, 2FA ak jesyon itilizatè
Chak moun gen pwòp kont li (non itilizatè + modpass pa li). Jounal aktivite a di **ki moun** ki fè kisa.

**Aktive l (yon sèl fwa):**
1. Vercel > Environment Variables > ajoute `APP_SECRET` (valè a nan `SEKRE-PRIVE-etap2.txt`) > **Redeploy**.
   ⚠️ Pa janm chanje `APP_SECRET` pita: sekrè 2FA yo chifre avèk li, epi chanje l fòse tout moun konfigire 2FA ankò. Kenbe yon kopi sekirize.
2. Konekte ak kont pataje admin lan (`logistic`) > tab **Itilizatè** > kreye yon kont pou chak moun (menm pou ou menm kòm admin). Sèvè a bay yon **modpass tanporè** (montre yon sèl fwa): ba moun nan li.
3. Nan premye koneksyon, moun nan **dwe chanje modpass la**. Yon admin dwe tou **aktive 2FA** (yon aplikasyon tankou Google/Microsoft Authenticator oswa Authy sou telefòn li; li antre kle a manyèlman) epi sove 8 kòd sekou.
4. Lè tout moun gen kont pèsonèl: dezaktive kont pataje yo (Vercel: `AUTH_LEGACY_DISABLED=1` > Redeploy). Kont pataje yo (`logistic`, `depotnord`, `logisticdepot`, `chofe`) pa gen 2FA epi nenpòt moun ki konn modpass yo ka sèvi ak yo.

**Sa admin ka fè (tab Itilizatè):** kreye kont, reyinisyalize modpass (nouvo modpass tanporè + dekonekte moun nan), dezaktive/aktive, chanje wòl, reyinisyalize 2FA (si moun nan pèdi telefòn li). Yon admin pa ka dezaktive, demote oswa reyinisyalize pwòp kont li; yon admin pa ka dezaktive 2FA li.

**Chak moun ("Kont mwen"):** chanje modpass li (sa dekonekte lòt aparèy li yo), aktive 2FA (opsyonèl pou depo/chofè/daily, obligatwa pou admin). Modpass: omwen 10 karaktè, pa twò komen. Yon kòd 2FA pa ka itilize de fwa; kòd sekou yo sèvi yon sèl fwa.

**Limit:** pa gen kòd QR (ou antre kle a manyèlman, oswa ou tape lyen an sou telefòn nan). Kont yo estoke nan PostgreSQL si li konfigire, sinon nan Redis.

## Notifikasyon Imèl
Chak fwa gen yon nouvo notifikasyon (yon bill fini, yon kontenè kite...), yon imèl rezime ka voye bay yon lis adrès, an menm tan ak notifikasyon push la.

**Aktive l (opsyonèl, gratis — pa bezwen achte yon domèn):**
1. Kreye yon kont gratis sou [brevo.com](https://www.brevo.com) (plan gratis: 300 imèl/jou).
2. **Senders & IP > Senders** > ajoute adrès ou vle voye yo soti a (egzanp yon adrès Gmail ou deja genyen), epi konfime l — Brevo voye yon lyen konfimasyon nan bwat lèt ou a. **Pa bezwen domèn ni DNS**, jis konfime ou posede adrès la.
3. **SMTP & API > API Keys** > jenere yon **API key**.
4. Vercel > Environment Variables > ajoute `BREVO_API_KEY` (valè a soti Brevo) ak `EMAIL_FROM` (menm adrès ou te konfime a, egzanp `DEKA LOG <ou@gmail.com>`) > **Redeploy**.
5. Konekte kòm admin, tab **Sekirite**, seksyon **Notifikasyon Imèl** — ajoute adrès moun ki dwe resevwa yo, epi klike **Voye yon tès** pou konfime li mache.

San `BREVO_API_KEY`, seksyon an montre yon mesaj ki di sa poko konfigire; ou ka toujou ajoute/retire adrès yo davans, yo pral kòmanse resevwa yo depi w konfigire kle a.

## Mòd San Entènèt ak Èd
- **San entènèt:** yon bandwol wouj parèt anlè app la lè aparèy la pèdi konesyon. App la kenbe dènye done ki te chaje yo; li rekonekte epi resenkronize otomatikman lè entènèt la retounen. Sove yon chanjman pandan w san entènèt pa mache — tann bandwol la disparèt anvan w kontinye.
- **Èd:** yon bouton "Èd" bò kote "Kont mwen" nan tout entèfas yo montre yon gid rapid espesifik pou wòl moun nan.
