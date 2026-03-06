# Research report: Vibe Quote Generator

This document records the API research and the key product/engineering decisions used to build the quote generator for GitHub Pages.

## 1) API research (Quotable)

### Endpoints

Quotable is hosted at:

- **Base URL**: `https://api.quotable.io`

For random quotes, the documentation describes two related endpoints:

- **Deprecated**: `GET /random` (returns a single quote object)
- **Preferred**: `GET /quotes/random` (returns an **array** of quote objects; default `limit=1`)

The app uses `GET https://api.quotable.io/quotes/random` and reads the first element of the returned array.

### Response shape used by the app

The quote objects documented for random quotes include:

- `_id` (string) — unique identifier
- `content` (string) — quote text
- `author` (string) — author name
- `authorSlug` (string) — author slug
- `length` (number) — character count
- `tags` (string[]) — tag names

In the UI, the app displays:

- `content`
- `author`
- up to 4 `tags` (for a clean editorial look)

### Rate limiting

The upstream docs mention a **rate limit of 180 requests per minute per IP**, with HTTP **429** for limit violations. The implementation includes:

- a user-facing “rate limited” status message
- a short client-side cooldown (to discourage rapid retries)

### Reliability notes

While searching, I encountered GitHub issues/discussions indicating occasional downtime for `api.quotable.io`. Because of this, the app treats the network as unreliable:

- request timeout (10 seconds)
- clear error messaging
- UI stays usable (favorites can still be browsed) even if fetching fails

## 2) Product requirements → implementation decisions

### No-build constraint (static files)

To match GitHub Pages + no build tooling:

- the site is served as plain static files (`index.html` + `assets/styles.css` + `assets/app.js`)
- fonts are loaded via a simple `<link>` (no bundlers required)

### Editorial dark aesthetic

Design choices:

- near-black gradient background with subtle “paper/ink” highlights via layered radial gradients
- quote set in a serif display face (`Playfair Display`) with generous scale and tight leading
- UI controls in a clean sans (`Inter` / system fallbacks) for contrast and scannability

### Favorites drawer UX

You requested a **drawer** UI. The drawer supports:

- open/close via the “Favorites” button
- overlay click to close
- Esc to close
- list actions per favorite: **Show**, **Copy**, **Remove**
- **Clear** all favorites

## 3) Data model & localStorage schema

### Storage key and versioning

Favorites are stored under a **versioned** key:

- `quoteGen:favorites:v1`

Versioning makes it safe to change structure later (e.g., `v2`) without breaking existing users.

### Record shape

Each favorite is stored as:

- `_id` (string)
- `content` (string)
- `author` (string)
- `authorSlug` (string, optional)
- `tags` (string[], optional)
- `dateSaved` (number, ms timestamp)

### Deduplication strategy

Favorites are deduped by `_id`.

Rationale:

- avoids collisions if two quotes share similar text or if author names vary in formatting
- remains stable if the API ever normalizes punctuation/whitespace in `content`
- simplifies toggle logic (favorite/unfavorite by ID)

The app keeps the **most recently saved** version if duplicates appear.

## 4) Accessibility & interaction design

### Keyboard support

- Drawer supports **Esc** to close.
- Focus is moved to the drawer’s Close button when opened.
- A basic **focus trap** keeps Tab navigation inside the drawer while open.
- When the drawer closes, focus returns to the control that opened it.

### Screen reader support

- Status updates use `role="status"` + `aria-live="polite"` so “Copied”, “Rate limited”, and error messages are announced.
- The drawer uses `role="dialog"` and `aria-modal="true"`.
- `inert` is applied when the drawer is closed to prevent focus from reaching it while off-screen.

## 5) Clipboard behavior (Copy button)

The implementation prefers:

- `navigator.clipboard.writeText(...)` when available **and** in a secure context

and falls back to:

- a hidden `<textarea>` + `document.execCommand("copy")`

Notes:

- GitHub Pages is served over **HTTPS**, so Clipboard API support is typically available.
- If run from `file://` or blocked by browser policy, the app will show an error message.

## 6) Error handling strategy

The app explicitly handles:

- **Timeouts** (10s): show “Request timed out”
- **HTTP 429**: show rate-limit message and enforce a short cooldown
- **Other non-2xx responses**: show `API error (status)`
- **Malformed responses**: show “Unexpected API response”

The UI is designed to degrade gracefully: even when fetching fails, the favorites drawer remains available.

## 7) Manual test checklist

### Core flows

- Load page → quote appears with author
- Click **New Quote** → quote changes; button disables while loading
- Click **Copy** → clipboard contains `content` + newline + `— author`
- Click **Favorite** → quote appears in favorites drawer; button changes to **Unfavorite**
- Click **Unfavorite** → quote removed from favorites

### Drawer behaviors

- Open drawer → focus moves inside
- Press **Esc** → drawer closes; focus returns to opener
- Tab cycles within drawer controls (doesn’t escape to the page behind)
- Remove an item → count decreases and item disappears
- Clear → list becomes empty state
- Show → loads quote into main view and closes drawer

### Persistence

- Favorite a quote → reload page → favorite still present
- Favorites dedupe by `_id` (no duplicates created by repeated favoriting)

### Failure cases

- Simulate offline / API down → app shows error and remains responsive
- Rate limit (if triggered) → shows cooldown message

