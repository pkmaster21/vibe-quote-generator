(function () {
  "use strict";

  const API_URL = "https://api.quotable.io/quotes/random";
  const STORAGE_KEY = "quoteGen:favorites:v1";
  const RATE_LIMIT_COOLDOWN_MS = 12_000;

  /** @type {null | { _id: string, content: string, author: string, authorSlug?: string, tags?: string[] }} */
  let currentQuote = null;
  /** @type {Array<{ _id: string, content: string, author: string, authorSlug?: string, tags?: string[], dateSaved: number }>} */
  let favorites = [];

  let drawerOpen = false;
  let lastFocusedEl = null;
  let cooldownUntil = 0;

  const els = {
    quoteText: document.getElementById("quoteText"),
    quoteAuthor: document.getElementById("quoteAuthor"),
    quoteTags: document.getElementById("quoteTags"),
    status: document.getElementById("status"),

    newQuoteBtn: document.getElementById("newQuoteBtn"),
    copyBtn: document.getElementById("copyBtn"),
    favoriteBtn: document.getElementById("favoriteBtn"),

    favoritesToggle: document.getElementById("favoritesToggle"),
    favoritesCount: document.getElementById("favoritesCount"),

    overlay: document.getElementById("overlay"),
    drawer: document.getElementById("favoritesDrawer"),
    closeDrawerBtn: document.getElementById("closeDrawerBtn"),
    clearFavoritesBtn: document.getElementById("clearFavoritesBtn"),
    favoritesEmpty: document.getElementById("favoritesEmpty"),
    favoritesList: document.getElementById("favoritesList"),
  };

  function setStatus(message, kind = "info") {
    const prefix =
      kind === "ok"
        ? "✓ "
        : kind === "error"
          ? "⚠ "
          : kind === "rate"
            ? "⏳ "
            : "";
    els.status.textContent = message ? prefix + message : "";
  }

  function nowMs() {
    return Date.now();
  }

  function isInCooldown() {
    return nowMs() < cooldownUntil;
  }

  function setButtonsDisabled(disabled) {
    els.newQuoteBtn.disabled = disabled;
    els.copyBtn.disabled = disabled || !currentQuote;
    els.favoriteBtn.disabled = disabled || !currentQuote;
  }

  function safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function loadFavorites() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = safeParseJson(raw);
    if (!Array.isArray(parsed)) return [];

    const cleaned = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      if (typeof item._id !== "string") continue;
      if (typeof item.content !== "string") continue;
      if (typeof item.author !== "string") continue;
      const dateSaved = typeof item.dateSaved === "number" ? item.dateSaved : Date.now();
      cleaned.push({
        _id: item._id,
        content: item.content,
        author: item.author,
        authorSlug: typeof item.authorSlug === "string" ? item.authorSlug : undefined,
        tags: Array.isArray(item.tags) ? item.tags.filter((t) => typeof t === "string") : undefined,
        dateSaved,
      });
    }

    // Dedupe by _id while preserving order (latest first if duplicates exist)
    const seen = new Set();
    const deduped = [];
    for (const item of cleaned) {
      if (seen.has(item._id)) continue;
      seen.add(item._id);
      deduped.push(item);
    }
    return deduped;
  }

  function saveFavorites() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }

  function isFavorite(id) {
    return favorites.some((f) => f._id === id);
  }

  function updateFavoriteButton() {
    if (!currentQuote) {
      els.favoriteBtn.textContent = "Favorite";
      els.favoriteBtn.setAttribute("aria-pressed", "false");
      return;
    }
    const fav = isFavorite(currentQuote._id);
    els.favoriteBtn.textContent = fav ? "Unfavorite" : "Favorite";
    els.favoriteBtn.setAttribute("aria-pressed", fav ? "true" : "false");
  }

  function renderTags(tags) {
    els.quoteTags.innerHTML = "";
    if (!Array.isArray(tags) || tags.length === 0) return;
    const top = tags.slice(0, 4);
    for (const t of top) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      els.quoteTags.appendChild(span);
    }
  }

  function renderQuote(q) {
    currentQuote = q;
    els.quoteText.textContent = q?.content ? q.content : "No quote text available.";
    els.quoteAuthor.textContent = q?.author ? `— ${q.author}` : "— Unknown";
    renderTags(q?.tags);
    setButtonsDisabled(false);
    updateFavoriteButton();
  }

  async function fetchRandomQuote() {
    if (isInCooldown()) {
      const remaining = Math.ceil((cooldownUntil - nowMs()) / 1000);
      setStatus(`Rate limit cooldown (${remaining}s).`, "rate");
      return null;
    }

    setStatus("Fetching a new quote…");
    setButtonsDisabled(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(API_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.status === 429) {
        cooldownUntil = nowMs() + RATE_LIMIT_COOLDOWN_MS;
        setStatus("Rate limited by API. Please wait a moment and try again.", "rate");
        return null;
      }

      if (!res.ok) {
        setStatus(`API error (${res.status}). Try again.`, "error");
        return null;
      }

      const data = await res.json();
      const q = Array.isArray(data) ? data[0] : data;
      if (!q || typeof q !== "object") {
        setStatus("Unexpected API response.", "error");
        return null;
      }
      if (typeof q._id !== "string" || typeof q.content !== "string" || typeof q.author !== "string") {
        setStatus("Quote data missing required fields.", "error");
        return null;
      }

      setStatus("");
      return {
        _id: q._id,
        content: q.content,
        author: q.author,
        authorSlug: typeof q.authorSlug === "string" ? q.authorSlug : undefined,
        tags: Array.isArray(q.tags) ? q.tags.filter((t) => typeof t === "string") : undefined,
      };
    } catch (err) {
      if (err && typeof err === "object" && "name" in err && err.name === "AbortError") {
        setStatus("Request timed out. Try again.", "error");
      } else {
        setStatus("Network error. Check your connection and try again.", "error");
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
      setButtonsDisabled(false);
    }
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (!ok) throw new Error("Copy failed");
  }

  async function copyCurrentQuote() {
    if (!currentQuote) return;
    const text = `${currentQuote.content}\n— ${currentQuote.author}`;
    try {
      await copyTextToClipboard(text);
      setStatus("Copied to clipboard.", "ok");
    } catch {
      setStatus("Could not copy. Your browser may block clipboard access.", "error");
    }
  }

  function updateFavoritesCount() {
    els.favoritesCount.textContent = String(favorites.length);
  }

  function renderFavorites() {
    els.favoritesList.innerHTML = "";
    updateFavoritesCount();

    const isEmpty = favorites.length === 0;
    els.favoritesEmpty.hidden = !isEmpty;
    els.clearFavoritesBtn.disabled = isEmpty;

    if (isEmpty) return;

    for (const fav of favorites) {
      const li = document.createElement("li");
      li.className = "favItem";

      const p = document.createElement("p");
      p.className = "favQuote";
      p.textContent = fav.content;

      const a = document.createElement("p");
      a.className = "favAuthor";
      a.textContent = `— ${fav.author}`;

      const actions = document.createElement("div");
      actions.className = "favActions";

      const showBtn = document.createElement("button");
      showBtn.className = "btn";
      showBtn.type = "button";
      showBtn.textContent = "Show";
      showBtn.addEventListener("click", () => {
        renderQuote({
          _id: fav._id,
          content: fav.content,
          author: fav.author,
          authorSlug: fav.authorSlug,
          tags: fav.tags,
        });
        closeDrawer();
        setStatus("Loaded from favorites.", "ok");
      });

      const copyBtn = document.createElement("button");
      copyBtn.className = "btn";
      copyBtn.type = "button";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        try {
          await copyTextToClipboard(`${fav.content}\n— ${fav.author}`);
          setStatus("Copied favorite.", "ok");
        } catch {
          setStatus("Could not copy favorite.", "error");
        }
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn danger";
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        favorites = favorites.filter((f) => f._id !== fav._id);
        saveFavorites();
        renderFavorites();
        updateFavoriteButton();
        setStatus("Removed from favorites.", "ok");
      });

      actions.appendChild(showBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(removeBtn);

      li.appendChild(p);
      li.appendChild(a);
      li.appendChild(actions);
      els.favoritesList.appendChild(li);
    }
  }

  function toggleFavorite() {
    if (!currentQuote) return;

    if (isFavorite(currentQuote._id)) {
      favorites = favorites.filter((f) => f._id !== currentQuote._id);
      saveFavorites();
      renderFavorites();
      updateFavoriteButton();
      setStatus("Removed from favorites.", "ok");
      return;
    }

    favorites = [
      {
        _id: currentQuote._id,
        content: currentQuote.content,
        author: currentQuote.author,
        authorSlug: currentQuote.authorSlug,
        tags: currentQuote.tags,
        dateSaved: Date.now(),
      },
      ...favorites,
    ];

    // Dedupe by _id, keeping most recently saved
    const seen = new Set();
    favorites = favorites.filter((f) => {
      if (seen.has(f._id)) return false;
      seen.add(f._id);
      return true;
    });

    saveFavorites();
    renderFavorites();
    updateFavoriteButton();
    setStatus("Saved to favorites.", "ok");
  }

  function getFocusableElements(container) {
    const nodes = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(nodes).filter((el) => {
      if (el.hasAttribute("disabled")) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      return true;
    });
  }

  function onDrawerKeydown(e) {
    if (!drawerOpen) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeDrawer();
      return;
    }

    if (e.key !== "Tab") return;

    const focusables = getFocusableElements(els.drawer);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || active === els.drawer) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function openDrawer() {
    if (drawerOpen) return;
    drawerOpen = true;
    lastFocusedEl = document.activeElement;

    document.documentElement.style.overflow = "hidden";
    els.drawer.removeAttribute("inert");
    els.overlay.hidden = false;
    requestAnimationFrame(() => {
      els.overlay.classList.add("open");
      els.drawer.classList.add("open");
    });

    els.drawer.setAttribute("aria-hidden", "false");
    els.favoritesToggle.setAttribute("aria-expanded", "true");

    document.addEventListener("keydown", onDrawerKeydown, true);
    setTimeout(() => els.closeDrawerBtn.focus(), 0);
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;

    els.overlay.classList.remove("open");
    els.drawer.classList.remove("open");
    els.drawer.setAttribute("aria-hidden", "true");
    els.favoritesToggle.setAttribute("aria-expanded", "false");
    els.drawer.setAttribute("inert", "");

    document.removeEventListener("keydown", onDrawerKeydown, true);
    setTimeout(() => {
      els.overlay.hidden = true;
      document.documentElement.style.overflow = "";
    }, 220);

    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") lastFocusedEl.focus();
    lastFocusedEl = null;
  }

  async function newQuote() {
    const q = await fetchRandomQuote();
    if (q) renderQuote(q);
  }

  function clearFavorites() {
    favorites = [];
    saveFavorites();
    renderFavorites();
    updateFavoriteButton();
    setStatus("Cleared favorites.", "ok");
  }

  function init() {
    favorites = loadFavorites();
    renderFavorites();
    updateFavoriteButton();
    updateFavoritesCount();

    els.newQuoteBtn.addEventListener("click", newQuote);
    els.copyBtn.addEventListener("click", copyCurrentQuote);
    els.favoriteBtn.addEventListener("click", toggleFavorite);

    els.favoritesToggle.addEventListener("click", () => (drawerOpen ? closeDrawer() : openDrawer()));
    els.closeDrawerBtn.addEventListener("click", closeDrawer);
    els.overlay.addEventListener("click", closeDrawer);
    els.clearFavoritesBtn.addEventListener("click", clearFavorites);

    // First quote
    newQuote();
  }

  init();
})();
