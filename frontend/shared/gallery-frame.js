// ==================================================================
// gallery-frame.js - Profile Gallery. Up to 6 stills (gif allowed).
// Manual arrows by default; Slideshow extras live on Progression Type.
// ==================================================================

const GALLERY_SPEEDS = { min: 2, max: 12, def: 4 };

function mountOneiraGallery(host, options) {
  const opts = options || {};
  if (host && host._oneiraGallery && host._oneiraGallery.destroy) {
    host._oneiraGallery.destroy();
    host._oneiraGallery = null;
  }
  const items = (Array.isArray(opts.items) ? opts.items : []).filter((row) => row && String(row.url || "").trim());
  const mode = opts.mode === "slideshow" ? "slideshow" : "manual";
  const transition = opts.transition === "fade" ? "fade" : "cut";
  let speed = Number(opts.speed);
  if (!Number.isFinite(speed)) speed = GALLERY_SPEEDS.def;
  speed = Math.max(GALLERY_SPEEDS.min, Math.min(GALLERY_SPEEDS.max, Math.round(speed)));
  const shuffleOn = !!opts.shuffle;

  const root = document.createElement("div");
  root.className = "oneira-gallery" + (items.length ? "" : " is-empty");
  const stage = document.createElement("div");
  stage.className = "oneira-gallery-stage";
  const img = document.createElement("img");
  img.className = "oneira-gallery-img";
  img.alt = "";
  img.draggable = false;
  const empty = document.createElement("div");
  empty.className = "oneira-gallery-empty";
  empty.textContent = opts.editHint ? "Add pictures in Options." : "";
  stage.appendChild(img);
  stage.appendChild(empty);
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "oneira-gallery-nav is-prev";
  prev.setAttribute("aria-label", "Previous");
  prev.textContent = "\u2039";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "oneira-gallery-nav is-next";
  next.setAttribute("aria-label", "Next");
  next.textContent = "\u203a";
  root.appendChild(stage);
  root.appendChild(prev);
  root.appendChild(next);
  host.appendChild(root);

  let order = items.map((_, i) => i);
  let pos = 0;
  let timer = null;
  let fading = false;
  let handle = null;

  function currentIndex() {
    return order[pos] == null ? 0 : order[pos];
  }

  function reshuffle() {
    order = items.map((_, i) => i);
    if (shuffleOn && order.length > 1) {
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }
    }
    pos = 0;
  }

  function show(index, animate) {
    if (!items.length) {
      root.classList.add("is-empty");
      img.removeAttribute("src");
      prev.hidden = true;
      next.hidden = true;
      return;
    }
    root.classList.remove("is-empty");
    const row = items[index];
    const apply = () => {
      img.src = row.url;
      img.alt = row.name || "Gallery";
      img.classList.remove("is-dim");
      fading = false;
    };
    const many = items.length > 1;
    prev.hidden = !many;
    next.hidden = !many;
    if (animate && transition === "fade" && img.src) {
      fading = true;
      img.classList.add("is-dim");
      setTimeout(apply, 180);
    } else {
      apply();
    }
  }

  function step(dir) {
    if (items.length < 2 || fading) return;
    pos += dir;
    if (pos >= order.length) {
      if (shuffleOn) reshuffle();
      else pos = 0;
    } else if (pos < 0) {
      pos = order.length - 1;
    }
    show(currentIndex(), true);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (mode !== "slideshow" || items.length < 2) return;
    timer = setInterval(() => step(1), speed * 1000);
  }

  prev.addEventListener("pointerdown", (e) => e.stopPropagation());
  next.addEventListener("pointerdown", (e) => e.stopPropagation());
  prev.addEventListener("click", (e) => {
    e.stopPropagation();
    step(-1);
    startTimer();
  });
  next.addEventListener("click", (e) => {
    e.stopPropagation();
    step(1);
    startTimer();
  });

  handle = {
    root,
    pause: stopTimer,
    restore: startTimer,
    destroy() {
      stopTimer();
      if (typeof oneiraPlayers !== "undefined") oneiraPlayers.delete(handle);
      if (host && host._oneiraGallery === handle) host._oneiraGallery = null;
      if (root.parentNode) root.remove();
    }
  };
  if (typeof oneiraPlayers !== "undefined") oneiraPlayers.add(handle);
  host._oneiraGallery = handle;
  reshuffle();
  show(currentIndex(), false);
  startTimer();
  return handle;
}
