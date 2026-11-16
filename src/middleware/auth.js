import { config } from '../config.js';

/**
 * SureGreet AI Agency Security & Access Control Middleware
 * 
 * Protects private agency dashboards, pipeline CRM, call telemetry, and scraper tools.
 * Supports:
 *  1. HTTP Basic Auth (Native browser modal: username 'admin' or 'archit', password from config)
 *  2. 1-Click Access via URL query param: `?key=<ADMIN_PASSWORD>`
 *  3. API Header Authentication: `x-admin-key: <ADMIN_PASSWORD>` or `Authorization: Bearer <ADMIN_PASSWORD>`
 * 
 * Public Routes / Webhooks are explicitly exempted:
 *  - `/outreach/unsubscribe` (CAN-SPAM compliance)
 *  - `/webhook/*` (Retell AI, Cal.com, Telegram, Inbound Email Webhooks)
 *  - `/api/booking/*`
 */
export function requireAdminAuth(req, res, next) {
  const fullPath = req.originalUrl || req.url || '';

  // 1. Explicit Exemption: CAN-SPAM Unsubscribe Link for email recipients
  if (fullPath.includes('/outreach/unsubscribe') || fullPath.includes('/unsubscribe')) {
    return next();
  }

  // 2. Explicit Exemption: External Webhooks
  if (fullPath.startsWith('/webhook/') || fullPath.startsWith('/api/booking/')) {
    return next();
  }

  const configuredPassword = process.env.ADMIN_PASSWORD || config?.admin?.password || 'suregreet2026!';
  const allowedUsernames = [
    (process.env.ADMIN_USER || config?.admin?.username || 'admin').toLowerCase().trim(),
    'archit',
    'suregreet',
  ];

  // 3. 1-Click URL Token Bypass (e.g. ?key=suregreet2026!) or Custom Header
  const queryKey = req.query?.key || req.query?.token || req.query?.admin_key;
  const headerKey = req.headers['x-admin-key'] || req.headers['x-api-key'];

  if (queryKey === configuredPassword || headerKey === configuredPassword) {
    return next();
  }

  // 4. Bearer Token Check
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === configuredPassword) {
      return next();
    }
  }

  // 5. HTTP Basic Auth Check (Standard browser popup dialog)
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const b64 = authHeader.slice(6).trim();
      const decoded = Buffer.from(b64, 'base64').toString('utf-8');
      const colonIdx = decoded.indexOf(':');

      if (colonIdx !== -1) {
        const username = decoded.substring(0, colonIdx).trim().toLowerCase();
        const password = decoded.substring(colonIdx + 1);

        if (allowedUsernames.includes(username) && password === configuredPassword) {
          return next();
        }
      }
    } catch (e) {
      console.warn('[Admin Auth] Basic auth decode error:', e.message);
    }
  }

  // 6. Access Denied -> Challenge browser with HTTP 401 & WWW-Authenticate
  res.setHeader('WWW-Authenticate', 'Basic realm="SureGreet AI Agency Portal", charset="UTF-8"');

  const acceptsHtml = req.accepts('html');
  if (acceptsHtml) {
    return res.status(401).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>401 Restricted Access | SureGreet AI</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex items-center justify-center p-4 selection:bg-blue-500 selection:text-white">
  <div class="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl text-center">
    <div class="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-3xl flex items-center justify-center mx-auto mb-5 shadow-inner">
      🔒
    </div>
    <h1 class="text-xl font-bold tracking-tight text-white mb-2">Restricted Agency Area</h1>
    <p class="text-sm text-gray-400 leading-relaxed mb-6">
      Access to SureGreet AI private CRM pipeline, call telemetry, and outbound infrastructure requires verified agency credentials.
    </p>

    <div class="p-4 bg-gray-950/60 rounded-xl border border-gray-800/80 text-left mb-6 text-xs space-y-2">
      <div class="flex justify-between items-center text-gray-400">
        <span>Protected Resource:</span>
        <span class="text-blue-400 font-medium font-mono">${fullPath.split('?')[0]}</span>
      </div>
      <div class="flex justify-between items-center text-gray-400">
        <span>Accepted Users:</span>
        <span class="text-gray-200 font-mono">admin <span class="text-gray-500">(or archit)</span></span>
      </div>
      <div class="flex justify-between items-center text-gray-400">
        <span>Authentication:</span>
        <span class="text-emerald-400 font-mono">HTTP Basic Auth</span>
      </div>
    </div>

    <div class="space-y-3">
      <button onclick="location.reload()" class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-blue-500/20 flex items-center justify-center space-x-2">
        <span>Sign In to Agency Portal</span>
        <span>→</span>
      </button>
      <a href="/health" class="block text-xs text-gray-500 hover:text-gray-400 transition">
        ← Return to System Health Check
      </a>
    </div>
  </div>
</body>
</html>`);
  }

  return res.status(401).json({
    status: 'error',
    code: 'UNAUTHORIZED',
    message: 'Authentication required to access SureGreet AI internal agency resources.',
  });
}
