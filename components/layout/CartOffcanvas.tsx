"use client";

import { useEffect } from "react";
import { useCartOffcanvas } from "./CartOffcanvasContext";

// Ported from legacy/pages/catalogo.html (markup) — Bootstrap's own JS
// (data-bs-toggle/data-bs-dismiss) drove open/close/backdrop/scroll-lock in
// production; since Bootstrap is gone (CLAUDE.md "Bootstrap eliminado"),
// this component re-implements that behavior directly. The item list is a
// static empty-cart placeholder — real cart state (Zustand) lands in F3, at
// which point `#cart-items`/totals here get replaced with store-driven
// content but the shell (header/backdrop/scroll-lock) stays as-is.
export default function CartOffcanvas() {
  const { isOpen, close } = useCartOffcanvas();

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
          <div id="cart-empty" className="cart-empty">
            <p className="cart-empty__text">Tu carrito está vacío</p>
            <a href="/catalogo" className="cart-empty__link">
              Explorá el catálogo →
            </a>
          </div>
          <ul id="cart-items" className="cart-items-list" />
          <div className="cart-total-row" style={{ display: "none" }}>
            <span className="cart-total-label">Total:</span>
            <span id="cart-total" className="cart-total-amount">
              $0
            </span>
          </div>
          <div className="cart-transfer-row" id="cart-transfer-row" style={{ display: "none" }}>
            <span className="cart-transfer-label">Con transferencia (−10%):</span>
            <span id="cart-transfer-total" className="cart-transfer-amount">
              $0
            </span>
          </div>
          <button
            id="checkout-btn"
            type="button"
            className="btn cart-checkout-btn w-100 mt-3"
            style={{ display: "none" }}
            disabled
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
            style={{ display: "none" }}
            disabled
          >
            Transferencia — 10% OFF
          </button>
          <button
            id="clear-cart"
            type="button"
            className="btn-clear-cart w-100 mt-2"
            style={{ display: "none" }}
            disabled
          >
            Vaciar Carrito
          </button>
        </div>
      </div>
    </>
  );
}
