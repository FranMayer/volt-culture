# VOLT Culture — Project Context

## What this is
Motorsport-inspired streetwear e-commerce. Static HTML/CSS/JS site deployed on Vercel. Brand based in Córdoba, Argentina.

## Stack
- **Frontend**: Vanilla HTML + CSS + JS (no framework/bundler)
- **CSS**: `css/style.css` (legacy, large), `css/volt-ds.css` (design system overrides, loads last), `css/mediaquery.css` (responsive)
- **Fonts**: Teko 700 (display/headings), DM Mono 400/500 (UI labels, mono), DM Sans 300/400 (body) — loaded via Google Fonts
- **UI library**: Bootstrap 5.3.3 (grid + offcanvas cart + modals only)
- **Auth + DB**: Firebase (compat SDK 9.22) — Firestore + Auth (Google popup)
- **Payments**: MercadoPago SDK
- **Shipping**: Andreani API (via Vercel serverless functions in `/api/`)
- **Hosting**: Vercel (serverless functions in `/api/*.js`)
- **Admin panel**: `/admin/panel.html` — protected by Firebase claim check

## Design system (volt-ds)
Palette: `#000000` / `#FFFFFF` / `#E8001D` (red) only + label grays `#444–#888`.
Grid overlay: 80×80px subtle lines.
All corners are sharp (border-radius: 0 !important in volt-ds.css).
`volt-ds.css` loads last and overrides legacy styles.

## Key files
- `index.html` — landing page (hero, ticker, identity cards, drop section, manifesto)
- `pages/catalogo.html` — product catalog with sidebar + offcanvas cart
- `pages/about.html` — about page
- `pages/envios.html` — shipping info
- `pages/novedades.html` — newsletter/updates signup
- `admin/panel.html` — admin panel
- `js/firebase-config.js` — Firebase init
- `js/store-auth.js` — auth state, nav rendering
- `js/cart-sync.js` — cart logic (localStorage + Firestore sync)
- `js/admin-products.js`, `js/admin-orders.js`, `js/admin-ui.js` — admin modules
- `api/_shipping-email.js` — Andreani shipping email
- `api/create-preference.js` — MercadoPago preference creation

## CSS variable sources
- `index.html` inline `<style>`: uses `--volt-black`, `--volt-white`, `--volt-red`, `--font-display/mono/body`, `--nav-h`
- `css/style.css`: uses `--color-red: #E8192C` (slightly different shade), lots of legacy vars
- `css/volt-ds.css`: canonical DS, uses `--volt-ds-*` prefix, `--font-ds-*`

## Known issues / tech debt
- Two conflicting red shades: `#E8001D` (DS) vs `#E8192C` (style.css) vs `#C1121F` (some components)
- `style.css` is very large (~4400 lines) and mixes legacy + current styles
- Bootstrap loads globally but only used for cart offcanvas + modals

## Commands
No build step. Files are served as-is by Vercel.
Local dev: open `index.html` directly or use a local server (e.g. `npx serve .`).
