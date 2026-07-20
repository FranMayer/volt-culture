// Ported verbatim from legacy/pages/catalogo.html / legacy/pages/about.html
// (both share the exact same footer markup).
export default function Footer() {
  return (
    <footer className="footer footer--telemetry">
      <div className="footer__scanline" aria-hidden="true" />
      <div className="footer__top-rule" aria-hidden="true">
        <span className="footer__rule-dot" />
        <span className="footer__rule-line" />
        <span className="footer__rule-dot" />
      </div>
      <div className="footer-container footer-container--dense">
        <div className="footer-section footer-brand">
          <img
            className="footer-logo-img"
            src="/images-brand/Logo color y blanco.svg"
            width={800}
            height={800}
            alt="VOLT — Motorsport Culture"
          />
          <p className="footer-tagline">Motorsport Culture</p>
          <p className="footer-brand-desc">
            Streetwear inspirado en la velocidad y la cultura racing.
          </p>
        </div>

        <nav className="footer-section footer-nav" aria-label="Navegación pie de página">
          <h3 className="footer-heading">Tienda</h3>
          <ul className="footer-links">
            <li>
              <a href="/catalogo">Tienda</a>
            </li>
            <li>
              <a href="/about">Nosotros</a>
            </li>
            <li>
              <a href="/envios">Envíos</a>
            </li>
            <li>
              <a href="/novedades">Novedades</a>
            </li>
          </ul>
        </nav>

        <div className="footer-section">
          <h3 className="footer-heading">Contacto</h3>
          <p>
            <a href="mailto:volt.streetcba@gmail.com">volt.streetcba@gmail.com</a>
          </p>
          <p>
            <a href="tel:+5493518588127">+54 9 351 858-8127</a>
          </p>
        </div>

        <div className="footer-section footer-section--news">
          <h3 className="footer-heading footer-heading--social">Redes</h3>
          <div className="social-icons">
            <a
              href="https://www.instagram.com/volt.culture/"
              target="_blank"
              rel="noopener"
              aria-label="Instagram @volt.culture"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a
              href="https://x.com/voltculturecba"
              target="_blank"
              rel="noopener"
              aria-label="X (Twitter) @voltculturecba"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
      <p className="footer-bottom">
        &copy; 2026 VOLT - Motorsport Culture. Todos los derechos reservados.
      </p>
    </footer>
  );
}
