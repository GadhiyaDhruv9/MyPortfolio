import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { isSessionValid, type KiteSession } from './kite';

const SESSION_KEY = 'kite_session_v1';

/** How long the web app waits for the Zerodha login window to finish. */
const WEB_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const WEB_POLL_INTERVAL_MS = 2000;
const WEB_CLAIM_TIMEOUT_MS = 8000;
const PENDING_KEY = 'kite_pending_login_v1';

// The phone apps keep the token in secure storage; browsers only have localStorage.
const storage = {
  async get(): Promise<string | null> {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(SESSION_KEY);
    try {
      return window.localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  async set(value: string): Promise<void> {
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(SESSION_KEY, value);
    try {
      window.localStorage.setItem(SESSION_KEY, value);
    } catch {
      // Storage blocked (private mode); the session lasts until the page closes.
    }
  },
  async remove(): Promise<void> {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(SESSION_KEY);
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // Nothing stored.
    }
  },
};

export async function loadSession(): Promise<KiteSession | null> {
  try {
    const raw = await storage.get();
    const session = raw ? (JSON.parse(raw) as KiteSession) : null;
    return isSessionValid(session) ? session : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await storage.remove();
}

/** The worker's base URL. Also accepts the Kite redirect URL (…/callback), an easy mix-up. */
function serverBase(url: string) {
  return url.trim().replace(/\/+$/, '').replace(/\/callback$/, '');
}

function kiteLoginUrl(apiKey: string, redirectParams: string) {
  return (
    `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey.trim())}` +
    `&redirect_params=${encodeURIComponent(redirectParams)}`
  );
}

/** Random URL-safe id that ties the login window to this app. */
function newNonce(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Waits `ms`, or less if the page comes back to the foreground first. */
function waitOrVisible(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      resolve();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') done();
    };
    const timer = setTimeout(done, ms);
    document.addEventListener('visibilitychange', onVisible);
  });
}

// The login that's waiting on the auth worker, kept so it survives the iPhone home-screen
// app being reloaded while the Zerodha window is open.
type PendingWebLogin = { apiKey: string; server: string; nonce: string; deadline: number };

const pendingWebLogin = {
  get(): PendingWebLogin | null {
    try {
      const raw = window.localStorage.getItem(PENDING_KEY);
      const pending = raw ? (JSON.parse(raw) as PendingWebLogin) : null;
      return pending && pending.deadline > Date.now() ? pending : null;
    } catch {
      return null;
    }
  },
  set(value: PendingWebLogin) {
    try {
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(value));
    } catch {
      // Storage blocked; the login still works as long as the page isn't reloaded.
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {
      // Nothing stored.
    }
  },
};

/** Polls the auth worker until the login window has parked the request_token. */
async function claimRequestToken({ server, nonce, deadline }: PendingWebLogin): Promise<string | null> {
  try {
    while (Date.now() < deadline) {
      await waitOrVisible(WEB_POLL_INTERVAL_MS);
      let res: Response;
      try {
        // iPhone pauses the app while the login window is open, which can leave a request
        // hanging forever, so give each one up after a few seconds.
        res = await fetch(`${server}/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nonce }),
          signal: AbortSignal.timeout(WEB_CLAIM_TIMEOUT_MS),
        });
      } catch {
        continue; // Offline, paused or timed out; keep waiting.
      }
      const body = (await res.json().catch(() => ({}))) as { pending?: boolean; status?: string; request_token?: string; error?: string };
      if (res.status === 404 && body.pending) continue;
      if (res.status === 404) throw new Error('The auth server address looks wrong. Check it in Zerodha settings (it should not end in /callback).');
      if (!res.ok) throw new Error(body.error || `Auth server error (${res.status}).`);
      if (body.status !== 'success' || !body.request_token) throw new Error('Zerodha login was not completed.');
      return body.request_token;
    }
    return null;
  } finally {
    pendingWebLogin.clear();
  }
}

/**
 * Web/PWA: the login opens in its own window (on iPhone home-screen apps, a browser
 * sheet that can't pass data back), so the auth worker holds the request_token under a
 * one-time nonce and the app polls for it.
 */
function webRequestToken(apiKey: string, server: string): Promise<string | null> {
  const pending: PendingWebLogin = { apiKey: apiKey.trim(), server, nonce: newNonce(), deadline: Date.now() + WEB_LOGIN_TIMEOUT_MS };
  pendingWebLogin.set(pending);
  // Must open before the first await so browsers treat it as part of the tap.
  window.open(kiteLoginUrl(apiKey, `web_nonce=${pending.nonce}`), '_blank');
  return claimRequestToken(pending);
}

/** Phone apps: Kite redirects to the worker, which bounces back into the app via deep link. */
async function nativeRequestToken(apiKey: string): Promise<string | null> {
  const appRedirect = Linking.createURL('kite-auth');
  const result = await WebBrowser.openAuthSessionAsync(kiteLoginUrl(apiKey, `app_redirect=${appRedirect}`), appRedirect);
  if (result.type !== 'success') return null;

  const { queryParams } = Linking.parse(result.url);
  const requestToken = typeof queryParams?.request_token === 'string' ? queryParams.request_token : null;
  if (queryParams?.status !== 'success' || !requestToken) throw new Error('Zerodha login was not completed.');
  return requestToken;
}

/**
 * Logs in with Zerodha:
 * 1. Opens Kite's login page (in-app browser on phones, a new window on web).
 * 2. Kite redirects to the auth worker (your registered redirect URL), which hands the
 *    short-lived request_token back to the app.
 * 3. The worker exchanges the request_token for an access token using the API
 *    secret, which never reaches the device.
 * On web, Kite API calls also go through the worker, since Kite blocks browser calls.
 */
export async function loginWithZerodha(apiKey: string, authServerUrl: string): Promise<KiteSession | null> {
  const server = serverBase(authServerUrl);
  const requestToken = Platform.OS === 'web' ? await webRequestToken(apiKey, server) : await nativeRequestToken(apiKey);
  return requestToken ? createSession(apiKey, server, requestToken) : null;
}

/** Web: whether a login started before the page was reloaded is still waiting. */
export function hasPendingWebLogin(): boolean {
  return Platform.OS === 'web' && pendingWebLogin.get() !== null;
}

/** Web: picks a login started before the page was reloaded back up where it left off. */
export async function resumeWebLogin(): Promise<KiteSession | null> {
  const pending = Platform.OS === 'web' ? pendingWebLogin.get() : null;
  if (!pending) return null;
  const requestToken = await claimRequestToken(pending);
  return requestToken ? createSession(pending.apiKey, pending.server, requestToken) : null;
}

/** Swaps the request_token for an access token via the worker and stores the session. */
async function createSession(apiKey: string, server: string, requestToken: string): Promise<KiteSession> {
  const isWeb = Platform.OS === 'web';
  const res = await fetch(`${server}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_token: requestToken }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; user_id?: string; user_name?: string; error?: string };
  if (!res.ok || !body.access_token) throw new Error(body.error || `Auth server error (${res.status}).`);

  const session: KiteSession = {
    apiKey: apiKey.trim(),
    accessToken: body.access_token,
    userId: body.user_id,
    userName: body.user_name,
    issuedAt: new Date().toISOString(),
    apiBase: isWeb ? `${server}/kite` : undefined,
  };
  await storage.set(JSON.stringify(session));
  return session;
}
