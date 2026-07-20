"use client";

import { useState } from "react";
import Link from "next/link";
import { useCartOffcanvas } from "./CartOffcanvasContext";

// Ported from legacy/pages/catalogo.html (nav + floating cart button) and
// legacy/js/animations.js (hamburger menu open/close semantics — that file
// itself is NOT migrated per CLAUDE.md "Qué NO migrar", but its behavior is
// re-implemented here as React state since the navbar still needs a working
// mobile menu). Auth (`#voltSignInBtn`) and the cart badge count are static
// placeholders — wired in F3.
export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { toggle: toggleCart } = useCartOffcanvas();

  const closeMenu = () => setMenuOpen(false);
  const toggleMenu = () => setMenuOpen((v) => !v);

  return (
    <>
      <div
        className={`menu-overlay${menuOpen ? " active" : ""}`}
        id="menuOverlay"
        onClick={closeMenu}
      />

      <nav className={`header${menuOpen ? " menu-open" : ""}`} id="mainHeader">
        <Link href="/" className="logo-link logo-lockup" aria-label="VOLT — Inicio">
          <img
            className="site-logo site-logo--navbar"
            src="/images-brand/Logo color y blanco.svg"
            width={800}
            height={800}
            alt="VOLT — Motorsport Culture"
          />
        </Link>

        <ul id="navMenu" className={menuOpen ? "active" : ""}>
          <li>
            <Link href="/catalogo" className="nav-link" onClick={closeMenu}>
              Tienda
            </Link>
          </li>
          <li>
            <Link href="/about" className="nav-link" onClick={closeMenu}>
              Nosotros
            </Link>
          </li>
          <li>
            <Link href="/envios" className="nav-link" onClick={closeMenu}>
              Envíos
            </Link>
          </li>
          <li>
            <Link href="/novedades" className="nav-link" onClick={closeMenu}>
              Novedades
            </Link>
          </li>
        </ul>

        <div className="header-actions">
          <div id="authNav" className="auth-nav">
            {/* Static placeholder — F3 wires up Firebase Auth state here. */}
            <button type="button" className="auth-btn auth-btn--in" id="voltSignInBtn">
              Ingresar
            </button>
          </div>
          <div
            className={`menu-toggle${menuOpen ? " active" : ""}`}
            id="menuToggle"
            role="button"
            tabIndex={0}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            onClick={toggleMenu}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleMenu();
              }
            }}
          >
            <span />
            <span />
            <span />
          </div>
        </div>
      </nav>

      {/* Floating cart button — `.btn-cart` is `position: fixed` so its DOM
          position doesn't matter; kept here since it's tightly coupled to
          nav state / the offcanvas it opens. */}
      <button
        className="btn-cart"
        type="button"
        aria-label="Abrir carrito"
        aria-controls="offcanvasRight"
        onClick={toggleCart}
      >
        <svg
          className="btn-cart__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path d="M6 6h15l-1.5 9h-12z" />
          <path d="M6 6L5 3H2" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
        </svg>
        {/* Static badge (0) — F3 connects this to the Zustand cart store. */}
        <span className="cart-badge" id="cartBadge" style={{ display: "none" }}>
          0
        </span>
      </button>
    </>
  );
}
