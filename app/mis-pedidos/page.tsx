"use client";

/**
 * app/mis-pedidos/page.tsx — port de legacy/pages/mis-pedidos.html.
 *
 * Diferencias deliberadas vs. legacy (mismo resultado observable, distinto host):
 *  - Legacy maneja el gate de auth con `firebase.auth().onAuthStateChanged` +
 *    `VoltStoreAuth.requireAuth()` propio. Ese `requireAuth()` estaba roto en
 *    prod (`_modalEl` null nunca abría el modal) y un visitante anónimo
 *    quedaba con `#pageLoader` visible para siempre — el bug que esta tarea
 *    arregla. Acá se usa `useAuth()` (components/auth/AuthProvider.tsx, ya
 *    montado en app/layout.tsx) que expone 3 estados explícitos
 *    (loading/!user/user) y el mismo AuthModal global vía `openModal()` — sin
 *    ese estado intermedio roto: !user siempre renderiza un prompt de login,
 *    nunca un spinner infinito.
 *  - "Repetir pedido" usa `useCartStore().addItem` (merge por lineKey ya
 *    resuelto en lib/cart/reducer.js) en vez de leer/escribir
 *    `localStorage['cart']` a mano + `dispatchEvent('cartUpdated')` (evento
 *    global eliminado por decisión de CLAUDE.md — Zustand ya notifica a los
 *    suscriptores).
 *  - Suma tracking Andreani por fetch a /api/tracking-andreani (pedido de
 *    esta tarea, no existe en el legacy: ese archivo solo arma un link a
 *    andreani.com). Degrada sin bloquear: si el fetch falla o no hay
 *    credenciales de Andreani configuradas, la tarjeta de la orden se
 *    renderiza igual con un texto de "no disponible".
 */

import { useEffect, useState, type ReactNode } from "react";
import {
    collection,
    onSnapshot,
    query,
    where,
    type DocumentData,
    type FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCartStore } from "@/lib/cart/store";

// ── Constantes/helpers portados de legacy/pages/mis-pedidos.html ──────────

const STATUS_LABEL: Record<string, string> = {
    paid: "Pagado",
    pending: "Pendiente",
    pending_payment: "En proceso",
    pending_transfer: "Esperando transferencia",
    failed: "Rechazado",
    mp_error: "Error",
    shipped: "Enviado",
    delivered: "Entregado",
    cancelled: "Cancelado",
};

const LEGACY_SHIPPING_METHOD_LABELS: Record<string, string> = {
    cadete: "Cadete (Córdoba Capital)",
    andreani: "Andreani / Interior",
    correo: "Correo Argentino",
    coordinar: "Coordinar entrega",
};

function formatPrice(n: number): string {
    return `$${Number(n || 0).toLocaleString("es-AR")}`;
}

function formatDate(date: Date | null): string {
    if (!date || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

function toDate(value: unknown): Date | null {
    if (!value) return null;
    if (typeof value === "object" && value !== null && "toDate" in value) {
        try {
            return (value as { toDate: () => Date }).toDate();
        } catch {
            return null;
        }
    }
    const d = new Date(value as string | number);
    return Number.isNaN(d.getTime()) ? null : d;
}

interface OrderItemView {
    id: string;
    title: string;
    quantity: number;
    price: number;
    image: string;
    variantColor: string;
    variantSize: string;
}

interface OrderShippingView {
    type: string;
    method: string;
    cost: number | null;
    address: { street?: string; city?: string; province?: string; postalCode?: string } | null;
    trackingNumber: string;
}

interface OrderView {
    docId: string;
    orderId: string;
    status: string;
    createdAt: Date | null;
    items: OrderItemView[];
    total: number;
    shipping: OrderShippingView | null;
}

/** legacy normalizeOrder() */
function normalizeOrder(raw: DocumentData, docId: string): OrderView {
    const orderId = String(raw.orderId || raw.id || docId || "").trim();
    const status = String(raw.status || "pending").trim() || "pending";

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items: OrderItemView[] = rawItems.map((row: DocumentData) => ({
        id: String(row?.id || row?.productId || "").trim(),
        title: row?.title || row?.name || "Producto",
        quantity: Math.max(1, Number(row?.quantity) || 1),
        price: Number(row?.price) || 0,
        image: row?.image || "",
        variantColor: row?.variantColor || "",
        variantSize: row?.variantSize || "",
    }));

    let total = Number(raw.total);
    if (Number.isNaN(total)) {
        total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }

    const s = raw.shipping;
    const shipping: OrderShippingView | null =
        s && typeof s === "object"
            ? {
                  type: String(s.type || "").trim().toLowerCase(),
                  method: String(s.method || "").trim().toLowerCase(),
                  cost: s.cost != null && !Number.isNaN(Number(s.cost)) ? Number(s.cost) : null,
                  address: s.address && typeof s.address === "object" ? s.address : null,
                  trackingNumber: String(s.trackingNumber || "").trim(),
              }
            : null;

    return {
        docId,
        orderId,
        status,
        createdAt: toDate(raw.createdAt),
        items,
        total,
        shipping,
    };
}

/** legacy isLegacyOrIncompleteOrder() */
function isLegacyOrIncompleteOrder(raw: DocumentData, docId: string): boolean {
    if (!raw || typeof raw !== "object") return true;
    const id = String(raw.orderId || raw.id || docId || "").trim();
    if (!id) return true;
    if (raw.test === true || raw.isTest === true || raw.legacy === true) return true;
    if (/^test[-_]/i.test(id)) return true;
    if (raw.items != null && !Array.isArray(raw.items)) return true;
    return false;
}

/** legacy isNetworkError() */
function isNetworkError(err: FirestoreError | null): boolean {
    if (typeof navigator !== "undefined" && !navigator.onLine) return true;
    if (!err) return false;
    const code = String(err.code || "").toLowerCase();
    const msg = String(err.message || "").toLowerCase();
    return (
        code === "unavailable" ||
        code === "deadline-exceeded" ||
        msg.includes("network") ||
        msg.includes("failed to get") ||
        msg.includes("connection") ||
        msg.includes("offline") ||
        msg.includes("quic") ||
        msg.includes("fetch") ||
        msg.includes("err_quic")
    );
}

// ── Íconos (inline SVG, mismos paths que legacy) ───────────────────────────

function PackageIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path d="M24 28v14" stroke="#ffffff" strokeWidth={1.75} strokeLinecap="round" />
            <path d="M8 18l16-9 16 9-16 9-16-9Z" stroke="#ffffff" strokeWidth={1.75} strokeLinejoin="round" />
            <path d="M8 18v12l16 9 16-9V18" stroke="#ffffff" strokeWidth={1.75} strokeLinejoin="round" />
            <path d="M24 19V5" stroke="#ffffff" strokeWidth={1.75} strokeLinecap="round" />
            <path d="M8 18l16 9 16-9" stroke="#ffffff" strokeWidth={1.75} strokeLinejoin="round" />
        </svg>
    );
}

function PageLoader() {
    return (
        <div id="pageLoader">
            <div className="loader-spinner" />
        </div>
    );
}

// ── Tracking Andreani (fetch a pages/api/tracking-andreani.js) ────────────

type TrackingState =
    | { status: "loading" }
    | { status: "empty" }
    | { status: "error" }
    | { status: "ok"; estado: string; fecha: string | null };

function TrackingStatus({ trackingNumber }: { trackingNumber: string }) {
    const [state, setState] = useState<TrackingState>({ status: "loading" });

    useEffect(() => {
        let cancelled = false;
        setState({ status: "loading" });

        fetch(`/api/tracking-andreani?numeroAndreani=${encodeURIComponent(trackingNumber)}`)
            .then((res) => {
                if (!res.ok) throw new Error(`status ${res.status}`);
                return res.json();
            })
            .then((data: { eventos?: Array<{ estado?: string; fecha?: string }> }) => {
                if (cancelled) return;
                const eventos = Array.isArray(data.eventos) ? data.eventos : [];
                if (eventos.length === 0) {
                    setState({ status: "empty" });
                    return;
                }
                const last = eventos[0];
                setState({ status: "ok", estado: last.estado || "Sin novedades", fecha: last.fecha || null });
            })
            .catch(() => {
                // ponytail: sin credenciales de Andreani en preview/dev el
                // endpoint devuelve 502 — degrada a texto, no bloquea la orden.
                if (!cancelled) setState({ status: "error" });
            });

        return () => {
            cancelled = true;
        };
    }, [trackingNumber]);

    if (state.status === "loading") {
        return <div className="order-card__ship-line">Consultando seguimiento...</div>;
    }
    if (state.status === "error") {
        return <div className="order-card__ship-line">Seguimiento no disponible por el momento.</div>;
    }
    if (state.status === "empty") {
        return <div className="order-card__ship-line">Sin novedades de seguimiento aún.</div>;
    }
    const fechaFmt = state.fecha ? toDate(state.fecha) : null;
    return (
        <div className="order-card__ship-line">
            <strong>Último estado:</strong> {state.estado}
            {fechaFmt ? ` — ${formatDate(fechaFmt)}` : ""}
        </div>
    );
}

// ── Tarjeta de orden ────────────────────────────────────────────────────

function normalizeStatusKey(status: string): string {
    return String(status || "pending").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") || "pending";
}

function statusBadgeClass(status: string): string {
    const key = normalizeStatusKey(status);
    return STATUS_LABEL[key] !== undefined ? key : "pending";
}

function OrderShippingBlock({ order }: { order: OrderView }) {
    const s = order.shipping;
    if (!s) return null;

    const lines: ReactNode[] = [];
    const status = order.status.toLowerCase();

    const trackUrl = s.trackingNumber
        ? `https://www.andreani.com/personas/rastrearEnvio?claveDeRastreo=${encodeURIComponent(s.trackingNumber)}`
        : null;

    const showTracking = status === "shipped" && !!s.trackingNumber;
    const isAndreani = s.type === "andreani" || s.method === "andreani";

    const addressBlock = s.address ? (
        <div className="order-card__ship-address" key="addr">
            {[s.address.street, [s.address.city, s.address.province].filter(Boolean).join(", ")]
                .filter(Boolean)
                .map((line, i) => (
                    <span key={i}>
                        {line}
                        <br />
                    </span>
                ))}
            {s.address.postalCode ? `CP ${s.address.postalCode}` : null}
        </div>
    ) : null;

    if (s.type === "cordoba") {
        lines.push(
            <div className="order-card__ship-line" key="ship">
                <strong>Envío:</strong> Córdoba Capital — {s.cost != null ? formatPrice(s.cost) : "$2.500"}
            </div>
        );
    } else if (s.type === "andreani") {
        lines.push(
            <div className="order-card__ship-line" key="ship">
                <strong>Envío:</strong> Andreani / Interior — A coordinar
            </div>
        );
        if (addressBlock) lines.push(addressBlock);
    } else if (s.method && LEGACY_SHIPPING_METHOD_LABELS[s.method]) {
        lines.push(
            <div className="order-card__ship-line" key="ship">
                <strong>Envío:</strong> {LEGACY_SHIPPING_METHOD_LABELS[s.method]}
            </div>
        );
        if ((s.method === "andreani" || s.method === "correo") && addressBlock) lines.push(addressBlock);
    } else {
        return null;
    }

    if (showTracking && trackUrl) {
        lines.push(
            <div className="order-card__ship-line" key="track-link">
                <strong>Seguimiento:</strong>{" "}
                <a href={trackUrl} target="_blank" rel="noopener noreferrer">
                    {s.trackingNumber}
                </a>
            </div>
        );
    }

    if (!lines.length) return null;

    return (
        <div className="order-card__shipping">
            {lines}
            {showTracking && isAndreani && <TrackingStatus trackingNumber={s.trackingNumber} />}
        </div>
    );
}

function OrderCard({ order }: { order: OrderView }) {
    const addItem = useCartStore((s) => s.addItem);
    const [justAdded, setJustAdded] = useState(false);

    useEffect(() => {
        if (!justAdded) return;
        const t = setTimeout(() => setJustAdded(false), 2500); // legacy:892-896
        return () => clearTimeout(t);
    }, [justAdded]);

    function handleReorder() {
        if (!order.items.length) return;
        order.items.forEach((item) => {
            addItem(
                {
                    id: item.id,
                    title: item.title,
                    price: item.price,
                    image: item.image,
                    quantity: item.quantity,
                    variantColor: item.variantColor || undefined,
                    variantSize: item.variantSize || undefined,
                },
                item.quantity
            );
        });
        setJustAdded(true);
    }

    const badgeKey = statusBadgeClass(order.status);
    // Badge color/class always collapses to a known bucket (or "pending"),
    // but the label must show the raw status text for unknown values —
    // matches legacy/pages/mis-pedidos.html:540, which never collapsed the
    // displayed text (only the CSS class did).
    const rawStatusKey = normalizeStatusKey(order.status);
    const label = STATUS_LABEL[rawStatusKey] ?? order.status ?? "Desconocido";

    return (
        <div className="order-card" data-order-id={order.orderId}>
            <div className="order-card__header">
                <div>
                    <div className="order-card__id">{order.orderId}</div>
                    <div className="order-card__date">{formatDate(order.createdAt)}</div>
                </div>
                <span className={`order-badge order-badge--${badgeKey}`}>{label}</span>
            </div>
            <div className="order-card__items">
                {order.items.length ? (
                    order.items.map((item, i) => (
                        <div className="order-item" key={i}>
                            <span>
                                {item.title}
                                <span className="order-item__qty">x{item.quantity}</span>
                            </span>
                            <span className="order-item__price">{formatPrice(item.price * item.quantity)}</span>
                        </div>
                    ))
                ) : (
                    <div className="order-item" style={{ color: "rgba(242,242,242,0.3)" }}>
                        Sin detalle de productos
                    </div>
                )}
            </div>
            <OrderShippingBlock order={order} />
            <div className="order-card__footer">
                <button
                    type="button"
                    className={`btn-reorder${justAdded ? " btn-reorder--done" : ""}`}
                    disabled={justAdded}
                    onClick={handleReorder}
                >
                    {justAdded ? "Agregado al carrito" : "Repetir pedido"}
                </button>
                <div className="order-card__total-group">
                    <span className="order-card__total-label">Total</span>
                    <span className="order-card__total-amount">{formatPrice(order.total)}</span>
                </div>
            </div>
        </div>
    );
}

// ── Página ──────────────────────────────────────────────────────────────

type OrdersState =
    | { status: "loading" }
    | { status: "empty" }
    | { status: "network-error" }
    | { status: "error" }
    | { status: "ok"; orders: OrderView[] };

export default function MisPedidosPage() {
    const { user, loading: authLoading, openModal } = useAuth();
    const [ordersState, setOrdersState] = useState<OrdersState>({ status: "loading" });

    useEffect(() => {
        if (!user || !user.email) {
            setOrdersState({ status: "loading" });
            return;
        }

        setOrdersState({ status: "loading" });

        const q = query(collection(db, "orders"), where("customer.email", "==", user.email)); // legacy:918-919

        const unsubscribe = onSnapshot(
            q,
            (snap) => {
                const orders: OrderView[] = [];
                snap.docs.forEach((d) => {
                    const raw = d.data();
                    if (isLegacyOrIncompleteOrder(raw, d.id)) return;
                    try {
                        orders.push(normalizeOrder(raw, d.id));
                    } catch {
                        /* pedido malformado — se omite, ver legacy:824 */
                    }
                });
                orders.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)); // legacy:910-914

                setOrdersState(orders.length === 0 ? { status: "empty" } : { status: "ok", orders });
            },
            (err) => {
                setOrdersState(isNetworkError(err) ? { status: "network-error" } : { status: "error" });
            }
        );

        return () => unsubscribe();
    }, [user]);

    // ── Estado 1: auth resolviéndose (breve, real) ──────────────────────
    if (authLoading) {
        return <PageLoader />;
    }

    // ── Estado 2: sin sesión — FIX del bug de prod: nunca un spinner
    // infinito, siempre un prompt de login claro. ───────────────────────
    if (!user) {
        return (
            <main id="main-content" className="orders-page orders-page--empty">
                <h1 className="orders-heading">
                    Mis <span>Pedidos</span>
                </h1>
                <div id="ordersList">
                    <div className="orders-empty" role="status">
                        <div className="orders-empty__icon" aria-hidden="true">
                            <PackageIcon />
                        </div>
                        <h2 className="orders-empty__title">Iniciá sesión para ver tus pedidos</h2>
                        <p className="orders-empty__desc">
                            Ingresá con tu cuenta VOLT para ver el detalle y el estado de envío de tus compras.
                        </p>
                        <button type="button" className="orders-empty__cta" onClick={() => openModal("login")}>
                            Ingresar
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    // ── Estado 3: usuario logueado — pedidos cargando/vacíos/error/listado ──
    if (ordersState.status === "loading") {
        return <PageLoader />;
    }

    if (ordersState.status === "empty") {
        return (
            <main id="main-content" className="orders-page orders-page--empty">
                <h1 className="orders-heading">
                    Mis <span>Pedidos</span>
                </h1>
                <div id="ordersList">
                    <div className="orders-empty" role="status">
                        <div className="orders-empty__icon" aria-hidden="true">
                            <PackageIcon />
                        </div>
                        <h2 className="orders-empty__title">Todavía no hiciste ningún pedido</h2>
                        <p className="orders-empty__desc">
                            Cuando compres en la tienda, vas a ver el detalle y el estado de envío acá.
                        </p>
                        <a href="/catalogo" className="orders-empty__cta">
                            Ir a la tienda
                        </a>
                    </div>
                </div>
            </main>
        );
    }

    if (ordersState.status === "network-error") {
        return (
            <main id="main-content" className="orders-page orders-page--load-error">
                <h1 className="orders-heading">
                    Mis <span>Pedidos</span>
                </h1>
                <p className="orders-subheading">No pudimos cargar tus pedidos. Revisá tu conexión e intentá de nuevo.</p>
                <div id="ordersList">
                    <div className="orders-empty" role="alert">
                        <div className="orders-empty__icon" aria-hidden="true">
                            <PackageIcon />
                        </div>
                        <div className="orders-empty__actions">
                            <button type="button" className="orders-empty__retry" onClick={() => window.location.reload()}>
                                Reintentar
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    if (ordersState.status === "error") {
        return (
            <main id="main-content" className="orders-page">
                <h1 className="orders-heading">
                    Mis <span>Pedidos</span>
                </h1>
                <div id="ordersList">
                    <div className="orders-error">No pudimos cargar tus pedidos. Intentá de nuevo más tarde.</div>
                </div>
            </main>
        );
    }

    const { orders } = ordersState;
    return (
        <main id="main-content" className="orders-page">
            <h1 className="orders-heading">
                Mis <span>Pedidos</span>
            </h1>
            <p className="orders-subheading">
                {orders.length} pedido{orders.length !== 1 ? "s" : ""}
            </p>
            <div id="ordersList">
                {orders.map((order) => (
                    <OrderCard order={order} key={order.docId} />
                ))}
            </div>
        </main>
    );
}
