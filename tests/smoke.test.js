/**
 * Smoke tests para voltculture.com.ar
 * Uso: node tests/smoke.test.js
 *      BASE_URL=https://voltculture.com.ar node tests/smoke.test.js
 */

const BASE = (process.env.BASE_URL || 'https://voltculture.com.ar').replace(/\/$/, '');
const ORIGIN = BASE;

async function runTest(name, fn) {
  const start = performance.now();
  const ms = () => Math.round(performance.now() - start);

  try {
    const pass = await fn();
    if (pass) {
      console.log(`✅ PASS — ${name} (${ms()}ms)`);
      return true;
    }
    console.log(`❌ FAIL — ${name} (${ms()}ms)`);
    return false;
  } catch (err) {
    console.log(`❌ FAIL — ${name} (${ms()}ms) — ${err.message}`);
    return false;
  }
}

const tests = [
  {
    name: 'HOME',
    run: async () => {
      const res = await fetch(`${BASE}/`);
      return res.status === 200;
    },
  },
  {
    name: 'CATÁLOGO',
    run: async () => {
      const res = await fetch(`${BASE}/pages/catalogo.html`);
      return res.status === 200;
    },
  },
  {
    name: 'NOVEDADES',
    run: async () => {
      const res = await fetch(`${BASE}/pages/novedades.html`);
      return res.status === 200;
    },
  },
  {
    name: 'API NEWSLETTER',
    run: async () => {
      const res = await fetch(`${BASE}/api/newsletter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'smoke@test.com' }),
      });
      return res.status === 200 || res.status === 400;
    },
  },
  {
    name: 'API CREATE-PREFERENCE',
    run: async () => {
      const res = await fetch(`${BASE}/api/create-preference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
        },
      });
      return res.status === 400 || res.status === 401;
    },
  },
  {
    name: 'WEBHOOK',
    run: async () => {
      const res = await fetch(`${BASE}/api/webhook`, { method: 'GET' });
      return res.status !== 500;
    },
  },
];

async function main() {
  console.log(`Smoke tests — ${BASE}\n`);

  const results = [];
  for (const { name, run } of tests) {
    results.push(await runTest(name, run));
  }

  const passed = results.filter(Boolean).length;
  const total = tests.length;

  console.log(`\n${passed}/${total} tests pasaron`);
  process.exit(passed === total ? 0 : 1);
}

main();
