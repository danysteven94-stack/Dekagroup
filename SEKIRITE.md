# DEKA LOG — Sekirite (gid rapid)

## Sa ki nan plas
- **Koneksyon bò sèvè**: modpass yo pa nan kòd paj la ankò. Sèvè a verifye yo (hash `scrypt`) epi bay yon sesyon (cookie `HttpOnly`, `Secure`, `SameSite=Strict`).
- **4 kont**: `logistic` (admin), `depotnord` (depo), `logisticdepot` (daily report), `chofe` (chofè). Chofè a bezwen yon modpass kounye a.
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

## ATANSYON: chak fwa `index.html` chanje
CSP a otorize sèlman script yo ki nan `index.html` (pa hash). Apre CHAK modifikasyon `index.html`:
```
node tools/update-csp.js        # rekonstwi vercel.json
node tools/update-csp.js --check
```
Si w bliye, paj la ka rete blan sou Vercel.

## Tès
```
node tests/security.test.js
node tests/client.e2e.js
```
