# Export Reddit Saved → slideshow (iPhone Shortcut)

Pull your **live saved posts** into the slideshow without the Reddit API app
(now pre-approval-gated) and without waiting for the monthly GDPR export.

It works by running JavaScript *inside your logged-in Reddit page*, so the
request to `saved.json` carries your login cookie (same-origin) — no API key, no
proxy, no CORS. Reddit caps the saved listing at ~1000 most-recent items, so this
grabs the recent ~1000 + everything new; use the GDPR export for the full history.

## Build the Shortcut (one time, ~2 min)

1. **Shortcuts** app → **+** (new shortcut).
2. Tap the **ⓘ** (settings) → turn ON **Show in Share Sheet** → set **Share Sheet Types** to **Safari web pages** only.
3. Add action **"Run JavaScript on Web Page"**. Paste in the entire contents of
   [`reddit-saved-shortcut.js`](reddit-saved-shortcut.js).
4. Add action **"Save File"** → turn ON **Ask Where to Save** (so you can pick iCloud Drive / Files).
5. Name it **Export Reddit Saved**. Done.

## Use it

1. In **Safari**, open **https://old.reddit.com** and make sure you're **signed in**.
2. Tap **Share** (the share icon) → **Export Reddit Saved**.
3. It saves a `reddit-saved-….json` file. **Each run grabs ~9 seconds' worth**
   (Apple kills this action if JS runs too long), then remembers where it
   stopped. **If the result says `"more": true`, run it again** to get the next
   chunk — repeat until `"done": true`. Two or three runs covers the full ~1000.
4. Open the slideshow → **Upload** each JSON file. It auto-detects the Reddit
   listing, dedupes, and runs it through the normal media pipeline (images/
   galleries/Redgifs/videos), tagged **reddit saved: <you>**.

Once it says `done`, the next run starts fresh from your newest saves, so re-run
anytime to pull in new ones — duplicates are ignored on import.

### Why multiple runs?
Apple's "Run JavaScript on Web Page" shares Safari's short JS time limit and
fails if the script runs too long ("took too long to call the completion
handler"). Paging ~1000 saved posts can't finish in that window, so the script
self-limits to ~9s and resumes via a cursor saved in the page's localStorage.

## Troubleshooting

- **"took too long to call the completion handler"** → you're on an old copy of
  the script. The current version self-limits each run to ~5s and aborts any
  stalled request, so it can't hit that error. Re-paste the latest
  `reddit-saved-shortcut.js` into the action.
- **"Reddit was slow… run it again"** → Reddit throttled your repeated pulls.
  Wait ~10–20s and run it again; progress is saved, so it continues.
- **"Not logged in"** → you weren't signed in on the page; open old.reddit.com signed in and retry.
- **count: 0 / nothing imported** → run it on **old.reddit.com** specifically (most reliable for `.json`); make sure it's the front page or your profile, not a logged-out tab.
- **Only ~1000 came in** → that's Reddit's hard listing cap; the GDPR export is the only source for older saves.
