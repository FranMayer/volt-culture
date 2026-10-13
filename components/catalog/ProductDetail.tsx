"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { cartLineKey } from "@/lib/types";
import { useCartStore } from "@/lib/cart/store";
import { useCartOffcanvas } from "@/components/layout/CartOffcanvasContext";
import {
  MAX_QTY_PER_LINE as QTY_MAX,
  defaultVariantSelection,
  getImageForColor,
  getProductGallery,
  getProductTypeLabel,
  isAvailable,
  isHoodieProduct,
  isSizeAvailable,
} from "@/lib/catalog-helpers";
import { getProductImageFallback } from "@/lib/products";

const FALLBACK_IMG = getProductImageFallback();

// Panel de compra de app/producto/[slug]/page.tsx. Mismo patrón de
// estado/variantes que components/catalog/QuickViewModal.tsx (F4) — se
// diferencia en que esto es una sección de página normal, no un diálogo
// modal: sin overlay/close/Escape, sin lightbox y sin share.
export default function ProductDetail({ product }: { product: Product }) {
  const { open: openCart } = useCartOffcanvas();
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

  const available = isAvailable(product, selectedSize);
  const typeLabel = getProductTypeLabel(product);
  const formattedPrice = product.price.toLocaleString("es-AR");

  const lineKey = cartLineKey({ id: product.id, variantColor: selectedColor, variantSize: selectedSize });
  const inCart = items.some((i) => cartLineKey(i) === lineKey);

  // Sigue la imagen propia del color si la tiene (legacy refresh():732-737).
  useEffect(() => {
    const colorImg = getImageForColor(product, selectedColor);
    if (!colorImg) return;
    const gi = gallery.indexOf(colorImg);
    if (gi >= 0) setGalleryIndex(gi);
  }, [selectedColor, product, gallery]);

  const currentImage = gallery[galleryIndex] || product.image || FALLBACK_IMG;

  function handleAddOrRemove() {
    if (inCart) {
      removeItem(lineKey);
      return;
    }
    if (!available) return;
    addItem(
      {
        id: product.id,
        title: product.name,
        price: product.price,
        quantity: qty,
        image: currentImage,
        variantColor: selectedColor,
        variantSize: selectedSize,
        promo2x1: product.promo2x1 === true,
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
                const sizeAvailable = isSizeAvailable(item);
                const active = item.size === selectedSize;
                return (
                  <button
                    key={item.size}
                    type="button"
                    className={`size-btn ${active ? "is-active" : ""} ${!sizeAvailable ? "is-disabled" : ""}`}
                    disabled={!sizeAvailable}
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
              max={QTY_MAX}
              value={qty}
              inputMode="numeric"
              onChange={(e) => {
                const normalized = Math.min(QTY_MAX, Math.max(1, parseInt(e.target.value, 10) || 1));
                setQty(normalized);
              }}
            />
            <button
              type="button"
              className="qty-btn qty-plus"
              aria-label="Aumentar cantidad"
              onClick={() => setQty((q) => Math.min(QTY_MAX, q + 1))}
            >
              +
            </button>
          </div>
        </div>

        <p className={`product-stock ${!available ? "product-stock--out" : ""}`}>
          <span>{available ? "Disponible" : "Agotado"}</span>
        </p>

        <div className="product-buttons">
          <button
            type="button"
            className={`add-to-cart${inCart ? " add-to-cart--in-cart" : ""}`}
            disabled={!available}
            onClick={handleAddOrRemove}
          >
            {!available ? "Agotado" : inCart ? "Eliminar del carrito" : "Añadir al carrito"}
          </button>
          {/* DEF-002: mismo acceso directo al pago que QuickViewModal — sin
              esto, con el producto ya en el carrito, la única salida era ir a
              buscar el botón flotante del carrito. */}
          {inCart && available && (
            <button
              type="button"
              className="product-finalize-btn"
              aria-label="Finalizar compra e ir al pago"
              onClick={openCart}
            >
              Finalizar compra
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
