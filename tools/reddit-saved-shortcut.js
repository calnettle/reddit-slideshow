/* ============================================================
 * Reddit Saved → JSON  (paste into an Apple Shortcut)
 * ------------------------------------------------------------
 * Pulls your LIVE saved posts straight from your logged-in Reddit
 * session — no API app, no monthly export. Runs inside the Reddit
 * page via the Shortcuts "Run JavaScript on Web Page" action, so the
 * request carries your login cookie (same-origin) and isn't subject
 * to Reddit's anonymous block or CORS.
 *
 * Output: JSON {source,user,count,children:[…]} — a raw Reddit listing.
 * Drop the saved file into the slideshow (Upload) — it detects the
 * `children` array and runs it through the normal media pipeline.
 *
 * Reddit caps the saved listing at ~1000 most-recent items; for the
 * full back-catalogue use the GDPR export. Use this for the recent
 * ~1000 + everything new, as often as you like.
 * ============================================================ */
async function run() {
  try {
    // 1. Who am I? (same-origin, uses your cookie)
    let me = null;
    try {
      const r = await fetch("/api/me.json", { credentials: "include", headers: { Accept: "application/json" } });
      if (r.ok) { const j = await r.json(); me = (j && j.data && j.data.name) || null; }
    } catch (e) {}
    if (!me) {
      completion(JSON.stringify({ error: "Not logged in. Open old.reddit.com (signed in) in Safari, then run this from the Share menu on that page." }));
      return;
    }

    // 2. Page through /user/<me>/saved.json (100 at a time)
    const out = { source: "reddit-saved", user: me, count: 0, children: [] };
    const seen = new Set();
    let after = "", pages = 0;
    while (pages < 12) { // ~1000 cap → ≤10 pages; 12 is a safety margin
      const url = "/user/" + encodeURIComponent(me) + "/saved.json?limit=100&raw_json=1" + (after ? "&after=" + encodeURIComponent(after) : "");
      const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) break;
      const j = await res.json();
      const kids = (j && j.data && j.data.children) || [];
      for (const c of kids) {
        const id = c && c.data && c.data.name;
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        out.children.push(c);
      }
      after = (j && j.data && j.data.after) || "";
      pages++;
      if (!after) break;
      await new Promise(r => setTimeout(r, 350)); // be gentle on Reddit
    }
    out.count = out.children.length;
    completion(JSON.stringify(out));
  } catch (e) {
    completion(JSON.stringify({ error: String((e && e.message) || e) }));
  }
}
run();
