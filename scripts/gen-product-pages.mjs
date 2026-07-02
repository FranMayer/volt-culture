/**
 * Genera /producto/{slug}-{id}.html + sitemap.xml desde Firestore.
 * Corre en el build de Vercel (buildCommand) y también local:
 *   node scripts/gen-product-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderProductPage, buildSitemap, slugify } from './product-page-template.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export function generate(products, { productsDir, sitemapPath, siteUrl }) {
    fs.mkdirSync(productsDir, { recursive: true });
    let count = 0;
    for (const p of products) {
        try {
            const html = renderProductPage(p, { siteUrl });
            fs.writeFileSync(path.join(productsDir, `${slugify(p.name)}-${p.id}.html`), html, 'utf8');
            count++;
        } catch (e) {
            console.error(`[gen] Producto ${p.id} omitido:`, e.message);
        }
    }
    fs.writeFileSync(sitemapPath, buildSitemap(products, siteUrl), 'utf8');
    return count;
}

async function initAdminDb() {
    const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/^"|"$/g, '').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^"|"$/g, '').trim();
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();
    const keyPath = path.join(ROOT, 'scripts', 'serviceAccountKey.json');
    const hasEnv = projectId && clientEmail && privateKey;
    const hasKeyFile = fs.existsSync(keyPath);

    // Sin credenciales: no es fatal. Chequeamos ANTES de importar firebase-admin
    // (así ni siquiera hace falta el paquete para saltear). El caller (main)
    // omite la generación para no abortar el deploy de todo el sitio por una
    // feature aditiva; las páginas se generan cuando FIREBASE_* esté configurado.
    if (!hasEnv && !hasKeyFile) return null;

    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const credential = hasEnv
        ? cert({ projectId, clientEmail, privateKey })
        : cert(JSON.parse(fs.readFileSync(keyPath, 'utf8')));

    if (!getApps().length) initializeApp({ credential });
    return getFirestore();
}

async function main() {
    const db = await initAdminDb();
    if (!db) {
        console.warn(
            '[gen] Sin credenciales Firebase en el build (FIREBASE_* ausentes) — se OMITE la generación de páginas de producto. ' +
            'El resto del sitio se despliega igual. Configurá FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY ' +
            'en el env de build de Vercel para habilitar las páginas SEO.'
        );
        return;
    }
    const snap = await db.collection('products').where('active', '==', true).get();
    const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const siteUrl = (process.env.SITE_URL || 'https://www.voltculture.com.ar').replace(/^"|"$/g, '').trim();
    const count = generate(products, {
        productsDir: path.join(ROOT, 'producto'),
        sitemapPath: path.join(ROOT, 'sitemap.xml'),
        siteUrl
    });
    console.log(`[gen] ${count} páginas de producto generadas`);
}

// Ejecuta main() solo si se invoca directamente (no al importarlo en tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => {
        console.error('[gen] Build de páginas de producto FALLÓ:', e.message);
        process.exit(1);
    });
}
