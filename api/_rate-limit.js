import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const RATE_LIMIT_BODY = { error: 'Demasiadas solicitudes, intentá más tarde' };
export const RATE_LIMIT_UNAVAILABLE_BODY = { error: 'Servicio temporalmente no disponible' };

const FAIL_CLOSED_ROUTES = new Set(['create-preference', 'welcome-email']);

const LIMIT_CONFIG = {
    'create-preference': { limit: 5, window: '10 m' },
    'welcome-email': { limit: 3, window: '1 h' },
    'public-default': { limit: 20, window: '1 m' }
};

let redisClient = null;
const limiterCache = new Map();

function getRedis() {
    if (redisClient) return redisClient;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;

    redisClient = new Redis({ url, token });
    return redisClient;
}

function getLimiter(routeKey) {
    const config = LIMIT_CONFIG[routeKey] || LIMIT_CONFIG['public-default'];
    const cacheKey = `${routeKey}:${config.limit}:${config.window}`;

    if (limiterCache.has(cacheKey)) {
        return limiterCache.get(cacheKey);
    }

    const redis = getRedis();
    if (!redis) return null;

    const limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(config.limit, config.window),
        prefix: `volt:rl:${routeKey}`,
        analytics: true
    });

    limiterCache.set(cacheKey, limiter);
    return limiter;
}

export function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
        return String(forwarded[0]).trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) return String(realIp).trim();

    return req.socket?.remoteAddress || 'unknown';
}

/**
 * Aplica rate limit por IP. Devuelve true si la solicitud puede continuar.
 * Si se supera el límite, responde 429 y devuelve false.
 *
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 * @param {'create-preference'|'welcome-email'|'public-default'} routeKey
 */
function isProductionEnv() {
    return process.env.VERCEL_ENV === 'production';
}

export async function applyRateLimit(req, res, routeKey = 'public-default') {
    const limiter = getLimiter(routeKey);

    if (!limiter) {
        if (FAIL_CLOSED_ROUTES.has(routeKey) && isProductionEnv()) {
            console.error(
                `[rate-limit] UPSTASH no configurado en producción para ruta sensible "${routeKey}" — rechazando solicitud`
            );
            res.status(503).json(RATE_LIMIT_UNAVAILABLE_BODY);
            return false;
        }
        const logFn = routeKey === 'public-default' && isProductionEnv() ? console.error : console.warn;
        logFn('[rate-limit] UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN no configurados');
        return true;
    }

    const ip = getClientIp(req);
    const { success, reset } = await limiter.limit(ip);

    if (!success) {
        const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json(RATE_LIMIT_BODY);
        return false;
    }

    return true;
}
