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

## Use it  (the reliable "page-read" way)

Apple's "Run JavaScript on Web Page" has a **hard ~1–2 second** limit, and
Reddit's `saved.json` is often too slow/throttled to fetch in that window. So
the script reads the posts straight from the **page that's already on screen** —
no network, so it can't time out.

1. In **Safari**, open **`https://old.reddit.com/saved?limit=100`** (signed in).
   That page renders up to 100 of your saved posts.
2. Tap **Share** → **Export Reddit Saved** → it instantly grabs those ~100 and
   **auto-advances to the next page**.
3. **Upload** the saved file into the slideshow. Then just **run the Shortcut
   again** (you're already on the next page) for the next 100. Repeat until the
   result says `"done": true`. ~1000 saved = ~10 quick runs.

The slideshow auto-detects the Reddit listing, dedupes, and builds slides.

> **Coverage:** the page-read path reliably captures **image & link posts**.
> Some **v.redd.it videos and galleries** don't carry their media URLs in the
> page HTML — for those, the GDPR export (or the JSON path below, when Reddit
> isn't throttling you) is more complete.

### Fallback: JSON fetch
If you run the Shortcut on a **non-saved** page, it instead fetches
`saved.json` (100/run, full media incl. galleries/videos) — but that only works
when Reddit isn't rate-limiting you. If a run returns a "too slow / throttled"
message, switch to the page-read method above. `DEADLINE_MS` at the top of the
script tunes the fetch budget (default 2000; the action's ceiling is ~2–3s).

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
