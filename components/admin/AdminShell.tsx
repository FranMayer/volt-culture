"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// legacy admin-ui.js setupTabs()/init(): 1 tab activo a la vez, el contenido
// de las otras 3 solo se carga (loadOrders/loadDespachos/loadCoupons) cuando
// se activan. next/dynamic + montaje condicional replica ambas cosas: el
// chunk de cada tab solo se baja la primera vez que el admin la abre.
const ProductsTab = dynamic(() => import("./ProductsTab"), { ssr: false });
const OrdersTab = dynamic(() => import("./OrdersTab"), { ssr: false });
const DespachosTab = dynamic(() => import("./DespachosTab"), { ssr: false });
const CouponsTab = dynamic(() => import("./CouponsTab"), { ssr: false });

const TABS = [
    { id: "productos", label: "Productos", Component: ProductsTab },
    { id: "pedidos", label: "Pedidos", Component: OrdersTab },
    { id: "despachos", label: "Despachos", Component: DespachosTab },
    { id: "cupones", label: "Cupones", Component: CouponsTab },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminShell({ onLogout }: { onLogout: () => void }) {
    const [activeTab, setActiveTab] = useState<TabId>("productos");

    return (
        <div className="admin-panel authenticated">
            <header className="admin-header">
                <h1 className="admin-brand">
                    <img
                        className="admin-logo"
                        src="/images-brand/Logo color y blanco.svg"
                        width={800}
                        height={240}
                        alt="VOLT — Motorsport Culture"
                    />
                    <span className="admin-brand__tag">ADMIN</span>
                </h1>
                <div className="d-flex align-items-center gap-3">
                    <a href="/catalogo" className="btn btn-outline-volt btn-sm">
                        Ver tienda
                    </a>
                    <button type="button" className="logout-btn" onClick={onLogout}>
                        Cerrar sesión
                    </button>
                </div>
            </header>

            <div className="admin-container">
                <div className="admin-tabs">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`admin-tab${activeTab === tab.id ? " active" : ""}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {TABS.map((tab) => (
                    <div key={tab.id} className={`tab-content${activeTab === tab.id ? " active" : ""}`}>
                        {activeTab === tab.id && <tab.Component />}
                    </div>
                ))}
            </div>
        </div>
    );
}
