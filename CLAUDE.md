# VOLT Culture — Migración a Next.js

## Contexto

VOLT Culture es un e-commerce de streetwear inspirado en motorsport (Córdoba, Argentina), hoy un sitio estático HTML/CSS/JS en Vercel. Está en proceso de **migración completa a Next.js** en la rama **`next-migration`**, según el plan aprobado el 2026-07-17:
`C:\Users\Franc\.claude\plans\okay-si-la-pagina-temporal-noodle.md` — **leer ese plan es prerequisito de cualquier trabajo de migración.**

`main` conserva el sitio estático viejo (producción) hasta el cutover. Rollback = revert del merge.

## Reglas de trabajo

1. **Leer el plan antes de codear.** Cada tarea pertenece a una fase (F0-F10) con criterios de aceptación propios.
2. **Una fase a la vez.** No adelantar trabajo de fases futuras; una fase se cierra con evidencia verificada antes de abrir la siguiente.
3. **Paridad visual obligatoria.** El sitio migrado debe verse idéntico al actual. Referencia objetiva: screenshots en `qa/baseline/` (capturados de producción en 360/768/1280).
4. **No reescribir CSS.** El CSS existente se porta tal cual (mover + alias de variables). La limpieza (p. ej. los ~1070 `!important` de volt-ds) es explícitamente post-migración.
5. **No tocar `main`.** Todo el trabajo de migración vive en `next-migration`. Nada se mergea sin pasar el QA end-to-end de F10.

## Stack (destino)

- **Framework**: Next.js App Router + TypeScript (sin Tailwind — CSS portado)
- **Estado del carrito**: Zustand + `persist`
- **Auth + DB**: Firebase — Firestore + Auth (SDK modular `firebase@12.8`; Admin SDK en backend)
- **Pagos**: MercadoPago Checkout Pro (server-side, `pages/api/create-preference` + webhook con firma HMAC)
- **Emails**: Resend · **Imágenes**: Cloudinary (upload firmado) · **Envíos**: Andreani API · **Rate limit**: Upstash Redis
- **Hosting**: Vercel (mismo proyecto que el sitio viejo; QA en preview deploys de la rama)
- **Design system**: paleta `#000`/`#FFF`/`#c1121f` + grises de label `#444–#888`, corners sharp, fuentes Teko 700 / DM Mono / Glacial Indifference (via `next/font`)

## Decisiones cerradas (no re-litigar)

- **CSS portado**, no reescrito: `theme.css` con set canónico `--volt-*` + alias de los 3 sets viejos (`--color-*`, `--volt-ds-*`, `--volt-black/white/red`).
- **Endpoints en `pages/api/` con firma `(req,res)` intacta.** No reescribir a `app/api` Request/Response — es código de pagos que funciona. Helpers compartidos en `lib/server/`.
- **Bootstrap eliminado**: offcanvas/modals propios + `bs-shim.css` mínimo para utilitarias.
- **Zustand con key `'cart'` y shape de item idéntico al actual** (`{id, title, price, quantity, image, variantColor?, variantSize?}`, lineKey `id-color-size`) — los carritos existentes en localStorage sobreviven el cutover.
- **volt-motion adaptado** a hooks/client components (no portado tal cual): intro lights-out solo primera carga, FLIP badge conectado al store, parallax/reveals con cleanup.
- **Cutover big-bang**: paridad total verificada en preview → merge a main → dominio cambia de una.

## Estructura del repo durante la migración

```
app/            rutas App Router (layout, page, catalogo, producto/[slug], admin, ...)
app/styles/     theme.css + CSS portado (volt-ds, style, mediaquery, home, bs-shim)
components/     layout/, auth/, catalog/, checkout/, home/, admin/
lib/            firebase/ (client, admin), cart/ (store, sync), server/ (helpers ex api/_*), types.ts
pages/api/      endpoints serverless (firma (req,res) intacta)
public/         images-brand/, images-ui/, glacial-indifference/
legacy/         frontend viejo completo — SOLO referencia de lectura, no se sirve, no se edita; se borra en F10
qa/baseline/    screenshots de producción (360/768/1280) — referencia de paridad visual
tests/          node scripts sin framework (smoke HTTP + unit de stock/cupones)
```

## Archivos críticos de referencia

| Archivo (en `legacy/` una vez movido) | Por qué importa | Fase |
|---|---|---|
| `js/cart-sync.js` | Semántica exacta de merge por lineKey + debounce 800ms a preservar | F3 |
| `js/pagos.js` | Checkout completo (stepper, DNI, cotización Andreani, MP/transferencia/cupones) | F7 |
| `api/create-preference.js` | back_urls/SITE_URL/allowlist CORS, validación server-side de precio y stock | F2/F7 |
| `scripts/product-page-template.mjs` | Slug `${slugify(name)}-${id}` + metadata/OG/JSON-LD a replicar en ISR | F5 |
| `vercel.json` | CSP/headers a conservar (incl. `Cross-Origin-Opener-Policy: unsafe-none` para Google popup) | F0/F10 |

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| F0 | Baseline visual + scaffold Next+TS + reorganización repo + CLAUDE.md | ✅ Hecha (2026-07-20) |
| F1 | Theme CSS unificado + layout compartido (navbar/footer/cart/WhatsApp) | ✅ Hecha (2026-07-20) |
| F2 | Firebase modular + tipos + backend a `pages/api` + aislamiento de entornos | ⬜ Pendiente |
| F3 | Carrito (Zustand + sync Firestore) + Auth | ⬜ Pendiente |
| F4 | Catálogo | ✅ Hecha (2026-07-21) — reviewer PASS; QA visual diferido |
| F5 | `producto/[slug]` con ISR + revalidate + sitemap/robots | ✅ Hecha (2026-07-21) — reviewer PASS; QA visual/preview diferido |
| F6 | Home + volt-motion + GA | ✅ Hecha (2026-07-21) — reviewer PASS; navbar único (home sin `.site-nav` por decisión); flourishes de motion (hero split-words/tilt/magnetic) omitidos; QA visual diferido |
| F7 | Checkout + retorno MP (success/pending/failure) | ✅ Hecha (2026-07-21) — reviewer PASS (math del dinero reconciliado); Andreani sin credenciales (cotización degrada); QA MP sandbox diferido |
| F8 | Páginas estáticas + mis-pedidos | ✅ Hecha (2026-07-21) — reviewer FAIL→fix (reveal invisible en estáticas) verificado con screenshot; mis-pedidos arregla el bug de prod del anónimo colgado |
| F9 | Admin panel | ⬜ Pendiente |
| F10 | QA end-to-end + limpieza + cutover | ⬜ Pendiente |

Al cerrar una fase verificada, actualizar su estado acá (⬜ Pendiente → ✅ Hecha, con fecha).

## Orquestación multi-agente

El agente principal (Fable 5) actúa como **orquestador** y minimiza sus propios tokens:
- **Nunca escribe código directamente** — ni features, ni fixes, ni tests, ni boilerplate.
- Flujo estándar por unidad de trabajo:
  1. **Orquestador** descompone la fase en tareas acotadas (archivos objetivo + criterios de aceptación) y las delega al **implementer** (`.claude/agents/implementer.md`, Sonnet).
  2. **Implementer** implementa, corre `next build` y tests, y devuelve resumen + evidencia.
  3. **Reviewer** (`.claude/agents/reviewer.md`, Opus, solo lectura) valida contra los criterios de la fase y contra `legacy/` donde sea crítico; reporta PASS/FAIL con evidencia.
  4. **Orquestador** verifica la evidencia (salida de comandos, screenshots vs baseline, hallazgos del reviewer) antes de dar la fase por cerrada. Nunca declara algo terminado solo porque un subagente dijo que lo terminó. FAIL → nueva tarea acotada al implementer.

## Qué NO migrar

- `legacy/js/animations.js` — código muerto (apunta a IDs inexistentes)
- `api/admin-redeploy.js` + `triggerRedeploy` + deploy hook de Vercel — reemplazados por ISR/revalidate (F5)
- `scripts/gen-product-pages.mjs` + `product-page-template.mjs` + `producto/*.html` generados — solo sobrevive `slugify` copiado a `lib/`
- `sitemap.xml`/`robots.txt` estáticos → `app/sitemap.ts` / `app/robots.ts`
- Bootstrap CDN, Firebase compat CDN, evento global `cartUpdated`, markup duplicado de layout
- Limpieza profunda de CSS / `!important` — post-migración

## Env vars

- **No hardcodear secretos ni URLs de entorno.** Todo por env vars (ver `.env.example`); la config pública de Firebase client es la única excepción tolerada.
- El **Firebase project es único**: preview escribe en el Firestore real. El QA de pagos usa env vars **scoped a Preview** en Vercel: `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` de TEST, `SITE_URL` = URL estable de la rama (no la de cada deploy), Andreani en QA (default del código). Compras de prueba solo contra productos de prueba dedicados; órdenes de QA se borran por id (nunca `admin-cleanup`).
- Las overrides de Preview se eliminan en el cutover (checklist F10).

## Comandos

- `npm run dev` — dev server Next (post-F0)
- `npx next build` — build de verificación (obligatorio verde para cerrar cualquier tarea)
- `npm run test:smoke` — smoke HTTP (`BASE_URL=<preview>` para QA de fase)
- `node tests/<archivo>` — unit tests individuales (stock, cupones)
