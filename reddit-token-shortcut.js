/* ============================================================
 * Reddit access TOKEN grabber  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * The reliable way to get your FULL saved posts (galleries + videos
 * included) without an API app or the monthly export.
 *
 * Your logged-in Reddit web session already holds a short-lived OAuth
 * bearer token. This reads it straight out of the page — INSTANT, no
 * network — so it can't hit the "Run JavaScript on Web Page" ~2s limit
 * and can't be rate-limited. You paste the token into the slideshow
 * (Option A → "Or paste an access token"), then "Fetch saved posts":
 * the app pulls everything from oauth.reddit.com (the real API, high
 * rate limits, full media), with no time limit of its own.
 *
 *   ➜ Run it on  https://www.reddit.com  (NEW design, signed in).
 *     On success the result IS the token — copy/paste it into the app.
 *     Tokens last ~1 hour; grab a fresh one if it says expired.
 * ============================================================ */
function run() {
  function out(o) { try { completion(typeof o === "string" ? o : JSON.stringify(o)); } catch (e) {} }
  function decode(jwt) {
    try { var p = jwt.split("."); if (p.length !== 3) return null; var b = p[1].replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "="; return JSON.parse(atob(b)); } catch (e) { return null; }
  }
  function isRedditToken(jwt) {
    var pl = decode(jwt); if (!pl) return false;
    var now = Math.floor(Date.now() / 1000);
    if (pl.exp && pl.exp < now) return false;                          // expired
    // Reddit access-token payloads carry these-ish fields:
    return !!(pl.scope || pl.client_id || pl.lid || pl.sub || (pl.aud && String(pl.aud).indexOf("reddit") >= 0));
  }

  var found = null, where = null;
  var rx = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
  function scan(text, label) {
    if (found || !text) return;
    var m; rx.lastIndex = 0;
    while ((m = rx.exec(text))) { if (isRedditToken(m[0])) { found = m[0]; where = label; return; } }
  }

  try {
    // 1) server-embedded session JSON in the page HTML
    try { scan(document.documentElement && document.documentElement.innerHTML, "page"); } catch (e) {}
    // 2) local/session storage (new Reddit stashes a token here)
    try { for (var i = 0; i < localStorage.length && !found; i++) { var k = localStorage.key(i); scan(localStorage.getItem(k), "localStorage:" + k); } } catch (e) {}
    try { for (var j = 0; j < sessionStorage.length && !found; j++) { var k2 = sessionStorage.key(j); scan(sessionStorage.getItem(k2), "sessionStorage:" + k2); } } catch (e) {}
    // 3) known globals
    try { var gs = [window.___r, window.__r, window.__reddit]; for (var x = 0; x < gs.length && !found; x++) { if (gs[x]) scan(JSON.stringify(gs[x]), "global"); } } catch (e) {}
  } catch (e) {}

  var host = (typeof location !== "undefined" && location && location.hostname) || "";
  if (found) {
    out(found); // the result IS the bare token — paste it straight into the app
  } else {
    out({ ok: false, error: "No token found here. Open https://www.reddit.com (new design, signed in) and run it there — not old.reddit.com.", host: host });
  }
}
run();
