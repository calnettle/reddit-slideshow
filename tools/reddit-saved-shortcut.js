/* ============================================================
 * Reddit Saved → JSON  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * Pulls your LIVE saved posts from your logged-in Reddit session.
 * Runs inside the Reddit page via "Run JavaScript on Web Page", which
 * has a HARD ~1–2s time limit, so everything finishes inside
 * DEADLINE_MS and resumes across runs via a cursor in localStorage.
 *
 * On success: {source,user,count,done,more,children:[…]} — upload to
 * the slideshow; run again until "done":true.
 *
 * On failure it returns a small {error,diag:{…}} object — copy the
 * whole thing back so the cause is obvious (which host you're on,
 * whether your username was found, and how the saved request failed).
 * Run it on **old.reddit.com** while signed in.
 * ============================================================ */
function run() {
  var DEADLINE_MS = 1700;
  var deadline = Date.now() + DEADLINE_MS;
  var finished = false, me = null, userSrc = "none", after = "", children = [], seen = {}, okAny = false;
  var loc = (typeof location !== "undefined" && location) ? location : { hostname: "", pathname: "" };
  var dbg = { host: loc.hostname || "", path: loc.pathname || "", meMs: null, meStatus: null, savedMs: null, savedOutcome: null };

  function remaining() { return deadline - Date.now(); }
  function getAfter() { try { return localStorage.getItem("rss_saved_after") || ""; } catch (e) { return ""; } }
  function setAfter(v) { try { if (v) localStorage.setItem("rss_saved_after", v); else localStorage.removeItem("rss_saved_after"); } catch (e) {} }
  function done(o) { if (finished) return; finished = true; try { completion(JSON.stringify(o)); } catch (e) {} }
  function payload() { return { source: "reddit-saved", user: me, count: children.length, done: !after, more: !!after, children: children }; }
  function fail(msg) {
    done({ error: msg, diag: { host: dbg.host, path: dbg.path, onOldReddit: dbg.host === "old.reddit.com", user: me || null, userSrc: userSrc, meMs: dbg.meMs, meStatus: dbg.meStatus, savedMs: dbg.savedMs, savedOutcome: dbg.savedOutcome, got: children.length } });
  }
  function backstop() { if (children.length || okAny) done(payload()); else fail("Reddit didn't respond in time."); }
  try { setTimeout(backstop, Math.max(100, remaining())); } catch (e) {}

  function tfetch(u) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, Math.max(120, remaining() - 40));
    return fetch(u, { credentials: "include", headers: { Accept: "application/json" }, signal: ctrl.signal })
      .finally(function () { clearTimeout(t); });
  }

  (async function () {
    try {
      // username: cache → page DOM → me.json (timed)
      try { me = localStorage.getItem("rss_saved_user"); if (me) userSrc = "cache"; } catch (e) {}
      if (!me) {
        var a = document.querySelector('span.user a[href*="/user/"], #header-bottom-right a[href*="/user/"], a.user[href*="/user/"], p.user a[href*="/user/"]');
        var href = a && a.getAttribute("href");
        var mm = href && href.match(/\/user\/([^\/?#]+)/);
        if (mm) { me = decodeURIComponent(mm[1]); userSrc = "dom"; }
      }
      if (!me) {
        var ms0 = Date.now();
        try { var r0 = await tfetch("/api/me.json"); dbg.meStatus = r0 && r0.status; if (r0 && r0.ok) { var j0 = await r0.json(); me = j0 && j0.data && j0.data.name; if (me) userSrc = "me.json"; } }
        catch (e) { dbg.meStatus = "abort/net"; }
        dbg.meMs = Date.now() - ms0;
      }
      if (!me) { fail("Couldn't find your username — run this on old.reddit.com while signed in."); return; }
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
        for (var i = 0; i < kids.length; i++) { var c = kids[i]; var id = c && c.data && c.data.name; if (id && seen[id]) continue; if (id) seen[id] = 1; children.push(c); }
        var na = (j && j.data && j.data.after) || "";
        if (!na || na === after) { after = na; setAfter(after); break; }
        after = na; setAfter(after);
      }

      if (!okAny && getAfter()) setAfter("");
      if (!children.length && !okAny) { fail("Reddit didn't respond in time."); return; }
      done(payload());
    } catch (e) { done({ error: String((e && e.message) || e), diag: { host: dbg.host, path: dbg.path } }); }
  })();
}
run();
