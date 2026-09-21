// ==================================================================
// music-player.js - Profile Music chrome. Looks only this pass:
// play/pause, prev/next, title, seek, volume. No audio yet.
// WinAmp is layout reference, not a skin we copy.
// ==================================================================

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

  const root = document.createElement("div");
  root.className = "oneira-music";

  const lcd = document.createElement("div");
  lcd.className = "oneira-music-lcd";
  const time = document.createElement("div");
  time.className = "oneira-music-time";
  time.textContent = "0:00";
  const title = document.createElement("div");
  title.className = "oneira-music-title";
  const name = String(opts.title || "").trim();
  title.textContent = name || "No track";
  title.classList.toggle("is-empty", !name);
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
  mute.setAttribute("aria-label", "Volume");
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
  root.appendChild(lcd);
  root.appendChild(seek);
  root.appendChild(row);
  host.appendChild(root);

  const handle = {
    root,
    destroy() {
      if (host && host._oneiraMusic === handle) host._oneiraMusic = null;
      if (root.parentNode) root.remove();
    }
  };
  host._oneiraMusic = handle;
  return handle;
}
