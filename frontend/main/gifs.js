const attentionGifs = new Set();
let attentionBound = false;

function isGifSrc(url) {
  return /\.gif(\?|$)/i.test(String(url || ""));
}

function isGifMedia(media) {
  if (!media) return false;
  if (String(media.mime || "").toLowerCase() === "image/gif") return true;
  return isGifSrc(media.url || media.icon_url || media.banner_url || media._previewUrl || media.live || "");
}

function stillUrlFromGif(url) {
  const text = String(url || "");
  if (!isGifSrc(text)) return "";
  return text.replace(/\.gif(\?|$)/i, ".still.webp$1");
}

function iconStillOf(row) {
  if (!row) return "";
  return row.icon_still_url || stillUrlFromGif(row.icon_url);
}

function bannerStillOf(row) {
  if (!row) return "";
  return row.banner_still_url || stillUrlFromGif(row.banner_url);
}

function shouldPlayGifsWhenFocused() {
  if (typeof accessibilityPrefs !== "undefined" && accessibilityPrefs && accessibilityPrefs.gifs_when_focused === false) {
    return false;
  }
  return true;
}

function reduceMotionOn() {
  return !!(document.documentElement && document.documentElement.classList.contains("reduced-motion"));
}

function windowLooksFocused() {
  return document.visibilityState === "visible" && (typeof document.hasFocus !== "function" || document.hasFocus());
}

function loadStillImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("still"));
    img.src = src;
  });
}

async function extractGifStillBlob(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadStillImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 1;
    canvas.height = img.naturalHeight || 1;
    canvas.getContext("2d").drawImage(img, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((next) => {
        if (next) resolve(next);
        else reject(new Error("still"));
      }, "image/webp", 0.86);
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadGifStillIfNeeded(intent, file) {
  if (!intent || !intent.still_upload_url || !file) return "";
  const mime = String(file.type || intent.mime || "").toLowerCase();
  const name = String(file.name || "");
  if (mime !== "image/gif" && !name.toLowerCase().endsWith(".gif")) return "";
  try {
    const blob = await extractGifStillBlob(file);
    const putRes = await fetch(intent.still_upload_url, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: blob
    });
    if (!putRes.ok) return "";
    return intent.still_public_url || "";
  } catch (e) {
    return "";
  }
}

function canvasStillFor(entry) {
  if (entry.canvasUrl) {
    if (entry.showing === "still") entry.img.src = entry.canvasUrl;
    return;
  }
  if (entry.canvasBusy) return;
  entry.canvasBusy = true;
  const probe = new Image();
  probe.crossOrigin = "anonymous";
  probe.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = probe.naturalWidth || 1;
      canvas.height = probe.naturalHeight || 1;
      canvas.getContext("2d").drawImage(probe, 0, 0);
      entry.canvasUrl = canvas.toDataURL("image/webp");
      if (entry.showing === "still") entry.img.src = entry.canvasUrl;
    } catch (e) {}
    entry.canvasBusy = false;
  };
  probe.onerror = () => {
    entry.canvasBusy = false;
  };
  probe.src = entry.live;
}

function showAttentionStill(entry) {
  if (entry.showing === "still" && entry.img.getAttribute("src")) return;
  entry.showing = "still";
  if (entry.still && !entry.stillFailed) {
    entry.img.onerror = () => {
      entry.img.onerror = null;
      entry.stillFailed = true;
      entry.img.src = entry.live;
      canvasStillFor(entry);
    };
    entry.img.src = entry.still;
    return;
  }
  entry.img.src = entry.live;
  canvasStillFor(entry);
}

function showAttentionLive(entry) {
  if (entry.showing === "live") return;
  entry.showing = "live";
  entry.img.onerror = null;
  entry.img.src = entry.live;
}

function attentionWantsLive(entry) {
  if (entry.kind === "profile") return true;
  if (reduceMotionOn()) return false;
  if (entry.hovering) {
    if (entry.kind === "hover" && entry.host && entry.host.classList.contains("active")) return false;
    return true;
  }
  if (entry.kind === "banner" && entry.introPlaying) return true;
  if (entry.kind === "hover") return false;
  if (!shouldPlayGifsWhenFocused()) return false;
  return windowLooksFocused() && entry.inView;
}

function teardownAttention(entry) {
  if (entry.observer) {
    try { entry.observer.disconnect(); } catch (e) {}
    entry.observer = null;
  }
  if (entry.host && entry.onEnter) {
    entry.host.removeEventListener("mouseenter", entry.onEnter);
    entry.host.removeEventListener("mouseleave", entry.onLeave);
  }
  if (entry.introTimer) {
    clearTimeout(entry.introTimer);
    entry.introTimer = 0;
  }
  if (entry.img && entry.img._attention === entry) entry.img._attention = null;
  attentionGifs.delete(entry);
}

function ensureAttentionListeners() {
  if (attentionBound) return;
  attentionBound = true;
  window.addEventListener("focus", refreshAttentionGifs);
  window.addEventListener("blur", refreshAttentionGifs);
  document.addEventListener("visibilitychange", refreshAttentionGifs);
}

function refreshAttentionGifs() {
  attentionGifs.forEach((entry) => {
    if (!entry.img || !entry.img.isConnected) {
      teardownAttention(entry);
      return;
    }
    entry.update();
  });
}

function bindAttentionGif(img, opts) {
  if (!img) return;
  opts = opts || {};
  const live = opts.live || "";
  if (!live) return;
  if (img._attention) teardownAttention(img._attention);
  if (!isGifSrc(live) && String(opts.mime || "").toLowerCase() !== "image/gif") {
    img.src = live;
    return;
  }
  const entry = {
    img,
    live,
    still: opts.still || stillUrlFromGif(live),
    kind: opts.kind || "chat",
    host: opts.host || img,
    hovering: false,
    inView: opts.kind !== "chat",
    introPlaying: false,
    introTimer: 0,
    showing: "",
    stillFailed: false,
    canvasUrl: "",
    canvasBusy: false,
    observer: null,
    onEnter: null,
    onLeave: null
  };
  entry.update = () => {
    if (attentionWantsLive(entry)) showAttentionLive(entry);
    else showAttentionStill(entry);
  };
  entry.onEnter = () => {
    entry.hovering = true;
    entry.update();
  };
  entry.onLeave = () => {
    entry.hovering = false;
    entry.update();
  };
  entry.host.addEventListener("mouseenter", entry.onEnter);
  entry.host.addEventListener("mouseleave", entry.onLeave);
  if (entry.kind === "chat") {
    entry.observer = new IntersectionObserver((rows) => {
      entry.inView = !!(rows[0] && rows[0].isIntersecting);
      entry.update();
    }, { threshold: 0.15 });
    entry.observer.observe(img);
  }
  if (entry.kind === "banner" && !reduceMotionOn()) {
    entry.introPlaying = true;
    entry.introTimer = setTimeout(() => {
      entry.introPlaying = false;
      entry.update();
    }, 5000);
  }
  img._attention = entry;
  attentionGifs.add(entry);
  ensureAttentionListeners();
  entry.update();
}

function paintGifBannerStrip(el, url, color, stillUrl) {
  if (!el) return;
  el.querySelectorAll(":scope > .attention-gif-layer").forEach((node) => node.remove());
  el.style.backgroundColor = (!url && color) ? color : "";
  if (!url || !isGifSrc(url)) {
    el.style.backgroundImage = url ? "url(" + JSON.stringify(url) + ")" : "";
    return;
  }
  el.style.backgroundImage = "";
  const img = document.createElement("img");
  img.className = "attention-gif-layer";
  img.alt = "";
  el.appendChild(img);
  bindAttentionGif(img, {
    live: url,
    still: stillUrl || stillUrlFromGif(url),
    kind: "banner",
    host: el
  });
}
