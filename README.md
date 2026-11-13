# Paradise Voices

Guest feedback PWA for Hunters Paradise Cottages (HPC) and Hunters Paradise Tuuti (HPT).

## Stack
- Plain HTML / CSS / JS. No build step and no npm: there is no `package.json`, so `npm run dev` / `npm run build` do not apply.
- Supabase (Postgres + RLS + RPC functions) for the backend.
- Four browser libraries loaded from a CDN: `supabase-js` (both pages), `chart.js` and `qrcodejs` (dashboard only), plus Google Fonts.
- Deployed as a static site on Vercel.

## Project structure
```
index.html                       Staff / guest app shell
dashboard.html                   Management dashboard shell
manifest.json, service-worker.js PWA install + offline cache (network-first)
css/styles.css                   All styling, including the print styles for reports and QR sheets
js/supabase-client.js            Supabase connection
js/app.js                        PIN login, room choice, guest feedback wizard
js/guest-mode.js                 QR guest mode (?b=HPC&room=K5), no PIN
js/loyalty-reception.js          Loyalty desk for reception (find, enrol, award, redeem)
js/dashboard.js                  Analytics, staff settings, downloadable report
js/dashboard-feedback.js         "Feedback" page: filters, resolve / reopen, CSV
js/dashboard-qr.js               QR code sheet (A6, four per A4)
js/dashboard-loyalty.js          Loyalty settings
js/dashboard-loyalty-overview.js Loyalty overview, corrections, CSV
assets/                          Logo + app icons
sql/schema.sql                   Database schema and later add-on blocks (see the note at its top)
```

## Local preview
Serve the folder with any static server from the project root, for example:

```
python -m http.server 5173
```

then open `http://localhost:5173/index.html` or `/dashboard.html`. Opening the files straight from disk
also works for a quick look, but the service worker and "Add to Home Screen" need HTTPS (Vercel).

## Database changes
Run only the block you need from `sql/schema.sql` in the Supabase SQL Editor. Running the whole file on an
existing project fails at the first `create table`.
