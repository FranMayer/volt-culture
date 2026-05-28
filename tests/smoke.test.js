/**
 * Smoke tests para voltculture.com.ar
 * Uso: node tests/smoke.test.js
 *      BASE_URL=https://voltculture.com.ar node tests/smoke.test.js
 */

const BASE = (process.env.BASE_URL || 'https://voltculture.com.ar').replace(/\/$/, '');
const ORIGIN = BASE;

/** GET /api/webhook debe responder 405 (solo POST permitido). */
const WEBHOOK_GET_STATUS = 405;

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const RETRY_ATTEMPTS = Number(process.env.SMOKE_RETRY_ATTEMPTS || 6);
const RETRY_DELAY_MS = Number(process.env.SMOKE_RETRY_DELAY_MS || 5000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reintenta solo ante 5xx transitorios (deploy / cold start).
 * No relaja criterios de éxito: el status esperado sigue siendo obligatorio.
 */
async function fetchUntilStatus(url, init, expectedStatus, label = url) {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const res = await fetch(url, init);
    lastStatus = res.status;

    if (res.status === expectedStatus) {
      return res;
    }

    if (RETRYABLE_STATUSES.has(res.status) && attempt < RETRY_ATTEMPTS) {
      console.warn(
        `  ${label}: HTTP ${res.status} (intento ${attempt}/${RETRY_ATTEMPTS}), reintento en ${RETRY_DELAY_MS / 1000}s…`
      );
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    return res;
  }

  return { status: lastStatus };
}

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
      const res = await fetchUntilStatus(
        `${BASE}/api/webhook`,
        { method: 'GET' },
        WEBHOOK_GET_STATUS,
        'WEBHOOK'
      );
      if (res.status !== WEBHOOK_GET_STATUS) {
        console.warn(`  WEBHOOK: se esperaba ${WEBHOOK_GET_STATUS}, recibido ${res.status}`);
      }
      return res.status === WEBHOOK_GET_STATUS;
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
