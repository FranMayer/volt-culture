"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { create, update } from "@/lib/products";
import { auth } from "@/lib/firebase/client";
import { compressImage, uploadImageToCloudinary } from "@/lib/admin/upload-client";
import {
    normalizeVariants,
    normalizeSizes,
    normalizeImageUrls,
    computeStock,
    validateVariantsAndSizes,
    validateImages,
    validateRequiredFields,
    buildProductPayload,
    diffChangedFields,
} from "@/lib/admin/product-form.js";
import type { Product } from "@/lib/types";

const PRESET_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "ÚNICO"];

interface VariantRow {
    id: string;
    color: string;
    hex: string;
    stock: number;
}
interface SizeRow {
    id: string;
    size: string;
    stock: number;
}
interface ImageRow {
    id: string;
    url: string;
    uploading: boolean;
}

function newId(): string {
    return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
}

function emptyVariantRow(): VariantRow {
    return { id: newId(), color: "Original", hex: "#0b0b0b", stock: 0 };
}
function emptySizeRow(): SizeRow {
    return { id: newId(), size: "ÚNICO", stock: 0 };
}

/**
 * components/admin/ProductFormModal.tsx — modal crear/editar producto. Port
 * de legacy/js/admin-products.js: adminFormState + resetForm()/editProduct()/
 * saveProduct() + los editores de listas (renderVariants/renderSizes/
 * renderImages) reescritos como estado de React en vez de manipulación
 * directa del DOM. La lógica pura (normalización/validación/armado de
 * payload) vive en lib/admin/product-form.js — ver
 * tests/admin-product-form.test.mjs.
 *
 * Modal propio (sin Bootstrap JS), mismo patrón que components/auth/
 * AuthModal.tsx: se monta/desmonta condicionalmente desde ProductsTab en vez
 * de alternar `.show`, así que acá no hace falta ese toggle — solo scroll
 * lock + Escape + click en backdrop, igual que AuthModal.
 */
export default function ProductFormModal({
    product,
    onClose,
    onSaved,
}: {
    product: Product | null;
    onClose: () => void;
    onSaved: (product: { id: string; name: string }) => void;
}) {
    const isEditing = !!product;

    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [line, setLine] = useState("TC");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [active, setActive] = useState(true);
    const [limited, setLimited] = useState(false);

    const [variants, setVariants] = useState<VariantRow[]>([emptyVariantRow()]);
    const [sizes, setSizes] = useState<SizeRow[]>([emptySizeRow()]);
    const [images, setImages] = useState<ImageRow[]>([]);
    const [variantsError, setVariantsError] = useState<string | null>(null);
    const [sizesError, setSizesError] = useState<string | null>(null);

    const [imageUrlInput, setImageUrlInput] = useState("");
    const [isDragover, setIsDragover] = useState(false);
    const [saving, setSaving] = useState(false);
    const dragImageId = useRef<string | null>(null);

    // legacy admin-products.js:566-609 editProduct() — puebla el form al
    // editar; adminFormState.editOriginal guarda el payload normalizado
    // original para el diff de saveProduct() (solo se manda lo que cambió).
    const editOriginal = useMemo(() => {
        if (!product) return null;
        const v = normalizeVariants(product.variants, product.stock);
        const s = normalizeSizes(product.sizes, product.stock);
        const imgs = normalizeImageUrls(product.images, product.imageUrl, product.image);
        return {
            name: product.name || "",
            category: product.category || "",
            line: (product.line || "TC").toUpperCase(),
            description: product.description || "",
            price: Number(product.price) || 0,
            stock: computeStock(v, s),
            imageUrl: imgs[0] || "",
            image: imgs[0] || "",
            images: imgs,
            variants: v,
            sizes: s,
            active: product.active !== false,
            limited: product.limited === true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as Record<string, any>;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product]);

    useEffect(() => {
        if (product) {
            setName(product.name || "");
            setCategory(product.category || "");
            setLine((product.line || "TC").toUpperCase());
            setDescription(product.description || "");
            setPrice(String(product.price ?? ""));
            setActive(product.active !== false);
            setLimited(product.limited === true);
            setVariants(normalizeVariants(product.variants, product.stock).map((v) => ({ id: newId(), ...v })));
            setSizes(normalizeSizes(product.sizes, product.stock).map((s) => ({ id: newId(), ...s })));
            setImages(
                normalizeImageUrls(product.images, product.imageUrl, product.image).map((url) => ({
                    id: newId(),
                    url,
                    uploading: false,
                }))
            );
        } else {
            setName("");
            setCategory("");
            setLine("TC");
            setDescription("");
            setPrice("");
            setActive(true);
            setLimited(false);
            setVariants([emptyVariantRow()]);
            setSizes([emptySizeRow()]);
            setImages([]);
        }
        setVariantsError(null);
        setSizesError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product]);

    // Scroll-lock + Escape, mismo patrón que AuthModal.
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

    const totalStock = computeStock(variants, sizes);

    // ── Variantes ───────────────────────────────────────────────────────
    function addVariant() {
        setVariants((v) => [...v, { id: newId(), color: "", hex: "#0b0b0b", stock: 0 }]);
    }
    function updateVariant(id: string, patch: Partial<VariantRow>) {
        setVariants((v) => v.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    }
    function removeVariant(id: string) {
        setVariants((v) => v.filter((row) => row.id !== id));
    }
    function moveVariant(index: number, dir: -1 | 1) {
        setVariants((v) => {
            const target = index + dir;
            if (target < 0 || target >= v.length) return v;
            const next = [...v];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }

    // ── Talles ──────────────────────────────────────────────────────────
    function addSize(size = "", stock = 0) {
        const normalized = String(size || "").trim().toUpperCase();
        setSizes((s) => {
            if (normalized && s.some((row) => row.size === normalized)) return s; // legacy: duplicado, no-op silencioso
            return [...s, { id: newId(), size: normalized, stock: Math.max(0, Number(stock) || 0) }];
        });
    }
    function updateSizeName(id: string, rawValue: string) {
        const next = String(rawValue || "").trim().toUpperCase();
        setSizes((s) => {
            if (!next) return s.map((row) => (row.id === id ? { ...row, size: "" } : row));
            const duplicate = s.some((row) => row.id !== id && row.size === next);
            if (duplicate) return s; // legacy: ignora el cambio si ya existe ese talle
            return s.map((row) => (row.id === id ? { ...row, size: next } : row));
        });
    }
    function updateSizeStock(id: string, stock: number) {
        setSizes((s) => s.map((row) => (row.id === id ? { ...row, stock: Math.max(0, Number(stock) || 0) } : row)));
    }
    function removeSize(id: string) {
        setSizes((s) => s.filter((row) => row.id !== id));
    }
    function moveSize(index: number, dir: -1 | 1) {
        setSizes((s) => {
            const target = index + dir;
            if (target < 0 || target >= s.length) return s;
            const next = [...s];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }

    // ── Imágenes ────────────────────────────────────────────────────────
    async function uploadOne(id: string, file: File) {
        try {
            const optimized = await compressImage(file);
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) throw new Error("Sesión expirada. Volvé a iniciar sesión en el panel.");
            const secureUrl = await uploadImageToCloudinary(optimized, idToken);
            setImages((imgs) => imgs.map((i) => (i.id === id ? { ...i, url: secureUrl, uploading: false } : i)));
        } catch (err) {
            console.error("Cloudinary upload error:", err);
            setImages((imgs) => imgs.filter((i) => i.id !== id));
            alert("❌ Error al subir imagen: " + ((err as Error)?.message || "desconocido"));
        }
    }

    function handleFiles(files: FileList | File[]) {
        Array.from(files).forEach((file) => {
            if (!file.type.startsWith("image/")) return;
            const id = newId();
            const previewUrl = URL.createObjectURL(file);
            setImages((imgs) => [...imgs, { id, url: previewUrl, uploading: true }]);
            uploadOne(id, file).finally(() => URL.revokeObjectURL(previewUrl));
        });
    }

    function addImageUrl() {
        const url = imageUrlInput.trim();
        if (!url) return;
        setImages((imgs) => [...imgs, { id: newId(), url, uploading: false }]);
        setImageUrlInput("");
    }

    function removeImage(id: string) {
        setImages((imgs) => imgs.filter((i) => i.id !== id));
    }

    function onImageDrop(e: DragEvent<HTMLDivElement>, targetId: string) {
        e.preventDefault();
        const fromId = dragImageId.current;
        dragImageId.current = null;
        if (!fromId || fromId === targetId) return;
        setImages((imgs) => {
            const from = imgs.findIndex((i) => i.id === fromId);
            const to = imgs.findIndex((i) => i.id === targetId);
            if (from < 0 || to < 0) return imgs;
            const next = [...imgs];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    }

    // ── Guardar ─────────────────────────────────────────────────────────
    async function handleSave() {
        const form = { name, category, line, description, price, active, limited, variants, sizes, images };
        const payload = buildProductPayload(form);

        const req = validateRequiredFields(payload);
        if (!req.ok) {
            alert(req.message);
            return;
        }

        setVariantsError(null);
        setSizesError(null);
        const vs = validateVariantsAndSizes(variants, sizes);
        if (!vs.ok) {
            if (vs.field === "variants") setVariantsError(vs.message ?? null);
            else setSizesError(vs.message ?? null);
            return;
        }

        const imgCheck = validateImages(images);
        if (!imgCheck.ok) {
            alert(imgCheck.message);
            return;
        }

        setSaving(true);
        try {
            let id: string;
            if (product) {
                id = product.id;
                const changed = diffChangedFields(editOriginal, payload) as Record<string, unknown>;
                if (Object.keys(changed).length > 0) {
                    await update(id, changed);
                }
                alert("✅ Producto actualizado");
            } else {
                id = await create(payload);
                alert("✅ Producto creado");
            }
            onSaved({ id, name: payload.name });
        } catch (err) {
            console.error("Error al guardar:", err);
            alert(`❌ Error: ${(err as Error).message}`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div className="modal-backdrop show" onClick={onClose} aria-hidden="true" />
            <div className="modal fade show" id="productModal" role="dialog" aria-modal="true">
                <div className="modal-dialog modal-lg modal-dialog-scrollable">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">{isEditing ? "EDITAR PRODUCTO" : "NUEVO PRODUCTO"}</h5>
                            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose} />
                        </div>
                        <div className="modal-body">
                            <div className="row">
                                <div className="col-md-4 mb-3">
                                    <label className="form-label">Nombre *</label>
                                    <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} required />
                                </div>
                                <div className="col-md-4 mb-3">
                                    <label className="form-label">Línea de producción *</label>
                                    <select className="form-select" value={line} onChange={(e) => setLine(e.target.value)}>
                                        <option value="TC">Turismo Carretera (TC)</option>
                                        <option value="F1">Fórmula 1 (F1)</option>
                                    </select>
                                </div>
                                <div className="col-md-4 mb-3">
                                    <label className="form-label">Tipo / Subcategoría *</label>
                                    <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)} required>
                                        <option value="">Seleccionar...</option>
                                        <option value="Remeras">Remeras</option>
                                        <option value="Buzos">Buzos</option>
                                        <option value="Pantalones">Pantalones</option>
                                        <option value="Gorras">Gorras</option>
                                    </select>
                                </div>
                            </div>

                            <div className="mb-3">
                                <label className="form-label">Descripción</label>
                                <textarea className="form-control" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                            </div>

                            <div className="row">
                                <div className="col-md-4 mb-3">
                                    <label className="form-label">Precio *</label>
                                    <div className="input-group">
                                        <span className="input-group-text">$</span>
                                        <input type="number" min={0} className="form-control" value={price} onChange={(e) => setPrice(e.target.value)} required />
                                    </div>
                                </div>
                                <div className="col-md-4 mb-3">
                                    <label className="form-label">Stock total (auto)</label>
                                    <input type="number" className="form-control" value={totalStock} readOnly />
                                </div>
                                <div className="col-md-4 mb-3">
                                    <label className="form-label">Estado</label>
                                    <select className="form-select" value={active ? "true" : "false"} onChange={(e) => setActive(e.target.value === "true")}>
                                        <option value="true">Activo</option>
                                        <option value="false">Inactivo</option>
                                    </select>
                                </div>
                            </div>

                            <div className="mb-3 form-check form-switch">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    role="switch"
                                    id="productLimited"
                                    checked={limited}
                                    onChange={(e) => setLimited(e.target.checked)}
                                />
                                <label className="form-check-label" htmlFor="productLimited">
                                    Edición limitada
                                </label>
                                <small className="d-block text-secondary">
                                    Muestra el sello “Edición limitada” en la card del catálogo. Usalo solo en drops reales.
                                </small>
                            </div>

                            <div className="admin-subsection">
                                <h6 className="admin-subsection__title">Variantes de color *</h6>
                                {variants.map((v, i) => (
                                    <div className="list-editor-row" key={v.id}>
                                        <input
                                            className="form-control"
                                            placeholder="Color"
                                            value={v.color}
                                            onChange={(e) => updateVariant(v.id, { color: e.target.value })}
                                        />
                                        <input
                                            type="color"
                                            className="form-control form-control-color"
                                            value={v.hex}
                                            onChange={(e) => updateVariant(v.id, { hex: e.target.value || "#0b0b0b" })}
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            className="form-control"
                                            value={v.stock}
                                            onChange={(e) => updateVariant(v.id, { stock: Math.max(0, Number(e.target.value) || 0) })}
                                        />
                                        <div className="d-flex align-items-center gap-1">
                                            <div className="swatch-preview" style={{ background: v.hex || "#44464c" }} />
                                            <button type="button" className="icon-btn" disabled={i === 0} onClick={() => moveVariant(i, -1)} aria-label="Subir">
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                disabled={i === variants.length - 1}
                                                onClick={() => moveVariant(i, 1)}
                                                aria-label="Bajar"
                                            >
                                                ↓
                                            </button>
                                            <button type="button" className="icon-btn" onClick={() => removeVariant(v.id)} aria-label="Quitar">
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button type="button" className="btn btn-outline-volt btn-sm" onClick={addVariant}>
                                    + Agregar color
                                </button>
                                {variantsError && <div className="field-error">{variantsError}</div>}
                            </div>

                            <div className="admin-subsection">
                                <h6 className="admin-subsection__title">Talles y stock *</h6>
                                <div className="mb-2">
                                    {PRESET_SIZES.map((s) => (
                                        <button key={s} type="button" className="chip-btn" onClick={() => addSize(s, 0)}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                {sizes.map((s, i) => (
                                    <div className="list-editor-row list-editor-row--sizes" key={s.id}>
                                        <input
                                            className="form-control"
                                            placeholder="Talle"
                                            value={s.size}
                                            onChange={(e) => updateSizeName(s.id, e.target.value)}
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            className="form-control"
                                            value={s.stock}
                                            onChange={(e) => updateSizeStock(s.id, Number(e.target.value))}
                                        />
                                        <div className="d-flex align-items-center gap-1">
                                            <button type="button" className="icon-btn" disabled={i === 0} onClick={() => moveSize(i, -1)} aria-label="Subir">
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                disabled={i === sizes.length - 1}
                                                onClick={() => moveSize(i, 1)}
                                                aria-label="Bajar"
                                            >
                                                ↓
                                            </button>
                                            <button type="button" className="icon-btn" onClick={() => removeSize(s.id)} aria-label="Quitar">
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button type="button" className="btn btn-outline-volt btn-sm" onClick={() => addSize()}>
                                    + Agregar talle
                                </button>
                                {sizesError && <div className="field-error">{sizesError}</div>}
                            </div>

                            <div className="admin-subsection">
                                <h6 className="admin-subsection__title">Imágenes múltiples</h6>
                                <div
                                    className={`dropzone${isDragover ? " is-dragover" : ""}`}
                                    onClick={(e) => {
                                        if ((e.target as HTMLElement).closest("input")) return;
                                        const input = document.createElement("input");
                                        input.type = "file";
                                        input.accept = "image/*";
                                        input.multiple = true;
                                        input.onchange = (ev) => handleFiles((ev.target as HTMLInputElement).files || []);
                                        input.click();
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setIsDragover(true);
                                    }}
                                    onDragLeave={() => setIsDragover(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragover(false);
                                        handleFiles(e.dataTransfer.files);
                                    }}
                                >
                                    Arrastrá imágenes acá o seleccioná archivos
                                    <div className="mt-2">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="form-control"
                                            onChange={(e) => {
                                                handleFiles(e.target.files || []);
                                                e.target.value = "";
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <label className="form-label">Pegar URL directa</label>
                                    <div className="input-group">
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="https://..."
                                            value={imageUrlInput}
                                            onChange={(e) => setImageUrlInput(e.target.value)}
                                        />
                                        <button type="button" className="btn btn-outline-volt" onClick={addImageUrl}>
                                            Agregar URL
                                        </button>
                                    </div>
                                </div>
                                <div className="images-grid">
                                    {images.map((img, index) => (
                                        <div
                                            className="image-card"
                                            draggable
                                            key={img.id}
                                            onDragStart={() => {
                                                dragImageId.current = img.id;
                                            }}
                                            onDragEnd={() => {
                                                dragImageId.current = null;
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => onImageDrop(e, img.id)}
                                        >
                                            {index === 0 && <span className="image-card__badge">Principal</span>}
                                            <img
                                                src={img.url}
                                                alt={`img ${index + 1}`}
                                                onError={(e) => {
                                                    e.currentTarget.src = "/images-brand/Isotipo color.png";
                                                }}
                                            />
                                            <button type="button" className="image-card__remove" onClick={() => removeImage(img.id)} aria-label="Quitar imagen">
                                                ×
                                            </button>
                                            {img.uploading && (
                                                <div className="image-card__loading">
                                                    <span className="admin-spinner-sm" />
                                                    subiendo...
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline-volt" onClick={onClose}>
                                Cancelar
                            </button>
                            <button type="button" className="btn btn-volt" onClick={handleSave} disabled={saving}>
                                {saving ? "Guardando..." : "GUARDAR"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
