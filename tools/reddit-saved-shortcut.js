/* ============================================================
 * Reddit Saved → JSON  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * Pulls your LIVE saved posts straight from your logged-in Reddit
 * session — no API app, no monthly export. Runs inside the Reddit
 * page via the Shortcuts "Run JavaScript on Web Page" action, so the
 * request carries your login cookie (same-origin) and isn't subject
 * to Reddit's anonymous block or CORS.
 *
 * IMPORTANT — this action shares Safari's short JS time limit and
 * MUST call completion() quickly (Apple warns multi-second setTimeout
 * will fail it). So this uses NO timers and a ~9s budget, then RESUMES
 * where it left off on the next run via a cursor saved in the page's
 * localStorage. For a big saved list, just run it 2–3 times and upload
 * each file — the slideshow dedupes, so they merge.
 *
 * Output per run: {source,user,count,done,more,children:[…]} — a raw
 * Reddit listing the slideshow imports directly. `more:true` means run
 * it again to get the rest. Reddit caps saved at ~1000 most-recent
 * items; use the GDPR export for the full back-catalogue.
 * ============================================================ */
async function run() {
  const BUDGET_MS = 9000;           // call completion() well inside Safari's JS limit
  const start = Date.now();
  try {
    // --- Who am I? Prefer the page (no network), cache it, fall back to me.json once.
    let me = null;
    try { me = localStorage.getItem("rss_saved_user"); } catch (e) {}
    if (!me) {
      const a = document.querySelector('span.user a[href*="/user/"], #header-bottom-right a[href*="/user/"], a.user[href*="/user/"]');
      const mm = a && a.getAttribute("href") && a.getAttribute("href").match(/\/user\/([^\/?#]+)/);
      if (mm) me = decodeURIComponent(mm[1]);
    }
    if (!me) {
      try { const r = await fetch("/api/me.json", { credentials: "include", headers: { Accept: "application/json" } }); if (r.ok) { const j = await r.json(); me = j && j.data && j.data.name; } } catch (e) {}
    }
    if (!me) { completion(JSON.stringify({ error: "Couldn't find your username — open old.reddit.com while signed in, then run this from that page." })); return; }
    try { localStorage.setItem("rss_saved_user", me); } catch (e) {}

    // --- Resume from where the last run stopped (cursor kept in localStorage).
    let after = "";
    try { after = localStorage.getItem("rss_saved_after") || ""; } catch (e) {}

    const children = [];
    const seen = new Set();
    let httpError = null;
    while (Date.now() - start < BUDGET_MS) {            // time budget — NO setTimeout
      const url = "/user/" + encodeURIComponent(me) + "/saved.json?limit=100&raw_json=1" + (after ? "&after=" + encodeURIComponent(after) : "");
      const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) { httpError = res.status; break; }
      const j = await res.json();
      const kids = (j && j.data && j.data.children) || [];
      for (const c of kids) { const id = c && c.data && c.data.name; if (id && seen.has(id)) continue; if (id) seen.add(id); children.push(c); }
      after = (j && j.data && j.data.after) || "";
      if (!after) break;                                 // reached the end
    }

    const done = !after;
    try { if (done) localStorage.removeItem("rss_saved_after"); else localStorage.setItem("rss_saved_after", after); } catch (e) {}

    if (!children.length && httpError) { completion(JSON.stringify({ error: "Reddit returned HTTP " + httpError + ". Make sure you're on old.reddit.com and signed in." })); return; }
    completion(JSON.stringify({ source: "reddit-saved", user: me, count: children.length, done: done, more: !done, children: children }));
  } catch (e) {
    completion(JSON.stringify({ error: String((e && e.message) || e) }));
  }
}
run();
