/**
 * Volt - Products Service
 * Capa de abstracción para manejar productos
 * 
 * Esta capa permite cambiar fácilmente de Firebase a otra base de datos
 * sin modificar el resto del código de la aplicación.
 */

// =====================================================
// DATOS DE EJEMPLO (cuando Firebase no está configurado)
// =====================================================
const SAMPLE_PRODUCTS = [
    {
        id: 'ferrari-001',
        name: 'Remera Ferrari',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera FERRARI (Delantera).jpg',
        active: true
    },
    {
        id: 'aston-002',
        name: 'Remera Aston Martin',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera ASTON MARTIN (Delantera).png',
        active: true
    },
    {
        id: 'alpine-003',
        name: 'Remera Alpine',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera Alpine (Delantera).jpg',
        active: true
    },
    {
        id: 'williams-004',
        name: 'Remera Williams',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera WILLIAMS (Delantera).png',
        active: true
    },
    {
        id: 'haas-005',
        name: 'Remera Haas',
        description: '100% Algodón + DTF Premium',
        price: 14900,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera HAAS (Delantera).png',
        active: true
    },
    {
        id: 'mclaren-006',
        name: 'Remera McLaren',
        description: '100% Algodón + DTF Premium',
        price: 15000,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera MCLAREN (Delantera) (1).png',
        active: true
    },
    {
        id: 'mercedes-007',
        name: 'Remera Mercedes Benz',
        description: '100% Algodón + DTF Premium',
        price: 14300,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera MERCEDES (Delantera).png',
        active: true
    },
    {
        id: 'redbull-008',
        name: 'Remera Red Bull',
        description: '100% Algodón + DTF Premium',
        price: 15900,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera RED BULL (Delantera).png',
        active: true
    },
    {
        id: 'alfaromeo-009',
        name: 'Remera Alfa Romeo',
        description: '100% Algodón + DTF Premium',
        price: 15200,
        stock: 0,
        category: 'Remeras',
        image: '/multi/Remera Alfa Romeo (Delantera).png',
        active: true
    }
];

// =====================================================
// IMÁGENES DE PRODUCTO (fallback + URLs rotas de Storage)
// =====================================================

/**
 * Ruta relativa al isotipo según la página actual (raíz vs pages/).
 * @returns {string}
 */
function getProductImageFallback() {
    if (typeof window !== 'undefined' && window.location && window.location.pathname) {
        if (window.location.pathname.includes('/pages/')) {
            return '../images-brand/Isotipo color.png';
        }
    }
    return 'images-brand/Isotipo color.png';
}

/**
 * Normaliza la URL; usa isotipo solo si falta o está vacía.
 * @param {string|null|undefined} url
 * @returns {string}
 */
// Cloudinary: pedir formato y calidad automáticos en la entrega (WebP/AVIF
// donde el browser lo soporte, JPG si no). Aplica a fotos ya subidas sin
// re-subir nada, porque es una transformación en el momento de servir.
// ponytail: idempotente; deja pasar cualquier URL que no sea de Cloudinary.
function optimizeCloudinary(url) {
    if (!/res\.cloudinary\.com/.test(url) || !url.includes('/image/upload/')) return url;
    if (url.includes('f_auto')) return url;
    return url.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
}

function sanitizeImageUrl(url) {
    if (url == null || url === '') return getProductImageFallback();
    const str = typeof url === 'string' ? url : String(url);
    const trimmed = str.trim().replace(/^["']|["']$/g, '').trim();
    if (!trimmed) return getProductImageFallback();
    return optimizeCloudinary(trimmed);
}

function sanitizeImageMap(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return map;
    const out = {};
    Object.keys(map).forEach((key) => {
        const val = map[key];
        out[key] = typeof val === 'string' ? sanitizeImageUrl(val) : val;
    });
    return out;
}

/**
 * Atributo onerror para <img> de producto (cubre URLs que se escapen del sanitize).
 * @returns {string}
 */
function getProductImageOnerrorAttr() {
    const fallback = getProductImageFallback().replace(/'/g, "\\'");
    return `onerror="this.src='${fallback}'; this.onerror=null;"`;
}

// =====================================================
// SERVICIO DE PRODUCTOS
// =====================================================
const ProductsService = {

    getProductImageFallback,
    sanitizeImageUrl,
    getProductImageOnerrorAttr,
    
    /**
     * Obtener todos los productos
     * @param {string} category - Filtrar por categoría (opcional)
     * @param {string} line - Filtrar por línea de producción (opcional)
     * @returns {Promise<Array>} Lista de productos
     */
    async getAll(category = null, line = null) {
        // Si Firebase está configurado, usar Firestore
        if (window.FirebaseConfig && window.FirebaseConfig.isInitialized()) {
            return await this._getFromFirestore(category, line);
        }

        // Si no, usar datos de ejemplo
        return this._getFromSample(category, line);
    },

    /**
     * Obtener un producto por ID
     * @param {string} id - ID del producto
     * @returns {Promise<Object|null>} Producto o null
     */
    async getById(id) {
        if (window.FirebaseConfig && window.FirebaseConfig.isInitialized()) {
            const db = window.FirebaseConfig.getDb();
            const doc = await db.collection('products').doc(id).get();
            if (doc.exists) {
                return this._normalizeProduct({ id: doc.id, ...doc.data() });
            }
            return null;
        }
        
        const sample = SAMPLE_PRODUCTS.find(p => p.id === id) || null;
        return sample ? this._normalizeProduct(sample) : null;
    },

    /**
     * Obtener categorías disponibles
     * @returns {Promise<Array>} Lista de categorías
     */
    async getCategories() {
        const products = await this.getAll();
        const categories = [...new Set(products.map(p => p.category))];
        return categories.sort();
    },

    /**
     * Actualizar stock de un producto
     * @param {string} id - ID del producto
     * @param {number} quantity - Cantidad a restar
     */
    async updateStock(id, quantity) {
        if (window.FirebaseConfig && window.FirebaseConfig.isInitialized()) {
            const db = window.FirebaseConfig.getDb();
            const productRef = db.collection('products').doc(id);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(productRef);
                if (doc.exists) {
                    const newStock = Math.max(0, doc.data().stock - quantity);
                    transaction.update(productRef, { stock: newStock });
                }
            });
        }
    },

    // =====================================================
    // MÉTODOS PRIVADOS
    // =====================================================

    /**
     * Obtener productos desde Firestore
     */
    async _getFromFirestore(category, line) {
        const db = window.FirebaseConfig.getDb();
        let query = db.collection('products').where('active', '==', true);

        if (category && category !== 'all') {
            query = query.where('category', '==', category);
        }

        const snapshot = await query.get();
        let products = [];

        snapshot.forEach(doc => {
            const data = this._normalizeProduct({ id: doc.id, ...doc.data() });
            products.push(data);
        });

        if (line && line !== 'all') {
            const wanted = String(line).toUpperCase();
            products = products.filter(p => p.line === wanted);
        }

        return products;
    },

    /**
     * Obtener productos desde datos de ejemplo
     */
    _getFromSample(category, line) {
        let products = SAMPLE_PRODUCTS.filter(p => p.active).map(p => this._normalizeProduct(p));

        if (category && category !== 'all') {
            products = products.filter(p => p.category === category);
        }

        if (line && line !== 'all') {
            const wanted = String(line).toUpperCase();
            products = products.filter(p => p.line === wanted);
        }

        return Promise.resolve(products);
    },

    _normalizeProduct(product) {
        const normalized = { ...product };
        if (!normalized.image && normalized.imageUrl) {
            normalized.image = normalized.imageUrl;
        }
        if (!normalized.imageUrl && normalized.image) {
            normalized.imageUrl = normalized.image;
        }
        if (normalized.image && typeof normalized.image === 'string') {
            normalized.image = sanitizeImageUrl(
                normalized.image.trim().replace(/^["']|["']$/g, '').trim()
            );
        }
        if (normalized.imageUrl && typeof normalized.imageUrl === 'string') {
            normalized.imageUrl = sanitizeImageUrl(
                normalized.imageUrl.trim().replace(/^["']|["']$/g, '').trim()
            );
        }

        if (!Array.isArray(normalized.images)) {
            normalized.images = normalized.imageUrl ? [normalized.imageUrl] : (normalized.image ? [normalized.image] : []);
        } else {
            normalized.images = normalized.images
                .map(img => {
                    if (typeof img === 'string') return sanitizeImageUrl(img.trim());
                    if (img && typeof img === 'object') {
                        const rawUrl = (img.url || img.src || '').trim();
                        const url = sanitizeImageUrl(rawUrl);
                        return {
                            ...img,
                            url,
                            ...(img.src ? { src: url } : {})
                        };
                    }
                    return null;
                })
                .filter(Boolean);
        }

        if (normalized.variantImages) {
            normalized.variantImages = sanitizeImageMap(normalized.variantImages);
        }
        if (normalized.imagesByColor) {
            normalized.imagesByColor = sanitizeImageMap(normalized.imagesByColor);
        }

        if (!Array.isArray(normalized.variants)) {
            normalized.variants = [];
        } else {
            normalized.variants = normalized.variants.map(variant => ({
                color: String(variant.color || '').trim(),
                hex: String(variant.hex || '#44464c').trim(),
                stock: Math.max(0, Number(variant.stock) || 0)
            }));
        }

        if (!Array.isArray(normalized.sizes)) {
            normalized.sizes = [];
        } else {
            normalized.sizes = normalized.sizes.map(size => ({
                size: String(size.size || '').trim().toUpperCase(),
                stock: Math.max(0, Number(size.stock) || 0)
            }));
        }

        if (typeof normalized.stock !== 'number') {
            normalized.stock = Number(normalized.stock) || 0;
        }

        // Línea de producción: los productos viejos no tienen `line`.
        // Se asume Turismo Carretera (TC) por defecto, sin migrar datos.
        normalized.line = String(normalized.line || 'TC').trim().toUpperCase() || 'TC';

        return normalized;
    },

    // =====================================================
    // MÉTODOS DE ADMINISTRACIÓN (para el panel admin)
    // =====================================================

    /**
     * Crear un nuevo producto
     */
    async create(productData) {
        if (!window.FirebaseConfig || !window.FirebaseConfig.isInitialized()) {
            throw new Error('Firebase no está configurado');
        }

        const db = window.FirebaseConfig.getDb();
        const docRef = await db.collection('products').add({
            ...productData,
            active: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return docRef.id;
    },

    /**
     * Actualizar un producto
     */
    async update(id, productData) {
        if (!window.FirebaseConfig || !window.FirebaseConfig.isInitialized()) {
            throw new Error('Firebase no está configurado');
        }

        const db = window.FirebaseConfig.getDb();
        await db.collection('products').doc(id).update({
            ...productData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    /**
     * Eliminar un producto (soft delete)
     */
    async delete(id) {
        if (!window.FirebaseConfig || !window.FirebaseConfig.isInitialized()) {
            throw new Error('Firebase no está configurado');
        }

        const db = window.FirebaseConfig.getDb();
        await db.collection('products').doc(id).update({
            active: false,
            deletedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    /**
     * Obtener todos los productos (incluyendo inactivos) - Solo admin
     */
    async getAllAdmin() {
        if (!window.FirebaseConfig || !window.FirebaseConfig.isInitialized()) {
            return SAMPLE_PRODUCTS;
        }

        const db = window.FirebaseConfig.getDb();
        // Sin orderBy en servidor: los docs sin campo createdAt (creados a mano en consola)
        // no aparecían en la lista del admin. Ordenamos en cliente.
        const snapshot = await db.collection('products').get();
        const products = [];

        snapshot.forEach(doc => {
            products.push({ id: doc.id, ...doc.data() });
        });

        products.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
            const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
            return tb - ta;
        });

        return products;
    },

    /**
     * Importar productos de ejemplo a Firestore
     */
    async importSampleProducts() {
        if (!window.FirebaseConfig || !window.FirebaseConfig.isInitialized()) {
            throw new Error('Firebase no está configurado');
        }

        const db = window.FirebaseConfig.getDb();
        const batch = db.batch();

        SAMPLE_PRODUCTS.forEach(product => {
            const docRef = db.collection('products').doc(product.id);
            batch.set(docRef, {
                ...product,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        console.log('✅ Productos de ejemplo importados a Firebase');
    }
};

// Exportar globalmente
window.ProductsService = ProductsService;

