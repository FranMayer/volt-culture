"use client";

import type { Product } from "@/lib/types";
import { getProductGallery, getProductTypeLabel, isHoodieProduct } from "@/lib/catalog-helpers";
import { getProductImageFallback } from "@/lib/products";

const FALLBACK_IMG = getProductImageFallback();

// Port of legacy/js/catalog.js createProductCard()/initCardInteractions().
// The card is only the "trigger": image + data + button that opens the
// quick-view; selection (color/talle/cantidad) and purchase live there.
export default function ProductCard({
  product,
  index,
  onOpenQuickView,
  onOpenLightbox,
}: {
  product: Product;
  index: number;
  onOpenQuickView: () => void;
  onOpenLightbox: (src: string) => void;
}) {
  const gallery = getProductGallery(product, FALLBACK_IMG);
  const initialImage = gallery[0] || product.image || FALLBACK_IMG;
  const formattedPrice = product.price.toLocaleString("es-AR");
  const typeLabel = getProductTypeLabel(product);

  // Tap en la card (fuera de imagen/botones/inputs) también abre el modal
  // (legacy:255-264).
  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest(".product-image") || target.closest("button") || target.closest("input")) {
      return;
    }
    onOpenQuickView();
  }

  return (
    <div
      className="product-card"
      data-category={product.category}
      data-id={product.id}
      data-price={product.price}
      style={{ animation: `fadeInUp 0.4s ease forwards ${index * 0.05}s`, opacity: 0 }}
      onClick={handleCardClick}
    >
      <div className="product-image-wrap">
        {product.limited === true && (
          <span className="product-badge-limited" aria-hidden="true">
            Edición limitada
          </span>
        )}
        <span className="product-index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <img
          src={initialImage}
          alt={product.name}
          className="product-image"
          loading="lazy"
          role="button"
          tabIndex={0}
          aria-label={`Ampliar imagen de ${product.name}`}
          onClick={() => onOpenLightbox(initialImage)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOpenLightbox(initialImage);
          }}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = FALLBACK_IMG;
          }}
        />
      </div>
      <div className="product-compact">
        <h3 className="product-title">{product.name}</h3>
        <p className="product-description">{product.description || ""}</p>
        <div className="product-price-row">
          <p className="product-price">${formattedPrice}</p>
          {typeLabel && (
            <span className={`product-type-tag${isHoodieProduct(product) ? "" : " product-type-tag--alt"}`}>
              {typeLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          className="product-expand-toggle"
          aria-haspopup="dialog"
          aria-label={`Ver producto ${product.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenQuickView();
          }}
        >
          <span className="product-expand-label">Ver producto →</span>
        </button>
      </div>
    </div>
  );
}
