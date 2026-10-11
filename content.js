/*
 * Netflix Controller Navigator – content script.
 *
 * Menus:  spatial navigation over everything clickable on the page, with a
 *         highlight ring, carousel paging and an on-screen keyboard for search.
 * Player: play/pause, seek, volume, skip intro, next episode, fullscreen.
 */
(async function () {
  "use strict";
  if (window.__nfcLoaded) return;
  window.__nfcLoaded = true;

  const settings = await NFC.loadSettings();
  browser.storage.onChanged.addListener((changes) => {
    if (changes.settings) {
      Object.assign(settings, NFC.DEFAULT_SETTINGS, changes.settings.newValue || {});
      applyTvMode();
    }
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- UI ----

  const ui = document.createElement("div");
  ui.id = "nfc-root";
  ui.innerHTML = `
    <div class="nfc-info" hidden>
      <div class="nfc-info-row"></div>
      <div class="nfc-info-title"></div>
      <div class="nfc-info-meta"></div>
      <div class="nfc-info-desc"></div>
    </div>
    <div class="nfc-lift" hidden><img alt=""></div>
    <div class="nfc-ring" hidden></div>
    <div class="nfc-toast" hidden></div>
    <div class="nfc-bar" hidden></div>
    <div class="nfc-help" hidden>
      <div class="nfc-help-card">
        <h2>Controller controls</h2>
        <div class="nfc-help-cols">
          <section><h3>Menus</h3><dl data-help="menus"></dl></section>
          <section><h3>Watching</h3><dl data-help="watching"></dl></section>
        </div>
        <p class="nfc-help-foot"></p>
      </div>
    </div>
    <div class="nfc-osk" hidden>
      <div class="nfc-osk-field"><span class="nfc-osk-text"></span><span class="nfc-osk-caret"></span></div>
      <div class="nfc-osk-keys"></div>
      <div class="nfc-osk-legend">A type · B / Y delete · X space · Start done</div>
    </div>`;
  document.documentElement.appendChild(ui);

  const $ = (sel) => ui.querySelector(sel);
  const ring = $(".nfc-ring"), toastEl = $(".nfc-toast"), barEl = $(".nfc-bar");
  const helpEl = $(".nfc-help"), oskEl = $(".nfc-osk");

  let toastTimer = 0;
  function toast(msg, ms = 1400) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.add("nfc-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("nfc-show");
      toastTimer = setTimeout(() => (toastEl.hidden = true), 250);
    }, ms);
  }

  // ------------------------------------------------------ controls bar ----

  let gamepadInput = null;

  function glyphStyle() {
    if (settings.glyphs && settings.glyphs !== "auto") return settings.glyphs;
    const pads = NFC.getPads();
    const pad = pads.find((p) => gamepadInput && p.id === gamepadInput.activePadId) || pads[0];
    return NFC.detectGlyphStyle(pad);
  }

  const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // "lb+rb" -> two glyphs side by side.
  function glyphGroup(keys, style) {
    return keys.split("+").map((k) =>
      `<span class="nfc-glyph-wrap" data-btn="${k}">${NFC.glyph(k, style)}</span>`).join("");
  }

  function confirmLabel(el) {
    if (!el || !el.isConnected) return "Select";
    if (el.matches("input, textarea")) return "Type";
    if (isHandle(el)) return "More";
    if (el.closest('.profile-link, [data-uia="profile-link"]')) return "Choose";
    if (/play/i.test(el.getAttribute("data-uia") || "") || /^play$/i.test(el.textContent.trim())) return "Play";
    if (el.closest(CARD_SEL) || cardImage(el)) return "Open";
    return "Select";
  }

  function playerPaused() {
    try {
      const p = nfPlayer();
      if (p) return !!p.getPaused();
    } catch (e) { /* fall through */ }
    const v = document.querySelector("video");
    return v ? v.paused : false;
  }

  // What the bar shows right now: [[glyphs, label], ...]
  function barItems() {
    if (!helpEl.hidden) return [["back", "Close"]];
    if (osk.open) {
      return [["dpad", "Move"], ["confirm", "Type"], ["back", osk.text ? "Delete" : "Close"], ["x", "Space"], ["start", "Done"]];
    }
    if (isPlayer()) {
      if (ctrlMode) {
        const label = focused && focused.isConnected && (focused.getAttribute("aria-label") || focused.textContent.trim());
        const items = [["dpad", "Move"], ["confirm", label ? label.slice(0, 22) : "Select"]];
        items.push(["back", playerPopup() ? "Close menu" : "Back to video"]);
        return items;
      }
      const items = [["confirm", playerPaused() ? "Play" : "Pause"], ["dpad-h", "Seek"], ["dpad-v", "Controls / Vol−"]];
      const skip = findSkipButton();
      if (skip) items.push(["y", (skip.textContent.trim() || "Skip").slice(0, 24)]);
      items.push(["back", "Exit"]);
      return items;
    }
    const modal = getModal();
    const confirm = ["confirm", confirmLabel(focused)];
    if (modal) {
      const items = [["dpad", "Navigate"], confirm, ["back", "Close"]];
      const list = modal.querySelector('[data-uia="add-to-my-list"], [data-uia="add-to-my-list-added"]');
      if (list) items.push(["y", list.matches('[data-uia="add-to-my-list-added"]') ? "Remove from My List" : "My List"]);
      items.push(["start", "Help"]);
      return items;
    }
    const items = [["dpad", "Navigate"], confirm];
    const path = location.pathname.replace(/\/$/, "");
    if (path !== "/browse" && path !== "") items.push(["back", "Back"]);
    items.push(["x", "Search"]);
    const row = focused && focused.isConnected && rowOf(focused);
    if (row && row.querySelector(HANDLE_SEL.left + ", " + HANDLE_SEL.right)) items.push(["lb+rb", "Scroll row"]);
    items.push(["start", "Help"]);
    return items;
  }

  let barSig = "", barTimer = 0;
  function refreshBar(poke) {
    if (!settings.showHints || !controllerActive) {
      barEl.hidden = true;
      return;
    }
    const style = glyphStyle();
    const items = barItems();
    const sig = style + "|" + items.map((i) => i.join(":")).join("|");
    if (sig !== barSig) {
      barSig = sig;
      barEl.innerHTML = items.map(([keys, label]) =>
        `<div class="nfc-bar-item">${glyphGroup(keys, style)}<span class="nfc-bar-label">${escapeHtml(label)}</span></div>`
      ).join("");
    }
    barEl.hidden = false;
    // While watching, the bar fades out like a native player overlay unless paused.
    if (isPlayer() && !osk.open && helpEl.hidden) {
      if (poke) {
        barEl.classList.remove("nfc-hide");
        clearTimeout(barTimer);
        barTimer = setTimeout(() => { if (!playerPaused()) barEl.classList.add("nfc-hide"); }, 3500);
      } else if (playerPaused()) {
        barEl.classList.remove("nfc-hide");
      }
    } else {
      barEl.classList.remove("nfc-hide");
    }
  }

  // Briefly "press" the glyph for the button that was just used.
  function flashGlyph(action) {
    const sel = /^(up|down|left|right)$/.test(action) ? '[data-btn^="dpad"]' : `[data-btn="${action}"]`;
    for (const el of barEl.querySelectorAll(sel)) {
      el.classList.remove("nfc-pressed");
      void el.offsetWidth;
      el.classList.add("nfc-pressed");
      setTimeout(() => el.classList.remove("nfc-pressed"), 170);
    }
  }

  // Hide the mouse cursor while the controller is in use; any real mouse
  // movement brings it back.
  let controllerActive = false;
  function markControllerActive() {
    controllerActive = true;
    document.documentElement.classList.add("nfc-active");
  }
  window.addEventListener("mousemove", (e) => {
    if (e.isTrusted && e.movementX + e.movementY !== 0) {
      document.documentElement.classList.remove("nfc-active");
    }
  }, { passive: true });

  window.addEventListener("gamepadconnected", (e) => {
    toast(`🎮 Controller connected – press Start for help`, 2500);
  });
  window.addEventListener("gamepaddisconnected", () => toast("🎮 Controller disconnected", 2000));

  // --------------------------------------------------------- context ----

  const isPlayer = () => location.pathname.startsWith("/watch");
  let closingModal = null; // a dialog that is fading out after B was pressed

  const bigEnough = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > innerWidth * 0.4 && r.height > 150;
  };

  function getModal() {
    const list = document.querySelectorAll(
      '[aria-modal="true"], [role="dialog"], [data-uia^="modal-motion-container"], .previewModal--container.detail-modal, .detail-modal'
    );
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (d.closest("#nfc-root") || d === closingModal) continue;
      if (bigEnough(d)) return d;
    }
    // Title details are open whenever ?jbv= is in the URL; if none of the
    // markers above matched, walk up from the close button to the dialog box.
    if (/[?&]jbv=/.test(location.search)) {
      const close = document.querySelector('[data-uia="previewModal-closebtn"]');
      for (let el = close && close.parentElement; el && el !== document.body; el = el.parentElement) {
        if (el === closingModal) return null;
        if (bigEnough(el)) return el;
      }
    }
    return null;
  }

  // The element that actually scrolls: inside an open modal, the nearest
  // scrollable ancestor/descendant of it; otherwise the window.
  function scrollTarget() {
    const modal = getModal();
    if (!modal) return window;
    const scrollable = (el) => {
      const oy = getComputedStyle(el).overflowY;
      return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 4;
    };
    for (let el = modal; el && el !== document.body; el = el.parentElement) {
      if (scrollable(el)) return el;
    }
    const inner = Array.from(modal.querySelectorAll("div")).find(scrollable);
    return inner || window;
  }

  function context() {
    if (isPlayer()) return "player";
    return getModal() ? "modal" : "browse";
  }

  // ------------------------------------------------ spatial navigation ----

  const FOCUSABLE = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea",
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
    '[role="option"]', '[role="checkbox"]', '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  const ROW_SEL = '.lolomoRow, .rowContainer, .slider, [data-list-context], [data-uia^="carousel-row-section"]';
  const CARD_SEL = '.slider-item, .title-card, [data-uia="standard-card"], [data-uia="progress-card"]';
  const HANDLE_SEL = {
    right: '.handleNext, [data-uia="carousel-hawkins-right-button"]',
    left: '.handlePrev, [data-uia="carousel-hawkins-left-button"]',
  };
  const isHandle = (el) => /\bhandle(Next|Prev)\b/.test(el.className || "") ||
    /^carousel-hawkins-(left|right)-button$/.test(el.getAttribute("data-uia") || "");

  function isUsable(el) {
    if (el.closest("#nfc-root")) return false;
    if (el.disabled || el.closest('[aria-hidden="true"], [inert]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    if (r.width * r.height > innerWidth * innerHeight * 0.85) return false;
    // At least half of it must be horizontally on screen (carousel items
    // that are scrolled away are reached by paging the row instead).
    const visW = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    if (visW < r.width * 0.5) return false;
    if (el.checkVisibility) {
      const opts = { visibilityProperty: true, checkVisibilityCSS: true };
      // Netflix carousel arrows are transparent until hovered – keep them.
      if (!isHandle(el)) Object.assign(opts, { opacityProperty: true, checkOpacity: true });
      if (!el.checkVisibility(opts)) return false;
    }
    return true;
  }

  function getCandidates() {
    const scope = getModal() || document;
    const all = Array.from(scope.querySelectorAll(FOCUSABLE)).filter(isUsable);
    // Nested focusables are one control. Keep the outer one when the inner
    // fills it (Netflix puts a plain <button> inside its play-button link);
    // otherwise keep the inner (a tabindex wrapper around a small link).
    const set = new Set(all);
    const drop = new Set();
    const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
    for (const el of all) {
      let p = el.parentElement;
      for (let d = 0; p && d < 25; d++, p = p.parentElement) {
        if (!set.has(p)) continue;
        if (area(el) >= area(p) * 0.8) drop.add(el);
        else drop.add(p);
        break;
      }
    }
    return all.filter((el) => !drop.has(el));
  }

  let focused = null;
  let lastRect = null;
  let transitioning = false;   // a back/close is in progress; inputs are ignored briefly

  // ------------------------------------------------------- transitions ----

  // Polls `cond` until it returns something truthy (resolved) or the timeout passes (null).
  function waitFor(cond, { timeout = 1200, interval = 40 } = {}) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      (function check() {
        let v = null;
        try { v = cond(); } catch (e) { /* keep polling */ }
        if (v) return resolve(v);
        if (performance.now() - t0 > timeout) return resolve(null);
        setTimeout(check, interval);
      })();
    });
  }

  // Resolves once whatever `getRect` measures has stopped moving (carousel animations).
  async function waitSettled(getRect, { timeout = 900, moveTimeout = 200 } = {}) {
    const t0 = performance.now();
    const key = () => {
      const r = getRect();
      return r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}` : "";
    };
    const start = key();
    // Netflix starts its carousel slide a few hundred ms after the click.
    await waitFor(() => (key() !== start || performance.now() - t0 > moveTimeout) || null, { timeout: moveTimeout + 20, interval: 16 });
    let last = key(), stable = 0;
    while (performance.now() - t0 < timeout) {
      await new Promise(requestAnimationFrame);
      const k = key();
      stable = k === last ? stable + 1 : 0;
      last = k;
      if (stable >= 3) break;
    }
  }

  // Remembers which element was highlighted on each page, so closing a title
  // or going back lands on the same card even after Netflix re-renders the row.
  let focusMemory = {};
  try { focusMemory = JSON.parse(sessionStorage.getItem("nfc-focus") || "{}"); } catch (e) { /* ignore */ }

  function pageKey() {
    const u = new URL(location.href);
    for (const p of ["jbv", "jbp", "jbr", "tctx"]) u.searchParams.delete(p);
    return u.pathname.replace(/\/$/, "") + u.search;
  }

  function elementKey(el) {
    if (!el) return "";
    const a = el.matches("a[href]") ? el : el.querySelector("a[href]");
    const href = a && a.getAttribute("href");
    if (href) return "href:" + href.replace(/[?&](tctx|trackId|trkid)=[^&]*/g, "").replace(/\?$/, "");
    const uia = el.getAttribute("data-uia");
    if (uia) return "uia:" + uia;
    const label = el.getAttribute("aria-label");
    if (label) return "label:" + label;
    return "text:" + el.tagName + ":" + el.textContent.trim().slice(0, 40);
  }

  function rememberFocus(el) {
    if (getModal() || isPlayer()) return;
    focusMemory[pageKey()] = elementKey(el);
    try { sessionStorage.setItem("nfc-focus", JSON.stringify(focusMemory)); } catch (e) { /* ignore */ }
  }

  const findByKey = (key) => (key ? getCandidates().find((c) => elementKey(c) === key) || null : null);

  // Puts the highlight back where it was on this page; falls back to a sensible first item.
  async function restoreFocus() {
    const key = focusMemory[pageKey()];
    const el = key && (await waitFor(() => findByKey(key), { timeout: 1500 }));
    if (el) { setFocus(el); return true; }
    const cands = await waitFor(() => { const c = getCandidates(); return c.length ? c : null; }, { timeout: 1500 });
    if (cands) setFocus(pickInitial(cands));
    return false;
  }

  function pickInitial(cands) {
    const preferred = [
      '[data-uia^="control-play-pause"]', '[data-uia="player-play-pause"]',
      '[data-uia="profile-link"]', ".profile-link",
      '[data-uia="play-button"]', '[data-uia="billboard-play"]', '[data-uia="play-video-button"]',
      '[data-uia="standard-card"]', '[data-uia="progress-card"]',
      ".title-card a", ".title-card-container a", ".slider-item a",
    ];
    for (const sel of preferred) {
      const hit = cands.find((c) => c.matches(sel) && inViewport(c.getBoundingClientRect()));
      if (hit) return hit;
    }
    const visible = cands.filter((c) => inViewport(c.getBoundingClientRect()));
    const pool = visible.length ? visible : cands;
    // Prefer something in the main content rather than the top nav bar.
    pool.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const na = ra.top < 80 ? 1 : 0, nb = rb.top < 80 ? 1 : 0;
      return na - nb || ra.top - rb.top || ra.left - rb.left;
    });
    return pool[0] || null;
  }

  const inViewport = (r) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;

  function findBest(from, cands, dir) {
    const fcx = from.left + from.width / 2, fcy = from.top + from.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of cands) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let primary, ortho, weight;
      if (dir === "right" || dir === "left") {
        if (dir === "right" ? cx <= fcx + 4 : cx >= fcx - 4) continue;
        primary = dir === "right" ? r.left - from.right : from.left - r.right;
        if (primary < -Math.min(from.width, r.width) * 0.5) continue;
        const gap = Math.max(0, Math.max(r.top, from.top) - Math.min(r.bottom, from.bottom));
        ortho = gap + Math.abs(cy - fcy) * 0.15;
        weight = 5; // stay in the same row
      } else {
        if (dir === "down" ? cy <= fcy + 4 : cy >= fcy - 4) continue;
        primary = dir === "down" ? r.top - from.bottom : from.top - r.bottom;
        if (primary < -Math.min(from.height, r.height) * 0.5) continue;
        const gap = Math.max(0, Math.max(r.left, from.left) - Math.min(r.right, from.right));
        ortho = gap + Math.abs(cx - fcx) * 0.3;
        weight = 2;
      }
      const score = Math.max(0, primary) + ortho * weight;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  function setFocus(el, { scroll = true } = {}) {
    if (!el) return;
    focused = el;
    lastRect = el.getBoundingClientRect();
    try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    rememberFocus(el);
    const isCard = updateTvFocus(el);
    if (!scroll) return;
    const row = isCard && rowOf(el);
    if (row) {
      // TV mode: the focused row always sits at the same height on screen.
      const delta = row.getBoundingClientRect().top - innerHeight * TV_ROW_Y;
      if (Math.abs(delta) > 6) window.scrollBy({ top: delta, behavior: "smooth" });
      return;
    }
    const r = lastRect;
    if (r.top < 90 || r.bottom > innerHeight - 30) {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }
  }

  // ----------------------------------------------------------- TV mode ----

  const TV_ROW_Y = 0.42;  // where the focused row sits, as a fraction of screen height
  const LIFT = 1.15;      // how much the focused card grows
  const liftEl = $(".nfc-lift"), liftImg = liftEl.querySelector("img");
  const infoEl = $(".nfc-info");
  let dimRow = null, curItem = null;

  function applyTvMode() {
    document.documentElement.classList.toggle("nfc-tv", !!settings.tvMode);
    if (!settings.tvMode) clearTvFocus();
  }

  function clearTvFocus() {
    if (dimRow) dimRow.classList.remove("nfc-tv-dim");
    if (curItem) curItem.classList.remove("nfc-tv-cur");
    dimRow = curItem = null;
    liftImg.removeAttribute("src");
    infoEl.hidden = true;
  }

  function cardImage(el) {
    const img = el.querySelector("img") || (el.closest(".title-card, .slider-item") || el).querySelector("img");
    return img && img.currentSrc ? img : null;
  }

  function videoId(el) {
    const a = el.matches("a[href]") ? el : el.querySelector("a[href]");
    const m = a && a.getAttribute("href").match(/\/(?:watch|title)\/(\d+)|[?&]jbv=(\d+)/);
    return m ? (m[1] || m[2]) : null;
  }

  // Netflix keeps title metadata in a page-side cache; use whatever is there.
  function videoMeta(id) {
    const out = {};
    if (!id) return out;
    try {
      const v = window.wrappedJSObject.netflix.falcorCache.videos[id];
      const val = (x) => (x && typeof x === "object" && "value" in x ? x.value : x);
      const jaw = val(v.jawSummary) || {};
      out.title = val(v.title) || jaw.title;
      out.synopsis = val(v.synopsis) || val(v.regularSynopsis) || jaw.synopsis;
      out.year = val(v.releaseYear) || jaw.releaseYear;
      out.maturity = jaw.maturity && jaw.maturity.rating && jaw.maturity.rating.value;
    } catch (e) { /* not available */ }
    for (const k of Object.keys(out)) out[k] = typeof out[k] === "string" || typeof out[k] === "number" ? String(out[k]) : "";
    return out;
  }

  // Lifts and dims cards and fills the info panel. Returns true if `el` is a title card.
  function updateTvFocus(el) {
    if (dimRow) dimRow.classList.remove("nfc-tv-dim");
    if (curItem) curItem.classList.remove("nfc-tv-cur");
    dimRow = curItem = null;
    const img = settings.tvMode && !isPlayer() && !getModal() ? cardImage(el) : null;
    if (!img) {
      liftImg.removeAttribute("src");
      infoEl.hidden = true;
      return false;
    }
    curItem = el.closest(".slider-item") || (el.matches('[data-uia="standard-card"], [data-uia="progress-card"]') ? el : null);
    dimRow = curItem && rowOf(curItem.parentElement);
    if (dimRow) {
      dimRow.classList.add("nfc-tv-dim");
      curItem.classList.add("nfc-tv-cur");
    }
    liftImg.src = img.currentSrc;

    const meta = videoMeta(videoId(el));
    const rowEl = rowOf(el);
    const rowTitle = rowEl && rowEl.querySelector(".row-header-title, .rowTitle, h2, h3");
    const set = (sel, text) => {
      const node = infoEl.querySelector(sel);
      node.textContent = text || "";
      node.hidden = !text;
    };
    set(".nfc-info-row", rowTitle ? rowTitle.textContent.trim() : "");
    set(".nfc-info-title", meta.title || el.getAttribute("aria-label") || img.alt || el.textContent.trim());
    set(".nfc-info-meta", [meta.year, meta.maturity].filter(Boolean).join("  ·  "));
    set(".nfc-info-desc", meta.synopsis);
    infoEl.hidden = false;
    return true;
  }

  async function toggleTvMode() {
    settings.tvMode = !settings.tvMode;
    applyTvMode();
    if (focused && focused.isConnected) setFocus(focused, { scroll: settings.tvMode });
    toast(settings.tvMode ? "📺 TV mode on" : "TV mode off");
    try { await NFC.saveSettings(settings); } catch (e) { /* storage unavailable */ }
  }

  applyTvMode();

  function currentRect() {
    if (focused && focused.isConnected) {
      const r = focused.getBoundingClientRect();
      if (r.width > 0) return r;
    }
    return lastRect;
  }

  function rowOf(el) {
    return el && el.closest(ROW_SEL);
  }

  function pageRow(dir, origin) {
    const row = rowOf(origin || focused);
    const handle = row && row.querySelector(HANDLE_SEL[dir]);
    if (!handle) return false;
    const hr = (origin || handle).getBoundingClientRect();
    const prev = focused;
    handle.click();
    const probe = () => {
      const c = row.querySelector(CARD_SEL);
      return c && c.getBoundingClientRect();
    };
    const startLeft = (probe() || {}).left;
    waitSettled(probe, { timeout: 1800, moveTimeout: 700 }).then(() => {
      // Nothing slid (already at the end, or the click was ignored): stay put.
      if ((probe() || {}).left === startLeft) return;
      const inRow = getCandidates().filter((c) => {
        if (isHandle(c)) return false;
        const r = c.getBoundingClientRect();
        return r.bottom > hr.top + 5 && r.top < hr.bottom - 5;
      });
      inRow.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      if (dir === "left") inRow.reverse();
      // If the card we were on is still on screen, step past it.
      setFocus(inRow[0] === prev && inRow[1] ? inRow[1] : inRow[0]);
    });
    return true;
  }

  function navigate(dir) {
    const cands = getCandidates();
    const from = currentRect();
    if (!from || !(focused && focused.isConnected) && !inViewport(from)) {
      setFocus(pickInitial(cands));
      return;
    }
    const others = cands.filter((c) => c !== focused && !(focused && (focused.contains(c) || c.contains(focused))));
    const best = findBest(from, others, dir);
    if (best && isHandle(best)) {
      if (!pageRow(dir, best)) setFocus(best);
      return;
    }
    if (best) {
      setFocus(best);
      return;
    }
    if ((dir === "left" || dir === "right") && pageRow(dir)) return;
    if (dir === "down" || dir === "up") {
      // Netflix lazy-loads rows as you scroll; nudge the page and retry.
      const scroller = scrollTarget();
      scroller.scrollBy({ top: (dir === "down" ? 1 : -1) * innerHeight * 0.5, behavior: "smooth" });
      waitFor(() => findBest(currentRect() || from, getCandidates().filter((c) => c !== focused), dir), { timeout: 700 })
        .then((next) => next && setFocus(next));
    }
  }

  function pageScroll(sign) {
    const scroller = scrollTarget();
    scroller.scrollBy({ top: sign * innerHeight * 0.8, behavior: "smooth" });
    setTimeout(() => {
      const cands = getCandidates().filter((c) => inViewport(c.getBoundingClientRect()));
      const cy = innerHeight / 2, cx = innerWidth / 3;
      cands.sort((a, b) => dist(a) - dist(b));
      function dist(el) {
        const r = el.getBoundingClientRect();
        return Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      }
      if (cands[0]) setFocus(cands[0], { scroll: false });
    }, 450);
  }

  // Ring follows the focused element every frame (cards animate/resize).
  function updateRing() {
    const r = (!isPlayer() || ctrlMode) && controllerActive && focused && focused.isConnected
      ? focused.getBoundingClientRect() : null;
    if (r && r.width > 0) {
      let box = r;
      if (settings.tvMode && liftImg.getAttribute("src")) {
        // Draw an enlarged copy of the card on top, so Netflix's own row
        // layout (and its overflow clipping) is never touched.
        const w = r.width * LIFT, h = r.height * LIFT;
        box = { left: r.left - (w - r.width) / 2, top: r.top - (h - r.height) / 2, width: w, height: h };
        liftEl.hidden = false;
        liftEl.style.transform = `translate(${box.left}px, ${box.top}px)`;
        liftEl.style.width = `${w}px`;
        liftEl.style.height = `${h}px`;
      } else {
        liftEl.hidden = true;
      }
      ring.hidden = false;
      ring.style.transform = `translate(${box.left - 4}px, ${box.top - 4}px)`;
      ring.style.width = `${box.width + 8}px`;
      ring.style.height = `${box.height + 8}px`;
      lastRect = r;
    } else {
      ring.hidden = true;
      liftEl.hidden = true;
    }
    requestAnimationFrame(updateRing);
  }
  requestAnimationFrame(updateRing);

  // ------------------------------------------------------ menu actions ----

  function clickEl(el) {
    if (!el) return;
    if (el.matches('input[type="text"], input[type="search"], input:not([type]), textarea')) {
      openOsk(el);
      return;
    }
    el.click();
  }

  function pressKey(key, code, keyCode, target) {
    const t = target || document.activeElement || document.body;
    for (const type of ["keydown", "keyup"]) {
      t.dispatchEvent(new KeyboardEvent(type, { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }));
    }
  }

  let modalOpenedAt = 0;

  async function closeModal() {
    const modal = getModal();
    if (!modal) return false;
    // Netflix ignores the close button while the dialog is still animating in.
    const sinceOpen = performance.now() - modalOpenedAt;
    if (sinceOpen < 900) await sleep(900 - sinceOpen);
    const hadJbv = /[?&]jbv=/.test(location.search);
    const stillOpen = () => getModal() === modal || (modal.isConnected && getComputedStyle(modal).opacity > 0.9);
    closingModal = modal;
    focused = null;
    clearTvFocus();
    // In priority order: a selector list would return a wrapper div first, and
    // clicking that does nothing.
    const btn = ['[data-uia="previewModal-closebtn"]', '[data-uia*="close"]', '[aria-label="close" i]', ".previewModal-close"]
      .map((sel) => modal.querySelector(sel)).find(Boolean);
    if (btn) btn.click();
    else pressKey("Escape", "Escape", 27, modal);
    // The page behind is already visible while the dialog fades, so put the
    // highlight back straight away rather than after the ~2s fade.
    const restored = restoreFocus();
    waitFor(() => !stillOpen() || null, { timeout: 1500 }).then(async (closed) => {
      if (!closed) {
        pressKey("Escape", "Escape", 27, document.body);
        closed = await waitFor(() => !stillOpen() || null, { timeout: 800 });
      }
      if (!closed && hadJbv && /[?&]jbv=/.test(location.search)) history.back();
      await waitFor(() => !modal.isConnected || null, { timeout: 3000 });
      closingModal = null;
    });
    await restored;
    return true;
  }

  async function goBack() {
    if (transitioning) return;
    transitioning = true;
    try {
      if (await closeModal()) return;
      const path = location.pathname.replace(/\/$/, "");
      if (path === "/browse" || path === "") {
        toast("Already on Home");
        return;
      }
      const before = location.href;
      history.back();
      const changed = await waitFor(() => location.href !== before || null, { timeout: 800 });
      if (!changed) { location.assign("/browse"); return; }
      lastUrl = location.href;
      lastCtx = context();
      focused = null;
      await restoreFocus();
    } finally {
      transitioning = false;
    }
  }

  async function openSearch() {
    let input = findSearchInput();
    if (!input) {
      const launcher = document.querySelector(
        '[data-uia="search-box-launcher"], [data-uia="navigation+actions+search+icon"], .searchTab, button[aria-label*="search" i]'
      );
      if (launcher) {
        launcher.click();
        await sleep(350);
        input = findSearchInput();
      }
    }
    if (input) {
      openOsk(input);
    } else {
      location.assign("/search?q=");
    }
  }

  function findSearchInput() {
    const el = document.querySelector(
      '[data-uia="search-box-input"], [data-uia="navigation+actions+search+input"], input[name="searchInput"], input[name="search"], input[type="search"], #searchInput'
    );
    return el && isUsable(el) ? el : null;
  }

  function toggleMyList() {
    const scope = getModal() || document;
    const btn = scope.querySelector(
      '[data-uia="add-to-my-list"], [data-uia="add-to-my-list-added"], [data-uia*="my-list"] button, button[aria-label*="My List" i]'
    );
    if (btn) {
      btn.click();
      toast("✓ My List updated");
      return true;
    }
    return false;
  }

  // ----------------------------------------------------- player control ----

  function nfPlayer() {
    try {
      const vp = window.wrappedJSObject.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const ids = vp.getAllPlayerSessionIds();
      if (!ids || !ids.length) return null;
      return vp.getVideoPlayerBySessionId(ids[ids.length - 1]);
    } catch (e) {
      return null;
    }
  }

  const video = () => document.querySelector("video");
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
  };

  function togglePlay() {
    const p = nfPlayer();
    try {
      if (p) {
        if (p.getPaused()) { p.play(); toast("▶ Play", 800); } else { p.pause(); toast("❚❚ Pause", 800); }
        return;
      }
    } catch (e) { /* fall through */ }
    const v = video();
    if (v) {
      if (v.paused) { v.play(); toast("▶ Play", 800); } else { v.pause(); toast("❚❚ Pause", 800); }
    } else {
      pressKey(" ", "Space", 32);
    }
  }

  function seek(seconds) {
    const p = nfPlayer();
    try {
      if (p) {
        const dur = p.getDuration();
        const t = Math.min(Math.max(0, p.getCurrentTime() + seconds * 1000), dur - 1000);
        p.seek(t);
        toast(`${seconds > 0 ? "⏩ +" : "⏪ "}${seconds}s   ${fmt(t / 1000)} / ${fmt(dur / 1000)}`, 1000);
        return;
      }
    } catch (e) { /* fall through */ }
    // Netflix's own shortcut (setting video.currentTime directly breaks DRM playback).
    pressKey(seconds > 0 ? "ArrowRight" : "ArrowLeft", seconds > 0 ? "ArrowRight" : "ArrowLeft", seconds > 0 ? 39 : 37);
    toast(seconds > 0 ? "⏩ Forward" : "⏪ Back", 800);
  }

  function changeVolume(delta) {
    const p = nfPlayer();
    try {
      if (p) {
        const v = Math.min(1, Math.max(0, p.getVolume() + delta));
        p.setVolume(v);
        if (v > 0 && (p.isMuted ? p.isMuted() : false)) p.setMuted(false);
        toast(`🔊 ${Math.round(v * 100)}%`, 800);
        return;
      }
    } catch (e) { /* fall through */ }
    const vid = video();
    if (vid) {
      vid.volume = Math.min(1, Math.max(0, vid.volume + delta));
      toast(`🔊 ${Math.round(vid.volume * 100)}%`, 800);
    } else {
      pressKey(delta > 0 ? "ArrowUp" : "ArrowDown", delta > 0 ? "ArrowUp" : "ArrowDown", delta > 0 ? 38 : 40);
    }
  }

  function toggleMute() {
    const p = nfPlayer();
    try {
      if (p) {
        const muted = p.isMuted ? p.isMuted() : p.getMuted();
        p.setMuted(!muted);
        toast(muted ? "🔊 Unmuted" : "🔇 Muted", 800);
        return;
      }
    } catch (e) { /* fall through */ }
    const v = video();
    if (v) { v.muted = !v.muted; toast(v.muted ? "🔇 Muted" : "🔊 Unmuted", 800); }
    else pressKey("m", "KeyM", 77);
  }

  function revealControls() {
    const target = document.querySelector(".watch-video, .watch-video--player-view") || document.body;
    const r = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true, clientX: r.left + r.width / 2 + Math.random() * 10, clientY: r.top + r.height / 2,
    }));
  }

  // ----------------------------------------------- player controls mode ----
  // Up while watching brings up Netflix's own control bar; the D-pad then
  // moves across its buttons and into the speed / subtitles / episodes menus.

  let ctrlMode = false, ctrlKeepAlive = 0;

  // A pop-up menu opened from the control bar (speed, audio & subtitles, episodes).
  function playerPopup() {
    const sel = '[role="menu"], [role="listbox"], [role="dialog"], [data-uia*="popup"], [data-uia*="menu"], [data-uia*="selector"], [data-uia="audio-subtitle-controls"], [data-uia*="playback-speed"], [data-uia*="episodes"]';
    return Array.from(document.querySelectorAll(sel)).reverse().find((el) => {
      if (el.closest("#nfc-root") || el.matches("button, [data-uia^='control-']")) return false;
      const r = el.getBoundingClientRect();
      return r.width > 120 && r.height > 80 && r.width * r.height < innerWidth * innerHeight * 0.7;
    }) || null;
  }

  // Pretend the mouse is resting on the highlighted control, so hover-only
  // things (volume slider, tooltips) appear as they would for a mouse user.
  function hoverFocused() {
    const el = focused;
    if (!el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"]) {
      el.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, init) : new MouseEvent(type, init));
    }
  }

  function enterCtrlMode() {
    ctrlMode = true;
    revealControls();
    clearInterval(ctrlKeepAlive);
    // Netflix hides the bar after a few idle seconds; keep nudging it.
    ctrlKeepAlive = setInterval(() => { revealControls(); hoverFocused(); }, 1500);
    waitFor(() => { const c = getCandidates(); return c.length ? c : null; }, { timeout: 1500 }).then((cands) => {
      if (!ctrlMode || !cands) return;
      setFocus(pickInitial(cands), { scroll: false });
      hoverFocused();
      refreshBar(true);
    });
    toast("Controls – D-pad to move, A to select, B to go back", 1800);
  }

  function exitCtrlMode() {
    ctrlMode = false;
    clearInterval(ctrlKeepAlive);
    focused = null;
    refreshBar(true);
  }

  const SKIP_SELECTOR = [
    '[data-uia="player-skip-intro"]', '[data-uia="player-skip-recap"]',
    '[data-uia="player-skip-preplay"]', '[data-uia="next-episode-seamless-button"]',
    '[data-uia="next-episode-seamless-button-draining"]', '[data-uia*="skip"]',
  ].join(",");

  function findSkipButton() {
    return document.querySelector(SKIP_SELECTOR) ||
      Array.from(document.querySelectorAll("button")).find((b) =>
        /skip (intro|recap|credits)|next episode/i.test(b.textContent)) || null;
  }

  function clickSkip() {
    const btn = findSkipButton();
    if (btn) { btn.click(); toast("⏭ Skipped", 800); return; }
    toast("Nothing to skip right now");
  }

  async function nextEpisode() {
    revealControls();
    await sleep(150);
    const btn = document.querySelector('[data-uia="control-next"], [data-uia="next-episode-seamless-button"]');
    if (btn) { btn.click(); toast("⏭ Next episode", 1000); }
    else toast("No next episode");
  }

  async function toggleFullscreen() {
    revealControls();
    await sleep(120);
    const btn = document.querySelector(
      document.fullscreenElement ? '[data-uia="control-fullscreen-exit"]' : '[data-uia="control-fullscreen-enter"]'
    );
    const was = !!document.fullscreenElement;
    if (btn) btn.click();
    await sleep(250);
    if (!!document.fullscreenElement !== was) return;
    try {
      if (was) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) {
      toast("Firefox blocked fullscreen – press F11 (or double-click the video)", 2500);
    }
  }

  function exitPlayer() {
    revealControls();
    setTimeout(() => {
      const back = document.querySelector('[data-uia="control-nav-back"], [data-uia="nfplayer-exit"]');
      if (back) back.click();
      else history.back();
    }, 120);
  }

  // ------------------------------------------------- on-screen keyboard ----

  const OSK_ROWS = [
    "1234567890".split(""),
    "qwertyuiop".split(""),
    "asdfghjkl'".split(""),
    "zxcvbnm-.⌫".split(""),
    ["SPACE", "CLEAR", "DONE"],
  ];
  const osk = { open: false, input: null, row: 1, col: 0, text: "" };
  const oskKeysEl = $(".nfc-osk-keys"), oskTextEl = $(".nfc-osk-text");

  oskKeysEl.innerHTML = OSK_ROWS.map((row, r) =>
    `<div class="nfc-osk-row">${row.map((k, c) =>
      `<span class="nfc-osk-key${k.length > 1 ? " nfc-osk-wide" : ""}" data-r="${r}" data-c="${c}">${k === "SPACE" ? "Space" : k === "CLEAR" ? "Clear" : k === "DONE" ? "Done" : k}</span>`
    ).join("")}</div>`
  ).join("");

  function renderOsk() {
    oskKeysEl.querySelectorAll(".nfc-osk-key").forEach((k) => {
      k.classList.toggle("nfc-osk-sel", +k.dataset.r === osk.row && +k.dataset.c === osk.col);
    });
    oskTextEl.textContent = osk.text;
  }

  function setInputValue(input, value) {
    input.focus({ preventScroll: true });
    // Use the native setter so React's value tracker sees the change and
    // fires onChange for the input event (Netflix's search is a React input).
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function openOsk(input) {
    osk.open = true;
    osk.input = input;
    osk.text = input.value || "";
    osk.row = 1; osk.col = 0;
    input.focus({ preventScroll: true });
    oskEl.hidden = false;
    renderOsk();
  }

  function closeOsk() {
    osk.open = false;
    oskEl.hidden = true;
    if (osk.input) setFocus(osk.input, { scroll: false });
  }

  function oskType(ch) {
    if (ch === "⌫") osk.text = osk.text.slice(0, -1);
    else if (ch === "SPACE") osk.text += " ";
    else if (ch === "CLEAR") osk.text = "";
    else if (ch === "DONE") { closeOsk(); return; }
    else osk.text += ch;
    if (osk.input && osk.input.isConnected) setInputValue(osk.input, osk.text);
    renderOsk();
  }

  function oskAction(action) {
    const rows = OSK_ROWS;
    switch (action) {
      case "left": osk.col = (osk.col - 1 + rows[osk.row].length) % rows[osk.row].length; break;
      case "right": osk.col = (osk.col + 1) % rows[osk.row].length; break;
      case "up":
      case "down": {
        const frac = (osk.col + 0.5) / rows[osk.row].length;
        osk.row = (osk.row + (action === "down" ? 1 : -1) + rows.length) % rows.length;
        osk.col = Math.min(rows[osk.row].length - 1, Math.floor(frac * rows[osk.row].length));
        break;
      }
      case "confirm": oskType(rows[osk.row][osk.col]); return;
      case "back": if (osk.text) oskType("⌫"); else closeOsk(); return;
      case "y": oskType("⌫"); return;
      case "x": oskType("SPACE"); return;
      case "start": closeOsk(); return;
    }
    renderOsk();
  }

  // ---------------------------------------------------------- dispatch ----

  function toggleHelp(show) {
    helpEl.hidden = show === undefined ? !helpEl.hidden : !show;
    if (helpEl.hidden) return;
    const style = glyphStyle();
    const HELP = {
      menus: [
        ["dpad", "Move"], ["confirm", "Select"], ["back", "Back / close"], ["x", "Search"],
        ["y", "My List (in details) · jump to top"], ["lb+rb", "Scroll row"], ["lt+rt", "Page up / down"],
        ["rs", "Scroll page"], ["select", "Home"], ["start", "Help"], ["l3", "TV mode on / off"],
      ],
      watching: [
        ["confirm+start", "Play / pause"], ["dpad-h", `Seek ±${settings.seekSmall}s`],
        ["lb+rb", `Seek ±${settings.seekLarge}s`], ["dpad-v", "Up: control bar (speed, subtitles, episodes…) · Down: volume −"],
        ["lt+rt", "Volume − / +"], ["x", "Mute"],
        ["y", "Skip intro / recap"], ["select", "Fullscreen"], ["back", "Exit player / back to video"],
      ],
    };
    for (const [key, rows] of Object.entries(HELP)) {
      helpEl.querySelector(`[data-help="${key}"]`).innerHTML = rows.map(([keys, label]) =>
        `<dt>${glyphGroup(keys, style)}</dt><dd>${escapeHtml(label)}</dd>`).join("");
    }
    helpEl.querySelector(".nfc-help-foot").innerHTML = `${glyphGroup("back", style)}<span>Close</span>`;
  }

  function onAction(action) {
    if (!settings.enabled || document.visibilityState !== "visible") return;
    markControllerActive();
    flashGlyph(action);
    handleAction(action);
    refreshBar(true);
    setTimeout(() => refreshBar(false), 350);
    setTimeout(() => refreshBar(false), 900);
  }

  function handleAction(action) {
    if (osk.open) return oskAction(action);
    if (!helpEl.hidden) {
      if (action === "back" || action === "start" || action === "confirm") toggleHelp(false);
      return;
    }

    if (action === "l3") return toggleTvMode();

    if (isPlayer()) {
      if (ctrlMode) {
        // Moving around Netflix's own control bar and its pop-up menus.
        switch (action) {
          case "left": case "right": case "up": return navigate(action);
          case "down": {
            // Down off the bottom row of controls = back to the video.
            const cands = getCandidates().filter((c) => c !== focused);
            const next = focused && findBest(focused.getBoundingClientRect(), cands, "down");
            if (next) return setFocus(next, { scroll: false });
            return exitCtrlMode();
          }
          case "confirm":
            if (!focused || !focused.isConnected) return setFocus(pickInitial(getCandidates()), { scroll: false });
            clickEl(focused);
            // Menus (speed, subtitles, episodes) open on click: move into them.
            setTimeout(() => { const p = playerPopup(); if (p) { const c = getCandidates().filter((el) => p.contains(el)); if (c.length) setFocus(pickInitial(c), { scroll: false }); } hoverFocused(); }, 250);
            return;
          case "back": {
            if (playerPopup()) { pressKey("Escape", "Escape", 27, document.body); setTimeout(() => { if (playerPopup()) exitCtrlMode(); else hoverFocused(); }, 200); return; }
            return exitCtrlMode();
          }
          case "start": return exitCtrlMode();
          case "x": return toggleMute();
          case "lt": return changeVolume(-settings.volumeStep);
          case "rt": return changeVolume(settings.volumeStep);
          case "select": return toggleFullscreen();
        }
        return;
      }
      switch (action) {
        case "confirm": case "start": return togglePlay();
        case "left": return seek(-settings.seekSmall);
        case "right": return seek(settings.seekSmall);
        case "lb": return seek(-settings.seekLarge);
        case "rb": return seek(settings.seekLarge);
        case "up": return enterCtrlMode();
        case "down": return changeVolume(-settings.volumeStep);
        case "lt": return changeVolume(-settings.volumeStep);
        case "rt": return changeVolume(settings.volumeStep);
        case "x": return toggleMute();
        case "y": return clickSkip();
        case "select": return toggleFullscreen();
        case "back": return exitPlayer();
      }
      return;
    }

    if (transitioning && action !== "start") return;

    switch (action) {
      case "up": case "down": case "left": case "right":
        return navigate(action);
      case "confirm":
        if (!focused || !focused.isConnected) return setFocus(pickInitial(getCandidates()));
        return clickEl(focused);
      case "back": return goBack();
      case "x": return openSearch();
      case "y":
        if (getModal() && toggleMyList()) return;
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setFocus(pickInitial(getCandidates()), { scroll: false }), 450);
        return;
      case "lb": return pageRow("left") || toast("Can't scroll this row");
      case "rb": return pageRow("right") || toast("Can't scroll this row");
      case "lt": return pageScroll(-1);
      case "rt": return pageScroll(1);
      case "select": return location.assign("/browse");
      case "start": return toggleHelp();
    }
  }

  function onStick({ ry }) {
    if (!settings.enabled || osk.open || isPlayer() || !ry) return;
    const scroller = scrollTarget();
    scroller.scrollBy(0, ry * 22);
  }

  // Reset focus when Netflix navigates (it's a single-page app) or a modal opens/closes.
  let lastUrl = location.href, lastCtx = context();
  setInterval(() => {
    if (controllerActive) refreshBar(false);
    const ctx = context();
    if (location.href !== lastUrl || ctx !== lastCtx) {
      const urlChanged = location.href !== lastUrl;
      lastUrl = location.href;
      lastCtx = ctx;
      if (ctx === "modal") modalOpenedAt = performance.now();
      if (ctx !== "browse") clearTvFocus();
      if (ctx !== "player" && ctrlMode) exitCtrlMode();
      if (controllerActive) {
        refreshBar(true);
        if (transitioning || isPlayer()) return;
        if (ctx === "modal") {
          // Title details: wait for its Play button rather than landing on the close X.
          const modal = getModal();
          focused = null;
          waitFor(() => modal.querySelector('[data-uia="play-button"], [data-uia*="play"]'), { timeout: 900 })
            .then(() => { if (getModal() === modal && !transitioning) setFocus(pickInitial(getCandidates())); });
        } else if (urlChanged && !(focused && focused.isConnected && isUsable(focused))) {
          restoreFocus();
        }
      }
    }
  }, 300);

  gamepadInput = new NFC.GamepadInput(settings, { onAction, onStick });
  gamepadInput.start();
})();
