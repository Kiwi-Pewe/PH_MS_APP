// ==================================================================
// music-player.js - Profile Music. Uploaded mp3/mp4 only. No autoplay.
// WinAmp is layout reference, not a skin we copy.
// ==================================================================

let oneiraMusicVolume = 0.8;
let oneiraMusicMuted = false;

function mountOneiraMusicPlayer(host, options) {
  const opts = options || {};
  if (host && host._oneiraMusic && host._oneiraMusic.destroy) {
    host._oneiraMusic.destroy();
    host._oneiraMusic = null;
  }
  const svg = typeof oneiraPlayerSvg === "function"
    ? oneiraPlayerSvg
    : function (path) {
      const ns = "http://www.w3.org/2000/svg";
      const node = document.createElementNS(ns, "svg");
      node.setAttribute("viewBox", "0 0 24 24");
      node.setAttribute("aria-hidden", "true");
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", path);
      p.setAttribute("fill", "currentColor");
      node.appendChild(p);
      return node;
    };
  const fmt = typeof oneiraPlayerTime === "function"
    ? oneiraPlayerTime
    : function (seconds) {
      const n = Math.max(0, Math.floor(Number(seconds) || 0));
      return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
    };

  const tracks = (Array.isArray(opts.tracks) ? opts.tracks : [])
    .map((row) => ({
      url: String((row && (row.url || row.src)) || "").trim(),
      name: String((row && row.name) || "").trim()
    }))
    .filter((row) => row.url);
  let index = 0;
  let scrubbing = false;
  let lastVol = oneiraMusicVolume || 0.8;
  let handle = null;

  const root = document.createElement("div");
  root.className = "oneira-music" + (tracks.length ? "" : " is-empty");

  const audio = document.createElement("audio");
  audio.preload = "metadata";
  audio.autoplay = false;
  audio.playsInline = true;

  const lcd = document.createElement("div");
  lcd.className = "oneira-music-lcd";
  const time = document.createElement("div");
  time.className = "oneira-music-time";
  time.textContent = "0:00";
  const title = document.createElement("div");
  title.className = "oneira-music-title";
  lcd.appendChild(time);
  lcd.appendChild(title);

  const seek = document.createElement("input");
  seek.type = "range";
  seek.min = "0";
  seek.max = "1000";
  seek.value = "0";
  seek.className = "oneira-music-seek";
  seek.setAttribute("aria-label", "Seek");

  const row = document.createElement("div");
  row.className = "oneira-music-row";
  const cluster = document.createElement("div");
  cluster.className = "oneira-music-cluster";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "oneira-music-skip";
  prev.setAttribute("aria-label", "Previous");
  prev.appendChild(svg("M6 6h2v12H6zm3.5 6l8.5 6V6z"));
  const play = document.createElement("button");
  play.type = "button";
  play.className = "oneira-music-play";
  play.setAttribute("aria-label", "Play");
  play.appendChild(svg("M8 5v14l11-7z"));
  const next = document.createElement("button");
  next.type = "button";
  next.className = "oneira-music-skip";
  next.setAttribute("aria-label", "Next");
  next.appendChild(svg("M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"));
  cluster.appendChild(prev);
  cluster.appendChild(play);
  cluster.appendChild(next);

  const volWrap = document.createElement("div");
  volWrap.className = "oneira-music-vol";
  const mute = document.createElement("button");
  mute.type = "button";
  mute.className = "oneira-music-icon";
  mute.setAttribute("aria-label", "Mute");
  mute.appendChild(svg("M5 9v6h4l5 5V4L9 9H5zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z"));
  const vol = document.createElement("input");
  vol.type = "range";
  vol.min = "0";
  vol.max = "100";
  vol.value = "80";
  vol.className = "oneira-music-vol-slider";
  vol.setAttribute("aria-label", "Volume");
  volWrap.appendChild(mute);
  volWrap.appendChild(vol);

  row.appendChild(cluster);
  row.appendChild(volWrap);
  root.appendChild(audio);
  root.appendChild(lcd);
  root.appendChild(seek);
  root.appendChild(row);
  host.appendChild(root);

  function current() {
    return tracks[index] || null;
  }

  function hasTracks() {
    return tracks.length > 0;
  }

  function setPlayingUi(on) {
    play.setAttribute("aria-label", on ? "Pause" : "Play");
    play.innerHTML = "";
    play.appendChild(on
      ? svg("M6 5h4v14H6zm8 0h4v14h-4z")
      : svg("M8 5v14l11-7z"));
  }

  function paintTitle() {
    const row = current();
    const name = row ? (row.name || "Track " + (index + 1)) : "";
    title.textContent = name || "No track";
    title.classList.toggle("is-empty", !name);
  }

  function paintTime() {
    const now = audio.currentTime || 0;
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    time.textContent = fmt(now) + (dur ? " / " + fmt(dur) : "");
    if (!scrubbing) seek.value = dur ? String(Math.round((now / dur) * 1000)) : "0";
  }

  function applyVolume() {
    audio.muted = oneiraMusicMuted;
    audio.volume = oneiraMusicMuted ? 0 : oneiraMusicVolume;
    vol.value = String(Math.round((oneiraMusicMuted ? 0 : oneiraMusicVolume) * 100));
    mute.setAttribute("aria-label", oneiraMusicMuted || oneiraMusicVolume === 0 ? "Unmute" : "Mute");
  }

  function setEnabled() {
    const off = !hasTracks();
    root.classList.toggle("is-empty", off);
    [seek, prev, play, next, mute, vol].forEach((el) => {
      el.disabled = off;
    });
  }

  function pause() {
    audio.pause();
    setPlayingUi(false);
  }

  function playCurrent() {
    if (!hasTracks() || !audio.src) return;
    if (typeof oneiraPlayers !== "undefined") {
      oneiraPlayers.forEach((api) => {
        if (api !== handle && api.pause) api.pause();
      });
    }
    applyVolume();
    const run = audio.play();
    if (run && typeof run.catch === "function") run.catch(() => setPlayingUi(false));
  }

  function loadTrack(nextIndex, autoplay) {
    if (!tracks.length) {
      audio.removeAttribute("src");
      audio.load();
      paintTitle();
      paintTime();
      setEnabled();
      setPlayingUi(false);
      return;
    }
    index = (nextIndex % tracks.length + tracks.length) % tracks.length;
    const row = current();
    audio.pause();
    audio.src = row.url;
    audio.load();
    paintTitle();
    paintTime();
    setEnabled();
    setPlayingUi(false);
    if (autoplay) playCurrent();
  }

  function skipPrev() {
    if (!hasTracks()) return;
    if ((audio.currentTime || 0) > 2) {
      audio.currentTime = 0;
      paintTime();
      return;
    }
    loadTrack(index - 1, !audio.paused);
  }

  function skipNext(autoplay) {
    if (!hasTracks()) return;
    const keep = autoplay == null ? !audio.paused : !!autoplay;
    if (index >= tracks.length - 1) {
      loadTrack(0, false);
      pause();
      return;
    }
    loadTrack(index + 1, keep);
  }

  play.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!hasTracks()) return;
    if (audio.paused) playCurrent();
    else pause();
  });
  prev.addEventListener("click", (e) => {
    e.stopPropagation();
    skipPrev();
  });
  next.addEventListener("click", (e) => {
    e.stopPropagation();
    skipNext();
  });
  mute.addEventListener("click", (e) => {
    e.stopPropagation();
    if (oneiraMusicMuted || oneiraMusicVolume === 0) {
      oneiraMusicMuted = false;
      oneiraMusicVolume = lastVol || 0.8;
    } else {
      lastVol = oneiraMusicVolume || lastVol || 0.8;
      oneiraMusicMuted = true;
    }
    applyVolume();
  });
  vol.addEventListener("input", () => {
    const n = Number(vol.value) / 100;
    oneiraMusicVolume = n;
    oneiraMusicMuted = n === 0;
    if (n > 0) lastVol = n;
    applyVolume();
  });
  seek.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    scrubbing = true;
  });
  seek.addEventListener("input", () => {
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (!dur) return;
    audio.currentTime = (Number(seek.value) / 1000) * dur;
    paintTime();
  });
  const endScrub = () => { scrubbing = false; paintTime(); };
  seek.addEventListener("pointerup", endScrub);
  seek.addEventListener("change", endScrub);
  audio.addEventListener("play", () => setPlayingUi(true));
  audio.addEventListener("pause", () => setPlayingUi(false));
  audio.addEventListener("timeupdate", paintTime);
  audio.addEventListener("loadedmetadata", paintTime);
  audio.addEventListener("ended", () => {
    if (index >= tracks.length - 1) {
      loadTrack(0, false);
      pause();
      return;
    }
    loadTrack(index + 1, true);
  });

  handle = {
    root,
    pause,
    destroy() {
      pause();
      audio.removeAttribute("src");
      audio.load();
      if (typeof oneiraPlayers !== "undefined") oneiraPlayers.delete(handle);
      if (host && host._oneiraMusic === handle) host._oneiraMusic = null;
      if (root.parentNode) root.remove();
    }
  };
  if (typeof oneiraPlayers !== "undefined") oneiraPlayers.add(handle);
  host._oneiraMusic = handle;
  applyVolume();
  loadTrack(0, false);
  return handle;
}
