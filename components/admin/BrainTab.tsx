"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
    ESTADOS_PAGADOS,
    PREFIJO_ORDEN,
    calcularModo,
    crearEvento,
    derivarEstado,
    esDeOrden,
    eventoDesdeOrden,
    fmtARS,
} from "@/lib/brain/engine.js";
import "@/app/styles/brain.css";

/**
 * components/admin/BrainTab.tsx — VOLT Brain dentro del panel admin.
 *
 * Los eventos son la única fuente de verdad: `brain_eventos` guarda movimientos
 * y todo lo demás (capital, totales, métricas del mes, modo) lo deriva
 * lib/brain/engine.js en cada render. Nada de contadores persistidos — borrar un
 * evento revierte su impacto exacto sin lógica de "deshacer".
 *
 * Las ventas de la tienda no se tipean: "Importar ventas" copia cada orden
 * pagada a un evento con doc id `order_<orderId>`, lo que hace el import
 * idempotente (mismo id ⇒ setDoc pisa, no duplica) y permite además que una
 * corrección en la orden se propague al volver a importar. Como el import los
 * revive, esos eventos no se pueden borrar desde acá: se corrigen en Pedidos.
 * Lo de afuera de la web (feria, transferencia a mano) entra por el formulario.
 */

type BrainEvento = {
    id: string;
    timestamp: number;
    tipo: "venta" | "gasto" | "marketing";
    detalle: string;
    deltaCapital: number;
};

type TipoEvento = BrainEvento["tipo"];

const TIPOS: { id: TipoEvento; label: string }[] = [
    { id: "venta", label: "Venta" },
    { id: "gasto", label: "Gasto" },
    { id: "marketing", label: "Marketing" },
];

/** Hoy en horario local — `toISOString()` da UTC y a la tarde en Argentina
 *  (UTC-3) devolvería mañana. */
function hoyLocal(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
}

const formInicial = () => ({
    venta: { descripcion: "", monto: "", medioPago: "Transferencia", fecha: hoyLocal() },
    gasto: { categoria: "Producción", descripcion: "", monto: "", fecha: hoyLocal() },
    marketing: { tipo: "Influencer", descripcion: "", alcance: "", inversion: "", fecha: hoyLocal() },
});

/** Timestamp de Firestore | Date | número → epoch ms. El motor hace
 *  `new Date(ev.timestamp)`, así que todo se normaliza a número antes de entrar. */
function aMillis(valor: unknown): number | null {
    if (typeof valor === "number") return valor;
    if (valor instanceof Date) return valor.getTime();
    const ts = valor as { toMillis?: () => number } | null;
    if (ts && typeof ts.toMillis === "function") return ts.toMillis();
    return null;
}

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
    return (
        <svg
            className="ico"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

const IconWallet = (
    <Icon size={18}>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </Icon>
);
const IconDown = (
    <Icon size={18}>
        <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
        <polyline points="16 17 22 17 22 11" />
    </Icon>
);
const IconUp = (
    <Icon size={18}>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
    </Icon>
);
const IconCart = (
    <Icon size={18}>
        <circle cx="8" cy="21" r="1" />
        <circle cx="19" cy="21" r="1" />
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </Icon>
);

export default function BrainTab() {
    const [eventos, setEventos] = useState<BrainEvento[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [tipo, setTipo] = useState<TipoEvento>("venta");
    const [form, setForm] = useState(formInicial);
    const [guardando, setGuardando] = useState(false);
    const [importando, setImportando] = useState(false);

    // Sin `eventos === null` el dashboard mostraría capital $0 y "modo ahorro"
    // por un instante antes del primer snapshot — un parpadeo feo cada vez que
    // se abre la solapa.
    useEffect(() => {
        const q = query(collection(db, "brain_eventos"), orderBy("timestamp", "desc"));
        return onSnapshot(
            q,
            (snap) => {
                setEventos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BrainEvento));
                setError(null);
            },
            (err) => {
                console.error("Error al leer brain_eventos:", err);
                setError(err.message);
                setEventos([]);
            },
        );
    }, []);

    const lista = eventos ?? [];
    const estado = useMemo(() => derivarEstado(lista), [lista]);
    const { modo, recomendaciones } = useMemo(() => calcularModo(estado), [estado]);
    const balanceMes = estado.ingresosMes - estado.egresosMes;

    const datos = form[tipo] as Record<string, string>;
    const set = (campo: string, valor: string) =>
        setForm((f) => ({ ...f, [tipo]: { ...f[tipo], [campo]: valor } }));

    const registrar = async (e: FormEvent) => {
        e.preventDefault();
        setGuardando(true);
        setError(null);
        setAviso(null);
        try {
            await addDoc(collection(db, "brain_eventos"), crearEvento(tipo, datos));
            setForm((f) => ({ ...f, [tipo]: formInicial()[tipo] }));
            setAviso("Evento registrado");
        } catch (err) {
            console.error("Error al registrar evento:", err);
            setError((err as Error).message);
        } finally {
            setGuardando(false);
        }
    };

    const borrar = useCallback(async (ev: BrainEvento) => {
        if (!confirm(`¿Borrar "${ev.detalle}"?`)) return;
        try {
            await deleteDoc(doc(db, "brain_eventos", ev.id));
        } catch (err) {
            console.error("Error al borrar evento:", err);
            setError((err as Error).message);
        }
    }, []);

    const importarVentas = async () => {
        setImportando(true);
        setError(null);
        setAviso(null);
        try {
            const snap = await getDocs(
                query(collection(db, "orders"), where("status", "in", ESTADOS_PAGADOS)),
            );
            const yaCargados = new Set(lista.map((ev) => ev.id));
            let nuevas = 0;
            let sinFecha = 0;

            // ponytail: un setDoc por orden, en serie. Con decenas de órdenes es
            // instantáneo; si algún día son miles, pasar a writeBatch (500 por lote).
            for (const d of snap.docs) {
                const orden = d.data() as Record<string, unknown>;
                const orderId = String(orden.orderId || d.id);
                const timestamp = aMillis(orden.paidAt) ?? aMillis(orden.createdAt);
                // Sin fecha no hay forma de ubicarla en un mes: mejor saltearla y
                // avisar que meterla con la fecha de hoy y ensuciar el balance.
                if (timestamp === null) {
                    sinFecha++;
                    continue;
                }
                const id = `${PREFIJO_ORDEN}${orderId}`;
                if (!yaCargados.has(id)) nuevas++;
                await setDoc(
                    doc(db, "brain_eventos", id),
                    eventoDesdeOrden({ ...orden, orderId, timestamp }),
                );
            }

            setAviso(
                `${snap.size} órdenes pagadas · ${nuevas} nuevas` +
                    (sinFecha ? ` · ${sinFecha} salteadas sin fecha` : ""),
            );
        } catch (err) {
            console.error("Error al importar ventas:", err);
            setError((err as Error).message);
        } finally {
            setImportando(false);
        }
    };

    const exportar = () => {
        const blob = new Blob([JSON.stringify(lista, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `volt-brain-${hoyLocal()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (eventos === null) {
        return <p className="brain-empty">Cargando eventos…</p>;
    }

    return (
        <div className="brain">
            <div className="brain-head">
                <div className="brain-head__titles">
                    <h2>VOLT BRAIN</h2>
                    <p>Panel de control interno — los eventos son la única fuente de verdad</p>
                </div>
                <div className="brain-head__actions">
                    <button
                        type="button"
                        className="brain-btn brain-btn--ghost"
                        onClick={importarVentas}
                        disabled={importando}
                    >
                        {importando ? "Importando…" : "Importar ventas"}
                    </button>
                    <button type="button" className="brain-btn brain-btn--ghost" onClick={exportar}>
                        Exportar JSON
                    </button>
                    <span className={`brain-mode brain-mode--${modo}`}>
                        <span className="brain-mode__dot" />
                        Modo {modo.toLowerCase()}
                    </span>
                </div>
            </div>

            {error && <div className="brain-msg brain-msg--err">{error}</div>}
            {aviso && <div className="brain-msg brain-msg--ok">{aviso}</div>}

            <div className="brain-metrics">
                <Metric
                    label="Capital disponible"
                    value={fmtARS(estado.capital)}
                    icon={IconWallet}
                    tone={estado.capital >= 0 ? "pos" : "neg"}
                    sub="vendido menos gastado, desde el día 1"
                />
                <Metric
                    label="Total invertido"
                    value={fmtARS(estado.totalGastado)}
                    icon={IconDown}
                    sub="todo lo que salió, acumulado"
                />
                <Metric
                    label="Total vendido"
                    value={fmtARS(estado.totalVendido)}
                    icon={IconCart}
                    sub={`${estado.ventas} ventas · ${estado.ventasMes} este mes`}
                />
                <Metric
                    label="Balance del mes"
                    value={fmtARS(balanceMes)}
                    icon={IconUp}
                    tone={balanceMes >= 0 ? "pos" : "neg"}
                    sub="ingresos menos egresos del mes en curso"
                />
            </div>

            <div className="brain-row">
                <section className="brain-card">
                    <h3 className="brain-card__title">REGISTRAR EVENTO</h3>

                    <div className="brain-seg" role="tablist">
                        {TIPOS.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={tipo === t.id}
                                className={`brain-seg__btn${tipo === t.id ? " active" : ""}`}
                                onClick={() => setTipo(t.id)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <form className="brain-form" onSubmit={registrar}>
                        {tipo === "venta" && (
                            <>
                                <Field label="Qué vendiste" htmlFor="b-desc">
                                    <input
                                        id="b-desc"
                                        type="text"
                                        required
                                        placeholder="Ej: 2 remeras TC a Martín"
                                        value={datos.descripcion}
                                        onChange={(e) => set("descripcion", e.target.value)}
                                    />
                                </Field>
                                <Field label="Monto total (ARS)" htmlFor="b-monto">
                                    <input
                                        id="b-monto"
                                        type="number"
                                        min="1"
                                        required
                                        value={datos.monto}
                                        onChange={(e) => set("monto", e.target.value)}
                                    />
                                </Field>
                                <Field label="Medio de pago" htmlFor="b-medio">
                                    <select
                                        id="b-medio"
                                        value={datos.medioPago}
                                        onChange={(e) => set("medioPago", e.target.value)}
                                    >
                                        {["Transferencia", "Mercado Pago", "Efectivo"].map((o) => (
                                            <option key={o} value={o}>{o}</option>
                                        ))}
                                    </select>
                                </Field>
                            </>
                        )}

                        {tipo === "gasto" && (
                            <>
                                <Field label="Categoría" htmlFor="b-cat">
                                    <select
                                        id="b-cat"
                                        value={datos.categoria}
                                        onChange={(e) => set("categoria", e.target.value)}
                                    >
                                        {["Producción", "Insumos", "Packaging", "Diseño", "Equipamiento", "Otro"].map((o) => (
                                            <option key={o} value={o}>{o}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Descripción" htmlFor="b-desc">
                                    <input
                                        id="b-desc"
                                        type="text"
                                        required
                                        value={datos.descripcion}
                                        onChange={(e) => set("descripcion", e.target.value)}
                                    />
                                </Field>
                                <Field label="Monto (ARS)" htmlFor="b-monto">
                                    <input
                                        id="b-monto"
                                        type="number"
                                        min="1"
                                        required
                                        value={datos.monto}
                                        onChange={(e) => set("monto", e.target.value)}
                                    />
                                </Field>
                            </>
                        )}

                        {tipo === "marketing" && (
                            <>
                                <Field label="Tipo" htmlFor="b-mtipo">
                                    <select
                                        id="b-mtipo"
                                        value={datos.tipo}
                                        onChange={(e) => set("tipo", e.target.value)}
                                    >
                                        {["Influencer", "Ad de Instagram", "Promo", "Otro"].map((o) => (
                                            <option key={o} value={o}>{o}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Descripción" htmlFor="b-desc">
                                    <input
                                        id="b-desc"
                                        type="text"
                                        required
                                        value={datos.descripcion}
                                        onChange={(e) => set("descripcion", e.target.value)}
                                    />
                                </Field>
                                <Field label="Alcance estimado (opcional)" htmlFor="b-alcance">
                                    <input
                                        id="b-alcance"
                                        type="number"
                                        min="0"
                                        value={datos.alcance}
                                        onChange={(e) => set("alcance", e.target.value)}
                                    />
                                </Field>
                                <Field label="Inversión ARS (opcional)" htmlFor="b-inv">
                                    <input
                                        id="b-inv"
                                        type="number"
                                        min="0"
                                        value={datos.inversion}
                                        onChange={(e) => set("inversion", e.target.value)}
                                    />
                                </Field>
                            </>
                        )}

                        {/* Fecha manual: sin esto todo entra con Date.now() y cargar algo
                            de un mes pasado desvirtúa el balance mensual. */}
                        <Field label="Fecha" htmlFor="b-fecha">
                            <input
                                id="b-fecha"
                                type="date"
                                required
                                max={hoyLocal()}
                                value={datos.fecha}
                                onChange={(e) => set("fecha", e.target.value)}
                            />
                        </Field>

                        <button
                            type="submit"
                            className="brain-btn brain-btn--primary brain-btn--block"
                            disabled={guardando}
                        >
                            {guardando ? "Guardando…" : "Registrar"}
                        </button>
                    </form>
                </section>

                <section className="brain-card">
                    <h3 className="brain-card__title">RECOMENDACIONES</h3>
                    {lista.length === 0 ? (
                        <p className="brain-empty">Cargá tu primer evento para ver recomendaciones</p>
                    ) : (
                        <ul className="brain-recos">
                            {recomendaciones.map((r: string) => (
                                <li key={r}>
                                    <Icon size={14}>
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                    </Icon>
                                    <span>{r}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            <section className="brain-card">
                <h3 className="brain-card__title">LOG DE EVENTOS</h3>
                {lista.length === 0 ? (
                    <p className="brain-empty">Sin eventos registrados</p>
                ) : (
                    <div className="brain-log-scroll">
                        <table className="brain-log">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Tipo</th>
                                    <th>Detalle</th>
                                    <th style={{ textAlign: "right" }}>Impacto</th>
                                    <th aria-label="Acciones" />
                                </tr>
                            </thead>
                            <tbody>
                                {lista.slice(0, 50).map((ev) => {
                                    const deOrden = esDeOrden(ev.id);
                                    return (
                                        <tr key={ev.id}>
                                            <td className="brain-log__date">
                                                {new Date(ev.timestamp).toLocaleDateString("es-AR", {
                                                    day: "2-digit",
                                                    month: "2-digit",
                                                    year: "2-digit",
                                                })}
                                            </td>
                                            <td>
                                                <span className={`brain-tag brain-tag--${ev.tipo}`}>
                                                    {ev.tipo.charAt(0).toUpperCase() + ev.tipo.slice(1)}
                                                </span>
                                            </td>
                                            <td>
                                                {ev.detalle}
                                                {deOrden && <span className="brain-log__origin">tienda</span>}
                                            </td>
                                            <td
                                                className={`brain-log__amount${
                                                    ev.deltaCapital > 0 ? " brain-pos" : ev.deltaCapital < 0 ? " brain-neg" : ""
                                                }`}
                                            >
                                                {ev.deltaCapital === 0
                                                    ? "—"
                                                    : `${ev.deltaCapital > 0 ? "+" : "-"}${fmtARS(Math.abs(ev.deltaCapital))}`}
                                            </td>
                                            <td style={{ textAlign: "right" }}>
                                                {/* Los importados no se borran: el próximo import los revive.
                                                    Se corrigen en la solapa Pedidos. */}
                                                {!deOrden && (
                                                    <button
                                                        type="button"
                                                        className="brain-del"
                                                        aria-label={`Borrar evento: ${ev.detalle}`}
                                                        title="Borrar"
                                                        onClick={() => borrar(ev)}
                                                    >
                                                        <Icon size={14}>
                                                            <path d="M3 6h18" />
                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                            <path d="M10 11v6M14 11v6" />
                                                        </Icon>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

function Metric({
    label,
    value,
    icon,
    sub,
    tone,
}: {
    label: string;
    value: string;
    icon: ReactNode;
    sub: string;
    tone?: "pos" | "neg";
}) {
    return (
        <div className="brain-metric">
            <div className="brain-metric__top">
                <span className="brain-label">{label}</span>
                <span className="brain-metric__icon">{icon}</span>
            </div>
            <div className={`brain-metric__value${tone ? ` brain-${tone}` : ""}`}>{value}</div>
            <div className="brain-metric__sub">{sub}</div>
        </div>
    );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
    return (
        <div className="brain-field">
            <label className="brain-label" htmlFor={htmlFor}>
                {label}
            </label>
            {children}
        </div>
    );
}
