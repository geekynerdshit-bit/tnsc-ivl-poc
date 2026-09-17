// Vercel Edge Middleware — gates /dashboard and /tags behind a single shared
// passcode. This is NOT a login system: no accounts, no per-user sessions,
// nothing for a field engineer to sign up for. One org-wide PIN, checked at
// the edge before the page is served at all, so an engineer hitting the URL
// sees a passcode prompt, never the dashboard's HTML or data.
//
// Threat model: keep casual field staff off the admin view, not defend
// against a determined attacker. /scan is never gated — it must stay
// reachable from every NFC tag with no prompt in the way.
//
// Set DASHBOARD_PASSCODE in Vercel → Project → Settings → Environment
// Variables. If it's unset, the gated routes are blocked entirely (fails
// closed) rather than silently left open.

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/tags', '/tags/:path*'],
  // Vercel now prefers the Node.js runtime for Middleware over the older
  // Edge-only default. Everything this file uses (Request/Response/URL,
  // FormData, crypto.subtle) is a standard Web API available in both, so
  // this is a config-only change — no logic here needed to move.
  runtime: 'nodejs',
};

const COOKIE_NAME = 'tnsc_dash_auth';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function gatePage({ wrong = false, redirectTo = '/dashboard' } = {}) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>IVL Console Tracker — Restricted</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0A1628; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 20px;
  }
  .card {
    background: #fff; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,.25);
    padding: 34px 28px; max-width: 340px; width: 100%; text-align: center;
  }
  h1 { font-size: 17px; color: #0F1E33; margin-bottom: 6px; }
  p { font-size: 13.5px; color: #64748b; margin-bottom: 20px; line-height: 1.5; }
  input {
    width: 100%; height: 50px; border: 1px solid #cbd5e1; border-radius: 6px;
    text-align: center; font-size: 22px; letter-spacing: 6px; margin-bottom: 14px;
    outline: none; color: #0F1E33;
  }
  input:focus { border-color: #00BFA5; box-shadow: 0 0 0 3px rgba(0,191,165,.15); }
  button {
    width: 100%; height: 48px; border: none; border-radius: 6px; cursor: pointer;
    background: #0A1628; color: #00BFA5; font-size: 15px; font-weight: 700;
  }
  .err { color: #991B1B; font-size: 13px; margin-bottom: 14px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Restricted area</h1>
    <p>This is the admin view. Enter the shared access code to continue.</p>
    ${wrong ? '<div class="err">Incorrect code — try again.</div>' : ''}
    <form method="POST">
      <input type="password" name="passcode" inputmode="numeric" autocomplete="off" autofocus required />
      <input type="hidden" name="redirect" value="${redirectTo}" />
      <button type="submit">Continue</button>
    </form>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const passcode = process.env.DASHBOARD_PASSCODE;

  // Fail closed: an unconfigured passcode blocks the route rather than
  // leaving the admin view open.
  if (!passcode) {
    return new Response(
      'Dashboard is not configured. Set DASHBOARD_PASSCODE in the Vercel project settings.',
      { status: 503, headers: { 'content-type': 'text/plain' } }
    );
  }

  const expected = await sha256Hex(passcode);

  if (request.method === 'POST') {
    const form = await request.formData();
    const entered = String(form.get('passcode') || '');
    const redirectTo = String(form.get('redirect') || '/dashboard');

    if (entered === passcode) {
      const res = new Response(null, {
        status: 303,
        headers: { Location: redirectTo },
      });
      res.headers.append(
        'Set-Cookie',
        `${COOKIE_NAME}=${expected}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`
      );
      return res;
    }
    return gatePage({ wrong: true, redirectTo });
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([a-f0-9]+)`));
  if (match && match[1] === expected) {
    return; // valid session — let the request through to the SPA
  }

  return gatePage({ redirectTo: url.pathname });
}
