"use client";

import { useEffect } from "react";
import { useCartOffcanvas } from "./CartOffcanvasContext";
import { useCartStore, cartSubtotal } from "@/lib/cart/store";
import { cartLineKey } from "@/lib/types";
import { useCheckout } from "@/components/checkout/CheckoutContext";

// Ported from legacy/pages/catalogo.html (markup) — Bootstrap's own JS
// (data-bs-toggle/data-bs-dismiss) drove open/close/backdrop/scroll-lock in
// production; since Bootstrap is gone (CLAUDE.md "Bootstrap eliminado"),
// this component re-implements that behavior directly. Item list/totals are
// now driven by the Zustand cart store (F3) — same DOM ids/classes as
// legacy/js/main.js#updateCart() so app/styles CSS keeps applying as-is.
const FALLBACK_IMG = "/images-brand/Isotipo color.png";

function formatARS(n: number) {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

export default function CartOffcanvas() {
  const { isOpen, close } = useCartOffcanvas();
  const { open: openCheckout } = useCheckout();
  const items = useCartStore((s) => s.items);
  const setQty = useCartStore((s) => s.setQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);

  const hasItems = items.length > 0;
  const subtotal = cartSubtotal(items);
  const displayStyle = hasItems ? undefined : { display: "none" };

  // Scroll-lock: matches Bootstrap's ScrollBarHelper (body overflow hidden +
  // padding-right compensation for the scrollbar it removes, so layout
  // doesn't shift horizontally while the offcanvas is open).
  useEffect(() => {
    if (!isOpen) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen]);

  // Close on Esc.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  return (
    <>
      {isOpen && (
        <div className="offcanvas-backdrop show" onClick={close} aria-hidden="true" />
      )}

      <div
        className={`offcanvas offcanvas-end cart-offcanvas${isOpen ? " show" : ""}`}
        tabIndex={-1}
        id="offcanvasRight"
        aria-labelledby="offcanvasRightLabel"
        aria-hidden={!isOpen}
      >
        <div className="offcanvas-header cart-offcanvas-header">
          <h5 className="offcanvas-title cart-offcanvas-title" id="offcanvasRightLabel">
            Carrito
          </h5>
          <button
            type="button"
            className="btn-close"
            aria-label="Cerrar"
            onClick={close}
          />
        </div>
        <div className="offcanvas-body cart-offcanvas-body">
          <div id="cart-empty" className="cart-empty" hidden={hasItems}>
            <p className="cart-empty__text">Tu carrito está vacío</p>
            <a href="/catalogo" className="cart-empty__link">
              Explorá el catálogo →
            </a>
          </div>
          <ul id="cart-items" className="cart-items-list">
            {items.map((item) => {
              const key = cartLineKey(item);
              const variantLabel = [item.variantColor, item.variantSize]
                .filter(Boolean)
                .join(" / ");
              return (
                <li className="cart-item" key={key} data-line-key={key}>
                  <img
                    className="cart-item__thumb"
                    src={item.image || FALLBACK_IMG}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = FALLBACK_IMG;
                    }}
                  />
                  <div className="cart-item__body">
                    <div className="cart-item__title">{item.title}</div>
                    {variantLabel && (
                      <div className="cart-item__meta">{variantLabel}</div>
                    )}
                    <div className="cart-item__meta">
                      <span className="qty-control">
                        <button
                          type="button"
                          className="qty-btn"
                          aria-label="Restar cantidad"
                          onClick={() => setQty(key, item.quantity - 1)}
                        >
                          −
                        </button>
                        <span className="qty-input" aria-live="polite">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="qty-btn"
                          aria-label="Sumar cantidad"
                          onClick={() => setQty(key, item.quantity + 1)}
                        >
                          +
                        </button>
                      </span>
                      {" - "}
                      {formatARS(item.price * item.quantity)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cart-item__remove remove-item"
                    aria-label="Quitar del carrito"
                    onClick={() => removeItem(key)}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="cart-total-row" style={displayStyle}>
            <span className="cart-total-label">Total:</span>
            <span id="cart-total" className="cart-total-amount">
              {formatARS(subtotal)}
            </span>
          </div>
          <div className="cart-transfer-row" id="cart-transfer-row" style={displayStyle}>
            <span className="cart-transfer-label">Con transferencia (−10%):</span>
            <span id="cart-transfer-total" className="cart-transfer-amount">
              {formatARS(subtotal * 0.9)}
            </span>
          </div>
          <button
            id="checkout-btn"
            type="button"
            className="btn cart-checkout-btn w-100 mt-3"
            style={displayStyle}
            disabled={!hasItems}
            onClick={() => openCheckout("mp")}
          >
            Pagar con Mercado Pago
          </button>
          <p className="cart-mp-trust">
            Pagos seguros. Mercado Pago procesa el cobro y la seguridad de tu
            transacción.
          </p>
          <button
            id="transfer-btn"
            type="button"
            className="btn cart-transfer-btn w-100"
            style={displayStyle}
            disabled={!hasItems}
            onClick={() => openCheckout("transfer")}
          >
            Transferencia — 10% OFF
          </button>
          <button
            id="clear-cart"
            type="button"
            className="btn-clear-cart w-100 mt-2"
            style={displayStyle}
            disabled={!hasItems}
            onClick={clear}
          >
            Vaciar Carrito
          </button>
        </div>
      </div>
    </>
  );
}
