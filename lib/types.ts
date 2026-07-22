/**
 * lib/types.ts — tipos compartidos cliente/servidor, derivados del uso real
 * en legacy/js/* y api/* (no son un diseño de datos nuevo).
 */

export interface ProductVariant {
    color: string;
    hex: string;
    stock: number;
}

export interface ProductSize {
    size: string;
    stock: number;
}

/** Documento Firestore products/{id} (ver legacy/js/{products-service,catalog,admin-products}.js). */
export interface Product {
    id: string;
    name: string;
    description?: string;
    price: number;
    stock: number;
    category: string;
    /** Imagen principal (fallback cuando no hay `images`). */
    image: string;
    imageUrl?: string;
    images?: string[];
    /**
     * Imágenes alternativas por color — dos nombres legados coexisten en el
     * código (`variantImages` u `imagesByColor`, se usa el que exista).
     * Corregido a `Record<string, string>` (F4): legacy/js/catalog.js:305
     * (`byColor[color]`) usa el valor directo como URL, no como array —
     * la declaración previa (`string[]`) no coincidía con products-service.js
     * (sanitizeImageMap trata cada valor como string único).
     */
    variantImages?: Record<string, string>;
    imagesByColor?: Record<string, string>;
    variants?: ProductVariant[];
    sizes?: ProductSize[];
    active: boolean;
    /** Sello "Edición limitada" en la card (F4, legacy/js/catalog.js:113-116). */
    limited?: boolean;
    featured?: boolean;
    /** Orden en la home cuando featured === true (1 = primero). */
    featuredOrder?: number;
    /** Línea de producción (TC, F1, etc). Productos viejos sin este campo → 'TC' (ver normalizeProduct). */
    line?: string;
    createdAt?: unknown;
    updatedAt?: unknown;
}

/**
 * Item de carrito — shape idéntico al actual (legacy/js/main.js + cart-sync.js).
 * lineKey (misma línea de carrito) = `${id}-${variantColor}-${variantSize}`.
 */
export interface CartItem {
    id: string;
    title: string;
    price: number;
    quantity: number;
    image: string;
    variantColor?: string;
    variantSize?: string;
}

/** Misma semántica que lineKey() en legacy/js/cart-sync.js. */
export function cartLineKey(item: Pick<CartItem, 'id' | 'variantColor' | 'variantSize'>): string {
    return `${item.id || ''}-${item.variantColor || ''}-${item.variantSize || ''}`;
}

export type OrderStatus =
    | 'pending'
    | 'pending_payment'
    | 'pending_transfer'
    | 'failed'
    | 'mp_error'
    | 'paid'
    | 'shipped'
    | 'delivered'
    | 'cancelled';

export interface OrderCustomer {
    name: string;
    phone: string;
    email: string;
    dni: string;
}

export interface OrderShippingAddress {
    street?: string;
    city?: string;
    province?: string;
    postalCode?: string;
}

export interface OrderShipping {
    /** Checkout actual. */
    type?: 'cordoba' | 'andreani';
    cost?: number;
    address?: OrderShippingAddress;
    /** Pedidos legados (pre checkout actual): cadete | andreani | correo | coordinar. */
    method?: string;
    notes?: string;
    /** Nota libre mostrada en el detalle admin (legacy/js/admin-orders.js#adminShippingHtml). */
    note?: string;
    /** Seteados por pages/api/notify-status.js al pasar a `shipped` (F9). */
    carrier?: string;
    trackingNumber?: string;
    /** Seteado por pages/api/crear-orden-andreani.js al generar el despacho (F9). */
    andreani?: {
        numeroDeEnvio: string;
        bultos?: unknown[];
        createdAt?: unknown;
    };
}

export interface OrderItem {
    id: string;
    title: string;
    quantity: number;
    image: string;
    variantColor?: string;
    variantSize?: string;
    /** Precio validado server-side al crear la orden. */
    price: number;
    /** Precio unitario ya con descuento de cupón aplicado (create-preference). */
    unitPrice?: number;
}

/** Documento Firestore orders/{orderId} (ver api/create-preference.js, api/create-transfer-order.js, api/webhook.js). */
export interface Order {
    orderId: string;
    status: OrderStatus;
    createdAt: unknown;
    updatedAt: unknown;
    customer: OrderCustomer;
    shipping: OrderShipping;
    items: OrderItem[];
    subtotal: number;
    discountPercent: number;
    discountAmount: number;
    discountSource: 'coupon' | 'transfer' | null;
    coupon: string | null;
    total: number;
    paymentId: string | null;
    paidAt: unknown;
    paymentMethod?: 'transfer' | 'mercadopago';
    mpStatus?: string;
    /** true una vez que el stock ya fue descontado — evita doble descuento en reintentos del webhook. */
    inventoryAdjusted?: boolean;
}

/** Documento Firestore coupons/{code} (ver api/_coupons.js, legacy/js/admin-coupons.js). */
export interface Coupon {
    code: string;
    percent: number;
    active: boolean;
    expiresAt?: unknown;
    maxUses?: number;
    usedCount?: number;
    createdAt?: unknown;
}

/** Respuesta de api/cotizar-envio.js (Andreani). */
export interface ShippingQuote {
    tarifaSinIva: number;
    tarifaConIva: number;
}
