// Client helper for the server-side admin write API (issue #3).
//
// Writes no longer go directly to Supabase with the public anon key. Instead
// they POST to the Express admin endpoints (same-origin relative URLs, matching
// the existing /api proxy pattern), which perform the write with the private
// service-role key. On a non-2xx response we throw with the server's error
// message so existing UI error handling surfaces it unchanged — including the
// 503 shown until SUPABASE_SERVICE_ROLE_KEY is configured.

export async function adminPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON response (e.g. proxy/HTML error) — fall through to status text.
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message)
        : '') || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}
