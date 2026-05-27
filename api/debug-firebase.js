import { verifyAdmin } from './_verify-admin.js';

export default async function handler(req, res) {
    if (process.env.VERCEL_ENV === 'production') {
        return res.status(404).end();
    }

    const decoded = await verifyAdmin(req, res);
    if (!decoded) return;

    const key = process.env.FIREBASE_PRIVATE_KEY || '';
    res.status(200).json({
        projectId: process.env.FIREBASE_PROJECT_ID || 'MISSING',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'MISSING',
        keyLength: key.length,
        keyStart: key.slice(0, 30),
        keyEnd: key.slice(-30),
        hasBegin: key.includes('-----BEGIN PRIVATE KEY-----'),
        hasEnd: key.includes('-----END PRIVATE KEY-----'),
        hasLiteralBackslashN: key.includes('\\n'),
        hasRealNewline: key.includes('\n'),
    });
}
