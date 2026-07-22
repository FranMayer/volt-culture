"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useCheckout } from "./CheckoutContext";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCartStore } from "@/lib/cart/store";
import { auth, db } from "@/lib/firebase/client";
import { clearFirestore, clearLocal } from "@/lib/cart/sync";
import { SHIPPING_CONFIG } from "@/lib/shipping-config";
import { normalizeCouponCode } from "@/lib/server/coupons";
import {
    validateDni,
    formatMoney,
    estimateCartShipment,
    checkCoupon,
    computeCheckoutTotals,
    buildTransferWaMessage,
    validateAndreaniAddress,
} from "@/lib/checkout";

// Ported from legacy/js/pagos.js (stepper markup/ids/classes preserved so
// app/styles/checkout.css + the sitewide dark theme (volt-ds.css/bs-shim.css,
// already global via app/layout.tsx — see checkout.css header comment) apply
// as-is, same approach as components/auth/AuthModal.tsx and
// components/layout/CartOffcanvas.tsx for Bootstrap's modal JS.

const CUSTOMER_STORAGE_KEY = "volt_checkout_customer";
const WHATSAPP_NUMBER = "5493518588127";
const TRANSFER_BANK = {
    banco: "Banco Santander",
    cuenta: "Caja de Ahorro en Pesos 064-371679/1",
    cbu: "0720064988000037167918",
    alias: "franmayer96",
    titular: "FRANCO EZEQUIEL MAYER",
    cuit: "CUIT 20-39693593-8",
};

const ARGENTINE_PROVINCES = [
    "Buenos Aires",
    "Ciudad Autónoma de Buenos Aires",
    "Catamarca",
    "Chaco",
    "Chubut",
    "Córdoba",
    "Corrientes",
    "Entre Ríos",
    "Formosa",
    "Jujuy",
    "La Pampa",
    "La Rioja",
    "Mendoza",
    "Misiones",
    "Neuquén",
    "Río Negro",
    "Salta",
    "San Juan",
    "San Luis",
    "Santa Cruz",
    "Santa Fe",
    "Santiago del Estero",
    "Tierra del Fuego",
    "Tucumán",
];

const SHIPPING_LABELS: Record<"cordoba" | "andreani", string> = {
    cordoba: `Envío ${SHIPPING_CONFIG.cordoba.label} (dentro de circunvalación) — ${formatMoney(SHIPPING_CONFIG.cordoba.cost)}`,
    andreani: `${SHIPPING_CONFIG.andreani.label} del país — ${SHIPPING_CONFIG.andreani.note}`,
};

type ShippingOption = "cordoba" | "andreani";
type Customer = { name: string; dni: string; phone: string; email: string };
type AndreaniAddress = { street: string; city: string; province: string; postalCode: string };
type QuoteState = { status: "idle" | "loading" | "ok" | "error"; text: string };

function emptyCustomer(): Customer {
    return { name: "", dni: "", phone: "", email: "" };
}
function emptyAddress(): AndreaniAddress {
    return { street: "", city: "", province: "", postalCode: "" };
}

export default function CheckoutModal() {
    const { isOpen, mode, close, showTransferSuccess } = useCheckout();
    const { user } = useAuth();
    const items = useCartStore((s) => s.items);

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [customer, setCustomer] = useState<Customer>(emptyCustomer());
    const [stepError, setStepError] = useState("");
    const [shippingOption, setShippingOption] = useState<ShippingOption | null>(null);
    const [address, setAddress] = useState<AndreaniAddress>(emptyAddress());
    const [quote, setQuote] = useState<QuoteState>({ status: "idle", text: "" });
    const [couponInput, setCouponInput] = useState("");
    const [coupon, setCoupon] = useState<{ code: string; percent: number } | null>(null);
    const [couponFeedback, setCouponFeedback] = useState<{ text: string; ok: boolean | null }>({ text: "", ok: null });
    const [couponBusy, setCouponBusy] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [payError, setPayError] = useState("");

    const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const quoteReqId = useRef(0);

    // Reset del formulario cada vez que se abre — legacy pagos.js
    // askCheckoutData() (líneas 658-686) reseteaba _shippingConfirmado/
    // _couponAplicado/inputs al abrir el modal.
    useEffect(() => {
        if (!isOpen) return;
        let saved: Partial<Customer> = {};
        try {
            saved = JSON.parse(localStorage.getItem(CUSTOMER_STORAGE_KEY) || "{}") || {};
        } catch {
            /* ignore */
        }
        setStep(1);
        setCustomer({
            name: saved.name || user?.displayName || "",
            dni: saved.dni || "",
            phone: saved.phone || "",
            email: saved.email || user?.email || "",
        });
        setStepError("");
        setShippingOption(null);
        setAddress(emptyAddress());
        setQuote({ status: "idle", text: "" });
        setCouponInput("");
        setCoupon(null);
        setCouponFeedback({ text: "", ok: null });
        setPayError("");
    }, [isOpen, user]);

    // Scroll-lock + Esc, mismo patrón que CartOffcanvas/AuthModal. Esc no
    // cierra mientras hay un submit en curso (evita perder la orden a mitad
    // de un fetch).
    useEffect(() => {
        if (!isOpen) return;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        const prevOverflow = document.body.style.overflow;
        const prevPadding = document.body.style.paddingRight;
        document.body.style.overflow = "hidden";
        if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !submitting) close();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPadding;
            document.removeEventListener("keydown", onKeyDown);
            if (quoteTimer.current) {
                clearTimeout(quoteTimer.current);
                quoteTimer.current = null;
            }
        };
    }, [isOpen, close, submitting]);

    function persistCustomer(c: Customer) {
        localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(c));
    }

    // ── Cotización Andreani (debounce 600ms, legacy pagos.js:432-448) ──
    function scheduleQuote(option: ShippingOption | null, postalCode: string) {
        if (quoteTimer.current) {
            clearTimeout(quoteTimer.current);
            quoteTimer.current = null;
        }
        if (option !== "andreani" || !/^\d{4}$/.test(postalCode)) {
            quoteReqId.current += 1;
            setQuote({ status: "idle", text: "" });
            return;
        }
        quoteTimer.current = setTimeout(() => {
            quoteTimer.current = null;
            void fetchQuote(postalCode);
        }, 600);
    }

    async function fetchQuote(postalCode: string) {
        const myReq = ++quoteReqId.current;
        setQuote({ status: "loading", text: "Cotizando envío…" });
        const { pesoKg, volumenCm3 } = estimateCartShipment(items);
        try {
            const url = `/api/cotizar-envio?codigoPostalDestino=${encodeURIComponent(postalCode)}&pesoKg=${pesoKg}&volumenCm3=${volumenCm3}`;
            const res = await fetch(url);
            if (myReq !== quoteReqId.current) return;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (myReq !== quoteReqId.current) return;
            const tarifa = Number(data.tarifaConIva);
            if (!Number.isFinite(tarifa)) throw new Error("tarifa inválida");
            setQuote({
                status: "ok",
                text: `Costo estimado de envío (Andreani): ${formatMoney(Math.round(tarifa))} IVA incluido — se coordina el pago del envío por WhatsApp.`,
            });
        } catch {
            if (myReq !== quoteReqId.current) return;
            // NOTA (F7): ANDREANI_USER/ANDREANI_PASS no están configuradas en
            // este entorno (el usuario descartó Andreani por falta de
            // credenciales) — /api/cotizar-envio devuelve 502 y este catch
            // es la ruta esperada mientras tanto. No se mockean datos: en
            // cuanto haya credenciales esto cotiza sin cambios de código acá.
            setQuote({ status: "error", text: "No pudimos cotizar el envío para ese código postal." });
        }
    }

    function selectShipping(option: ShippingOption) {
        setShippingOption(option);
        scheduleQuote(option, address.postalCode);
    }

    function handlePostalCodeChange(value: string) {
        setAddress((a) => ({ ...a, postalCode: value }));
        scheduleQuote(shippingOption, value);
    }

    // ── Navegación del stepper (legacy pagos.js:634-651, 816-847) ──
    function handleStep1Continue(e?: FormEvent) {
        e?.preventDefault();
        if (!customer.name.trim()) return setStepError("Completá tu nombre y apellido.");
        if (!validateDni(customer.dni)) return setStepError("El DNI debe tener 7 u 8 dígitos numéricos, sin puntos ni espacios.");
        if (!customer.phone.trim()) return setStepError("Completá tu teléfono.");
        if (!customer.email.trim() || !customer.email.includes("@")) return setStepError("Completá un email válido.");
        setStepError("");
        persistCustomer(customer);
        setStep(2);
    }

    function handleStep2Continue() {
        if (!shippingOption) return setStepError("Elegí una opción de envío.");
        if (shippingOption === "andreani") {
            const err = validateAndreaniAddress(address);
            if (err) return setStepError(err);
        }
        setStepError("");
        setStep(3);
    }

    function handleBack() {
        setStepError("");
        setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : s));
    }

    // ── Cupón (legacy pagos.js:772-806) ──
    async function handleCouponApply() {
        const code = normalizeCouponCode(couponInput);
        if (!code) {
            setCouponFeedback({ text: "Ingresá un código.", ok: false });
            return;
        }
        setCouponBusy(true);
        setCouponFeedback({ text: "Validando…", ok: null });
        try {
            const snap = await getDoc(doc(db, "coupons", code));
            const data = snap.exists() ? (snap.data() as { code?: string; percent?: number }) : null;
            const res = checkCoupon(data);
            if (!res.valid) {
                setCoupon(null);
                setCouponFeedback({ text: res.reason ?? "Cupón inválido.", ok: false });
            } else {
                const appliedCode = data?.code || code;
                setCoupon({ code: appliedCode, percent: res.percent as number });
                setCouponFeedback({ text: `Cupón ${appliedCode} aplicado: ${res.percent}% off en productos.`, ok: true });
            }
        } catch {
            setCoupon(null);
            setCouponFeedback({ text: "No se pudo validar el cupón. Probá de nuevo.", ok: false });
        } finally {
            setCouponBusy(false);
        }
    }

    function handleCouponRemove() {
        setCoupon(null);
        setCouponInput("");
        setCouponFeedback({ text: "", ok: null });
    }

    // ── Pago (legacy pagos.js:849-903 + los dos click handlers de checkoutBtn/transferBtn) ──
    async function handlePay() {
        setPayError("");
        if (!shippingOption) {
            setStep(2);
            setStepError("Por favor volvé al paso 2 y elegí una opción de envío.");
            return;
        }
        if (shippingOption === "andreani") {
            const err = validateAndreaniAddress(address);
            if (err) {
                setStep(2);
                setStepError(err);
                return;
            }
        }
        if (!customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !validateDni(customer.dni)) {
            setStep(1);
            setStepError("Completá tus datos personales.");
            return;
        }
        persistCustomer(customer);

        const missingId = items.find((it) => !it.id);
        if (missingId) {
            setPayError("Un producto del carrito no tiene id. Volvé al shop, vaciá el carrito y agregá los productos de nuevo.");
            return;
        }

        const payloadItems = items.map((it) => ({
            id: it.id,
            title: it.title,
            quantity: it.quantity,
            price: it.price,
            variantColor: it.variantColor || "",
            variantSize: it.variantSize || "",
        }));

        const postBody: Record<string, unknown> = { items: payloadItems, customer, shippingOption };
        if (shippingOption === "andreani") postBody.shipping = { type: "andreani", address };
        if (coupon?.code) postBody.couponCode = coupon.code;

        setSubmitting(true);
        try {
            if (mode === "mp") {
                const res = await fetch("/api/create-preference", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(postBody),
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error + (data.details ? " — " + data.details : ""));
                if (!data.init_point) {
                    throw new Error("El servidor no devolvió el link de pago (init_point). Revisá MP_ACCESS_TOKEN y la respuesta de la API.");
                }
                if (!data.orderId) throw new Error("El servidor no devolvió orderId para seguimiento de la orden.");
                localStorage.setItem("volt_current_order", data.orderId);
                // No vaciamos el carrito acá: si el pago se rechaza/abandona en
                // MP el cliente vuelve con el carrito intacto para reintentar
                // (legacy pagos.js:990-993). Se limpia recién en success (Tarea 2).
                window.location.href = data.init_point;
                return;
            }

            const res = await fetch("/api/create-transfer-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(postBody),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                throw new Error((data.error || `HTTP ${res.status}`) + (data.details ? " — " + data.details : ""));
            }
            if (!data.orderId) throw new Error("El servidor no devolvió orderId para seguimiento de la orden.");
            localStorage.setItem("volt_current_order", data.orderId);

            const waMessage = buildTransferWaMessage({
                items,
                customer,
                shippingOption,
                shippingConfig: SHIPPING_CONFIG,
                address: shippingOption === "andreani" ? address : undefined,
                serverTotals: {
                    orderId: data.orderId,
                    subtotal: data.subtotal,
                    discountAmount: data.discountAmount,
                    total: data.total,
                    discountSource: data.discountSource,
                    coupon: data.coupon,
                    discountPercent: data.discountPercent,
                },
            });
            const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMessage)}`;

            // legacy pagos.js:1125-1129 llama clearFirestore(uid) incluso con uid
            // undefined (compra por transferencia sin sesión) — acá se guarda esa
            // llamada para no crashear el flujo de un invitado no logueado.
            const uid = auth.currentUser?.uid;
            if (uid) await clearFirestore(uid);
            clearLocal();

            showTransferSuccess({ orderId: data.orderId, waUrl });
        } catch (err) {
            setPayError(err instanceof Error ? err.message : "Error al generar el pago.");
        } finally {
            setSubmitting(false);
        }
    }

    const totals = computeCheckoutTotals(items, shippingOption ?? "cordoba", SHIPPING_CONFIG, mode, coupon);

    return (
        <>
            {isOpen && <div className="modal-backdrop show" aria-hidden="true" />}

            <div
                className={`modal fade${isOpen ? " show" : ""}`}
                id="customerDataModal"
                tabIndex={-1}
                aria-labelledby="customerDataModalTitle"
                aria-hidden={!isOpen}
            >
                <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title" id="customerDataModalTitle">CHECKOUT</h5>
                            <button
                                type="button"
                                className="btn-close btn-close-white"
                                aria-label="Cerrar"
                                disabled={submitting}
                                onClick={close}
                            />
                        </div>
                        <div className="modal-body pt-2">
                            <div className="volt-stepper__bar" aria-hidden="true">
                                <div
                                    className="volt-stepper__fill"
                                    style={{ width: step === 1 ? "0%" : step === 2 ? "50%" : "100%" }}
                                />
                            </div>
                            <div className="volt-stepper" role="navigation" aria-label="Pasos del checkout">
                                {([1, 2, 3] as const).map((n) => (
                                    <div
                                        key={n}
                                        className={`volt-stepper__item${n === step ? " is-active" : ""}${n < step ? " is-done" : ""}`}
                                    >
                                        <strong>{n}</strong>
                                        {n === 1 ? "Datos" : n === 2 ? "Envío" : "Resumen"}
                                    </div>
                                ))}
                            </div>

                            {stepError && <p className="volt-checkout-error" role="alert">{stepError}</p>}

                            {/* PASO 1 — Datos */}
                            <div className={`volt-step-panel${step === 1 ? " is-visible" : ""}`}>
                                <form id="customerDataForm" noValidate onSubmit={handleStep1Continue}>
                                    <div className="mb-2">
                                        <label className="form-label" htmlFor="customerName">Nombre y apellido</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            id="customerName"
                                            required
                                            autoComplete="name"
                                            value={customer.name}
                                            onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                                        />
                                    </div>
                                    <div className="mb-2">
                                        <label className="form-label" htmlFor="customerDni">DNI</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            id="customerDni"
                                            required
                                            autoComplete="off"
                                            inputMode="numeric"
                                            maxLength={8}
                                            placeholder="Sin puntos ni espacios"
                                            value={customer.dni}
                                            onChange={(e) => setCustomer((c) => ({ ...c, dni: e.target.value }))}
                                        />
                                    </div>
                                    <div className="mb-2">
                                        <label className="form-label" htmlFor="customerPhone">Teléfono</label>
                                        <input
                                            type="tel"
                                            className="form-control"
                                            id="customerPhone"
                                            required
                                            autoComplete="tel"
                                            placeholder="Ej: 3512345678"
                                            value={customer.phone}
                                            onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                                        />
                                    </div>
                                    <div className="mb-2">
                                        <label className="form-label" htmlFor="customerEmail">Email</label>
                                        <input
                                            type="email"
                                            className="form-control"
                                            id="customerEmail"
                                            required
                                            autoComplete="email"
                                            value={customer.email}
                                            onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                                        />
                                    </div>
                                </form>
                            </div>

                            {/* PASO 2 — Envío */}
                            <div className={`volt-step-panel${step === 2 ? " is-visible" : ""}`}>
                                <p className="small text-secondary mb-2">Elegí cómo querés recibir tu pedido</p>
                                <div className="volt-ship-grid mb-3" role="radiogroup" aria-label="Opción de envío">
                                    <button
                                        type="button"
                                        className={`volt-ship-card${shippingOption === "cordoba" ? " is-selected" : ""}`}
                                        aria-pressed={shippingOption === "cordoba"}
                                        onClick={() => selectShipping("cordoba")}
                                    >
                                        <div className="volt-ship-card__title">
                                            Envío {SHIPPING_CONFIG.cordoba.label} — {formatMoney(SHIPPING_CONFIG.cordoba.cost)}
                                        </div>
                                        <p className="volt-ship-card__meta">
                                            Dentro de circunvalación. Costo fijo {formatMoney(SHIPPING_CONFIG.cordoba.cost)}, se suma al total en Mercado Pago.
                                        </p>
                                    </button>
                                    <button
                                        type="button"
                                        className={`volt-ship-card${shippingOption === "andreani" ? " is-selected" : ""}`}
                                        aria-pressed={shippingOption === "andreani"}
                                        onClick={() => selectShipping("andreani")}
                                    >
                                        <div className="volt-ship-card__title">{SHIPPING_CONFIG.andreani.label} del país</div>
                                        <p className="volt-ship-card__meta">
                                            Andreani u OCA. El costo se calcula según destino y se coordina por WhatsApp antes del despacho.
                                        </p>
                                    </button>
                                </div>

                                {shippingOption === "andreani" && (
                                    <>
                                        <p className="small mb-2" id="shippingAndreaniNote">
                                            Completá la dirección de entrega. El costo de envío se coordina por WhatsApp antes del despacho.
                                        </p>
                                        <div id="andreaniAddressForm">
                                            <div className="mb-2">
                                                <label className="form-label" htmlFor="shippingStreet">Calle y número</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    id="shippingStreet"
                                                    required
                                                    autoComplete="street-address"
                                                    value={address.street}
                                                    onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                                                />
                                            </div>
                                            <div className="mb-2">
                                                <label className="form-label" htmlFor="shippingCity">Ciudad</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    id="shippingCity"
                                                    required
                                                    autoComplete="address-level2"
                                                    value={address.city}
                                                    onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                                                />
                                            </div>
                                            <div className="mb-2">
                                                <label className="form-label" htmlFor="shippingProvince">Provincia</label>
                                                <select
                                                    className="form-select"
                                                    id="shippingProvince"
                                                    required
                                                    autoComplete="address-level1"
                                                    value={address.province}
                                                    onChange={(e) => setAddress((a) => ({ ...a, province: e.target.value }))}
                                                >
                                                    <option value="">Provincia</option>
                                                    {ARGENTINE_PROVINCES.map((p) => (
                                                        <option key={p} value={p}>{p}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="mb-0">
                                                <label className="form-label" htmlFor="shippingPostalCode">Código postal</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    id="shippingPostalCode"
                                                    required
                                                    autoComplete="postal-code"
                                                    inputMode="numeric"
                                                    value={address.postalCode}
                                                    onChange={(e) => handlePostalCodeChange(e.target.value)}
                                                />
                                                {quote.text && (
                                                    <p
                                                        className="small mb-0"
                                                        id="andreaniQuoteBox"
                                                        style={{ color: quote.status === "error" ? "#e06b6b" : "#ccc", marginTop: "0.6rem" }}
                                                    >
                                                        {quote.text}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* PASO 3 — Resumen / pago */}
                            <div className={`volt-step-panel${step === 3 ? " is-visible" : ""}`}>
                                <h6 className="text-uppercase small mb-2" style={{ color: "#c1121f" }}>Tu pedido</h6>
                                <ul className="volt-summary-list" id="checkoutSummaryItems">
                                    {items.map((item) => {
                                        const bits = [item.variantSize && `Talle: ${item.variantSize}`, item.variantColor && `Color: ${item.variantColor}`]
                                            .filter(Boolean)
                                            .join(" · ");
                                        return (
                                            <li key={`${item.id}-${item.variantColor || ""}-${item.variantSize || ""}`}>
                                                <span>{item.title || "Producto"}{bits ? ` · ${bits}` : ""} ×{item.quantity || 1}</span>
                                                <span>{formatMoney(item.price * (item.quantity || 1))}</span>
                                            </li>
                                        );
                                    })}
                                    {shippingOption === "cordoba" && (
                                        <li>
                                            <span>Envío {SHIPPING_CONFIG.cordoba.label}</span>
                                            <span>{formatMoney(SHIPPING_CONFIG.cordoba.cost)}</span>
                                        </li>
                                    )}
                                    {coupon ? (
                                        <>
                                            <li><span>Subtotal</span><span>{formatMoney(totals.subtotal)}</span></li>
                                            <li className="volt-summary-discount">
                                                <span>Cupón {coupon.code} (−{coupon.percent}%)</span>
                                                <span>−{formatMoney(totals.discountAmount)}</span>
                                            </li>
                                            <li className="volt-summary-total-transfer">
                                                <span><strong>{mode === "transfer" ? "Total a transferir" : "Total"}</strong></span>
                                                <span><strong>{formatMoney(totals.total)}</strong></span>
                                            </li>
                                        </>
                                    ) : mode === "transfer" ? (
                                        <>
                                            <li><span>Subtotal</span><span>{formatMoney(totals.subtotal)}</span></li>
                                            <li className="volt-summary-discount">
                                                <span>Descuento transferencia (−10%)</span>
                                                <span>−{formatMoney(totals.discountAmount)}</span>
                                            </li>
                                            <li className="volt-summary-total-transfer">
                                                <span><strong>Total a transferir</strong></span>
                                                <span><strong>{formatMoney(totals.total)}</strong></span>
                                            </li>
                                        </>
                                    ) : (
                                        <li><span><strong>Total</strong></span><span><strong>{formatMoney(totals.total)}</strong></span></li>
                                    )}
                                    {shippingOption === "andreani" && (
                                        <li style={{ fontSize: "0.78rem", color: "#888", fontWeight: "normal", paddingTop: "0.35rem", borderBottom: "none" }}>
                                            <span>Envío interior — A coordinar</span>
                                        </li>
                                    )}
                                </ul>

                                <div className="volt-coupon" id="checkoutCouponBlock">
                                    <label className="form-label" htmlFor="checkoutCouponInput">¿Tenés un cupón?</label>
                                    <div className="volt-coupon__row">
                                        <input
                                            type="text"
                                            className="form-control"
                                            id="checkoutCouponInput"
                                            placeholder="Ej: VOLT20"
                                            autoComplete="off"
                                            value={couponInput}
                                            onChange={(e) => setCouponInput(e.target.value)}
                                        />
                                        <button type="button" className="btn btn-danger btn-sm" disabled={couponBusy} onClick={handleCouponApply}>
                                            Aplicar
                                        </button>
                                        {coupon && (
                                            <button type="button" className="btn btn-outline-light btn-sm" onClick={handleCouponRemove}>
                                                Quitar
                                            </button>
                                        )}
                                    </div>
                                    <div
                                        className={`volt-coupon__feedback${couponFeedback.ok === true ? " is-ok" : couponFeedback.ok === false ? " is-error" : ""}`}
                                        role="status"
                                    >
                                        {couponFeedback.text}
                                    </div>
                                </div>

                                <h6 className="text-uppercase small mb-2" style={{ color: "#c1121f" }}>Envío</h6>
                                <div className="volt-summary-ship" id="checkoutSummaryShipping">
                                    {shippingOption && (
                                        <>
                                            {SHIPPING_LABELS[shippingOption]}
                                            {"\n"}
                                            {shippingOption === "cordoba"
                                                ? `Costo fijo de envío: ${formatMoney(SHIPPING_CONFIG.cordoba.cost)}${mode === "mp" ? " (incluido en el total de Mercado Pago)" : ""}.\n`
                                                : `El costo de envío se coordina por WhatsApp según tu destino.\n${address ? `\nDirección:\n${address.street}\n${address.city}, ${address.province}\nCP ${address.postalCode}\n` : ""}`}
                                            {`\n\nContacto: ${customer.name} · DNI ${customer.dni} · ${customer.phone} · ${customer.email}`}
                                        </>
                                    )}
                                </div>

                                {mode === "transfer" && (
                                    <div className="volt-bank-panel" id="checkoutBankPanel">
                                        <div className="volt-bank-panel__title">Datos para la transferencia</div>
                                        <div className="volt-bank-panel__row"><span className="volt-bank-panel__key">Banco</span><span className="volt-bank-panel__val">{TRANSFER_BANK.banco}</span></div>
                                        <div className="volt-bank-panel__row"><span className="volt-bank-panel__key">Cuenta</span><span className="volt-bank-panel__val">{TRANSFER_BANK.cuenta}</span></div>
                                        <div className="volt-bank-panel__row"><span className="volt-bank-panel__key">CBU</span><span className="volt-bank-panel__val">{TRANSFER_BANK.cbu}</span></div>
                                        <div className="volt-bank-panel__row"><span className="volt-bank-panel__key">Alias</span><span className="volt-bank-panel__val volt-bank-panel__alias">{TRANSFER_BANK.alias}</span></div>
                                        <div className="volt-bank-panel__row"><span className="volt-bank-panel__key">Titular</span><span className="volt-bank-panel__val">{TRANSFER_BANK.titular}</span></div>
                                        <div className="volt-bank-panel__row"><span className="volt-bank-panel__key">Documento</span><span className="volt-bank-panel__val">{TRANSFER_BANK.cuit}</span></div>
                                        <p className="volt-bank-panel__note">Realizá la transferencia y envianos el comprobante por WhatsApp. Te confirmamos el pedido por email a la brevedad.</p>
                                    </div>
                                )}
                                {mode === "mp" && (
                                    <p className="volt-mp-trust" id="checkoutMpTrust">
                                        Pagos seguros. Mercado Pago procesa el cobro y la seguridad de tu transacción.
                                    </p>
                                )}

                                {payError && <p className="volt-checkout-error" role="alert">{payError}</p>}
                            </div>
                        </div>
                        <div className="modal-footer flex-wrap gap-2">
                            <button type="button" className="btn btn-outline-light btn-sm" disabled={submitting} onClick={close}>
                                Cancelar
                            </button>
                            <div className="ms-auto d-flex flex-wrap gap-2">
                                {step > 1 && (
                                    <button type="button" className="btn btn-outline-secondary btn-sm" disabled={submitting} onClick={handleBack}>
                                        Atrás
                                    </button>
                                )}
                                {step < 3 && (
                                    <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        onClick={() => (step === 1 ? handleStep1Continue() : handleStep2Continue())}
                                    >
                                        Continuar
                                    </button>
                                )}
                                {step === 3 && (
                                    <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        id="customerDataConfirm"
                                        disabled={submitting}
                                        onClick={handlePay}
                                    >
                                        {submitting
                                            ? "Generando..."
                                            : mode === "transfer"
                                                ? "CONFIRMAR Y ENVIAR COMPROBANTE"
                                                : "IR A PAGAR CON MERCADO PAGO"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
