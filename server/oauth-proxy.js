/* ============================================================
 * Reddit proxy (Cloudflare Worker) — for the slideshow
 * ------------------------------------------------------------
 * Two routes, both server-side (no browser CORS block, real User-Agent):
 *
 * 1) LIVE SAVED via private RSS  (the reliable path — no login, no expiring
 *    token, no app registration):
 *      GET  https://<worker>/rss?url=<url-encoded saved.rss URL>
 *    Fetches your private saved feed (old.reddit.com/user/<you>/saved.rss?feed=
 *    <token>&user=<you>, enabled at old.reddit.com/prefs/feeds), parses it, and
 *    returns the post ids. The app then hydrates full gallery/video media from
 *    Arctic Shift. The feed token is permanent, so this can run on a schedule.
 *
 * 2) OAuth passthrough (only if you have a bearer token):
 *      GET  https://<worker>/api?path=<oauth path>   header X-Reddit-Token: <tok>
 *
 * Deploy:  cd server && wrangler deploy oauth-proxy.js --name reddit-oauth
 *   → paste the printed URL into the app.  No KV/secret needed.
 * ============================================================ */

const UA = "web:calnetcorp-reddit-slideshow:1.1 (saved slideshow)";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "X-Reddit-Token,Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Pull t3 post ids out of a Reddit RSS/Atom feed (from permalinks + bare t3_ ids).
function idsFromFeed(xml) {
  const ids = [], seen = {};
  const add = (raw) => { const id = "t3_" + String(raw).toLowerCase(); if (!seen[id]) { seen[id] = 1; ids.push(id); } };
  let m;
  const rePerma = /\/comments\/([a-z0-9]+)[\/"?]/gi;
  while ((m = rePerma.exec(xml))) add(m[1]);
  const reT3 = /\bt3_([a-z0-9]+)\b/gi;
  while ((m = reT3.exec(xml))) add(m[1]);
  return ids;
}

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const route = url.pathname.replace(/\/+$/, "") || "/";

    if (route === "/") return json({ ok: true, service: "reddit-slideshow proxy", routes: ["/rss", "/api"] });

    // --- LIVE SAVED via private RSS feed ---
    if (route === "/rss") {
      const feed = url.searchParams.get("url") || "";
      let host = "";
      try { host = new URL(feed).hostname; } catch (e) { return json({ error: "bad or missing ?url=" }, 400); }
      if (!/(^|\.)reddit\.com$/i.test(host)) return json({ error: "only reddit.com feed URLs are allowed" }, 400);
      try {
        const r = await fetch(feed, { headers: { "User-Agent": UA, "Accept": "application/atom+xml, application/rss+xml, text/xml, */*" } });
        const body = await r.text();
        if (!r.ok) return json({ error: "feed returned HTTP " + r.status + " (check the token, or reset it at old.reddit.com/prefs/feeds)", status: r.status }, 502);
        const ids = idsFromFeed(body);
        return json({ ok: true, count: ids.length, ids });
      } catch (e) {
        return json({ error: "feed fetch failed: " + String((e && e.message) || e) }, 502);
      }
    }

    // --- OAuth passthrough (optional) ---
    if (route === "/api") {
      const token = req.headers.get("X-Reddit-Token");
      if (!token) return json({ error: "missing X-Reddit-Token header" }, 400);
      let path = url.searchParams.get("path") || "/api/v1/me";
      if (!path.startsWith("/")) path = "/" + path;
      try {
        const r = await fetch("https://oauth.reddit.com" + path, {
          headers: { "Authorization": "Bearer " + token, "User-Agent": UA, "Accept": "application/json" },
        });
        const body = await r.text();
        return new Response(body, { status: r.status, headers: { ...CORS, "Content-Type": r.headers.get("content-type") || "application/json" } });
      } catch (e) {
        return json({ error: "proxy fetch failed: " + String((e && e.message) || e) }, 502);
      }
    }

    return json({ error: "not found" }, 404);
  },
};
