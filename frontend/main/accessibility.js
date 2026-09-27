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

let oneiraAnimFocused = true;

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

function markOneiraAnimImg(img, opts) {
  if (!img || img.tagName !== "IMG") return;
  opts = opts || {};
  const kind = opts.kind === "emoji" ? "emoji" : "gif";
  if (kind === "gif" && !opts.force && !urlLooksAnimated(img.getAttribute("src") || img.src, opts.mime)) {
    return;
  }
  img.dataset.animKind = kind;
  img.classList.add("oneira-anim");
  if (!img.getAttribute("crossorigin")) {
    try { img.crossOrigin = "anonymous"; } catch (e) { /* ignore */ }
  }
  syncOneiraAnimImg(img);
}

function syncOneiraAnimImg(img) {
  if (!img || !img.dataset.animKind) return;
  const play = img.dataset.animKind === "emoji" ? shouldPlayAnimatedEmoji() : shouldPlayAnimatedGifs();
  if (play) unfreezeOneiraAnimImg(img);
  else freezeOneiraAnimImg(img);
}

function freezeOneiraAnimImg(img) {
  if (img.dataset.animFrozen === "1") return;
  const live = img.dataset.animLiveSrc || img.currentSrc || img.src;
  if (!live || live.indexOf("data:") === 0) return;
  img.dataset.animLiveSrc = live;
  function capture() {
    if (img.dataset.animFrozen === "1") return;
    if (shouldPlayAnimatedGifs() && img.dataset.animKind !== "emoji") return;
    if (shouldPlayAnimatedEmoji() && img.dataset.animKind === "emoji") return;
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0);
      img.dataset.animFrozen = "1";
      img.src = canvas.toDataURL("image/png");
    } catch (e) {
      // Cross-origin without CORS — leave the live GIF.
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
  if (img.dataset.animFrozen !== "1") return;
  const live = img.dataset.animLiveSrc;
  if (!live) return;
  delete img.dataset.animFrozen;
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
  const focused = !document.hidden && (typeof document.hasFocus !== "function" || document.hasFocus());
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
window.addEventListener("focus", refreshOneiraFocusState);
window.addEventListener("blur", refreshOneiraFocusState);

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
