/* ============================================================
 * Reddit OAuth proxy (Cloudflare Worker)
 * ------------------------------------------------------------
 * Browsers can't call oauth.reddit.com from a non-Reddit website — Reddit's
 * edge blocks it (the slideshow app sees "Load failed"). This Worker makes that
 * call SERVER-SIDE instead: it forwards
 *
 *     GET  https://<worker>/api?path=<url-encoded oauth.reddit.com path>
 *     header  X-Reddit-Token: <your bearer token>
 *
 * to oauth.reddit.com with the bearer token + a real User-Agent, and returns the
 * response with permissive CORS so the app can read it. No time limit, no browser
 * block, full gallery/video media. The app paginates by calling this per page.
 *
 * Deploy:
 *   cd server
 *   wrangler deploy oauth-proxy.js --name reddit-oauth
 *   → paste the printed URL into the app (Option A → Worker proxy URL).
 * Or in the dashboard: new Worker, paste this file, deploy. No KV/secret needed.
 * ============================================================ */

const UA = "web:calnetcorp-reddit-slideshow:1.0 (saved exporter)";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "X-Reddit-Token,Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const route = url.pathname.replace(/\/+$/, "") || "/";

    if (route === "/") return json({ ok: true, service: "reddit-slideshow oauth proxy" });
    if (route !== "/api") return json({ error: "not found" }, 404);

    const token = req.headers.get("X-Reddit-Token");
    if (!token) return json({ error: "missing X-Reddit-Token header" }, 400);

    // The full oauth.reddit.com path (incl. its own query string) arrives
    // url-encoded in ?path= ; default to /api/v1/me.
    let path = url.searchParams.get("path") || "/api/v1/me";
    if (!path.startsWith("/")) path = "/" + path;

    try {
      const r = await fetch("https://oauth.reddit.com" + path, {
        headers: { "Authorization": "Bearer " + token, "User-Agent": UA, "Accept": "application/json" },
      });
      const body = await r.text();
      // Pass Reddit's status + body straight through (with CORS) so the app can
      // surface 401/403/etc. instead of an opaque failure.
      return new Response(body, {
        status: r.status,
        headers: { ...CORS, "Content-Type": r.headers.get("content-type") || "application/json" },
      });
    } catch (e) {
      return json({ error: "proxy fetch failed: " + String((e && e.message) || e) }, 502);
    }
  },
};
