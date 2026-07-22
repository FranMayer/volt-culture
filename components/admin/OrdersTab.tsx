"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { adminFetchJson } from "@/lib/admin/api-client";
import type { Order, OrderStatus } from "@/lib/types";
import OrderDetailModal from "./OrderDetailModal";

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

function statusLabel(status?: string) {
    return STATUS_LABELS[status || ""] || status || "Desconocido";
}
function statusClass(status?: string) {
    return STATUS_CLASSES[status || ""] || "status-pending";
}

function toDate(value: unknown): Date | null {
    const ts = value as { toDate?: () => Date } | undefined;
    return typeof ts?.toDate === "function" ? ts.toDate() : null;
}

/**
 * components/admin/OrdersTab.tsx — port de legacy/js/admin-orders.js
 * (loadOrders/renderOrders/updateOrderStats). limit(200) idéntico al
 * original. La mutación de estado va por pages/api/notify-status.js (POST
 * autenticado) — este componente solo dispara la llamada y refresca.
 */
export default function OrdersTab() {
    const [orders, setOrders] = useState<AdminOrder[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [detailId, setDetailId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoadError(null);
            const snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200)));
            const list: AdminOrder[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Order) }));
            setOrders(list);
        } catch (err) {
            console.error("Error al cargar pedidos:", err);
            const message = (err as Error).message || "";
            setLoadError(
                /permission/i.test(message)
                    ? "Sin permiso admin en Firestore. Cerrá sesión, ejecutá set-admin.mjs y volvé a ingresar."
                    : message
            );
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        if (!orders) return [];
        const now = new Date();
        const s = search.trim().toLowerCase();
        return orders.filter((order) => {
            if (statusFilter !== "all" && order.status !== statusFilter) return false;

            const created = toDate(order.createdAt);
            if (dateFilter !== "all" && created) {
                if (dateFilter === "today" && created.toDateString() !== now.toDateString()) return false;
                if (dateFilter === "week") {
                    const weekAgo = new Date(now);
                    weekAgo.setDate(now.getDate() - 7);
                    if (created < weekAgo) return false;
                }
                if (dateFilter === "month") {
                    const monthAgo = new Date(now);
                    monthAgo.setMonth(now.getMonth() - 1);
                    if (created < monthAgo) return false;
                }
            }

            if (s) {
                const haystack = `${order.orderId || ""} ${order.customer?.email || ""}`.toLowerCase();
                if (!haystack.includes(s)) return false;
            }
            return true;
        });
    }, [orders, statusFilter, dateFilter, search]);

    const stats = useMemo(() => {
        const all = orders || [];
        const paid = all.filter((o) => o.status === "paid");
        const pending = all.filter((o) => o.status === "pending" || o.status === "pending_payment" || o.status === "pending_transfer");
        const revenue = paid.reduce((sum, o) => sum + (o.total || 0), 0);
        return { total: all.length, approved: paid.length, pending: pending.length, revenue };
    }, [orders]);

    async function handleStatusChanged(orderId: string, status: OrderStatus, trackingNumber: string) {
        const payload: Record<string, unknown> = { orderId, status };
        if (status === "shipped") payload.trackingNumber = trackingNumber;
        await adminFetchJson("/api/notify-status", { method: "POST", body: JSON.stringify(payload) });
        await load();
    }

    return (
        <div>
            <div className="row mb-4">
                <div className="col-md-3 mb-3">
                    <div className="stats-card">
                        <h3>{stats.total}</h3>
                        <p>Total Pedidos</p>
                    </div>
                </div>
                <div className="col-md-3 mb-3">
                    <div className="stats-card">
                        <h3>{stats.approved}</h3>
                        <p>Aprobados</p>
                    </div>
                </div>
                <div className="col-md-3 mb-3">
                    <div className="stats-card">
                        <h3>{stats.pending}</h3>
                        <p>Pendientes</p>
                    </div>
                </div>
                <div className="col-md-3 mb-3">
                    <div className="stats-card">
                        <h3>${stats.revenue.toLocaleString("es-AR")}</h3>
                        <p>Ingresos Totales</p>
                    </div>
                </div>
            </div>

            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <h2>Pedidos</h2>
                <div className="d-flex gap-2 align-items-center flex-wrap">
                    <select
                        className="form-select form-select-sm"
                        style={{ width: "auto" }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">Todos los estados</option>
                        <option value="pending">Pending</option>
                        <option value="pending_payment">Pending payment</option>
                        <option value="pending_transfer">Pending transferencia</option>
                        <option value="paid">Paid</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="failed">Failed</option>
                        <option value="mp_error">MP error</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <select
                        className="form-select form-select-sm"
                        style={{ width: "auto" }}
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                    >
                        <option value="all">Todo el tiempo</option>
                        <option value="today">Hoy</option>
                        <option value="week">Esta semana</option>
                        <option value="month">Este mes</option>
                    </select>
                    <input
                        className="form-control form-control-sm"
                        style={{ width: 220 }}
                        placeholder="Buscar orderId o email"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
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
            </div>

            <div className="card">
                <div className="card-header">HISTORIAL DE PEDIDOS</div>
                <div className="card-body">
                    <div className="table-responsive">
                        <table className="table table-hover">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Order ID</th>
                                    <th>Cliente</th>
                                    <th>Productos</th>
                                    <th>Monto</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders === null && !loadError && (
                                    <tr>
                                        <td colSpan={7} className="text-center py-4">
                                            Cargando...
                                        </td>
                                    </tr>
                                )}
                                {loadError && (
                                    <tr>
                                        <td colSpan={7} className="orders-empty">
                                            <p>Error al cargar pedidos</p>
                                            <small style={{ color: "rgba(255,255,255,0.3)" }}>{loadError}</small>
                                        </td>
                                    </tr>
                                )}
                                {orders !== null && !loadError && filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="orders-empty">
                                            <p>No hay pedidos para ese filtro</p>
                                        </td>
                                    </tr>
                                )}
                                {filtered.map((order) => {
                                    const created = toDate(order.createdAt);
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
                                            <td className="order-items">
                                                {(order.items || []).map((i, idx) => (
                                                    <span key={idx}>
                                                        {i.title} x{i.quantity}
                                                        <br />
                                                    </span>
                                                ))}
                                            </td>
                                            <td className="order-amount">${(order.total || 0).toLocaleString("es-AR")}</td>
                                            <td>
                                                <span className={`order-status ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>
                                            </td>
                                            <td>
                                                <button type="button" className="btn btn-sm btn-detail" onClick={() => setDetailId(order.id)}>
                                                    Ver detalle
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {detailId && (
                <OrderDetailModal orderId={detailId} onClose={() => setDetailId(null)} onStatusChanged={handleStatusChanged} />
            )}
        </div>
    );
}
