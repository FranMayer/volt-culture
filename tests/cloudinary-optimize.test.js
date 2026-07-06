/**
 * Verifica optimizeCloudinary (entrega f_auto,q_auto). Uso: node tests/cloudinary-optimize.test.js
 * Ejecuta la función real extraída del fuente, sin importar el módulo browser.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/products-service.js'), 'utf8');
const m = src.match(/function optimizeCloudinary\([\s\S]*?\n\}/);
assert.ok(m, 'optimizeCloudinary debe existir en products-service.js');
const optimizeCloudinary = new Function(`${m[0]}; return optimizeCloudinary;`)();

const base = 'https://res.cloudinary.com/demo/image/upload/v123/foo.jpg';
const opt = 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v123/foo.jpg';

assert.strictEqual(optimizeCloudinary(base), opt, 'inserta f_auto,q_auto tras /image/upload/');
assert.strictEqual(optimizeCloudinary(opt), opt, 'idempotente: no duplica el transform');
const ext = 'https://example.com/img.jpg';
assert.strictEqual(optimizeCloudinary(ext), ext, 'deja pasar URLs que no son de Cloudinary');

console.log('✅ cloudinary optimize checks passed');
