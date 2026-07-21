/**
 * lib/products.ts — capa de datos de productos (glue de Firestore).
 * Port de legacy/js/products-service.js al SDK Firestore modular. Isomórfico:
 * puede correr en server (F5 ISR) o en client (F4 catálogo) — usa
 * lib/firebase/client.ts, mismo proyecto Firestore que hoy, sin dependencias
 * solo-browser.
 *
 * La lógica sin Firestore (SAMPLE_PRODUCTS, normalización, saneo de imágenes)
 * vive en lib/products-data.js (plain JS, mismo patrón que lib/cart/reducer.js)
 * para que tests/products.test.mjs la ejercite con `node` plano.
 *
 * Diferencia deliberada con el original: legacy solo caía a SAMPLE_PRODUCTS
 * si `FirebaseConfig.isInitialized()` era false (config ausente/init fallido
 * al cargar la página); un error de red en la query en sí no tenía catch y
 * explotaba. Acá el fallback cubre además errores de Firestore en runtime
 * (try/catch alrededor del fetch), tal como pide la tarea de F4 — con el SDK
 * modular el `initializeApp` de lib/firebase/client.ts siempre "inicializa"
 * (usa defaults hardcodeados si faltan las env vars), así que el caso
 * "sin config" ya no puede detectarse igual; el try/catch es el equivalente
 * isomórfico correcto para ambos casos.
 */
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    runTransaction,
    addDoc,
    updateDoc,
    serverTimestamp,
    writeBatch,
    type Query,
    type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { SAMPLE_PRODUCTS, normalizeProduct, getFromSample, getProductImageFallback, sanitizeImageUrl } from '@/lib/products-data.js';
import type { Product } from '@/lib/types';

const COLLECTION = 'products';

async function getFromFirestore(category?: string | null, line?: string | null): Promise<Product[]> {
    const clauses = [where('active', '==', true)];
    if (category && category !== 'all') clauses.push(where('category', '==', category));
    const q: Query<DocumentData> = query(collection(db, COLLECTION), ...clauses);

    const snapshot = await getDocs(q);
    let products: Product[] = [];
    snapshot.forEach((d) => {
        products.push(normalizeProduct({ id: d.id, ...d.data() }));
    });

    if (line && line !== 'all') {
        const wanted = String(line).toUpperCase();
        products = products.filter((p) => p.line === wanted);
    }

    return products;
}

/** Todos los productos activos, opcionalmente filtrados por categoría y/o línea. */
export async function getAll(category?: string | null, line?: string | null): Promise<Product[]> {
    try {
        return await getFromFirestore(category, line);
    } catch (err) {
        console.error('lib/products: Firestore falló, usando SAMPLE_PRODUCTS', err);
        return getFromSample(category, line);
    }
}

/** Un producto por id (activo o no — sin filtro `active`, igual que el original). */
export async function getById(id: string): Promise<Product | null> {
    try {
        const snap = await getDoc(doc(db, COLLECTION, id));
        if (snap.exists()) return normalizeProduct({ id: snap.id, ...snap.data() });
        return null;
    } catch (err) {
        console.error('lib/products: Firestore falló, usando SAMPLE_PRODUCTS', err);
        const sample = SAMPLE_PRODUCTS.find((p) => p.id === id) || null;
        return sample ? normalizeProduct(sample) : null;
    }
}

/** Categorías disponibles entre los productos activos. */
export async function getCategories(): Promise<string[]> {
    const products = await getAll();
    return [...new Set(products.map((p) => p.category))].sort();
}

/** Descuenta `quantity` del stock del producto. */
export async function updateStock(id: string, quantity: number): Promise<void> {
    const productRef = doc(db, COLLECTION, id);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(productRef);
        if (snap.exists()) {
            const current = snap.data().stock as number;
            const newStock = Math.max(0, current - quantity);
            transaction.update(productRef, { stock: newStock });
        }
    });
}

// =====================================================
// ADMINISTRACIÓN (F9 — expuesto acá para que el panel admin no
// reimplemente el data layer; sin UI ni endpoint que lo llame todavía)
// =====================================================

/** Crea un producto nuevo (`active: true`). */
export async function create(productData: Record<string, unknown>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION), {
        ...productData,
        active: true,
        createdAt: serverTimestamp(),
    });
    return docRef.id;
}

/** Actualiza campos de un producto existente. */
export async function update(id: string, productData: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), {
        ...productData,
        updatedAt: serverTimestamp(),
    });
}

/** Soft delete: marca `active: false`. */
export async function remove(id: string): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), {
        active: false,
        deletedAt: serverTimestamp(),
    });
}

/** Todos los productos (incl. inactivos), orden por `createdAt` desc en cliente — sólo admin. */
export async function getAllAdmin(): Promise<Product[]> {
    const snapshot = await getDocs(collection(db, COLLECTION));
    const products: Product[] = [];
    snapshot.forEach((d) => {
        products.push({ id: d.id, ...d.data() } as Product);
    });

    // createdAt es un Timestamp de Firestore (o ausente en docs creados a
    // mano en consola) — no tipado en Product (declarado `unknown`), de ahí `any` acá.
    const millis = (ts: any): number => ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : 0);
    products.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

    return products;
}

/** Importa SAMPLE_PRODUCTS a Firestore (setup inicial / demo). */
export async function importSampleProducts(): Promise<void> {
    const batch = writeBatch(db);
    SAMPLE_PRODUCTS.forEach((product) => {
        batch.set(doc(db, COLLECTION, product.id), {
            ...product,
            createdAt: serverTimestamp(),
        });
    });
    await batch.commit();
}

export { SAMPLE_PRODUCTS, getProductImageFallback, sanitizeImageUrl };
