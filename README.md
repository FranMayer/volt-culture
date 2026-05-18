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
- **CSS3** con variables custom + **Bootstrap** (utilidades puntuales)
- **JavaScript** vanilla (ES6+)
- **Mercado Pago** — integración de pagos (Checkout Pro)
- Sin frameworks frontend · Sin build tools · Deploy estático

---

## 📁 Estructura del proyecto
```
/
├── index.html                  # Home — Hero, about snippet, footer
├── pages/
│   ├── catalogo.html           # Shop — productos, carrito, filtros
│   ├── about.html              # Nosotros — historia de la marca
│   ├── envios.html             # Política de envíos
│   └── novedades.html          # Novedades / blog
├── css/
│   ├── style.css               # Estilos principales + componentes
│   └── mediaquery.css          # Responsive breakpoints
├── js/
│   ├── main.js                 # Carrito, offcanvas, badge bounce
│   ├── catalog.js              # Renderizado de productos y categorías
│   └── pagos.js                # Integración Mercado Pago
├── images-brand/               # Assets de marca
│   ├── logo-nuevo.png          # Logotipo completo (fondo transparente)
│   ├── Isotipo color.png       # Isotipo — usado en footer
│   ├── buzoprincipal.png       # Hero image
│   ├── colapinto.jpg           # Imagen sección about
│   └── Verstappen.jpg          # Imagen sección about
└── README.md
```

---

## ✨ Features

### Tienda
- Catálogo de productos con filtro por categorías (Buzos, Remeras, Gorras)
- Categoría **Autos a escala** con badge *PRÓXIMAMENTE*
- Stock disponible por producto
- Botón **Añadir al carrito** con estado ✓ Añadido

### Carrito
- Sidebar offcanvas con miniatura del producto (64×64)
- Animación *bounce* en el badge al agregar un item
- Estado vacío con link directo al catálogo
- Botón **Vaciar carrito** con estilo VOLT (borde rojo, hover fill)
- Integración directa con **Mercado Pago Checkout Pro**

### UI / Marca
- Paleta: negro `#000` · blanco `#fff` · rojo `#E8192C`
- Tipografía: **Teko** (titulares) + **Barlow** (cuerpo)
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