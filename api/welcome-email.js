import { Resend } from 'resend';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { applyRateLimit } from './_rate-limit.js';

function initAdminAuth() {
    const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/^"|"$/g, '').trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^"|"$/g, '').trim();
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '')
        .replace(/\\n/g, '\n')
        .replace(/^"|"$/g, '')
        .trim();

    if (!getApps().length) {
        initializeApp({
            credential: cert({ projectId, clientEmail, privateKey })
        });
    }
    return getAuth();
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }
    if (!(await applyRateLimit(req, res, 'welcome-email'))) return;

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    let decoded;
    try {
        const auth = initAdminAuth();
        decoded = await auth.verifyIdToken(token);
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const { email, name } = req.body || {};

    if (!email || !name) {
        return res.status(400).json({ error: 'Faltan los campos email y/o name' });
    }

    const bodyEmail = String(email).trim().toLowerCase();
    const tokenEmail = (decoded.email || '').trim().toLowerCase();
    if (!tokenEmail || tokenEmail !== bodyEmail) {
        return res.status(403).json({ error: 'El email no coincide con la sesión autenticada' });
    }

    if (!process.env.RESEND_API_KEY) {
        return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });
    }

    const siteUrl = process.env.SITE_URL || 'https://www.voltculture.com.ar';

    try {
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
            from:    'VOLT Store <noreply@voltculture.com.ar>',
            to:      email,
            subject: `¡Bienvenido/a a VOLT, ${name}!`,
            html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Cabecera -->
          <tr>
            <td style="border-bottom:3px solid #c1121f;padding-bottom:20px;">
              <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:0.12em;
                         text-transform:uppercase;color:#f2f2f2;">
                ⚡ VOLT
              </p>
              <p style="margin:4px 0 0;font-size:11px;letter-spacing:0.2em;
                         text-transform:uppercase;color:rgba(242,242,242,0.35);">
                MOTORSPORT CULTURE
              </p>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:32px 0 24px;">
              <p style="margin:0 0 20px;font-size:22px;font-weight:700;
                         color:#f2f2f2;line-height:1.3;">
                Bienvenido/a, <span style="color:#c1121f;">${name}</span>.
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:rgba(242,242,242,0.75);line-height:1.6;">
                Tu cuenta en VOLT está lista. Somos una marca de streetwear inspirada en la
                velocidad, la adrenalina y la cultura racing — diseñada para quienes llevan
                el motorsport en la sangre.
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:rgba(242,242,242,0.75);line-height:1.6;">
                Ya podés explorar el catálogo completo y encontrar tu próximo look.
              </p>

              <!-- CTA -->
              <a href="${siteUrl}/pages/catalogo.html"
                 style="display:inline-block;background:#c1121f;color:#ffffff;
                        font-size:13px;font-weight:700;letter-spacing:0.1em;
                        text-transform:uppercase;text-decoration:none;
                        padding:14px 32px;">
                Ir a la Tienda
              </a>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="border-top:1px solid rgba(242,242,242,0.08);padding-top:24px;">
              <p style="margin:0;font-size:12px;color:rgba(242,242,242,0.25);line-height:1.6;">
                Recibiste este email porque creaste una cuenta en VOLT Store.<br>
                <a href="${siteUrl}" style="color:rgba(242,242,242,0.25);">voltculture.com.ar</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
        });

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('welcome-email error:', err.message);
        return res.status(500).json({ error: 'No se pudo enviar el email de bienvenida' });
    }
}
