/**
 * _andreani-auth.js — Autenticación y fetch autenticado contra la API de Andreani.
 *
 * El prefijo _ evita que Vercel lo exponga como ruta pública.
 *
 * Variables de entorno:
 *   ANDREANI_BASE_URL (default 'https://apisqa.andreani.com', ambiente QA)
 *   ANDREANI_USER, ANDREANI_PASS (credenciales Basic Auth para /login)
 *
 * USO:
 *   import { andreaniFetch } from './_andreani-auth.js';
 *   const response = await andreaniFetch('/v1/tarifas?cpDestino=5000', { method: 'GET' });
 */

let tokenCache = { token: null, expiresAt: 0 };

function getBaseUrl() {
    return (process.env.ANDREANI_BASE_URL || 'https://apisqa.andreani.com').replace(/\/$/, '');
}

/**
 * Decodifica el claim `exp` (segundos epoch) de un JWT sin validar la firma.
 * @returns {number|null} timestamp en ms, o null si no se pudo decodificar.
 */
function decodeJwtExpMs(token) {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
        const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
        if (typeof payload.exp !== 'number') return null;
        return payload.exp * 1000;
    } catch {
        return null;
    }
}

/**
 * Limpia el cache de token de Andreani. Se usa antes de reintentar tras un 401.
 */
export function clearAndreaniToken() {
    tokenCache = { token: null, expiresAt: 0 };
}

/**
 * Obtiene un token de autenticación de Andreani, reutilizando el cache en
 * memoria del módulo mientras no esté vencido (renueva 60s antes de expirar).
 *
 * @returns {Promise<string>}
 */
export async function getAndreaniToken() {
    if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
        return tokenCache.token;
    }

    const user = process.env.ANDREANI_USER;
    const pass = process.env.ANDREANI_PASS;
    if (!user || !pass) {
        throw new Error('Faltan las variables de entorno ANDREANI_USER y/o ANDREANI_PASS');
    }

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');

    let response;
    try {
        response = await fetch(`${getBaseUrl()}/login`, {
            method: 'POST',
            headers: { Authorization: `Basic ${basicAuth}` }
        });
    } catch (err) {
        throw new Error(`No se pudo conectar con Andreani para autenticar: ${err.message}`);
    }

    if (!response.ok) {
        const details = await response.text().catch(() => '');
        throw new Error(`Login de Andreani falló con status ${response.status}: ${details}`);
    }

    const token = response.headers.get('x-authorization-token');
    if (!token) {
        throw new Error('Andreani no devolvió el header x-authorization-token en la respuesta de login');
    }

    const decodedExpMs = decodeJwtExpMs(token);
    // Renovamos 60s antes de la expiración real; si no se pudo decodificar el
    // exp, cacheamos 20 minutos como fallback conservador.
    const expiresAt = decodedExpMs
        ? decodedExpMs - 60_000
        : Date.now() + 20 * 60 * 1000 - 60_000;

    tokenCache = { token, expiresAt };
    return token;
}

/**
 * Fetch autenticado contra la API de Andreani. Reintenta UNA vez con token
 * renovado si la respuesta es 401. Devuelve el Response sin consumir.
 *
 * @param {string} path — path relativo, ej. '/v1/tarifas?cpDestino=5000'
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function andreaniFetch(path, options = {}) {
    const base = getBaseUrl();

    const doFetch = (token) => fetch(`${base}${path}`, {
        ...options,
        headers: {
            ...(options.headers || {}),
            'x-authorization-token': token
        }
    });

    let token = await getAndreaniToken();
    let response = await doFetch(token);

    if (response.status === 401) {
        clearAndreaniToken();
        token = await getAndreaniToken();
        response = await doFetch(token);
    }

    return response;
}
