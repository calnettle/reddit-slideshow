/* ============================================================
 * Reddit Saved → JSON  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * Pulls your LIVE saved posts from your logged-in Reddit session —
 * no API app, no monthly export. Runs inside the Reddit page via the
 * Shortcuts "Run JavaScript on Web Page" action, so requests carry
 * your login cookie (same-origin) and dodge Reddit's anonymous block.
 *
 * !! That action has a HARD ~1–2 SECOND time limit. Apple's own docs
 * say a 1s setTimeout is fine but a 5s one "might not complete in
 * time". So EVERYTHING here finishes inside DEADLINE_MS (~1.5s): it
 * grabs a few pages, saves its place in the page's localStorage, and
 * calls completion(). Run it again to get the next few — repeat until
 * "done":true. Upload each file; the slideshow dedupes/merges.
 *
 * ~1000 saved cap (Reddit). If a run says "run it again" with few/no
 * items, Reddit is throttling your repeated pulls — wait ~20–30s
 * between runs. Tune DEADLINE_MS down to 1200 if you still see the
 * "took too long" error, or up to 1800 if runs always succeed fast.
 * ============================================================ */
function run() {
  var DEADLINE_MS = 1500;                  // total budget — keep under the action's ~2s limit
  var deadline = Date.now() + DEADLINE_MS;
  var finished = false;
  var me = null, after = "", children = [], seen = {}, okAny = false;

  function remaining() { return deadline - Date.now(); }
  function getAfter() { try { return localStorage.getItem("rss_saved_after") || ""; } catch (e) { return ""; } }
  function setAfter(v) { try { if (v) localStorage.setItem("rss_saved_after", v); else localStorage.removeItem("rss_saved_after"); } catch (e) {} }
  function done(o) { if (finished) return; finished = true; try { completion(JSON.stringify(o)); } catch (e) {} }
  function payload() { return { source: "reddit-saved", user: me, count: children.length, done: !after, more: !!after, children: children }; }
  function backstop() { if (children.length || okAny) done(payload()); else done({ error: "Reddit was slow — wait ~20s and run it again (it resumes where it left off)." }); }

  // Backstop fires AT the deadline (a short ~1.5s timer, which the action allows)
  // so completion() is guaranteed even if a request is hung.
  try { setTimeout(backstop, Math.max(100, remaining())); } catch (e) {}

  // Each request is aborted at the deadline, so no single fetch can overrun.
  function tfetch(u) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, Math.max(120, remaining() - 40));
    return fetch(u, { credentials: "include", headers: { Accept: "application/json" }, signal: ctrl.signal })
      .finally(function () { clearTimeout(t); });
  }

  (async function () {
    try {
      // username: page DOM (instant, no network) → cache → me.json only if needed
      try { me = localStorage.getItem("rss_saved_user"); } catch (e) {}
      if (!me) {
        var a = document.querySelector('span.user a[href*="/user/"], #header-bottom-right a[href*="/user/"], a.user[href*="/user/"], p.user a[href*="/user/"]');
        var href = a && a.getAttribute("href");
        var mm = href && href.match(/\/user\/([^\/?#]+)/);
        if (mm) me = decodeURIComponent(mm[1]);
      }
      if (!me) { try { var r0 = await tfetch("/api/me.json"); if (r0 && r0.ok) { var j0 = await r0.json(); me = j0 && j0.data && j0.data.name; } } catch (e) {} }
      if (!me) { done({ error: "Open old.reddit.com while signed in, then run this on that page." }); return; }
      try { localStorage.setItem("rss_saved_user", me); } catch (e) {}

      after = getAfter();
      while (!finished && remaining() > 250) {   // leave headroom to call completion()
        var url = "/user/" + encodeURIComponent(me) + "/saved.json?limit=100&raw_json=1" + (after ? "&after=" + encodeURIComponent(after) : "");
        var res;
        try { res = await tfetch(url); } catch (e) { break; }   // abort/network → stop, keep cursor
        if (!res || !res.ok) break;
        okAny = true;
        var j = await res.json();
        var kids = (j && j.data && j.data.children) || [];
        for (var i = 0; i < kids.length; i++) { var c = kids[i]; var id = c && c.data && c.data.name; if (id && seen[id]) continue; if (id) seen[id] = 1; children.push(c); }
        var na = (j && j.data && j.data.after) || "";
        if (!na || na === after) { after = na; setAfter(after); break; }  // end / no progress
        after = na; setAfter(after);   // persist progress each page
      }

      if (!okAny && getAfter()) setAfter("");   // unstick a bad cursor
      if (!children.length && !okAny) { done({ error: "Reddit didn't respond in time — wait ~20s and run it again." }); return; }
      done(payload());
    } catch (e) { done({ error: String((e && e.message) || e) }); }
  })();
}
run();
