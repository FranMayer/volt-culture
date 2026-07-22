"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { needsAddressShipping, buildShippingLines, shippingPlainText } from "@/lib/admin/order-shipping.js";
import type { Order, OrderStatus } from "@/lib/types";

type AdminOrder = Order & { id: string };

const STATUS_LABELS: Record<string, string> = {
    pending: "Pendiente",
    pending_payment: "Pendiente pago",
    pending_transfer: "Pendiente transferencia",
    paid: "Pagado",
    shipped: "Enviado",
    delivered: "Entregado",
    failed: "Fallido",
    mp_error: "Error MP",
    cancelled: "Cancelado",
};

const STATUS_CLASSES: Record<string, string> = {
    pending: "status-pending",
    pending_payment: "status-pending-payment",
    pending_transfer: "status-pending-transfer",
    paid: "status-paid",
    shipped: "status-shipped",
    delivered: "status-delivered",
    failed: "status-failed",
    mp_error: "status-mp-error",
    cancelled: "status-cancelled",
};

const MANUAL_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
    { value: "paid", label: "Pagado" },
    { value: "shipped", label: "Enviado" },
    { value: "delivered", label: "Entregado" },
    { value: "cancelled", label: "Cancelado" },
    { value: "pending_payment", label: "Pago pendiente" },
];

function statusLabel(status?: string) {
    return STATUS_LABELS[status || ""] || status || "Desconocido";
}
function statusClass(status?: string) {
    return STATUS_CLASSES[status || ""] || "status-pending";
}

/**
 * components/admin/OrderDetailModal.tsx — port de openOrderDetail() +
 * saveOrderStatusBtn/syncShippedTrackingPanel (legacy/js/admin-orders.js).
 * Modal propio (mount/unmount condicional, scroll-lock + Escape + backdrop),
 * mismo patrón que ProductFormModal.tsx. Los datos de envío se renderizan
 * como JSX vía lib/admin/order-shipping.js (no dangerouslySetInnerHTML — ver
 * el comentario de ese archivo).
 */
export default function OrderDetailModal({
    orderId,
    onClose,
    onStatusChanged,
}: {
    orderId: string;
    onClose: () => void;
    onStatusChanged: (orderId: string, status: OrderStatus, trackingNumber: string) => Promise<void>;
}) {
    const [order, setOrder] = useState<AdminOrder | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [manualStatus, setManualStatus] = useState<OrderStatus>("paid");
    const [trackingInput, setTrackingInput] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const snap = await getDoc(doc(db, "orders", orderId));
            if (cancelled) return;
            if (!snap.exists()) {
                setNotFound(true);
                return;
            }
            const data = { id: snap.id, ...(snap.data() as Order) } as AdminOrder;
            setOrder(data);
            setManualStatus(
                (MANUAL_STATUS_OPTIONS.some((o) => o.value === data.status) ? data.status : "paid") as OrderStatus
            );
            setTrackingInput(data.shipping?.trackingNumber || "");
        })();
        return () => {
            cancelled = true;
        };
    }, [orderId]);

    // Scroll-lock + Escape, mismo patrón que ProductFormModal/AuthModal.
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleCopyShipping() {
        if (!order) return;
        const items = (order.items || []).map((i) => `- ${i.title} x${i.quantity}`).join("\n");
        const text = [
            `Nombre: ${order.customer?.name || "-"}`,
            `DNI: ${order.customer?.dni || "-"}`,
            `Telefono: ${order.customer?.phone || "-"}`,
            `Email: ${order.customer?.email || "-"}`,
            shippingPlainText(order),
            "",
            "Productos:",
            items,
        ].join("\n");
        await navigator.clipboard.writeText(text);
        alert("✅ Datos de envío copiados");
    }

    async function handleSaveStatus() {
        if (!order) return;
        const ship = order.shipping || {};
        const needsAddress = needsAddressShipping(ship);
        const trackingNumber = manualStatus === "shipped" && needsAddress ? trackingInput.trim() : "";
        setSaving(true);
        try {
            await onStatusChanged(order.id, manualStatus, trackingNumber);
            onClose();
        } catch (err) {
            alert(`❌ No se pudo actualizar el estado: ${(err as Error).message}`);
        } finally {
            setSaving(false);
        }
    }

    const ship = order?.shipping || {};
    const needsAddress = needsAddressShipping(ship);
    const isCordoba = ship.type === "cordoba";
    const showTrackingInput = manualStatus === "shipped" && needsAddress && !isCordoba;
    const showCordobaHint = manualStatus === "shipped" && isCordoba;
    const isTransfer = order?.paymentMethod === "transfer";

    return (
        <>
            <div className="modal-backdrop show" onClick={onClose} aria-hidden="true" />
            <div className="modal fade show" id="orderDetailModal" role="dialog" aria-modal="true">
                <div className="modal-dialog modal-xl modal-dialog-scrollable">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">DETALLE DE ORDEN</h5>
                            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose} />
                        </div>
                        <div className="modal-body">
                            {notFound && <p>No se encontró la orden.</p>}
                            {!order && !notFound && <p>Cargando...</p>}
                            {order && (
                                <>
                                    <p>
                                        <strong>Order:</strong> {order.orderId || order.id}
                                    </p>
                                    <p>
                                        <strong>Cliente:</strong> {order.customer?.name || "-"}
                                        <br />
                                        <strong>Email:</strong> {order.customer?.email || "-"}
                                        <br />
                                        <strong>Tel:</strong> {order.customer?.phone || "-"}
                                        <br />
                                        <strong>DNI:</strong> {order.customer?.dni || "-"}
                                        <br />
                                        {buildShippingLines(order).map((line, idx) => (
                                            <span key={idx}>
                                                {line.label && <strong>{line.label}: </strong>}
                                                {line.trackingUrl ? (
                                                    <a href={line.trackingUrl} target="_blank" rel="noopener noreferrer">
                                                        {line.text}
                                                    </a>
                                                ) : (
                                                    <span style={line.muted ? { color: "rgba(255,255,255,0.5)" } : undefined}>
                                                        {line.text}
                                                    </span>
                                                )}
                                                <br />
                                            </span>
                                        ))}
                                    </p>

                                    {isTransfer ? (
                                        <p>
                                            <strong>Pago:</strong> Transferencia bancaria
                                            {order.discountPercent ? (
                                                <span style={{ color: "#f5a623" }}> (−{order.discountPercent}% aplicado)</span>
                                            ) : null}
                                        </p>
                                    ) : order.paymentMethod === "mercadopago" || order.paymentId ? (
                                        <p>
                                            <strong>Pago:</strong> Mercado Pago
                                            {order.paymentId ? (
                                                <small style={{ color: "rgba(255,255,255,0.5)" }}> #{String(order.paymentId)}</small>
                                            ) : null}
                                        </p>
                                    ) : null}

                                    <ul style={{ paddingLeft: 18 }}>
                                        {(order.items || []).map((item, idx) => (
                                            <li key={idx} style={{ marginBottom: 8 }}>
                                                {item.image && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={item.image}
                                                        alt=""
                                                        style={{ width: 46, height: 46, objectFit: "cover", border: "1px solid #44464c", marginRight: 8 }}
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = "none";
                                                        }}
                                                    />
                                                )}
                                                {item.title} {item.variantColor ? `| ${item.variantColor}` : ""} {item.variantSize ? `| ${item.variantSize}` : ""} x
                                                {item.quantity} - ${Number(item.price || 0).toLocaleString("es-AR")}
                                            </li>
                                        ))}
                                    </ul>

                                    {isTransfer && Number.isFinite(Number(order.subtotal)) ? (
                                        <>
                                            <p style={{ marginBottom: 4 }}>
                                                <strong>Subtotal:</strong> ${Number(order.subtotal || 0).toLocaleString("es-AR")}
                                            </p>
                                            <p style={{ marginBottom: 4, color: "#f5a623" }}>
                                                <strong>Descuento transferencia:</strong> −${Number(order.discountAmount || 0).toLocaleString("es-AR")}
                                            </p>
                                            <p>
                                                <strong>Total a transferir:</strong> ${Number(order.total || 0).toLocaleString("es-AR")}
                                            </p>
                                        </>
                                    ) : (
                                        <p>
                                            <strong>Total:</strong> ${Number(order.total || 0).toLocaleString("es-AR")}
                                        </p>
                                    )}

                                    <p>
                                        <strong>Estado:</strong>{" "}
                                        <span className={`order-status ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>
                                    </p>

                                    {order.status === "pending_transfer" && (
                                        <div
                                            style={{
                                                margin: "8px 0 12px 0",
                                                padding: "10px 12px",
                                                background: "rgba(245,166,35,0.08)",
                                                border: "1px solid rgba(245,166,35,0.35)",
                                                fontSize: "0.85rem",
                                                color: "#f5a623",
                                            }}
                                        >
                                            Esperando comprobante de transferencia. Al marcar <strong>Pagado</strong> se descuenta el
                                            stock y se notifica al cliente.
                                        </div>
                                    )}

                                    <div className="d-flex gap-2 align-items-center">
                                        <select
                                            className="form-select form-select-sm"
                                            style={{ width: "auto" }}
                                            value={manualStatus}
                                            onChange={(e) => setManualStatus(e.target.value as OrderStatus)}
                                        >
                                            {MANUAL_STATUS_OPTIONS.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                        <button type="button" className="btn btn-volt btn-sm" onClick={handleSaveStatus} disabled={saving}>
                                            {saving ? "Guardando..." : "Actualizar estado"}
                                        </button>
                                    </div>

                                    {showTrackingInput && (
                                        <div className="shipped-tracking-panel mt-3">
                                            <p className="small text-secondary mb-2">
                                                Opcional pero recomendado: el cliente lo recibirá por email con link de seguimiento en
                                                Andreani.
                                            </p>
                                            <label className="form-label" htmlFor="andreaniTrackingInput">
                                                Número de tracking Andreani
                                            </label>
                                            <input
                                                type="text"
                                                className="form-control form-control-sm"
                                                id="andreaniTrackingInput"
                                                placeholder="Ej: 1234567890"
                                                autoComplete="off"
                                                value={trackingInput}
                                                onChange={(e) => setTrackingInput(e.target.value)}
                                            />
                                        </div>
                                    )}
                                    {showCordobaHint && (
                                        <div className="shipped-tracking-panel mt-3">
                                            <p className="small mb-0" style={{ color: "rgba(255,255,255,0.65)" }}>
                                                Entrega local — coordinar por WhatsApp
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline-volt" onClick={handleCopyShipping} disabled={!order}>
                                Copiar datos de envío
                            </button>
                            <button type="button" className="btn btn-outline-volt" onClick={onClose}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
