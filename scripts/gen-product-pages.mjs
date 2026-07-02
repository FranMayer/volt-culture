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
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');

    let credential;
    const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/^"|"$/g, '').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^"|"$/g, '').trim();
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();

    if (projectId && clientEmail && privateKey) {
        credential = cert({ projectId, clientEmail, privateKey });
    } else {
        const keyPath = path.join(ROOT, 'scripts', 'serviceAccountKey.json');
        if (!fs.existsSync(keyPath)) {
            throw new Error('Sin credenciales: definí FIREBASE_* o scripts/serviceAccountKey.json');
        }
        credential = cert(JSON.parse(fs.readFileSync(keyPath, 'utf8')));
    }

    if (!getApps().length) initializeApp({ credential });
    return getFirestore();
}

async function main() {
    const db = await initAdminDb();
    const snap = await db.collection('products').where('active', '==', true).get();
    const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const siteUrl = (process.env.SITE_URL || 'https://voltculture.com.ar').replace(/^"|"$/g, '').trim();
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
