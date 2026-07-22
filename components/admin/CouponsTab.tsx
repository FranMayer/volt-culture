"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { normalizeCouponCode, isCouponValid } from "@/lib/server/coupons.js";
import type { Coupon } from "@/lib/types";

type AdminCoupon = Coupon & { id: string };

/** Etiqueta de estado a partir de isCouponValid (lib/server/coupons.js, ya
 *  testeada en tests/coupons.test.mjs) — a diferencia de legacy (que solo
 *  mostraba Activo/Inactivo según el flag `active`), acá el estado refleja
 *  vencimiento y agotamiento de usos también, como pide la tarea. */
function couponStatusLabel(c: Coupon): string {
    const { valid, reason } = isCouponValid(c);
    if (valid) return "Válido";
    switch (reason) {
        case "expired":
            return "Expirado";
        case "exhausted":
            return "Agotado";
        case "inactive":
            return "Inactivo";
        default:
            return "Inválido";
    }
}

/**
 * components/admin/CouponsTab.tsx — port de legacy/js/admin-coupons.js
 * (CRUD directo a Firestore `coupons`, doc id = código normalizado). Mismo
 * shape que valida lib/server/coupons.js (checkout, F7).
 */
export default function CouponsTab() {
    const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [code, setCode] = useState("");
    const [percent, setPercent] = useState("");
    const [maxUses, setMaxUses] = useState("");
    const [expires, setExpires] = useState("");

    const load = useCallback(async () => {
        try {
            setLoadError(null);
            const snap = await getDocs(query(collection(db, "coupons"), orderBy("createdAt", "desc")));
            const list: AdminCoupon[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Coupon) }));
            setCoupons(list);
        } catch (err) {
            console.error("Error al cargar cupones:", err);
            setLoadError((err as Error).message);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleCreate(e: FormEvent) {
        e.preventDefault();
        const normalized = normalizeCouponCode(code);
        const percentValue = Number(percent);
        if (!normalized) {
            alert("Ingresá un código.");
            return;
        }
        if (!Number.isInteger(percentValue) || percentValue < 1 || percentValue > 100) {
            alert("El % debe ser un entero entre 1 y 100.");
            return;
        }
        const maxUsesValue = Number(maxUses);
        const maxUsesFinal = Number.isInteger(maxUsesValue) && maxUsesValue > 0 ? maxUsesValue : null;

        setCreating(true);
        try {
            await setDoc(doc(db, "coupons", normalized), {
                code: normalized,
                percent: percentValue,
                active: true,
                maxUses: maxUsesFinal,
                usedCount: 0,
                expiresAt: expires ? Timestamp.fromDate(new Date(`${expires}T23:59:59`)) : null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            setCode("");
            setPercent("");
            setMaxUses("");
            setExpires("");
            await load();
        } catch (err) {
            alert(`No se pudo crear el cupón: ${(err as Error).message}`);
        } finally {
            setCreating(false);
        }
    }

    async function handleToggle(c: AdminCoupon) {
        try {
            const snap = await getDoc(doc(db, "coupons", c.id));
            if (!snap.exists()) return;
            await updateDoc(doc(db, "coupons", c.id), {
                active: !(snap.data().active === true),
                updatedAt: serverTimestamp(),
            });
            await load();
        } catch (err) {
            alert(`No se pudo actualizar el cupón: ${(err as Error).message}`);
        }
    }

    async function handleDelete(c: AdminCoupon) {
        if (!confirm(`¿Borrar el cupón ${c.id}? Esta acción es irreversible.`)) return;
        try {
            await deleteDoc(doc(db, "coupons", c.id));
            await load();
        } catch (err) {
            alert(`No se pudo borrar el cupón: ${(err as Error).message}`);
        }
    }

    return (
        <div>
            <form className="row g-2 align-items-end mb-4" style={{ maxWidth: 820 }} onSubmit={handleCreate}>
                <div className="col-12 col-sm-3">
                    <label className="form-label" htmlFor="couponCodeInput">
                        Código
                    </label>
                    <input
                        type="text"
                        className="form-control"
                        id="couponCodeInput"
                        placeholder="VOLT20"
                        autoComplete="off"
                        style={{ textTransform: "uppercase" }}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                    />
                </div>
                <div className="col-6 col-sm-2">
                    <label className="form-label" htmlFor="couponPercentInput">
                        % descuento
                    </label>
                    <input
                        type="number"
                        className="form-control"
                        id="couponPercentInput"
                        min={1}
                        max={100}
                        step={1}
                        placeholder="20"
                        value={percent}
                        onChange={(e) => setPercent(e.target.value)}
                    />
                </div>
                <div className="col-6 col-sm-2">
                    <label className="form-label" htmlFor="couponMaxUsesInput">
                        Máx. usos
                    </label>
                    <input
                        type="number"
                        className="form-control"
                        id="couponMaxUsesInput"
                        min={1}
                        step={1}
                        placeholder="∞"
                        value={maxUses}
                        onChange={(e) => setMaxUses(e.target.value)}
                    />
                </div>
                <div className="col-6 col-sm-3">
                    <label className="form-label" htmlFor="couponExpiresInput">
                        Vence (opcional)
                    </label>
                    <input
                        type="date"
                        className="form-control"
                        id="couponExpiresInput"
                        value={expires}
                        onChange={(e) => setExpires(e.target.value)}
                    />
                </div>
                <div className="col-6 col-sm-2">
                    <button type="submit" className="btn btn-danger w-100" disabled={creating}>
                        {creating ? "Creando..." : "Crear"}
                    </button>
                </div>
            </form>

            <div className="table-responsive">
                <table className="table table-hover">
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>%</th>
                            <th>Estado</th>
                            <th>Vence</th>
                            <th>Usos</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {coupons === null && !loadError && (
                            <tr>
                                <td colSpan={6}>Cargando…</td>
                            </tr>
                        )}
                        {loadError && <tr><td colSpan={6}>Error: {loadError}</td></tr>}
                        {coupons !== null && !loadError && coupons.length === 0 && (
                            <tr>
                                <td colSpan={6}>Todavía no hay cupones.</td>
                            </tr>
                        )}
                        {(coupons || []).map((c) => {
                            const active = c.active === true;
                            const expiresAt = c.expiresAt as { toDate?: () => Date } | undefined;
                            const expiresLabel = typeof expiresAt?.toDate === "function" ? expiresAt.toDate().toLocaleDateString("es-AR") : "—";
                            const usedCount = Number(c.usedCount) || 0;
                            const maxUsesValue = Number(c.maxUses);
                            const usesLabel = Number.isInteger(maxUsesValue) && maxUsesValue > 0 ? `${usedCount}/${maxUsesValue}` : `${usedCount}/∞`;
                            return (
                                <tr key={c.id}>
                                    <td>{c.code}</td>
                                    <td>{c.percent}%</td>
                                    <td>{couponStatusLabel(c)}</td>
                                    <td>{expiresLabel}</td>
                                    <td>{usesLabel}</td>
                                    <td>
                                        <div className="d-flex gap-2">
                                            <button type="button" className="btn btn-sm btn-outline-volt" onClick={() => handleToggle(c)}>
                                                {active ? "Desactivar" : "Activar"}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-sm"
                                                style={{ background: "#780000", color: "#fff", border: "none" }}
                                                onClick={() => handleDelete(c)}
                                            >
                                                Borrar
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
