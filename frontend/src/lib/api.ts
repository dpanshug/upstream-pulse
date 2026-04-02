/**
 * Centralized API fetch wrapper with session-expiry handling.
 *
 * When the oauth-proxy session expires it redirects API requests to the
 * OpenShift OAuth login page. The browser either follows the cross-origin
 * redirect (CORS failure → TypeError) or returns HTML instead of JSON.
 * This wrapper detects both cases and triggers a transparent re-login
 * instead of surfacing a confusing "Failed to fetch" error.
 */

const API_URL = import.meta.env.VITE_API_URL ?? '';

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Redirecting to login…');
    this.name = 'SessionExpiredError';
  }
}

function redirectToLogin(): never {
  window.location.href = '/';
  throw new SessionExpiredError();
}

/**
 * Drop-in replacement for `fetch()` that prefixes `API_URL` and handles
 * session expiry transparently.
 *
 * Usage:
 *   const res = await apiFetch('/api/metrics/dashboard?days=30');
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let res: Response;

  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    // Network error — usually a CORS failure after an oauth redirect
    redirectToLogin();
  }

  if (res.status === 401) {
    redirectToLogin();
  }

  // oauth-proxy may redirect to the HTML login page and the browser follows
  // it, giving us a 200 with text/html instead of application/json.
  const ct = res.headers.get('content-type') ?? '';
  if (res.ok && !ct.includes('json') && path.startsWith('/api/')) {
    redirectToLogin();
  }

  return res;
}
