"use client";

import { useEffect, useState } from "react";
import { getProductImageFallback } from "@/lib/products";

const FALLBACK_IMG = getProductImageFallback();

// Port of legacy/js/catalog.js openLightbox() (legacy:906-970).
export default function Lightbox({
  gallery,
  startIndex,
  name,
  onClose,
}: {
  gallery: string[];
  startIndex: number;
  name: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    document.body.classList.add("lightbox-open");
    return () => document.body.classList.remove("lightbox-open");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && gallery.length > 1) {
        setIndex((i) => (i - 1 + gallery.length) % gallery.length);
      }
      if (e.key === "ArrowRight" && gallery.length > 1) {
        setIndex((i) => (i + 1) % gallery.length);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [gallery.length, onClose]);

  if (!gallery.length) return null;

  return (
    <div
      className="product-lightbox"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="product-lightbox__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Imagen ampliada de ${name || "producto"}`}
      >
        <button type="button" className="product-lightbox__close" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
        <img
          className="product-lightbox__img"
          src={gallery[index]}
          alt={name || "Producto"}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = FALLBACK_IMG;
          }}
        />
        {gallery.length > 1 && (
          <>
            <button
              type="button"
              className="product-lightbox__nav prev"
              aria-label="Imagen anterior"
              onClick={() => setIndex((i) => (i - 1 + gallery.length) % gallery.length)}
            >
              ‹
            </button>
            <button
              type="button"
              className="product-lightbox__nav next"
              aria-label="Imagen siguiente"
              onClick={() => setIndex((i) => (i + 1) % gallery.length)}
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  );
}
