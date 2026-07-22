"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { cartLineKey } from "@/lib/types";
import { useCartStore } from "@/lib/cart/store";
import { useCartOffcanvas } from "@/components/layout/CartOffcanvasContext";
import {
  computeAvailableStock,
  defaultVariantSelection,
  getImageForColor,
  getProductGallery,
  getProductTypeLabel,
  isHoodieProduct,
  productPath,
} from "@/lib/catalog-helpers";
import { getProductImageFallback } from "@/lib/products";

const FALLBACK_IMG = getProductImageFallback();

// Port of legacy/js/catalog.js openQuickView() (legacy:604-854) — detail +
// purchase dialog for a single product. State that legacy tracked via
// data-* attributes on the dialog element (selected color/size/qty, stock)
// is plain React state here; the cart membership check reads straight from
// the F3 Zustand store instead of re-parsing localStorage on every refresh.
export default function QuickViewModal({
  product,
  onClose,
  onOpenLightbox,
  lightboxOpen,
}: {
  product: Product;
  onClose: () => void;
  onOpenLightbox: (src: string) => void;
  lightboxOpen: boolean;
}) {
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
  const [shareLabel, setShareLabel] = useState("Compartir");

  const stock = computeAvailableStock(product, selectedColor, selectedSize);
  const typeLabel = getProductTypeLabel(product);
  const formattedPrice = product.price.toLocaleString("es-AR");

  const lineKey = cartLineKey({ id: product.id, variantColor: selectedColor, variantSize: selectedSize });
  const inCart = items.some((i) => cartLineKey(i) === lineKey);

  // Clamp qty to available stock whenever the selection changes stock
  // (legacy refresh():720-730).
  useEffect(() => {
    setQty((q) => Math.min(Math.max(1, q), Math.max(1, stock)));
  }, [stock]);

  // Follow the color's own image if it has one (legacy refresh():732-737).
  useEffect(() => {
    const colorImg = getImageForColor(product, selectedColor);
    if (!colorImg) return;
    const gi = gallery.indexOf(colorImg);
    if (gi >= 0) setGalleryIndex(gi);
  }, [selectedColor, product, gallery]);

  useEffect(() => {
    document.body.classList.add("quickview-open");
    return () => document.body.classList.remove("quickview-open");
  }, []);

  // Esc closes the quick-view — unless a lightbox is on top of it, in which
  // case Esc closes that first (legacy:761-766, Lightbox has its own
  // independent listener that always closes itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !lightboxOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxOpen, onClose]);

  function setGallery(idx: number) {
    if (!gallery.length) return;
    setGalleryIndex(((idx % gallery.length) + gallery.length) % gallery.length);
  }

  function handleAddOrRemove() {
    if (inCart) {
      removeItem(lineKey);
      return;
    }
    if (stock <= 0) return;
    const imageSrc = gallery[galleryIndex] || product.image || FALLBACK_IMG;
    addItem(
      {
        id: product.id,
        title: product.name,
        price: product.price,
        quantity: qty,
        image: imageSrc,
        variantColor: selectedColor,
        variantSize: selectedSize,
      },
      qty
    );
  }

  async function handleShare() {
    const url = `${location.origin}${productPath(product)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareLabel("Link copiado ✓");
        setTimeout(() => setShareLabel("Compartir"), 2000);
      }
    } catch {
      /* usuario canceló el share: no es error */
    }
  }

  const qtyMax = Math.max(1, stock);
  const currentImage = gallery[galleryIndex] || product.image || FALLBACK_IMG;

  return (
    <div
      className="product-quickview"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="product-quickview__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${product.name || "producto"}`}
      >
        <button type="button" className="product-quickview__close" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
        <div className="product-quickview__media">
          <img
            className="product-quickview__img"
            data-cart-img=""
            src={currentImage}
            alt={product.name || "Producto"}
            role="button"
            tabIndex={0}
            aria-label="Ampliar imagen"
            onClick={() => onOpenLightbox(currentImage)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpenLightbox(currentImage);
            }}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = FALLBACK_IMG;
            }}
          />
          {gallery.length > 1 && (
            <>
              <button
                type="button"
                className="product-quickview__nav prev"
                aria-label="Imagen anterior"
                onClick={() => setGallery(galleryIndex - 1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="product-quickview__nav next"
                aria-label="Imagen siguiente"
                onClick={() => setGallery(galleryIndex + 1)}
              >
                ›
              </button>
              <div className="product-quickview__dots">
                {gallery.map((_: string, i: number) => (
                  <span
                    key={i}
                    className={`product-quickview__dot${i === galleryIndex ? " is-active" : ""}`}
                    onClick={() => setGallery(i)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="product-quickview__info">
          <h2 className="product-quickview__title">{product.name || ""}</h2>
          <div className="product-price-row">
            <p className="product-price">${formattedPrice}</p>
            {typeLabel && (
              <span className={`product-type-tag${isHoodieProduct(product) ? "" : " product-type-tag--alt"}`}>
                {typeLabel}
              </span>
            )}
          </div>
          {product.description && <p className="product-quickview__desc">{product.description}</p>}

          {variants.length > 0 && (
            <div className="variant-group variant-group--colors">
              <span className="variant-label">Color</span>
              <div className="color-swatches">
                {variants.map((variant) => (
                  <button
                    key={variant.color}
                    type="button"
                    className={`color-swatch${variant.color === selectedColor ? " is-active" : ""}`}
                    data-color={variant.color || ""}
                    data-hex={variant.hex || "#44464c"}
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
            {inCart && stock > 0 && (
              <button
                type="button"
                className="product-finalize-btn"
                aria-label="Finalizar compra e ir al pago"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  // legacy goToCheckoutFlow() abría el offcanvas y disparaba
                  // el click de #checkout-btn para arrancar el stepper de
                  // pago; ese stepper llega en F7 (aún no existe acá), así
                  // que por ahora solo abrimos el carrito.
                  openCart();
                }}
              >
                Finalizar compra
              </button>
            )}
          </div>

          <div className="product-quickview__share">
            <a className="product-quickview__permalink" href={productPath(product)}>
              Página del producto →
            </a>
            <button type="button" className="product-quickview__share-btn" onClick={handleShare}>
              {shareLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
