// ==================================================================
// media-player.js - Shared Oneira video chrome. Profile widget now;
// chat can mount the same player later. Gear is top-right; fullscreen
// sits where the gear used to be on the bar.
// ==================================================================

const ONEIRA_PLAYER_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const oneiraPlayers = new Set();
let oneiraPlayerVolume = 1;
let oneiraPlayerMuted = false;

function pauseAllOneiraPlayers() {
  [...oneiraPlayers].forEach((api) => {
    if (api && api.pause) api.pause();
  });
  const fs = document.fullscreenElement || document.webkitFullscreenElement;
  if (fs && fs.classList && fs.classList.contains("oneira-player")) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  }
}

function oneiraPlayerTime(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function oneiraPlayerSvg(path, view) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", view || "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const node = document.createElementNS(ns, "path");
  node.setAttribute("d", path);
  node.setAttribute("fill", "currentColor");
  svg.appendChild(node);
  return svg;
}

function mountOneiraPlayer(host, options) {
  [...oneiraPlayers].forEach((api) => {
    if (api.root && !api.root.isConnected) api.destroy();
  });
  if (host && host._oneiraPlayer && host._oneiraPlayer.destroy) {
    host._oneiraPlayer.destroy();
    host._oneiraPlayer = null;
  }
  const opts = options || {};
  const root = document.createElement("div");
  root.className = "oneira-player is-empty" + (opts.transparent ? " is-overlay" : "");
  const stage = document.createElement("div");
  stage.className = "oneira-player-stage";
  const video = document.createElement("video");
  video.preload = "metadata";
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.controls = false;
  video.autoplay = false;
  const empty = document.createElement("div");
  empty.className = "oneira-player-empty";
  empty.setAttribute("aria-hidden", "true");
  empty.textContent = "Oneira";
  stage.appendChild(video);
  stage.appendChild(empty);
  const gearWrap = document.createElement("div");
  gearWrap.className = "oneira-player-gear-wrap";
  const gearBtn = document.createElement("button");
  gearBtn.type = "button";
  gearBtn.className = "oneira-player-icon oneira-player-gear";
  gearBtn.setAttribute("aria-label", "Settings");
  gearBtn.appendChild(oneiraPlayerSvg("M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.1 7.1 0 00-1.63-.94l-.36-2.54A.5.5 0 0014.9 2h-3.8a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 00-.6.22L3.71 8.84a.5.5 0 00.12.64L5.86 11.06a7.07 7.07 0 000 1.88L3.83 14.52a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54a.5.5 0 00.49.42h3.8a.5.5 0 00.49-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z"));
  const menu = document.createElement("div");
  menu.className = "oneira-player-menu";
  menu.hidden = true;
  gearWrap.appendChild(gearBtn);
  gearWrap.appendChild(menu);
  stage.appendChild(gearWrap);

  const bar = document.createElement("div");
  bar.className = "oneira-player-chrome";
  const scrub = document.createElement("input");
  scrub.type = "range";
  scrub.min = "0";
  scrub.max = "1000";
  scrub.value = "0";
  scrub.className = "oneira-player-scrub";
  scrub.setAttribute("aria-label", "Seek");
  const row = document.createElement("div");
  row.className = "oneira-player-row";
  const timeEl = document.createElement("div");
  timeEl.className = "oneira-player-time";
  timeEl.textContent = "0:00";
  const cluster = document.createElement("div");
  cluster.className = "oneira-player-cluster";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "oneira-player-skip";
  backBtn.setAttribute("aria-label", "Back 5 seconds");
  backBtn.textContent = "\u22125s";
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "oneira-player-play";
  playBtn.setAttribute("aria-label", "Play");
  playBtn.appendChild(oneiraPlayerSvg("M8 5v14l11-7z"));
  const fwdBtn = document.createElement("button");
  fwdBtn.type = "button";
  fwdBtn.className = "oneira-player-skip";
  fwdBtn.setAttribute("aria-label", "Forward 5 seconds");
  fwdBtn.textContent = "+5s";
  cluster.appendChild(backBtn);
  cluster.appendChild(playBtn);
  cluster.appendChild(fwdBtn);
  const volWrap = document.createElement("div");
  volWrap.className = "oneira-player-vol";
  const muteBtn = document.createElement("button");
  muteBtn.type = "button";
  muteBtn.className = "oneira-player-icon";
  muteBtn.setAttribute("aria-label", "Mute");
  muteBtn.appendChild(oneiraPlayerSvg("M5 9v6h4l5 5V4L9 9H5zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z"));
  const vol = document.createElement("input");
  vol.type = "range";
  vol.min = "0";
  vol.max = "100";
  vol.className = "oneira-player-vol-slider";
  vol.setAttribute("aria-label", "Volume");
  volWrap.appendChild(muteBtn);
  const volPop = document.createElement("div");
  volPop.className = "oneira-player-vol-pop";
  volPop.appendChild(vol);
  volWrap.appendChild(volPop);
  const fsBtn = document.createElement("button");
  fsBtn.type = "button";
  fsBtn.className = "oneira-player-icon";
  fsBtn.setAttribute("aria-label", "Full screen");
  function paintFsIcon() {
    const on = document.fullscreenElement === root;
    fsBtn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
    fsBtn.innerHTML = "";
    fsBtn.appendChild(on
      ? oneiraPlayerSvg("M7 14H5v5h5v-2H7v-3zm0-4h2V7h3V5H5v5h2zm10 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z")
      : oneiraPlayerSvg("M7 14H5v5h5v-2H7v-3zm12-9h-5v2h3v3h2V5zM5 5v5h2V7h3V5H5zm14 9h-2v3h-3v2h5v-5z"));
  }
  paintFsIcon();
  const end = document.createElement("div");
  end.className = "oneira-player-end";
  end.appendChild(volWrap);
  end.appendChild(fsBtn);
  row.appendChild(timeEl);
  row.appendChild(cluster);
  row.appendChild(end);
  bar.appendChild(scrub);
  bar.appendChild(row);
  root.appendChild(stage);
  root.appendChild(bar);
  host.appendChild(root);

  let src = "";
  let speed = 1;
  let scrubbing = false;
  let lastVol = oneiraPlayerVolume || 1;

  function hasSrc() {
    return !!src;
  }

  function applyVolume() {
    video.muted = oneiraPlayerMuted;
    video.volume = oneiraPlayerMuted ? 0 : oneiraPlayerVolume;
    vol.value = String(Math.round((oneiraPlayerMuted ? 0 : oneiraPlayerVolume) * 100));
    muteBtn.setAttribute("aria-label", oneiraPlayerMuted || oneiraPlayerVolume === 0 ? "Unmute" : "Mute");
  }

  function setPlayingUi(on) {
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    playBtn.innerHTML = "";
    playBtn.appendChild(on
      ? oneiraPlayerSvg("M6 5h4v14H6zm8 0h4v14h-4z")
      : oneiraPlayerSvg("M8 5v14l11-7z"));
  }

  function paintTime() {
    const now = video.currentTime || 0;
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    timeEl.textContent = oneiraPlayerTime(now) + (dur ? " / " + oneiraPlayerTime(dur) : "");
    if (!scrubbing) {
      scrub.value = dur ? String(Math.round((now / dur) * 1000)) : "0";
    }
  }

  function closeMenu() {
    menu.hidden = true;
  }

  function paintMenu() {
    menu.innerHTML = "";
    const speedTitle = document.createElement("div");
    speedTitle.className = "oneira-player-menu-title";
    speedTitle.textContent = "Playback speed";
    menu.appendChild(speedTitle);
    const speedRow = document.createElement("div");
    speedRow.className = "oneira-player-menu-row";
    ONEIRA_PLAYER_SPEEDS.forEach((n) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "oneira-player-menu-chip" + (speed === n ? " is-on" : "");
      btn.textContent = n === 1 ? "1x" : n + "x";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        speed = n;
        video.playbackRate = n;
        paintMenu();
      });
      speedRow.appendChild(btn);
    });
    menu.appendChild(speedRow);
    const resTitle = document.createElement("div");
    resTitle.className = "oneira-player-menu-title";
    resTitle.textContent = "Resolution";
    menu.appendChild(resTitle);
    const resBtn = document.createElement("button");
    resBtn.type = "button";
    resBtn.className = "oneira-player-menu-chip is-on";
    resBtn.textContent = "Source";
    resBtn.disabled = true;
    resBtn.title = "Extra sizes wait on transcoding.";
    menu.appendChild(resBtn);
  }

  function setEnabled() {
    root.classList.toggle("is-empty", !hasSrc());
    const off = !hasSrc();
    [scrub, backBtn, playBtn, fwdBtn, muteBtn, vol, gearBtn, fsBtn].forEach((el) => {
      el.disabled = off;
    });
  }

  let hideTimer = null;

  function showChrome() {
    root.classList.remove("is-chrome-hidden");
  }

  function hideChrome() {
    if (!opts.transparent) return;
    if (!menu.hidden) return;
    root.classList.add("is-chrome-hidden");
  }

  function chromeShouldStay() {
    if (!opts.transparent || !hasSrc()) return true;
    if (!menu.hidden) return true;
    if (video.paused && opts.showWhenPaused !== false) return true;
    return false;
  }

  function armChromeHide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (chromeShouldStay()) {
      showChrome();
      return;
    }
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!chromeShouldStay()) hideChrome();
    }, 3000);
  }

  function noteChromeInteraction() {
    if (!opts.transparent) return;
    showChrome();
    armChromeHide();
  }

  let handle = null;

  function pause() {
    video.pause();
    setPlayingUi(false);
  }

  function play() {
    if (!hasSrc()) return;
    oneiraPlayers.forEach((api) => {
      if (api !== handle) api.pause();
    });
    applyVolume();
    video.playbackRate = speed;
    const run = video.play();
    if (run && typeof run.catch === "function") run.catch(() => setPlayingUi(false));
  }

  function setSource(next) {
    const row = next || {};
    src = String(row.src || "").trim();
    video.pause();
    setPlayingUi(false);
    closeMenu();
    if (!src) {
      video.removeAttribute("src");
      video.load();
    } else {
      video.src = src;
    }
    setEnabled();
    paintTime();
    showChrome();
    armChromeHide();
  }

  bar.addEventListener("pointerdown", (e) => e.stopPropagation());
  gearWrap.addEventListener("pointerdown", (e) => e.stopPropagation());
  volWrap.addEventListener("pointerenter", () => volWrap.classList.add("is-open"));
  volWrap.addEventListener("pointerleave", () => volWrap.classList.remove("is-open"));
  volWrap.addEventListener("pointerdown", (e) => e.stopPropagation());
  menu.addEventListener("pointerdown", (e) => e.stopPropagation());
  playBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!hasSrc()) return;
    if (video.paused) play();
    else pause();
  });
  backBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!hasSrc()) return;
    video.currentTime = Math.max(0, (video.currentTime || 0) - 5);
    paintTime();
  });
  fwdBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!hasSrc()) return;
    const dur = Number.isFinite(video.duration) ? video.duration : (video.currentTime || 0) + 5;
    video.currentTime = Math.min(dur, (video.currentTime || 0) + 5);
    paintTime();
  });
  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (oneiraPlayerMuted || oneiraPlayerVolume === 0) {
      oneiraPlayerMuted = false;
      oneiraPlayerVolume = lastVol || 1;
    } else {
      lastVol = oneiraPlayerVolume || lastVol || 1;
      oneiraPlayerMuted = true;
    }
    applyVolume();
  });
  vol.addEventListener("input", () => {
    const n = Number(vol.value) / 100;
    oneiraPlayerVolume = n;
    oneiraPlayerMuted = n === 0;
    if (n > 0) lastVol = n;
    applyVolume();
  });
  scrub.addEventListener("pointerdown", () => { scrubbing = true; });
  scrub.addEventListener("input", () => {
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    if (!dur) return;
    video.currentTime = (Number(scrub.value) / 1000) * dur;
    paintTime();
  });
  const endScrub = () => { scrubbing = false; paintTime(); };
  scrub.addEventListener("pointerup", endScrub);
  scrub.addEventListener("change", endScrub);
  gearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!hasSrc()) return;
    if (menu.hidden) {
      paintMenu();
      menu.hidden = false;
      showChrome();
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    } else {
      closeMenu();
      armChromeHide();
    }
  });
  fsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!hasSrc()) return;
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (document.fullscreenElement === root || document.webkitFullscreenElement === root) {
      if (exit) exit.call(document);
      return;
    }
    if (req) req.call(root);
  });
  const onFsChange = () => paintFsIcon();
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  video.addEventListener("play", () => {
    setPlayingUi(true);
    showChrome();
    armChromeHide();
  });
  video.addEventListener("pause", () => {
    setPlayingUi(false);
    armChromeHide();
  });
  video.addEventListener("ended", () => {
    setPlayingUi(false);
    armChromeHide();
  });
  video.addEventListener("timeupdate", paintTime);
  video.addEventListener("loadedmetadata", paintTime);
  video.addEventListener("click", (e) => {
    if (opts.allowStageToggle === false) return;
    e.stopPropagation();
    if (!hasSrc() || opts.stageIsDrag) return;
    if (video.paused) play();
    else pause();
  });
  root.addEventListener("pointermove", noteChromeInteraction);
  root.addEventListener("pointerdown", noteChromeInteraction);

  handle = {
    root,
    pause,
    setSource,
    destroy() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      pause();
      oneiraPlayers.delete(handle);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      if ((document.fullscreenElement === root || document.webkitFullscreenElement === root) && (document.exitFullscreen || document.webkitExitFullscreen)) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
      if (host && host._oneiraPlayer === handle) host._oneiraPlayer = null;
      if (root.parentNode) root.remove();
    }
  };
  oneiraPlayers.add(handle);
  if (host) host._oneiraPlayer = handle;
  applyVolume();
  setSource({ src: opts.src || "", name: opts.name || "" });
  setEnabled();
  paintTime();
  return handle;
}
