# Paradise Voices

Guest feedback PWA for Hunters Paradise Cottages (HPC) and Hunters Paradise Tuuti (HPT).

## Stack
- Plain HTML / CSS / JS — no build step, no npm required
- Supabase (Postgres + RLS + RPC functions) for the backend
- Deployed as a static site on Vercel

## Project structure
```
index.html            Main app shell
manifest.json          PWA install config
service-worker.js      Enables "installable" PWA status
css/styles.css          Brand styling (colors, fonts, components)
js/supabase-client.js   Supabase connection
js/app.js               App logic
assets/                 Logo + generated app icons
sql/schema.sql          Full database schema — run once in Supabase SQL Editor
sql/update_rooms.sql    Room data correction (only needed if schema.sql already ran)
```

## Local preview
Open `index.html` directly in Chrome to check the connection test.
Full PWA install behavior (service worker, "Add to Home Screen") only works once deployed over HTTPS (e.g. on Vercel).
