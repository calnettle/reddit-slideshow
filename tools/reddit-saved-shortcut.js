/* ============================================================
 * Reddit Saved → JSON  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * Pulls your LIVE saved posts from your logged-in Reddit session —
 * no API app, no monthly export. Runs inside the Reddit page via the
 * Shortcuts "Run JavaScript on Web Page" action, so requests carry
 * your login cookie (same-origin) and dodge Reddit's anonymous block
 * and CORS.
 *
 * That action shares Safari's SHORT JS time limit and fails ("took
 * too long to call the completion handler") if it runs too long — so
 * this is built to ALWAYS finish fast:
 *   • each request is aborted if it stalls (REQ_MS)
 *   • an absolute backstop guarantees completion() fires (SAFETY_MS)
 *   • progress is saved per-page in the page's localStorage, so it
 *     resumes where it left off and can never get stuck.
 * Run it a few times: each run returns a chunk with "more":true until
 * "done":true. Upload each file — the slideshow dedupes/merges. Reddit
 * caps saved at ~1000; use the GDPR export for the full history.
 *
 * If Reddit starts throttling your repeated pulls, a run may come back
 * with a "run it again" message and fewer items — that's expected;
 * wait a few seconds and re-run, progress is kept.
 * ============================================================ */
function run() {
  var HARD_MS = 5000;    // stop starting new requests after this
  var REQ_MS = 3500;     // abort any single request that stalls past this
  var SAFETY_MS = 7000;  // absolute backstop — guarantee completion() in time
  var start = Date.now();
  var finished = false;
  var me = null, after = "", children = [], seen = {}, okAny = false;

  function getAfter() { try { return localStorage.getItem("rss_saved_after") || ""; } catch (e) { return ""; } }
  function setAfter(v) { try { if (v) localStorage.setItem("rss_saved_after", v); else localStorage.removeItem("rss_saved_after"); } catch (e) {} }
  function done(obj) { if (finished) return; finished = true; try { completion(JSON.stringify(obj)); } catch (e) {} }
  function payload() { return { source: "reddit-saved", user: me, count: children.length, done: !after, more: !!after, children: children }; }
  function bail() { if (children.length) done(payload()); else done({ error: "Reddit was slow to respond — wait a few seconds and run it again (it resumes where it left off)." }); }

  // Absolute backstop: completion() WILL be called within the time limit,
  // even if a request is hung. (The limit is ~9s+; this fires before it.)
  try { setTimeout(bail, SAFETY_MS); } catch (e) {}

  // fetch with a per-request timeout so one stalled request can't hang the script.
  function tfetch(u) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, REQ_MS);
    return fetch(u, { credentials: "include", headers: { Accept: "application/json" }, signal: ctrl.signal })
      .finally(function () { clearTimeout(t); });
  }

  (async function () {
    try {
      // --- username: page DOM (no network) → cache → me.json fallback
      try { me = localStorage.getItem("rss_saved_user"); } catch (e) {}
      if (!me) {
        var a = document.querySelector('span.user a[href*="/user/"], #header-bottom-right a[href*="/user/"], a.user[href*="/user/"]');
        var href = a && a.getAttribute("href");
        var mm = href && href.match(/\/user\/([^\/?#]+)/);
        if (mm) me = decodeURIComponent(mm[1]);
      }
      if (!me) { try { var r0 = await tfetch("/api/me.json"); if (r0 && r0.ok) { var j0 = await r0.json(); me = j0 && j0.data && j0.data.name; } } catch (e) {} }
      if (!me) { done({ error: "Open old.reddit.com while signed in, then run this on that page." }); return; }
      try { localStorage.setItem("rss_saved_user", me); } catch (e) {}

      // --- page saved.json, resuming from the saved cursor
      after = getAfter();
      while (!finished && (Date.now() - start) < HARD_MS) {
        var url = "/user/" + encodeURIComponent(me) + "/saved.json?limit=100&raw_json=1" + (after ? "&after=" + encodeURIComponent(after) : "");
        var res;
        try { res = await tfetch(url); } catch (e) { break; }   // abort/network → stop, keep last good cursor
        if (!res || !res.ok) break;
        okAny = true;
        var j = await res.json();
        var kids = (j && j.data && j.data.children) || [];
        for (var i = 0; i < kids.length; i++) { var c = kids[i]; var id = c && c.data && c.data.name; if (id && seen[id]) continue; if (id) seen[id] = 1; children.push(c); }
        var nextAfter = (j && j.data && j.data.after) || "";
        if (!nextAfter || nextAfter === after) { after = nextAfter; setAfter(after); break; } // end / no progress
        after = nextAfter;
        setAfter(after); // persist progress every page so a stall never loses ground
      }

      // recover from a stuck cursor: resumed with a cursor but nothing succeeded → reset for a fresh start
      if (!okAny && getAfter()) setAfter("");
      if (!children.length && !okAny) { done({ error: "Reddit didn't respond in time — run it again in a few seconds." }); return; }
      done(payload());
    } catch (e) { done({ error: String((e && e.message) || e) }); }
  })();
}
run();
