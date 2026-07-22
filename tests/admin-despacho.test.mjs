/**
 * Tests unitarios de lib/admin/despacho.js. Uso: node tests/admin-despacho.test.mjs
 */
import { splitStreet, bultoUnitFor, buildBulto, hasAndreaniShipment } from '../lib/admin/despacho.js';

let failed = 0;
function check(label, cond) {
    if (!cond) { console.error(`FAIL — ${label}`); failed++; }
}

// splitStreet
check('calle + numero simple', JSON.stringify(splitStreet('Av. Colón 1234')) === JSON.stringify({ calle: 'Av. Colón', numero: '1234' }));
check('calle + numero con piso', JSON.stringify(splitStreet('San Martín 55 3B')) === JSON.stringify({ calle: 'San Martín', numero: '55 3B' }));
check('sin numero -> S/N', JSON.stringify(splitStreet('Camino sin nombre')) === JSON.stringify({ calle: 'Camino sin nombre', numero: 'S/N' }));
check('vacio -> S/N', JSON.stringify(splitStreet('')) === JSON.stringify({ calle: '', numero: 'S/N' }));
check('null -> S/N', JSON.stringify(splitStreet(null)) === JSON.stringify({ calle: '', numero: 'S/N' }));

// bultoUnitFor
check('hoodie -> 0.7kg/6000cm3', JSON.stringify(bultoUnitFor('Hoodie Negro')) === JSON.stringify({ kilos: 0.7, volumenCm3: 6000 }));
check('buzo -> 0.7kg/6000cm3', JSON.stringify(bultoUnitFor('Buzo canguro')) === JSON.stringify({ kilos: 0.7, volumenCm3: 6000 }));
check('remera -> 0.3kg/3000cm3 (default)', JSON.stringify(bultoUnitFor('Remera VOLT')) === JSON.stringify({ kilos: 0.3, volumenCm3: 3000 }));

// buildBulto
const order = {
    total: 45000,
    items: [
        { title: 'Hoodie Negro', quantity: 2 },
        { title: 'Remera VOLT', quantity: 1 },
    ],
};
const bulto = buildBulto(order);
check('kilos suma unidades (0.7*2 + 0.3*1 = 1.7)', bulto.kilos === 1.7);
check('volumen suma unidades (6000*2 + 3000 = 15000)', bulto.volumenCm3 === 15000);
check('valorDeclarado = order.total', bulto.valorDeclarado === 45000);
check('buildBulto sin items -> 0', buildBulto({ total: 0 }).kilos === 0);

// hasAndreaniShipment (guard de idempotencia)
check('sin shipping.andreani -> false', hasAndreaniShipment({}) === false);
check('shipping.andreani sin numeroDeEnvio -> false', hasAndreaniShipment({ shipping: { andreani: {} } }) === false);
check('shipping.andreani.numeroDeEnvio -> true', hasAndreaniShipment({ shipping: { andreani: { numeroDeEnvio: '123' } } }) === true);
check('order null -> false', hasAndreaniShipment(null) === false);

if (failed > 0) { console.error(`\n❌ ${failed} admin-despacho checks failed`); process.exit(1); }
console.log('✅ admin-despacho checks passed');
