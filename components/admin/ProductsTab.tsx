"use client";

import { useCallback, useEffect, useState } from "react";
import { getAllAdmin, remove, update } from "@/lib/products";
import { auth } from "@/lib/firebase/client";
import { postRevalidate } from "@/lib/admin/upload-client";
import { slugify } from "@/lib/catalog-helpers";
import type { Product } from "@/lib/types";
import ProductFormModal from "./ProductFormModal";

// Port de legacy/js/admin-products.js: loadProducts()/renderProductCard()/
// updateStats()/deleteProduct()/toggleFeatured()/setFeaturedOrder(). El data
// layer (create/update/remove/getAllAdmin) ya existe en lib/products.ts
// (portado en F4) — este componente solo orquesta UI + llamadas.
export default function ProductsTab() {
    const [products, setProducts] = useState<Product[] | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [editing, setEditing] = useState<Product | null | "new">(null);

    const load = useCallback(async () => {
        try {
            setLoadError(false);
            const list = await getAllAdmin();
            setProducts(list);
        } catch (err) {
            console.error("Error al cargar productos:", err);
            setLoadError(true);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function revalidateFor(product: { id: string; name: string }) {
        const idToken = await auth.currentUser?.getIdToken().catch(() => null);
        if (!idToken) return;
        await postRevalidate(idToken, `${slugify(product.name)}-${product.id}`);
    }

    async function handleDelete(product: Product) {
        if (!confirm("¿Estás seguro de eliminar este producto?")) return;
        try {
            await remove(product.id);
            alert("✅ Producto eliminado");
            await load();
            await revalidateFor(product);
        } catch (err) {
            console.error("Error al eliminar:", err);
            alert(`❌ Error: ${(err as Error).message}`);
        }
    }

    async function handleToggleFeatured(product: Product) {
        try {
            const isFeatured = product.featured === true;
            const data: Record<string, unknown> = { featured: !isFeatured };
            if (!isFeatured) {
                // legacy admin-products.js:625-641 — al marcar, asigna el
                // próximo número libre (1 primero, 2 segundo, ...).
                const maxOrder = (products || [])
                    .filter((p) => p.featured === true && p.id !== product.id)
                    .reduce((max, p) => Math.max(max, Number(p.featuredOrder) || 0), 0);
                data.featuredOrder = maxOrder + 1;
            }
            await update(product.id, data);
            await load();
            await revalidateFor(product);
        } catch (err) {
            console.error("Error al cambiar destacado:", err);
            alert(`❌ No se pudo actualizar el destacado: ${(err as Error).message}`);
        }
    }

    async function handleSetFeaturedOrder(product: Product, rawValue: string) {
        const order = Number(rawValue);
        if (!Number.isInteger(order) || order < 1) {
            alert("❌ El orden debe ser un número entero mayor o igual a 1.");
            await load();
            return;
        }
        const clash = (products || []).find(
            (p) => p.id !== product.id && p.featured === true && Number(p.featuredOrder) === order
        );
        if (clash) {
            alert(`❌ El número ${order} ya lo usa "${clash.name}". Elegí otro.`);
            await load();
            return;
        }
        try {
            await update(product.id, { featuredOrder: order });
            await load();
            await revalidateFor(product);
        } catch (err) {
            console.error("Error al cambiar el orden destacado:", err);
            alert(`❌ No se pudo actualizar el orden: ${(err as Error).message}`);
        }
    }

    async function handleSaved(product: { id: string; name: string }) {
        setEditing(null);
        await load();
        await revalidateFor(product);
    }

    const active = (products || []).filter((p) => p.active !== false);
    const categories = new Set(active.map((p) => p.category));
    const lowStock = active.filter((p) => p.stock > 0 && p.stock <= 3);
    const outOfStock = active.filter((p) => p.stock === 0);

    return (
        <div>
            <div className="row mb-4">
                <div className="col-md-3 mb-3">
                    <div className="stats-card">
                        <h3>{active.length}</h3>
                        <p>Productos</p>
                    </div>
                </div>
                <div className="col-md-3 mb-3">
                    <div className="stats-card">
                        <h3>{categories.size}</h3>
                        <p>Categorías</p>
                    </div>
                </div>
                <div className="col-md-3 mb-3">
                    <div className="stats-card">
                        <h3>{lowStock.length}</h3>
                        <p>Stock bajo</p>
                    </div>
                </div>
                <div className="col-md-3 mb-3">
                    <div className="stats-card">
                        <h3>{outOfStock.length}</h3>
                        <p>Sin stock</p>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header admin-card-head">
                    <span>Lista de productos</span>
                    <button type="button" className="btn btn-volt" onClick={() => setEditing("new")}>
                        + Nuevo producto
                    </button>
                </div>
                <div className="card-body">
                    <div className="table-responsive">
                        <table className="table table-hover">
                            <thead>
                                <tr>
                                    <th>Imagen</th>
                                    <th>Nombre</th>
                                    <th>Categoría</th>
                                    <th>Precio</th>
                                    <th>Stock</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products === null && !loadError && (
                                    <tr>
                                        <td colSpan={7} className="text-center py-4">
                                            Cargando...
                                        </td>
                                    </tr>
                                )}
                                {loadError && (
                                    <tr>
                                        <td colSpan={7} className="text-center py-4">
                                            No se pudieron cargar los productos.
                                        </td>
                                    </tr>
                                )}
                                {products !== null && products.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="text-center py-4">
                                            No hay productos.{" "}
                                            <button
                                                type="button"
                                                className="btn btn-danger btn-sm"
                                                onClick={() => setEditing("new")}
                                            >
                                                Agregar uno
                                            </button>
                                        </td>
                                    </tr>
                                )}
                                {(products || []).map((p) => (
                                    <ProductRow
                                        key={p.id}
                                        product={p}
                                        onEdit={() => setEditing(p)}
                                        onDelete={() => handleDelete(p)}
                                        onToggleFeatured={() => handleToggleFeatured(p)}
                                        onSetFeaturedOrder={(v) => handleSetFeaturedOrder(p, v)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {editing !== null && (
                <ProductFormModal
                    product={editing === "new" ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
}

function ProductRow({
    product,
    onEdit,
    onDelete,
    onToggleFeatured,
    onSetFeaturedOrder,
}: {
    product: Product;
    onEdit: () => void;
    onDelete: () => void;
    onToggleFeatured: () => void;
    onSetFeaturedOrder: (value: string) => void;
}) {
    const p = product;
    const isFeatured = p.featured === true;
    return (
        <tr>
            <td>
                <img
                    src={p.image || ""}
                    alt={p.name}
                    className="product-thumb"
                    onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/images-brand/Isotipo color.png";
                    }}
                />
            </td>
            <td>
                <strong>{p.name}</strong>
                <br />
                <small className="text-secondary">{p.id}</small>
            </td>
            <td>
                {p.line || "TC"} · {p.category}
            </td>
            <td>${p.price.toLocaleString("es-AR")}</td>
            <td>
                <span className={p.stock === 0 ? "text-danger" : p.stock <= 3 ? "status-inactive" : undefined}>
                    {p.stock}
                </span>
            </td>
            <td>
                {p.active === false ? (
                    <span className="admin-badge admin-badge--muted">Inactivo</span>
                ) : p.stock === 0 ? (
                    <span className="admin-badge admin-badge--muted">Sin stock</span>
                ) : p.stock <= 3 ? (
                    <span className="admin-badge admin-badge--warn">Stock bajo</span>
                ) : (
                    <span className="admin-badge admin-badge--ok">Activo</span>
                )}
            </td>
            <td>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <button
                    type="button"
                    className="admin-icon-btn"
                    onClick={onToggleFeatured}
                    title={isFeatured ? "Quitar de destacados" : "Destacar"}
                    aria-label={isFeatured ? "Quitar de destacados" : "Destacar"}
                >
                    <svg
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill={isFeatured ? "#FFD700" : "none"}
                        stroke={isFeatured ? "#FFD700" : "currentColor"}
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                </button>
                {isFeatured && (
                    <input
                        type="number"
                        min={1}
                        step={1}
                        className="form-control form-control-sm admin-featured-order"
                        defaultValue={Number(p.featuredOrder) || undefined}
                        onBlur={(e) => onSetFeaturedOrder(e.target.value)}
                        title="Orden en la home (1 = primero)"
                        aria-label="Orden en la home"
                    />
                )}
                <button type="button" className="admin-icon-btn" onClick={onEdit} title="Editar" aria-label="Editar">
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                </button>
                <button
                    type="button"
                    className="admin-icon-btn admin-icon-btn--danger"
                    onClick={onDelete}
                    title="Eliminar"
                    aria-label="Eliminar"
                >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" x2="10" y1="11" y2="17" />
                        <line x1="14" x2="14" y1="11" y2="17" />
                    </svg>
                </button>
              </div>
            </td>
        </tr>
    );
}
