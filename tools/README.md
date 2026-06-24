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
3. It pages through your saved posts and saves a `reddit-saved-….json` file.
4. Open the slideshow → **Upload** that JSON file. It auto-detects the Reddit
   listing and runs it through the normal media pipeline (images/galleries/
   Redgifs/videos), tagged as the source **reddit saved: <you>**.

Re-run anytime to pull in new saves — it dedupes against what's already loaded.

## Troubleshooting

- **"Not logged in"** → you weren't signed in on the page; open old.reddit.com signed in and retry.
- **count: 0 / nothing imported** → run it on **old.reddit.com** specifically (most reliable for `.json`); make sure it's the front page or your profile, not a logged-out tab.
- **Only ~1000 came in** → that's Reddit's hard listing cap; the GDPR export is the only source for older saves.
