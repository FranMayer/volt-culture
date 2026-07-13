# VOLT — Motorsport Culture 🏁

Tienda online oficial de VOLT, marca argentina de streetwear inspirada  
en la velocidad, la adrenalina y la cultura del motorsport.  
Diseños únicos para quienes llevan el motor en la sangre.

---

## 🌐 Demo

[volt.culture](#) · [@voltculturecba](https://x.com/voltculturecba)

---

## 🛠️ Stack tecnológico

- **HTML5** semántico, multi-página
- **CSS3** con variables custom + **Bootstrap 5.3** (grilla + offcanvas del carrito + modales)
- **JavaScript** vanilla (ES6+) — sin framework ni bundler
- **Firebase** (compat 9.22) — Auth (Google) + Firestore (productos, órdenes, carritos)
- **Mercado Pago** (Checkout Pro) + **transferencia** con comprobante
- **Andreani** — cotización y envíos vía funciones serverless en `/api/`
- **Vercel** — hosting estático + funciones serverless + build step (páginas de producto SEO)

---

## 📁 Estructura del proyecto
```
/
├── index.html                  # Home — hero, intro F1, identidad, drop, manifiesto
├── pages/
│   ├── catalogo.html           # Shop — productos, filtros, carrito offcanvas, quick-view
│   ├── about.html · envios.html · novedades.html
│   ├── success · pending · failure.html   # Retornos de pago
│   └── mis-pedidos.html        # Historial del cliente logueado
├── producto/                   # Páginas SEO por producto (generadas en build, gitignored)
├── admin/panel.html            # Panel admin (protegido por claim de Firebase)
├── css/
│   ├── style.css               # Legacy (grande)
│   ├── volt-ds.css             # Design system (carga última, overrides)
│   └── mediaquery.css          # Responsive
├── js/                         # store-auth, cart-sync, catalog, pagos, admin-*, ...
├── api/                        # Funciones serverless: pagos, webhook, envíos, admin
├── scripts/                    # gen-product-pages.mjs (build SEO) + helpers
├── tests/                      # Tests node (sin framework): node tests/<archivo>
└── images-brand/               # Assets de marca
```

---

## ✨ Features

### Tienda
- Catálogo con filtro por **línea** (Turismo Carretera / Fórmula 1 *PRÓXIMAMENTE*) y por tipo (Remeras, Buzos, Gorras…)
- Quick-view del producto (galería, talles, colores) enlazado con las páginas SEO `/producto/`
- Stock por variante (color/talle) y checkout **con o sin cuenta** (invitado, con DNI)
- **Cupones de descuento** y páginas de producto generadas para SEO (JSON-LD)
- Botón **Añadir al carrito** con estado ✓ Añadido

### Carrito
- Sidebar offcanvas con miniatura del producto (64×64)
- Animación *bounce* en el badge al agregar un item
- Estado vacío con link directo al catálogo
- Botón **Vaciar carrito** con estilo VOLT (borde rojo, hover fill)
- Integración directa con **Mercado Pago Checkout Pro**

### UI / Marca
- Paleta: negro `#000` · blanco `#fff` · rojo `#c1121f` (canónico) + grises de label
- Tipografía: **Teko** 700 (titulares) · **DM Mono** (labels UI) · **Glacial Indifference** (cuerpo)
- Esquinas rectas (`border-radius: 0`) en todo el design system (volt-ds)
- Navbar con underline animado en hover (expand L→R, rojo)
- Link activo resaltado por página
- Footer con redes: Instagram · X/Twitter
- Envíos a todo el país — ticker en el hero

---

## 🚀 Correr localmente

No requiere instalación. Abrí directamente en el navegador:
```bash
# Opción 1 — Live Server (VS Code / Cursor)
# Click derecho en index.html → Open with Live Server

# Opción 2 — Python
python -m http.server 8000
# Abrí http://localhost:8000
```

---

## 🔒 Rate limiting (Upstash Redis)

Las APIs públicas usan [Upstash Redis](https://upstash.com/) para limitar abuso por IP (`api/_rate-limit.js`):

| Ruta | Límite |
|------|--------|
| `/api/create-preference` | 5 solicitudes / IP cada 10 min |
| `/api/newsletter` | 3 / IP cada hora |
| `/api/welcome-email` | 3 / IP cada hora |
| Resto de APIs públicas (ej. `/api/webhook`) | 20 / IP por minuto |

Las rutas con token admin (`notify-status`, `admin-cleanup`, etc.) no llevan este límite.

Variables en Vercel y en `.env.local` (ver `.env.example`):

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Para probar APIs en local: `npm run dev:api` (`vercel dev`).

---

## 💳 Mercado Pago

La integración usa **Checkout Pro** vía el SDK de Mercado Pago.  
El flujo toma `title`, `quantity` y `price` de cada item del carrito  
y genera la preferencia de pago en `js/pagos.js`.

Para configurar tu propia cuenta:
1. Obtené tu **Public Key** en [mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers)
2. Reemplazá la key en `js/pagos.js`
3. Configurá las URLs de retorno (success / failure / pending)

---

## 📱 Redes

- Instagram: [@volt.culture](https://instagram.com/volt.culture)
- X / Twitter: [@voltculturecba](https://x.com/voltculturecba)

---

## 📄 Licencia

© 2026 VOLT – Motorsport Culture. Todos los derechos reservados.  
Proyecto privado — no disponible para uso o distribución externa.