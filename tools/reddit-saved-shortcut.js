/* ============================================================
 * Reddit Saved → JSON  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * Pulls your LIVE saved posts from your logged-in Reddit session.
 * "Run JavaScript on Web Page" has a HARD ~1–2s limit AND Reddit's
 * saved.json can be slow/throttled — too slow to fetch in that window.
 *
 * So the RELIABLE path reads the posts straight from the page that's
 * ALREADY rendered (zero network, can't time out):
 *
 *   ➜ Open  https://old.reddit.com/saved?limit=100  (signed in),
 *     run the Shortcut, upload the file. It grabs the ~100 posts on
 *     that page instantly and auto-advances to the next page — just
 *     run it again for the next 100. Repeat until "done":true.
 *
 * (If you run it on a non-saved page it falls back to fetching
 * saved.json, which only works when Reddit isn't throttling you.)
 *
 * Note: the page-read path captures image/link posts reliably; some
 * v.redd.it videos and galleries need the JSON path (or the GDPR
 * export) for full media. Output: {source,user,count,done,more,
 * nextUrl,children:[…]} — the slideshow imports `children`.
 * ============================================================ */
function run() {
  var DEADLINE_MS = 2000;
  var deadline = Date.now() + DEADLINE_MS;
  var finished = false, me = null, userSrc = "none", after = "", children = [], seen = {}, okAny = false;
  var loc = (typeof location !== "undefined" && location) ? location : { hostname: "", pathname: "", href: "" };
  var dbg = { host: loc.hostname || "", path: loc.pathname || "", dom: 0, savedMs: null, savedOutcome: null };

  function remaining() { return deadline - Date.now(); }
  function getAfter() { try { return localStorage.getItem("rss_saved_after") || ""; } catch (e) { return ""; } }
  function setAfter(v) { try { if (v) localStorage.setItem("rss_saved_after", v); else localStorage.removeItem("rss_saved_after"); } catch (e) {} }
  function done(o) { if (finished) return; finished = true; try { completion(JSON.stringify(o)); } catch (e) {} }
  function payload(extra) { var p = { source: "reddit-saved", user: me, count: children.length, done: !after, more: !!after, children: children }; if (extra) for (var k in extra) p[k] = extra[k]; return p; }
  function fail(msg) { done({ error: msg, diag: { host: dbg.host, path: dbg.path, dom: dbg.dom, user: me || null, userSrc: userSrc, savedMs: dbg.savedMs, savedOutcome: dbg.savedOutcome, got: children.length } }); }
  function backstop() { if (children.length || okAny) done(payload()); else fail("Reddit didn't respond in time."); }
  try { setTimeout(backstop, Math.max(100, remaining())); } catch (e) {}

  function tfetch(u) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, Math.max(120, remaining() - 40));
    return fetch(u, { credentials: "include", headers: { Accept: "application/json" }, signal: ctrl.signal }).finally(function () { clearTimeout(t); });
  }

  // --- Read saved posts already rendered on old.reddit.com/saved (instant) ---
  function scrapeDom() {
    var out = [];
    try {
      var things = document.querySelectorAll('.thing[data-fullname^="t3_"]');
      for (var i = 0; i < things.length; i++) {
        var el = things[i];
        var name = el.getAttribute("data-fullname");
        if (!name || seen[name]) continue;
        seen[name] = 1;
        var ts = el.getAttribute("data-timestamp");
        var titleEl = el.querySelector("a.title");
        var scoreEl = el.querySelector(".score.unvoted") || el.querySelector(".score");
        out.push({ kind: "t3", data: {
          name: name, id: name.slice(3),
          subreddit: el.getAttribute("data-subreddit") || "",
          permalink: el.getAttribute("data-permalink") || "",
          url: el.getAttribute("data-url") || "",
          domain: el.getAttribute("data-domain") || "",
          title: titleEl ? (titleEl.textContent || "").trim() : "",
          created_utc: ts ? Math.floor(parseInt(ts, 10) / 1000) : 0,
          score: scoreEl ? (parseInt(scoreEl.getAttribute("title") || scoreEl.textContent, 10) || 0) : 0
        } });
      }
    } catch (e) {}
    return out;
  }
  function nextPageUrl() { try { var a = document.querySelector(".next-button a"); return (a && a.getAttribute("href")) || ""; } catch (e) { return ""; } }

  (async function () {
    try {
      // 1) Reliable path: scrape the rendered saved page (no network → no timeout)
      var domKids = scrapeDom();
      dbg.dom = domKids.length;
      if (domKids.length) {
        for (var d = 0; d < domKids.length; d++) children.push(domKids[d]);
        var nu = nextPageUrl();
        try { me = localStorage.getItem("rss_saved_user"); } catch (e) {}
        done(payload({ via: "page", nextUrl: nu, more: !!nu, done: !nu }));
        try { if (nu) location.assign(nu); } catch (e) {} // auto-advance to the next saved page
        return;
      }

      // 2) Fallback: fetch saved.json (only fast enough when not throttled)
      try { me = localStorage.getItem("rss_saved_user"); if (me) userSrc = "cache"; } catch (e) {}
      if (!me) {
        var a2 = document.querySelector('span.user a[href*="/user/"], #header-bottom-right a[href*="/user/"], a.user[href*="/user/"], p.user a[href*="/user/"]');
        var href = a2 && a2.getAttribute("href"); var mm = href && href.match(/\/user\/([^\/?#]+)/);
        if (mm) { me = decodeURIComponent(mm[1]); userSrc = "dom"; }
      }
      if (!me) { try { var r0 = await tfetch("/api/me.json"); if (r0 && r0.ok) { var j0 = await r0.json(); me = j0 && j0.data && j0.data.name; if (me) userSrc = "me.json"; } } catch (e) {} }
      if (!me) { fail("Open old.reddit.com/saved?limit=100 while signed in, then run this there."); return; }
      try { localStorage.setItem("rss_saved_user", me); } catch (e) {}

      after = getAfter();
      while (!finished && remaining() > 250) {
        var url = "/user/" + encodeURIComponent(me) + "/saved.json?limit=100&raw_json=1" + (after ? "&after=" + encodeURIComponent(after) : "");
        var ms1 = Date.now(), res;
        try { res = await tfetch(url); } catch (e) { dbg.savedMs = Date.now() - ms1; dbg.savedOutcome = "aborted/net"; break; }
        dbg.savedMs = Date.now() - ms1;
        if (!res || !res.ok) { dbg.savedOutcome = "http " + (res && res.status); break; }
        dbg.savedOutcome = "ok"; okAny = true;
        var j = await res.json();
        var kids = (j && j.data && j.data.children) || [];
        for (var i2 = 0; i2 < kids.length; i2++) { var c = kids[i2]; var id = c && c.data && c.data.name; if (id && seen[id]) continue; if (id) seen[id] = 1; children.push(c); }
        var na = (j && j.data && j.data.after) || "";
        if (!na || na === after) { after = na; setAfter(after); break; }
        after = na; setAfter(after);
      }
      if (!okAny && getAfter()) setAfter("");
      if (!children.length && !okAny) { fail("Reddit's saved.json was too slow (throttled). Use old.reddit.com/saved?limit=100 instead — that reads the page directly."); return; }
      done(payload());
    } catch (e) { done({ error: String((e && e.message) || e), diag: { host: dbg.host, path: dbg.path } }); }
  })();
}
run();
