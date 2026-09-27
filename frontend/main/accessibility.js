// ==================================================================
// accessibility.js - Saved a11y prefs, CSS variables, document
// classes, and animated-media pause (GIFs / custom emoji / video)
// when Oneira is unfocused or the matching toggles are off.
// ==================================================================

function defaultAccessibilityPrefs() {
  return {
    text_size: 15,
    underline_links: false,
    display_name_styles: false,
    ui_density: "default",
    chat_display: "default",
    group_spacing: 20,
    zoom: 100,
    saturation: 100,
    saturation_custom: false,
    high_contrast: false,
    sync_contrast: true,
    role_colors: "names",
    official_messages: "default",
    toggle_indicators: false,
    reduced_motion: false,
    sync_motion: true,
    gifs_when_focused: true,
    animated_emoji: true,
    sticker_anim: "always",
    tts_rate: 1,
    image_descriptions: false,
    legacy_input: false
  };
}

function osWantsReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function osWantsHighContrast() {
  return !!(window.matchMedia && (
    window.matchMedia("(prefers-contrast: more)").matches ||
    window.matchMedia("(prefers-contrast: high)").matches
  ));
}

function effectiveReducedMotion(prefs) {
  if (prefs.sync_motion) return osWantsReducedMotion() || !!prefs.reduced_motion;
  return !!prefs.reduced_motion;
}

function effectiveHighContrast(prefs) {
  if (prefs.sync_contrast) return osWantsHighContrast() || !!prefs.high_contrast;
  return !!prefs.high_contrast;
}

// Tab visible + window focused. Prefer visibility over document.hasFocus()
// alone — hasFocus flaps false during normal UI chrome use and was leaving
// profile GIFs stuck on a frozen frame.
let oneiraAnimFocused = true;
let oneiraWindowBlurred = false;

function oneiraAllowsMotion() {
  if (!accessibilityPrefs) return oneiraAnimFocused;
  if (effectiveReducedMotion(accessibilityPrefs)) return false;
  return oneiraAnimFocused;
}

function shouldPlayAnimatedGifs() {
  if (!oneiraAllowsMotion()) return false;
  if (!accessibilityPrefs) return true;
  return accessibilityPrefs.gifs_when_focused !== false;
}

function shouldPlayAnimatedEmoji() {
  if (!oneiraAllowsMotion()) return false;
  if (!accessibilityPrefs) return true;
  return accessibilityPrefs.animated_emoji !== false;
}

function urlLooksAnimated(url, mime) {
  const kind = String(mime || "").toLowerCase();
  if (kind === "image/gif") return true;
  const path = String(url || "").split("?")[0].split("#")[0].toLowerCase();
  return path.endsWith(".gif");
}

function mediaLooksAnimated(media, url) {
  const src = url || (media && (media.url || media.key)) || "";
  if (urlLooksAnimated(src, media && media.mime)) return true;
  return /\.gif$/i.test(String((media && media.name) || ""));
}

function markOneiraAnimImg(img, opts) {
  if (!img || img.tagName !== "IMG") return;
  opts = opts || {};
  const kind = opts.kind === "emoji" ? "emoji" : "gif";
  const src = img.getAttribute("src") || img.src || "";
  if (kind === "gif" && !opts.force && !urlLooksAnimated(src, opts.mime)) {
    return;
  }
  img.dataset.animKind = kind;
  img.classList.add("oneira-anim");
  // Remember the real URL before any freeze. Do not set crossOrigin —
  // R2 often lacks CORS, which breaks load or leaves GIFs stuck static
  // after a canvas freeze/restore cycle.
  if (!img.dataset.animLiveSrc && src && src.indexOf("data:") !== 0) {
    img.dataset.animLiveSrc = src;
  }
  syncOneiraAnimImg(img);
}

function animShouldPlay(img) {
  return img.dataset.animKind === "emoji" ? shouldPlayAnimatedEmoji() : shouldPlayAnimatedGifs();
}

function syncOneiraAnimImg(img) {
  if (!img || !img.dataset.animKind) return;
  if (animShouldPlay(img)) unfreezeOneiraAnimImg(img);
  else freezeOneiraAnimImg(img);
}

function freezeOneiraAnimImg(img) {
  if (img.dataset.animFrozen === "1") return;
  if (animShouldPlay(img)) return;
  const live = img.dataset.animLiveSrc || img.currentSrc || img.src;
  if (!live || live.indexOf("data:") === 0) return;
  img.dataset.animLiveSrc = live;
  function capture() {
    if (img.dataset.animFrozen === "1") return;
    if (animShouldPlay(img)) return;
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0);
      // toDataURL throws if the image is cross-origin without CORS.
      const freezeUrl = canvas.toDataURL("image/png");
      img.dataset.animFrozen = "1";
      img.src = freezeUrl;
    } catch (e) {
      // Can't snapshot — leave the live GIF playing.
    }
  }
  if (img.complete && img.naturalWidth) capture();
  else {
    img.addEventListener("load", function onAnimLoad() {
      img.removeEventListener("load", onAnimLoad);
      capture();
    });
  }
}

function unfreezeOneiraAnimImg(img) {
  const live = img.dataset.animLiveSrc;
  if (!live || live.indexOf("data:") === 0) return;
  const frozen = img.dataset.animFrozen === "1";
  const showingData = (img.getAttribute("src") || img.src || "").indexOf("data:") === 0;
  if (!frozen && !showingData) return;
  delete img.dataset.animFrozen;
  // Re-assigning GIF src after a data-URL freeze can leave a static
  // decode in some browsers. Clear first so the decoder restarts.
  img.removeAttribute("src");
  img.src = live;
}

function syncOneiraAnimVideos() {
  document.querySelectorAll("video").forEach((vid) => {
    if (oneiraAllowsMotion()) {
      if (vid.dataset.animWasPlaying === "1") {
        delete vid.dataset.animWasPlaying;
        const play = vid.play();
        if (play && typeof play.catch === "function") play.catch(() => {});
      }
      return;
    }
    if (!vid.paused && !vid.ended) {
      vid.dataset.animWasPlaying = "1";
      vid.pause();
    }
  });
}

function syncAllOneiraAnimMedia() {
  document.querySelectorAll("img.oneira-anim").forEach(syncOneiraAnimImg);
  document.querySelectorAll("img:not(.oneira-anim)").forEach((img) => {
    if (urlLooksAnimated(img.currentSrc || img.src, "")) markOneiraAnimImg(img, { kind: "gif" });
  });
  syncOneiraAnimVideos();
}

function refreshOneiraFocusState() {
  const focused = !document.hidden && !oneiraWindowBlurred;
  oneiraAnimFocused = focused;
  document.documentElement.classList.toggle("oneira-unfocused", !focused);
  syncAllOneiraAnimMedia();
}

function applyAccessibility(prefs) {
  accessibilityPrefs = Object.assign(defaultAccessibilityPrefs(), prefs || {});
  const root = document.documentElement;
  const size = Number(accessibilityPrefs.text_size) || 15;
  root.style.setProperty("--message-scale", String(size / 15));
  root.style.setProperty("--cluster-gap", (Number(accessibilityPrefs.group_spacing) || 0) + "px");
  root.classList.toggle("underline-links", !!accessibilityPrefs.underline_links);
  root.classList.toggle("show-toggle-icons", !!accessibilityPrefs.toggle_indicators);
  root.classList.toggle("reduced-motion", effectiveReducedMotion(accessibilityPrefs));
  root.classList.toggle("high-contrast", effectiveHighContrast(accessibilityPrefs));
  root.classList.toggle("chat-compact", accessibilityPrefs.chat_display === "compact");
  root.classList.toggle("ui-density-compact", accessibilityPrefs.ui_density === "compact");
  root.classList.toggle("ui-density-spacious", accessibilityPrefs.ui_density === "spacious");
  root.classList.toggle("legacy-chat-input", !!accessibilityPrefs.legacy_input);
  applyAccessibilityZoom(accessibilityPrefs.zoom);
  if (accessibilityPrefs.legacy_input) {
    if (typeof hideMentionPicker === "function") hideMentionPicker();
    if (typeof closeEmojiPicker === "function") closeEmojiPicker();
  }
  if (typeof applyAppearance === "function" && appearancePrefs) applyAppearance(appearancePrefs);
  if (typeof refreshAccessibilityPreview === "function") refreshAccessibilityPreview();
  if (typeof refreshServerNameColors === "function") refreshServerNameColors();
  refreshOneiraFocusState();
}

function applyAccessibilityZoom(percent) {
  const z = Math.min(2, Math.max(0.5, (Number(percent) || 100) / 100));
  document.documentElement.style.zoom = Math.abs(z - 1) < 0.001 ? "" : String(z);
  const shell = document.getElementById("app-shell");
  if (shell) {
    shell.style.zoom = "";
    shell.style.width = "";
    shell.style.height = "";
  }
}

function hydrateAccessibility(payload) {
  applyAccessibility(Object.assign(defaultAccessibilityPrefs(), payload || {}));
}

function speakMessageContent(msg) {
  if (!window.speechSynthesis || !msg) return;
  const text = String(msg.content || "").trim();
  if (!text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = Number((accessibilityPrefs && accessibilityPrefs.tts_rate) || 1);
  window.speechSynthesis.speak(utter);
}

if (window.matchMedia) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const contrast = window.matchMedia("(prefers-contrast: more)");
  const onOsChange = () => {
    if (accessibilityPrefs) applyAccessibility(accessibilityPrefs);
  };
  if (motion.addEventListener) motion.addEventListener("change", onOsChange);
  else if (motion.addListener) motion.addListener(onOsChange);
  if (contrast.addEventListener) contrast.addEventListener("change", onOsChange);
  else if (contrast.addListener) contrast.addListener(onOsChange);
}

document.addEventListener("visibilitychange", refreshOneiraFocusState);
window.addEventListener("focus", () => {
  oneiraWindowBlurred = false;
  refreshOneiraFocusState();
});
window.addEventListener("blur", () => {
  oneiraWindowBlurred = true;
  refreshOneiraFocusState();
});

if (typeof MutationObserver !== "undefined") {
  const animObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === "IMG") {
          if (node.classList.contains("msg-custom-emoji-img")) markOneiraAnimImg(node, { kind: "emoji" });
          else if (urlLooksAnimated(node.getAttribute("src") || node.src, "")) markOneiraAnimImg(node, { kind: "gif" });
        }
        if (node.querySelectorAll) {
          node.querySelectorAll("img.msg-custom-emoji-img").forEach((img) => markOneiraAnimImg(img, { kind: "emoji" }));
          node.querySelectorAll("img").forEach((img) => {
            if (img.classList.contains("msg-custom-emoji-img")) return;
            if (urlLooksAnimated(img.getAttribute("src") || img.src, "")) markOneiraAnimImg(img, { kind: "gif" });
          });
        }
      });
    });
  });
  if (document.documentElement) {
    animObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
}
