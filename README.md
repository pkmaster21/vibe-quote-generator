# Vibe Quote Generator (static, no-build)

A no-build, no-framework quote generator designed for **GitHub Pages**. It fetches random quotes from **Quotable**, lets you **copy** them, and lets you save a **favorites** list (stored in your browser via `localStorage`).

## What’s included

- **Random quote** from `api.quotable.io`
- **Author + quote text** display
- **New Quote** button
- **Copy** button (uses the Clipboard API when available, with a fallback)
- **Favorites drawer** with per-item **Show / Copy / Remove** and a **Clear** option
- **Persistence** via `localStorage` (favorites survive reloads on the same browser/device)

## Run locally

You can try opening `index.html` directly, but some browsers restrict network requests from `file://` pages. The most reliable way is to serve the folder as a static site.

### Option A: Python (installed on many machines)

From the `vibe-quote-generator` folder:

```bash
python -m http.server 5173
```

Then open `http://localhost:5173`.

### Option B: Node (if you already have it)

```bash
npx serve .
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In your repo settings, enable **Pages** and choose:
   - **Source**: your default branch
   - **Folder**: `/ (root)` (the folder containing `index.html`)
3. Visit the Pages URL GitHub provides.

## Favorites storage

- **Storage key**: `quoteGen:favorites:v1`
- **Format**: JSON array of objects like:
  - `_id`, `content`, `author`, `authorSlug` (optional), `tags` (optional), `dateSaved`
- **Deduping**: favorites are deduped by the quote `_id`.

## Notes

- Quotable has rate limiting (the app shows a cooldown message if it receives HTTP `429`).
- Favorites are local to your browser. Clearing site data / using another device won’t carry them over.

