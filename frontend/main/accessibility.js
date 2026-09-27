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

// Focused = Oneira's tab is visible AND this document has focus
// (another app / another window / DevTools → hasFocus false).
let oneiraAnimFocused = true;
const oneiraFreezeCanvasByImg = typeof WeakMap !== "undefined" ? new WeakMap() : null;

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

function oneiraFreezeCanvasFor(img) {
  return oneiraFreezeCanvasByImg ? oneiraFreezeCanvasByImg.get(img) : img._oneiraFreezeCanvas;
}

function oneiraSetFreezeCanvas(img, canvas) {
  if (oneiraFreezeCanvasByImg) oneiraFreezeCanvasByImg.set(img, canvas);
  else img._oneiraFreezeCanvas = canvas;
}

function oneiraClearFreezeCanvas(img) {
  const canvas = oneiraFreezeCanvasFor(img);
  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  if (oneiraFreezeCanvasByImg) oneiraFreezeCanvasByImg.delete(img);
  else delete img._oneiraFreezeCanvas;
}

// Draw the current frame to a canvas overlay. Works cross-origin
// without CORS (canvas can paint; we just never call toDataURL).
function freezeOneiraAnimImg(img) {
  if (img.dataset.animFrozen === "1") return;
  if (animShouldPlay(img)) return;
  let live = img.dataset.animLiveSrc || "";
  const current = img.getAttribute("src") || img.src || "";
  if ((!live || live.indexOf("data:") === 0) && current && current.indexOf("data:") !== 0) {
    live = current;
    img.dataset.animLiveSrc = live;
  }
  if (!live || live.indexOf("data:") === 0) return;

  function paintFreeze() {
    if (animShouldPlay(img) || img.dataset.animFrozen === "1") return;
    if (!img.naturalWidth) return;
    // Need pixels in the img decoder — restore live src if we cleared it.
    if (!img.getAttribute("src") && live) {
      img.src = live;
      img.addEventListener("load", function onFreezeLoad() {
        img.removeEventListener("load", onFreezeLoad);
        paintFreeze();
      });
      return;
    }
    let canvas = oneiraFreezeCanvasFor(img);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "oneira-anim-freeze-canvas";
      canvas.setAttribute("aria-hidden", "true");
      oneiraSetFreezeCanvas(img, canvas);
    }
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    try {
      canvas.getContext("2d").drawImage(img, 0, 0);
    } catch (e) {
      return;
    }
    canvas.style.cssText = img.style.cssText;
    canvas.style.visibility = "visible";
    if (!img.style.width && img.offsetWidth) canvas.style.width = img.offsetWidth + "px";
    if (!img.style.height && img.offsetHeight) canvas.style.height = img.offsetHeight + "px";
    if (!canvas.parentNode && img.parentNode) {
      img.parentNode.insertBefore(canvas, img.nextSibling);
    }
    img.dataset.animFrozen = "1";
    img.style.visibility = "hidden";
    // Drop the GIF src so it stops decoding while frozen.
    img.removeAttribute("src");
  }

  if (img.complete && img.naturalWidth) paintFreeze();
  else {
    if (!img.getAttribute("src") && live) img.src = live;
    img.addEventListener("load", function onAnimLoad() {
      img.removeEventListener("load", onAnimLoad);
      paintFreeze();
    });
  }
}

function unfreezeOneiraAnimImg(img) {
  const live = img.dataset.animLiveSrc;
  if (!live || live.indexOf("data:") === 0) return;
  if (img.dataset.animFrozen !== "1" && !oneiraFreezeCanvasFor(img)) return;
  oneiraClearFreezeCanvas(img);
  img.style.visibility = "";
  delete img.dataset.animFrozen;
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
  const tabVisible = !document.hidden;
  const docFocused = typeof document.hasFocus !== "function" || document.hasFocus();
  const focused = tabVisible && docFocused;
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
// Catch focus moves that don't always fire window blur (e.g. another app).
window.setInterval(() => {
  const tabVisible = !document.hidden;
  const docFocused = typeof document.hasFocus !== "function" || document.hasFocus();
  const focused = tabVisible && docFocused;
  if (focused !== oneiraAnimFocused) refreshOneiraFocusState();
}, 400);

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
