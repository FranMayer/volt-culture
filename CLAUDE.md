# VOLT Culture — Project Context

## Orquestación multi-agente
El agente principal (Fable 5) actúa como **orquestador** y minimiza sus propios tokens:
- **Nunca escribe código directamente** — ni features, ni fixes, ni tests, ni boilerplate.
- Delega toda implementación al subagente **implementer** (`.claude/agents/implementer.md`, Sonnet).
- Delega code review, detección de bugs y análisis de seguridad al subagente **reviewer** (`.claude/agents/reviewer.md`, Opus, solo lectura).
- Su trabajo es: planificar, descomponer tareas en unidades acotadas para los subagentes, y **verificar evidencia** (salida de comandos, hallazgos del reviewer) antes de declarar algo terminado. Nunca declara una tarea completa solo porque un subagente dijo que la terminó.

## What this is
Motorsport-inspired streetwear e-commerce. Static HTML/CSS/JS site deployed on Vercel. Brand based in Córdoba, Argentina.

## Stack
- **Frontend**: Vanilla HTML + CSS + JS (no framework/bundler)
- **CSS**: `css/style.css` (legacy, large), `css/volt-ds.css` (design system overrides, loads last), `css/mediaquery.css` (responsive)
- **Fonts**: Teko 700 (display/headings, Google Fonts), DM Mono 400/500 (UI labels, mono, Google Fonts), Glacial Indifference 400/700 (body/sub, self-hosted from `/glacial-indifference/*.otf`). DM Sans kept only as a body fallback.
- **UI library**: Bootstrap 5.3.3 (grid + offcanvas cart + modals only)
- **Auth + DB**: Firebase (compat SDK 9.22) — Firestore + Auth (Google popup)
- **Payments**: MercadoPago SDK
- **Shipping**: Andreani API (via Vercel serverless functions in `/api/`)
- **Hosting**: Vercel (serverless functions in `/api/*.js`)
- **Admin panel**: `/admin/panel.html` — protected by Firebase claim check

## Design system (volt-ds)
Palette: `#000000` / `#FFFFFF` / `#c1121f` (red, canonical) only + label grays `#444–#888`.
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
- `css/style.css`: `--color-red` now `#c1121f`, lots of legacy vars
- `css/volt-ds.css`: canonical DS, uses `--volt-ds-*` prefix, `--font-ds-*`; defines the Glacial Indifference `@font-face`

## Known issues / tech debt
- Red is unified to `#c1121f` everywhere (was previously `#E8001D` / `#E8192C` / `#C1121F` mixed). Keep new red work on `#c1121f`.
- `style.css` is very large (~4400 lines) and mixes legacy + current styles
- Bootstrap loads globally but only used for cart offcanvas + modals

## Commands
No build step. Files are served as-is by Vercel.
Local dev: open `index.html` directly or use a local server (e.g. `npx serve .`).
