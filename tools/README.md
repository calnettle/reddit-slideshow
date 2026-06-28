# Export Reddit Saved → slideshow (iPhone Shortcut)

Pull your **live saved posts** into the slideshow without the Reddit API app
(now pre-approval-gated) and without waiting for the monthly GDPR export.

There are two tools here. **Use the Token grabber** — it's the reliable one and
gets **full media (galleries + videos)**. The page-scraper is a fallback that
only gets images/links.

---

## ✅ RECOMMENDED — Token grabber (`reddit-token-shortcut.js`)

Your logged-in Reddit session already holds a short-lived OAuth token. This reads
it out of the page **instantly** (no network → can't hit the ~2s action limit,
can't be rate-limited). You paste it into the slideshow, and the **app** pulls
every saved post from `oauth.reddit.com` — the real API: high rate limits, full
gallery/video media, and no time limit on the app's side.

**Build the Shortcut (one time):**
1. **Shortcuts** → **+** new.
2. **ⓘ** → **Show in Share Sheet** ON → **Share Sheet Types** = **Safari web pages**.
3. Add **"Run JavaScript on Web Page"** → paste all of [`reddit-token-shortcut.js`](reddit-token-shortcut.js).
4. Add **"Copy to Clipboard"** (so the token is ready to paste). *(Optional: also "Show Result".)*
5. Name it **Reddit Token**.

**Use it:**
1. In Safari open **`https://www.reddit.com`** (the **new** design), **signed in**.
2. Share → **Reddit Token**. The result *is* your token (starts with `eyJ…`); it's now on your clipboard.
3. In the slideshow → **Option A** → expand **"Or paste an access token"** → paste → **Use this token** → **Fetch saved posts**.
4. The app pulls all your saved posts (galleries + videos included). Tokens last ~1 hour — if it says expired, grab a fresh one.

> If it returns `{"ok":false,…}` it didn't find a token on that page — make sure
> you're on **www.reddit.com** (not old.reddit.com) and signed in.

---

## Fallback — page-scraper (`reddit-saved-shortcut.js`)

Only if the token route doesn't work for you. Reads saved posts from the rendered
`old.reddit.com/saved` page. **Images/links only** — no galleries or videos.

**Build the Shortcut (one time, ~2 min)**

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
