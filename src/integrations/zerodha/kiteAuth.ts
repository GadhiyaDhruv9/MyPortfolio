import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { isSessionValid, type KiteSession } from './kite';

const SESSION_KEY = 'kite_session_v1';

/** Kite's API does not allow browser (CORS) calls, so sync is phone-only. */
export const kiteSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export async function loadSession(): Promise<KiteSession | null> {
  if (!kiteSupported) return null;
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as KiteSession) : null;
    return isSessionValid(session) ? session : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  if (!kiteSupported) return;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

function trimSlash(url: string) {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Logs in with Zerodha:
 * 1. Opens Kite's login page in an in-app browser.
 * 2. Kite redirects to the auth worker (your registered redirect URL), which bounces
 *    back into the app with a short-lived request_token.
 * 3. The worker exchanges the request_token for an access token using the API
 *    secret, which never reaches the phone.
 */
export async function loginWithZerodha(apiKey: string, authServerUrl: string): Promise<KiteSession | null> {
  if (!kiteSupported) throw new Error('Zerodha sync works in the iOS/Android app only.');
  const appRedirect = Linking.createURL('kite-auth');
  const loginUrl =
    `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey.trim())}` +
    `&redirect_params=${encodeURIComponent(`app_redirect=${appRedirect}`)}`;

  const result = await WebBrowser.openAuthSessionAsync(loginUrl, appRedirect);
  if (result.type !== 'success') return null;

  const { queryParams } = Linking.parse(result.url);
  const requestToken = typeof queryParams?.request_token === 'string' ? queryParams.request_token : null;
  if (queryParams?.status !== 'success' || !requestToken) throw new Error('Zerodha login was not completed.');

  const res = await fetch(`${trimSlash(authServerUrl)}/session`, {
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
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  return session;
}
