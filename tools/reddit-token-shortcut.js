/* ============================================================
 * Reddit access TOKEN grabber  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * Reads your logged-in Reddit web session's OAuth bearer token out of
 * the page — INSTANT (no network → no ~2s timeout, no rate-limit). You
 * paste it into the slideshow (Option A) and the app pulls your saved
 * posts (galleries + videos) via your Worker proxy.
 *
 *   ➜ Run it on the FEED at  https://sh.reddit.com  (signed in).
 *     sh.reddit.com is the NEW-Reddit host that won't redirect you to
 *     old.reddit.com (old Reddit has no token). On success the result
 *     IS the token (eyJ…) — copy it into the app.
 *
 * If it can't find one it returns a small {ok:false,…} report (how many
 * tokens it saw, whether they were expired, the storage keys present) —
 * paste that back and it'll be obvious what to do.
 * ============================================================ */
function run() {
  function out(o) { try { completion(typeof o === "string" ? o : JSON.stringify(o)); } catch (e) {} }
  function decode(jwt) {
    try { var p = jwt.split("."); if (p.length !== 3) return null; var b = p[1].replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "="; return JSON.parse(atob(b)); } catch (e) { return null; }
  }
  var now = Math.floor(Date.now() / 1000);
  var rx = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g;
  var seenAll = {}, cands = [];
  function harvest(text, label) {
    if (!text) return;
    rx.lastIndex = 0; var m;
    while ((m = rx.exec(text))) {
      var t = m[0]; if (seenAll[t]) continue; seenAll[t] = 1;
      var pl = decode(t); if (!pl) continue;                        // not a real JWT (random eyJ… match)
      var expired = !!(pl.exp && pl.exp < now);
      var tokenish = !!(pl.scope || pl.scopes || pl.scp || pl.client_id || pl.cid || pl.aud);
      cands.push({ t: t, label: label, expired: expired, tokenish: tokenish, hasSub: !!pl.sub, len: t.length });
    }
  }

  try { harvest(document.documentElement && document.documentElement.innerHTML, "page"); } catch (e) {}
  try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); harvest(localStorage.getItem(k), "ls:" + k); } } catch (e) {}
  try { for (var j = 0; j < sessionStorage.length; j++) { var k2 = sessionStorage.key(j); harvest(sessionStorage.getItem(k2), "ss:" + k2); } } catch (e) {}
  try { var gs = [window.___r, window.__r, window.__reddit, window.__SHREDDIT_SESSION__, window.__reddit_session, window.r]; for (var x = 0; x < gs.length; x++) { if (gs[x]) harvest(JSON.stringify(gs[x]), "global"); } } catch (e) {}
  try { harvest(document.cookie, "cookie"); } catch (e) {}

  // Prefer an unexpired token that looks like an access token, then the longest.
  var live = cands.filter(function (c) { return !c.expired; });
  live.sort(function (a, b) { return (b.tokenish - a.tokenish) || (b.hasSub - a.hasSub) || (b.len - a.len); });
  var host = (typeof location !== "undefined" && location && location.hostname) || "";

  if (live.length) { out(live[0].t); return; }

  var lsKeys = []; try { for (var z = 0; z < localStorage.length; z++) lsKeys.push(localStorage.key(z)); } catch (e) {}
  var msg = host === "old.reddit.com"
    ? "You're on OLD Reddit (no token). Open the feed at https://sh.reddit.com, signed in, and run it there."
    : cands.length
      ? "Found only EXPIRED tokens. Pull-to-refresh sh.reddit.com to mint a fresh one, then run it again."
      : "No token found on this page. Open the FEED at https://sh.reddit.com (signed in) and run it there.";
  out({ ok: false, error: msg, host: host, jwtsFound: cands.length, anyExpired: cands.some(function (c) { return c.expired; }), lsKeys: lsKeys.slice(0, 40) });
}
run();
