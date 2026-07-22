"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useCartOffcanvas } from "./CartOffcanvasContext";
import { useCartStore, cartCount } from "@/lib/cart/store";
import { useAuth } from "@/components/auth/AuthProvider";
import { displayName, signOutUser } from "@/lib/auth";
import { useFlipBadge } from "@/lib/motion/useFlipBadge";

// Ported from legacy/pages/catalogo.html (nav + floating cart button) and
// legacy/js/animations.js (hamburger menu open/close semantics — that file
// itself is NOT migrated per CLAUDE.md "Qué NO migrar", but its behavior is
// re-implemented here as React state since the navbar still needs a working
// mobile menu). Auth nav (`#authNav`) mirrors legacy/js/store-auth.js
// `_updateNavbar()` — logged-out shows #voltSignInBtn (opens AuthModal),
// logged-in shows greeting + mis-pedidos + logout, admin claim prepends the
// panel link (F3). The cart badge count is reactive (F3).
export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { toggle: toggleCart } = useCartOffcanvas();
  const count = useCartStore((s) => cartCount(s.items));
  const { user, loading, isAdmin, openModal } = useAuth();
  const badgeRef = useRef<HTMLSpanElement>(null);
  useFlipBadge(badgeRef);

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
          {/* legacy store-auth.js:130-163 `_updateNavbar` — `.loaded` gates
              the CSS fade-in until auth state resolves (avoids a flash of
              the wrong state on first paint). */}
          <div id="authNav" className={`auth-nav${!loading ? " loaded" : ""}`}>
            {isAdmin && (
              <a href="/admin" className="auth-btn auth-btn--admin">
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  style={{ verticalAlign: "-0.12em", marginRight: "0.3em" }}
                >
                  <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" />
                </svg>
                Panel
              </a>
            )}
            {user ? (
              <>
                <span className="auth-greeting">
                  Hola, <strong>{displayName(user)}</strong>
                </span>
                <Link href="/mis-pedidos" className="auth-btn auth-btn--link">
                  Mis pedidos
                </Link>
                <button
                  type="button"
                  className="auth-btn auth-btn--out"
                  id="voltSignOutBtn"
                  onClick={() => signOutUser()}
                >
                  Salir
                </button>
              </>
            ) : (
              <button
                type="button"
                className="auth-btn auth-btn--in"
                id="voltSignInBtn"
                onClick={() => openModal("login")}
              >
                Ingresar
              </button>
            )}
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
        {/* Same semantics as legacy/js/main.js#updateBadge(): "99+" past 99,
            hidden at 0. transformOrigin matches legacy volt-motion.js
            initCartBadge (lib/motion/useFlipBadge.ts pulses this ref on
            count increase — see hook for why MutationObserver isn't used
            here). */}
        <span
          ref={badgeRef}
          className="cart-badge"
          id="cartBadge"
          style={{ display: count > 0 ? "flex" : "none", transformOrigin: "center" }}
        >
          {count > 99 ? "99+" : count}
        </span>
      </button>
    </>
  );
}
