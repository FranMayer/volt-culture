/**
 * Tests unitarios de _stock.js. Uso: node tests/stock.test.mjs
 * Foco: decremento y reposición (round-trip) por variante/talle y clamp en 0.
 */
import assert from 'node:assert';
import { applyStockDecrement, applyStockIncrement } from '../lib/server/stock.js';

// Producto con variantes (color) y talles.
const product = {
    variants: [
        { color: 'Rojo', hex: '#f00', stock: 5 },
        { color: 'Negro', hex: '#000', stock: 3 }
    ],
    sizes: [
        { size: 'M', stock: 4 },
        { size: 'L', stock: 4 }
    ],
    stock: 8
};

const dec = applyStockDecrement(product, 2, 'Rojo', 'M');
assert.equal(dec.variants.find((v) => v.color === 'Rojo').stock, 3, 'decremento variante');
assert.equal(dec.sizes.find((s) => s.size === 'M').stock, 2, 'decremento talle');

const inc = applyStockIncrement(dec, 2, 'Rojo', 'M');
assert.equal(inc.variants.find((v) => v.color === 'Rojo').stock, 5, 'reposición restaura variante');
assert.equal(inc.sizes.find((s) => s.size === 'M').stock, 4, 'reposición restaura talle');

// Producto simple (sin variantes ni talles): usa el campo stock base.
assert.equal(applyStockDecrement({ stock: 10 }, 3).stock, 7, 'decremento base');
assert.equal(applyStockIncrement({ stock: 7 }, 3).stock, 10, 'reposición base');

// Nunca baja de 0.
assert.equal(applyStockDecrement({ stock: 1 }, 5).stock, 0, 'clamp en 0');

console.log('✅ stock checks passed');
