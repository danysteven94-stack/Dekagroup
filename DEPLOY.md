# DEKA LOG — Deplwaman otomatik (gid pa etap)

Objektif: chak chanjman pase pa GitHub → tès yo kouri pou kont yo → Vercel bay yon **lyen preview** → ou aprouve → li ale sou sit reyèl la. Si yon bagay kase, ou retounen nan vèsyon anvan an nan 1 klik.

## 1. Mete pwojè a sou GitHub (yon sèl fwa)
1. Kreye yon kont sou github.com (si w pa gen youn), epi yon **repo prive** ki rele `deka-log`.
2. Dezipe `deka-log-vercel.zip`. Nan repo a: **Add file > Upload files**, glise TOUT dosye yo (ansanm ak `.github`, `public`, `api`, `tools`, `tests`), epi **Commit changes**.
   - ⚠️ Pa janm mete fichye `SEKRE-PRIVE-deka-log.txt` la nan GitHub. (`.gitignore` pwoteje l si w sèvi ak Git, men pa lè w upload a la men.)
   - Si dosye kache `.github` pa vizib nan zip la sou òdinatè w, aktive "montre fichye kache".

## 2. Konekte Vercel ak GitHub (yon sèl fwa)
1. Vercel > **Add New > Project** > chwazi repo `deka-log` > **Import**.
2. Framework Preset: **Other**. Pa chanje anyen anplis (`vercel.json` deja di ki dosye pou sèvi: `public`).
3. **Environment Variables** — mete yo pou **Production** (ak menm valè pou **Preview** sof `DATABASE_URL`, gade anba):
   - `AUTH_ADMIN_HASH`, `AUTH_DEPOT_HASH`, `AUTH_DAILY_HASH`, `AUTH_CHOFE_HASH` (valè yo nan `SEKRE-PRIVE-deka-log.txt`)
   - Redis: `KV_REST_API_URL` ak `KV_REST_API_TOKEN` (oswa `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) — menm valè w te deja genyen.
   - Push (si w sèvi ak li): variab VAPID ou te deja genyen.
   - `APP_SECRET` (kont pèsonèl + 2FA; gade `SEKIRITE.md`, pa janm chanje l) epi pita `AUTH_LEGACY_DISABLED=1` lè tout moun gen kont pèsonèl.
   - Baz done: **Storage > Create Database > Neon** (gade `SEKIRITE.md`). Nan entegrasyon Neon an, aktive **"Create a branch for each preview deployment"**: konsa chak preview gen pwòp baz li, epi li pa manyen done reyèl yo.
4. **Deploy.** Apre sa chak `git push` sou `main` redeplwaye otomatikman.

> Yon preview ki pa gen `DATABASE_URL` pa ka li ni ekri done yo (sistèm nan refize: li pa ka manyen Redis pwodiksyon an).

## 3. Chak chanjman (jan yon pwofesyonèl travay)
1. Fè chanjman nan yon **branch** (oswa mande m, epi upload nouvo fichye yo nan yon branch), epi louvri yon **Pull Request**.
2. GitHub Actions kouri **CI** otomatikman: tès yo (81+), verifikasyon CSP, sentaks, vilnerabilite, epi yon tès ak vrè Chrome.
3. Vercel poste lyen **preview** nan Pull Request la: teste l la (ak kont teste).
4. Tout vèt? **Merge** → sit reyèl la mete ajou.
5. Apre chak deplwaman pwodiksyon, workflow **Smoke test** verifye sit la (header sekirite yo, fichye sous yo kache, API a fèmen bay vizitè anonim...). Si li vin wouj, ou resevwa yon imèl.

**Rekòmande (1 minit):** GitHub > Settings > Branches > **Add rule** pou `main` > kòche "Require a pull request" ak "Require status checks to pass" (chwazi `Tests and security checks`). Konsa pesonn pa ka mete yon vèsyon ki kase sou sit reyèl la.

## 4. Si yon bagay pa mache: retounen nan vèsyon anvan
Vercel > **Deployments** > chwazi dènye bon deplwaman an > **⋯ > Promote to Production** (oswa "Instant Rollback"). Sit la tounen nan segonn. Repare pwoblèm nan apre, nan yon Pull Request.

## 5. Sekirite ki travay pou ou
- **Pa gen script "inline":** tout kòd JavaScript la se fichye separe (`public/js/`), kidonk CSP a (`script-src 'self'`) pa janm bezwen chanje lè kòd la chanje, epi li pa ka bloke okenn script legal.
- **Sèl `public/` ki sou entènèt:** kòd sous, tès, konfigirasyon ak dokiman pa ka telechaje. Smoke test la verifye sa apre chak deplwaman.
- **Dependabot:** chak semèn, GitHub louvri Pull Request pou mizajou bibliyotèk ak koreksyon sekirite. CI teste yo anvan ou merge.

## 6. Teste lokalman (san konpòt)
```
npm install
npm run demo          # sit la sou http://localhost:3000, ak done demo (anyen pa ale deyò)
npm test              # tout tès yo
npm run test:browser  # tès ak vrè Chrome (bezwen puppeteer)
npm run smoke -- https://sit-ou.vercel.app   # tcheke yon sit ki deplwaye
```
Kont demo (pataje): `logistic` / `demo-admin-1234`, `depotnord` / `demo-depot-1234`, `logisticdepot` / `demo-daily-1234`, `chofe` / `demo-chofe-1234`. Ou ka kreye kont pèsonèl nan tab Itilizatè (demo a gen deja yon `APP_SECRET`).
