"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { cartLineKey } from "@/lib/types";
import { useCartStore } from "@/lib/cart/store";
import {
  computeAvailableStock,
  defaultVariantSelection,
  getImageForColor,
  getProductGallery,
  getProductTypeLabel,
  isHoodieProduct,
} from "@/lib/catalog-helpers";
import { getProductImageFallback } from "@/lib/products";

const FALLBACK_IMG = getProductImageFallback();

// Panel de compra de app/producto/[slug]/page.tsx. Mismo patrón de
// estado/variantes que components/catalog/QuickViewModal.tsx (F4) — se
// diferencia en que esto es una sección de página normal, no un diálogo
// modal: sin overlay/close/Escape, sin lightbox y sin "Finalizar
// compra"/share (no pedidos por la tarea de F5; el carrito global del
// layout ya cubre ir a pagar).
export default function ProductDetail({ product }: { product: Product }) {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);

  const variants = useMemo(() => product.variants ?? [], [product]);
  const sizes = useMemo(() => product.sizes ?? [], [product]);
  const gallery = useMemo(() => getProductGallery(product, FALLBACK_IMG), [product]);
  const initialSelection = useMemo(() => defaultVariantSelection(product), [product]);

  const [selectedColor, setSelectedColor] = useState(initialSelection.selectedColor);
  const [selectedSize, setSelectedSize] = useState(initialSelection.selectedSize);
  const [qty, setQty] = useState(1);
  const [galleryIndex, setGalleryIndex] = useState(() => {
    const initialImage =
      getImageForColor(product, initialSelection.selectedColor) || gallery[0] || product.image || FALLBACK_IMG;
    const idx = gallery.indexOf(initialImage);
    return idx >= 0 ? idx : 0;
  });

  const stock = computeAvailableStock(product, selectedColor, selectedSize);
  const typeLabel = getProductTypeLabel(product);
  const formattedPrice = product.price.toLocaleString("es-AR");

  const lineKey = cartLineKey({ id: product.id, variantColor: selectedColor, variantSize: selectedSize });
  const inCart = items.some((i) => cartLineKey(i) === lineKey);

  // Clamp qty al stock disponible cuando cambia la selección (mismo efecto
  // que QuickViewModal, legacy refresh():720-730).
  useEffect(() => {
    setQty((q) => Math.min(Math.max(1, q), Math.max(1, stock)));
  }, [stock]);

  // Sigue la imagen propia del color si la tiene (legacy refresh():732-737).
  useEffect(() => {
    const colorImg = getImageForColor(product, selectedColor);
    if (!colorImg) return;
    const gi = gallery.indexOf(colorImg);
    if (gi >= 0) setGalleryIndex(gi);
  }, [selectedColor, product, gallery]);

  const qtyMax = Math.max(1, stock);
  const currentImage = gallery[galleryIndex] || product.image || FALLBACK_IMG;

  function handleAddOrRemove() {
    if (inCart) {
      removeItem(lineKey);
      return;
    }
    if (stock <= 0) return;
    addItem(
      {
        id: product.id,
        title: product.name,
        price: product.price,
        quantity: qty,
        image: currentImage,
        variantColor: selectedColor,
        variantSize: selectedSize,
      },
      qty
    );
  }

  return (
    <div className="pp-wrap">
      <div className="pp-img">
        <img
          src={currentImage}
          alt={product.name || "Producto"}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = FALLBACK_IMG;
          }}
        />
        {gallery.length > 1 && (
          <div className="pp-thumbs">
            {gallery.map((src: string, i: number) => (
              <button
                key={src + i}
                type="button"
                className={`pp-thumb${i === galleryIndex ? " is-active" : ""}`}
                onClick={() => setGalleryIndex(i)}
                aria-label={`Ver imagen ${i + 1}`}
              >
                <img src={src} alt={`${product.name || "Producto"} ${i + 1}`} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pp-info">
        <h1 className="pp-title">{product.name || ""}</h1>
        <div className="product-price-row">
          <p className="pp-price">${formattedPrice}</p>
          {typeLabel && (
            <span className={`product-type-tag${isHoodieProduct(product) ? "" : " product-type-tag--alt"}`}>
              {typeLabel}
            </span>
          )}
        </div>
        {product.description && <p className="pp-desc">{product.description}</p>}

        {variants.length > 0 && (
          <div className="variant-group variant-group--colors">
            <span className="variant-label">Color</span>
            <div className="color-swatches">
              {variants.map((variant) => (
                <button
                  key={variant.color}
                  type="button"
                  className={`color-swatch${variant.color === selectedColor ? " is-active" : ""}`}
                  title={variant.color || ""}
                  aria-label={`Color ${variant.color || ""}`}
                  style={{ ["--swatch-color" as string]: variant.hex || "#44464c" }}
                  data-no-stock={Number(variant.stock) === 0 ? "true" : undefined}
                  onClick={() => setSelectedColor(variant.color)}
                />
              ))}
            </div>
          </div>
        )}

        {sizes.length > 0 && (
          <div className="variant-group variant-group--sizes">
            <span className="variant-label">Talle</span>
            <div className="size-buttons">
              {sizes.map((item) => {
                const itemStock = Number(item.stock) || 0;
                const active = item.size === selectedSize;
                return (
                  <button
                    key={item.size}
                    type="button"
                    className={`size-btn ${active ? "is-active" : ""} ${itemStock === 0 ? "is-disabled" : ""}`}
                    disabled={itemStock === 0}
                    onClick={() => setSelectedSize(item.size)}
                  >
                    {item.size || ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="variant-group variant-group--qty">
          <span className="variant-label">Cantidad</span>
          <div className="qty-control">
            <button
              type="button"
              className="qty-btn qty-minus"
              aria-label="Disminuir cantidad"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <input
              type="number"
              className="qty-input"
              min={1}
              max={qtyMax}
              value={qty}
              inputMode="numeric"
              onChange={(e) => {
                const normalized = Math.min(qtyMax, Math.max(1, parseInt(e.target.value, 10) || 1));
                setQty(normalized);
              }}
            />
            <button
              type="button"
              className="qty-btn qty-plus"
              aria-label="Aumentar cantidad"
              onClick={() => setQty((q) => Math.min(qtyMax, q + 1))}
            >
              +
            </button>
          </div>
        </div>

        <p className={`product-stock ${stock === 0 ? "product-stock--out" : ""}`}>
          {stock === 0 ? "Sin stock " : "Disponibles: "}
          <span>{stock}</span>
        </p>

        <div className="product-buttons">
          <button
            type="button"
            className={`add-to-cart${inCart ? " add-to-cart--in-cart" : ""}`}
            disabled={stock === 0}
            onClick={handleAddOrRemove}
          >
            {stock === 0 ? "Sin stock" : inCart ? "Eliminar del carrito" : "Añadir al carrito"}
          </button>
        </div>
      </div>
    </div>
  );
}
