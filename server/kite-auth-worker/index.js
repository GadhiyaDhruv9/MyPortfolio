/**
 * Kite Connect auth helper (Cloudflare Worker).
 *
 * Keeps the Kite API secret off the phone. Routes:
 *   GET  /callback  Kite's registered redirect URL.
 *                   - Native app: bounces the request_token back into the app (the deep
 *                     link the app passed via redirect_params as app_redirect).
 *                   - Web/PWA: parks the request_token in KV under the web_nonce the app
 *                     passed via redirect_params, and shows a "return to the app" page.
 *                     (iPhone home-screen apps open the login in a separate browser sheet
 *                     that can't hand data back, so the app collects it from here.)
 *   POST /claim     { nonce } → { status, request_token } once, or 404 while pending. Web only.
 *   POST /session   { request_token } → { access_token, user_id, user_name }.
 *                   Computes the checksum with the secret and calls Kite.
 *   GET  /kite/...  Read-only proxy to api.kite.trade for the web app, since Kite's API
 *                   blocks browser (CORS) calls. Forwards the caller's own access token.
 *
 * Secrets (set with `npx wrangler secret put …`): KITE_API_KEY, KITE_API_SECRET.
 * Vars (wrangler.toml): WEB_ORIGINS — comma-separated origins allowed to call from a browser.
 * KV binding: KITE_HANDOFF — holds a request_token for at most 5 minutes until claimed.
 * Stores nothing else; logs nothing.
 */

// Only bounce back into the app (Expo Go uses exp://, the built app uses myportfolio://).
const ALLOWED_APP_SCHEMES = ['exp:', 'exps:', 'myportfolio:'];

// Kite endpoints the app reads. Everything else is refused.
const PROXY_PATHS = ['/portfolio/holdings', '/trades', '/quote/ohlc'];

const NONCE_RE = /^[A-Za-z0-9_-]{22,64}$/;
const HANDOFF_TTL_SECONDS = 300;

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = (env.WEB_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Kite-Version',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {};
}

const json = (body, status = 200, origin = null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function donePage(ok) {
  const title = ok ? 'Logged in to Zerodha' : 'Zerodha login not completed';
  const message = ok
    ? 'Close this window and go back to the Portfolio app. It will finish connecting on its own.'
    : 'Close this window and go back to the Portfolio app to try again.';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>body{font-family:-apple-system,system-ui,sans-serif;background:#f2f4f7;color:#111827;margin:0;padding:48px 24px;text-align:center}
h1{font-size:22px;margin:0 0 12px}p{font-size:16px;line-height:1.5;color:#4b5563;max-width:360px;margin:0 auto}</style></head>
<body><h1>${ok ? '✅' : '⚠️'} ${title}</h1><p>${message}</p></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function handleCallback(url, env) {
  const webNonce = url.searchParams.get('web_nonce');
  if (webNonce !== null) {
    if (!NONCE_RE.test(webNonce) || !env.KITE_HANDOFF) return donePage(false);
    const status = url.searchParams.get('status') ?? '';
    const requestToken = url.searchParams.get('request_token') ?? '';
    await env.KITE_HANDOFF.put(webNonce, JSON.stringify({ status, request_token: requestToken }), { expirationTtl: HANDOFF_TTL_SECONDS });
    return donePage(status === 'success' && !!requestToken);
  }

  const appRedirect = url.searchParams.get('app_redirect');
  let target;
  try {
    target = new URL(appRedirect ?? '');
  } catch {
    return new Response('Missing or invalid app_redirect.', { status: 400 });
  }
  if (!ALLOWED_APP_SCHEMES.includes(target.protocol)) return new Response('Redirect not allowed.', { status: 400 });
  for (const key of ['request_token', 'status', 'action']) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleClaim(request, env, origin) {
  if (!env.KITE_HANDOFF) return json({ error: 'Worker is missing the KITE_HANDOFF KV binding.' }, 500, origin);
  const body = await readJson(request);
  const nonce = typeof body?.nonce === 'string' ? body.nonce : '';
  if (!NONCE_RE.test(nonce)) return json({ error: 'Invalid nonce.' }, 400, origin);
  const stored = await env.KITE_HANDOFF.get(nonce);
  if (!stored) return json({ pending: true }, 404, origin);
  await env.KITE_HANDOFF.delete(nonce);
  return json(JSON.parse(stored), 200, origin);
}

async function handleSession(request, env, origin) {
  if (!env.KITE_API_KEY || !env.KITE_API_SECRET) return json({ error: 'Worker is missing KITE_API_KEY / KITE_API_SECRET.' }, 500, origin);
  const body = await readJson(request);
  if (!body) return json({ error: 'Expected a JSON body.' }, 400, origin);
  const requestToken = typeof body?.request_token === 'string' ? body.request_token.trim() : '';
  if (!/^[A-Za-z0-9]{8,64}$/.test(requestToken)) return json({ error: 'Invalid request_token.' }, 400, origin);

  const checksum = await sha256Hex(env.KITE_API_KEY + requestToken + env.KITE_API_SECRET);
  const res = await fetch('https://api.kite.trade/session/token', {
    method: 'POST',
    headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ api_key: env.KITE_API_KEY, request_token: requestToken, checksum }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== 'success') return json({ error: data.message || `Kite returned ${res.status}.` }, 502, origin);

  const { access_token, user_id, user_name } = data.data;
  return json({ access_token, user_id, user_name }, 200, origin);
}

async function handleProxy(request, url, origin) {
  const path = url.pathname.slice('/kite'.length);
  if (!PROXY_PATHS.includes(path)) return json({ status: 'error', message: 'Not allowed.' }, 404, origin);
  const auth = request.headers.get('Authorization');
  if (!auth) return json({ status: 'error', message: 'Missing Authorization.', error_type: 'TokenException' }, 403, origin);
  const res = await fetch(`https://api.kite.trade${path}${url.search}`, {
    headers: { 'X-Kite-Version': '3', Authorization: auth },
  });
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    // Browsers must come from an allowed origin; native app requests carry no Origin.
    if (request.headers.get('Origin') && !origin && url.pathname !== '/callback') return new Response('Origin not allowed.', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    if (request.method === 'GET' && url.pathname === '/callback') return handleCallback(url, env);
    if (request.method === 'POST' && url.pathname === '/claim') return handleClaim(request, env, origin);
    if (request.method === 'POST' && url.pathname === '/session') return handleSession(request, env, origin);
    if (request.method === 'GET' && url.pathname.startsWith('/kite/')) return handleProxy(request, url, origin);
    if (request.method === 'GET' && url.pathname === '/') return new Response('Kite auth helper is running.');
    return new Response('Not found', { status: 404 });
  },
};
