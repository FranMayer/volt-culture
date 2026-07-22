"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { adminFetchBlob, adminFetchJson } from "@/lib/admin/api-client";
import { needsAddressShipping } from "@/lib/admin/order-shipping.js";
import { splitStreet, buildBulto, hasAndreaniShipment } from "@/lib/admin/despacho.js";
import type { Order } from "@/lib/types";

type AdminOrder = Order & { id: string };

function toDate(value: unknown): Date | null {
    const ts = value as { toDate?: () => Date } | undefined;
    return typeof ts?.toDate === "function" ? ts.toDate() : null;
}

/** legacy needsDespacho() — solo pedidos pagados/enviados con envío a domicilio (Andreani/Correo). */
function needsDespacho(order: AdminOrder): boolean {
    return (order.status === "paid" || order.status === "shipped") && needsAddressShipping(order.shipping);
}

/**
 * components/admin/DespachosTab.tsx — port de legacy/js/admin-despachos.js.
 * Crea la orden de envío Andreani (idempotente vía hasAndreaniShipment: si ya
 * tiene numeroDeEnvio la fila no ofrece "Generar", solo "Ver etiqueta" — el
 * endpoint es idempotente igual, esto evita el request de más) y descarga la
 * etiqueta PDF. Sin credenciales Andreani en el entorno (decisión del
 * usuario, F9) ambas acciones van a fallar contra el upstream real — el error
 * se muestra con alert() (mismo UX que legacy) sin romper el resto del panel.
 */
export default function DespachosTab() {
    const [despachos, setDespachos] = useState<AdminOrder[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoadError(null);
            const snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200)));
            const list: AdminOrder[] = [];
            snap.forEach((d) => {
                const order = { id: d.id, ...(d.data() as Order) } as AdminOrder;
                if (needsDespacho(order)) list.push(order);
            });
            setDespachos(list);
        } catch (err) {
            console.error("Error al cargar despachos:", err);
            setLoadError((err as Error).message);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleGenerar(order: AdminOrder) {
        const address = order.shipping?.address || {};
        const { calle, numero } = splitStreet(address.street);
        const destinoResumen = `${calle} ${numero}, ${address.city || "-"}, ${address.province || "-"} (CP ${address.postalCode || "-"})`;
        const confirmed = confirm(`¿Generar orden de envío Andreani para el pedido ${order.orderId || order.id}?\n\nDestino: ${destinoResumen}`);
        if (!confirmed) return;

        const body = {
            orderId: order.id,
            destinatario: {
                nombreCompleto: order.customer?.name || "",
                email: order.customer?.email || "",
                documentoNumero: order.customer?.dni || "",
                telefono: order.customer?.phone || "",
            },
            destino: {
                postal: {
                    codigoPostal: address.postalCode || "",
                    calle,
                    numero,
                    localidad: address.city || "",
                    region: address.province || "",
                },
            },
            bultos: [buildBulto(order)],
        };

        setBusyId(order.id);
        try {
            const data = await adminFetchJson<{ numeroDeEnvio: string }>("/api/crear-orden-andreani", {
                method: "POST",
                body: JSON.stringify(body),
            });
            alert(`✅ Orden Andreani generada. Número de envío: ${data.numeroDeEnvio}`);
            await load();
        } catch (err) {
            alert(`❌ No se pudo generar la orden Andreani: ${(err as Error).message}`);
        } finally {
            setBusyId(null);
        }
    }

    async function handleVerEtiqueta(numeroDeEnvio: string) {
        setBusyId(numeroDeEnvio);
        try {
            const blob = await adminFetchBlob(`/api/etiqueta-andreani?numeroAndreani=${encodeURIComponent(numeroDeEnvio)}`);
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
            // Revocamos recién después de un rato: revocarla ya mismo puede romper la
            // pestaña recién abierta si todavía está cargando el blob.
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (err) {
            alert(`❌ No se pudo obtener la etiqueta: ${(err as Error).message}`);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h2>Despachos</h2>
                <button type="button" className="refresh-btn" onClick={load}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                        <path d="M3 21v-5h5" />
                    </svg>
                    Actualizar
                </button>
            </div>

            <div className="card">
                <div className="card-header">DESPACHOS ANDREANI</div>
                <div className="card-body">
                    <div className="table-responsive">
                        <table className="table table-hover">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Order</th>
                                    <th>Cliente</th>
                                    <th>Destino</th>
                                    <th>Estado despacho</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {despachos === null && !loadError && (
                                    <tr>
                                        <td colSpan={6} className="text-center py-4">
                                            Cargando...
                                        </td>
                                    </tr>
                                )}
                                {loadError && (
                                    <tr>
                                        <td colSpan={6} className="orders-empty">
                                            <p>Error al cargar despachos</p>
                                            <small style={{ color: "rgba(255,255,255,0.3)" }}>{loadError}</small>
                                        </td>
                                    </tr>
                                )}
                                {despachos !== null && !loadError && despachos.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="orders-empty">
                                            <p>No hay despachos pendientes</p>
                                        </td>
                                    </tr>
                                )}
                                {despachos?.map((order) => {
                                    const created = toDate(order.createdAt);
                                    const address = order.shipping?.address || {};
                                    const numeroDeEnvio = order.shipping?.andreani?.numeroDeEnvio;
                                    const shipped = hasAndreaniShipment(order);
                                    return (
                                        <tr key={order.id}>
                                            <td style={{ whiteSpace: "nowrap" }}>{created ? created.toLocaleString("es-AR") : "-"}</td>
                                            <td>
                                                <small>{order.orderId || order.id}</small>
                                            </td>
                                            <td>
                                                <strong>{order.customer?.name || "Cliente"}</strong>
                                                <br />
                                                <small style={{ color: "rgba(255,255,255,0.5)" }}>{order.customer?.email || "-"}</small>
                                            </td>
                                            <td>
                                                {address.city || "-"}, {address.province || "-"} — CP {address.postalCode || "-"}
                                            </td>
                                            <td>
                                                {shipped ? (
                                                    <>
                                                        <small>Nº {numeroDeEnvio}</small>
                                                        <br />
                                                        <a
                                                            href={`https://www.andreani.com/#!/informacionEnvio/${encodeURIComponent(numeroDeEnvio!)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            Ver tracking
                                                        </a>
                                                    </>
                                                ) : (
                                                    <span className="order-status status-pending">Pendiente de despacho</span>
                                                )}
                                            </td>
                                            <td>
                                                {shipped ? (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-detail"
                                                        disabled={busyId === numeroDeEnvio}
                                                        onClick={() => handleVerEtiqueta(numeroDeEnvio!)}
                                                    >
                                                        {busyId === numeroDeEnvio ? "Abriendo..." : "Ver etiqueta"}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-volt"
                                                        disabled={busyId === order.id}
                                                        onClick={() => handleGenerar(order)}
                                                    >
                                                        {busyId === order.id ? "Generando..." : "Generar orden Andreani"}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
