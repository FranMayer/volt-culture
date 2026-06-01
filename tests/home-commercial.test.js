const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function assertIncludes(label, needle) {
  if (!indexHtml.includes(needle)) {
    throw new Error(`${label}: missing "${needle}"`);
  }
}

assertIncludes('featured products section', 'id="homeFeaturedGrid"');
assertIncludes('featured products hero placement', 'class="hero-featured"');
assertIncludes('featured products larger desktop width', 'width: min(700px, 48vw);');
assertIncludes('featured products compact limit', 'data-limit="3"');
assertIncludes('featured products carousel layout', 'home-featured__grid--carousel');
assertIncludes('featured products script', '/js/home-featured.js');
assertIncludes('home cart button', 'data-bs-target="#offcanvasRight"');
assertIncludes('home cart items list', 'id="cart-items"');
assertIncludes('home checkout flow', 'type="module" src="/js/pagos.js"');
assertIncludes('drop shop CTA', 'VER COLECCIÓN →');

if (indexHtml.includes('<section class="home-featured section-panel"')) {
  throw new Error('standalone featured section should be removed from below the hero');
}

console.log('home commercial checks passed');
