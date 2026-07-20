import { createHash } from 'crypto';
import { verifyAdmin } from '@/lib/server/verify-admin';

/**
 * Firma Cloudinary: todos los params del upload (excepto file, api_key, signature)
 * ordenados alfabéticamente como key=value&… + apiSecret → SHA1 hex.
 */
function signCloudinaryParams(params, apiSecret) {
    const stringToSign =
        Object.keys(params)
            .sort()
            .map((k) => `${k}=${params[k]}`)
            .join('&') + apiSecret;
    return createHash('sha1').update(stringToSign).digest('hex');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const decoded = await verifyAdmin(req, res);
    if (!decoded) return;

    const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').replace(/^"|"$/g, '').trim();
    const apiKey = (process.env.CLOUDINARY_API_KEY || '').replace(/^"|"$/g, '').trim();
    const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').replace(/^"|"$/g, '').trim();

    if (!cloudName || !apiKey || !apiSecret) {
        return res.status(500).json({
            error: 'Cloudinary no configurado',
            details:
                'Definí CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Vercel Project Settings'
        });
    }

    const timestamp = Math.round(Date.now() / 1000);
    // Solo params que el cliente enviará en FormData (ni file, ni api_key, ni signature).
    const params = { timestamp };
    const signature = signCloudinaryParams(params, apiSecret);

    return res.status(200).json({
        signature,
        timestamp,
        cloudName,
        apiKey,
        params
    });
}
