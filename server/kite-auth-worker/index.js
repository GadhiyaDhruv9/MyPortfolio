/**
 * Kite Connect auth helper (Cloudflare Worker).
 *
 * Keeps the Kite API secret off the phone. Two routes:
 *   GET  /callback  Kite's registered redirect URL. Bounces the request_token back
 *                   into the app (the deep link the app passed via redirect_params).
 *   POST /session   { request_token } → { access_token, user_id, user_name }.
 *                   Computes the checksum with the secret and calls Kite.
 *
 * Secrets (set with `npx wrangler secret put …`): KITE_API_KEY, KITE_API_SECRET.
 * Stores nothing; logs nothing.
 */

// Only bounce back into the app (Expo Go uses exp://, the built app uses myportfolio://).
const ALLOWED_APP_SCHEMES = ['exp:', 'exps:', 'myportfolio:'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function handleCallback(url) {
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

async function handleSession(request, env) {
  if (!env.KITE_API_KEY || !env.KITE_API_SECRET) return json({ error: 'Worker is missing KITE_API_KEY / KITE_API_SECRET.' }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }
  const requestToken = typeof body?.request_token === 'string' ? body.request_token.trim() : '';
  if (!/^[A-Za-z0-9]{8,64}$/.test(requestToken)) return json({ error: 'Invalid request_token.' }, 400);

  const checksum = await sha256Hex(env.KITE_API_KEY + requestToken + env.KITE_API_SECRET);
  const res = await fetch('https://api.kite.trade/session/token', {
    method: 'POST',
    headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ api_key: env.KITE_API_KEY, request_token: requestToken, checksum }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== 'success') return json({ error: data.message || `Kite returned ${res.status}.` }, 502);

  const { access_token, user_id, user_name } = data.data;
  return json({ access_token, user_id, user_name });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/callback') return handleCallback(url);
    if (request.method === 'POST' && url.pathname === '/session') return handleSession(request, env);
    if (request.method === 'GET' && url.pathname === '/') return new Response('Kite auth helper is running.');
    return new Response('Not found', { status: 404 });
  },
};
