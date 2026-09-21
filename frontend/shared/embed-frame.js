// ==================================================================
// embed-frame.js - Profile Embed: one YouTube / Spotify / Twitch
// iframe from a pasted link. Not a generic webpage box.
// ==================================================================

const ONEIRA_EMBED_PROVIDERS = { youtube: true, spotify: true, twitch: true };
const TWITCH_RESERVED = {
  videos: true, clips: true, directory: true, settings: true, downloads: true,
  search: true, turbo: true, jobs: true, broadcast: true, login: true, signup: true,
  p: true, inventory: true, subscriptions: true, wallet: true, bits: true
};

function twitchEmbedParents() {
  const host = String((typeof location !== "undefined" && location.hostname) || "localhost").trim() || "localhost";
  const parents = [host];
  if (host !== "localhost") parents.push("localhost");
  if (host !== "127.0.0.1") parents.push("127.0.0.1");
  return parents;
}

function twitchParentQuery() {
  return twitchEmbedParents().map((h) => "parent=" + encodeURIComponent(h)).join("&");
}

function parseOneiraEmbed(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  let youtube = text.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:[^#]*&)?v=)([\w-]{11})/i);
  if (youtube) {
    return {
      provider: "youtube",
      kind: "video",
      id: youtube[1],
      url: "https://www.youtube.com/watch?v=" + youtube[1]
    };
  }
  const spotify = text.match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]+)|spotify:(track|album|playlist|episode|show):([A-Za-z0-9]+))/i);
  if (spotify) {
    const kind = (spotify[1] || spotify[3] || "").toLowerCase();
    const id = spotify[2] || spotify[4] || "";
    if (!kind || !id) return null;
    return {
      provider: "spotify",
      kind,
      id,
      url: "https://open.spotify.com/" + kind + "/" + id
    };
  }
  const clipHost = text.match(/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/i);
  if (clipHost) {
    return {
      provider: "twitch",
      kind: "clip",
      id: clipHost[1],
      url: "https://clips.twitch.tv/" + clipHost[1]
    };
  }
  const vod = text.match(/twitch\.tv\/videos\/(\d+)/i);
  if (vod) {
    return {
      provider: "twitch",
      kind: "video",
      id: vod[1],
      url: "https://www.twitch.tv/videos/" + vod[1]
    };
  }
  const channelClip = text.match(/twitch\.tv\/[A-Za-z0-9_]+\/clip\/([A-Za-z0-9_-]+)/i);
  if (channelClip) {
    return {
      provider: "twitch",
      kind: "clip",
      id: channelClip[1],
      url: "https://clips.twitch.tv/" + channelClip[1]
    };
  }
  const channel = text.match(/twitch\.tv\/([A-Za-z0-9_]{4,25})(?:[/?#]|$)/i);
  if (channel && !TWITCH_RESERVED[channel[1].toLowerCase()]) {
    const name = channel[1].toLowerCase();
    return {
      provider: "twitch",
      kind: "channel",
      id: name,
      url: "https://www.twitch.tv/" + name
    };
  }
  return null;
}

function oneiraEmbedIframeSrc(parsed) {
  if (!parsed || !ONEIRA_EMBED_PROVIDERS[parsed.provider] || !parsed.id) return "";
  if (parsed.provider === "youtube") {
    return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(parsed.id) + "?rel=0&modestbranding=1&playsinline=1";
  }
  if (parsed.provider === "spotify") {
    return "https://open.spotify.com/embed/" + encodeURIComponent(parsed.kind) + "/" + encodeURIComponent(parsed.id);
  }
  const parent = twitchParentQuery();
  if (parsed.kind === "clip") {
    return "https://clips.twitch.tv/embed?clip=" + encodeURIComponent(parsed.id) + "&" + parent + "&autoplay=false";
  }
  if (parsed.kind === "video") {
    return "https://player.twitch.tv/?video=" + encodeURIComponent(parsed.id) + "&" + parent + "&autoplay=false";
  }
  return "https://player.twitch.tv/?channel=" + encodeURIComponent(parsed.id) + "&" + parent + "&autoplay=false";
}

function restoreAllOneiraPlayers() {
  if (typeof oneiraPlayers === "undefined") return;
  oneiraPlayers.forEach((api) => {
    if (api && api.restore) api.restore();
  });
}

function mountOneiraEmbed(host, options) {
  const opts = options || {};
  if (host && host._oneiraEmbed && host._oneiraEmbed.destroy) {
    host._oneiraEmbed.destroy();
    host._oneiraEmbed = null;
  }
  const parsed = parseOneiraEmbed(opts.url);
  const src = oneiraEmbedIframeSrc(parsed);
  const root = document.createElement("div");
  root.className = "oneira-embed" + (src ? "" : " is-empty") + (opts.editOverlay ? " is-edit" : "");

  const empty = document.createElement("div");
  empty.className = "oneira-embed-empty";
  empty.textContent = opts.editOverlay
    ? "Paste a YouTube, Spotify, or Twitch link in Options."
    : "";
  root.appendChild(empty);

  let iframe = null;
  let liveSrc = src;
  let parked = false;

  function mountFrame(nextSrc) {
    liveSrc = nextSrc || "";
    if (iframe) {
      iframe.remove();
      iframe = null;
    }
    if (!liveSrc) {
      root.classList.add("is-empty");
      return;
    }
    root.classList.remove("is-empty");
    iframe = document.createElement("iframe");
    iframe.src = liveSrc;
    iframe.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.title = parsed && parsed.provider ? parsed.provider : "Embed";
    root.appendChild(iframe);
    parked = false;
  }

  if (opts.editOverlay) {
    const grab = document.createElement("div");
    grab.className = "oneira-embed-grab";
    root.appendChild(grab);
  }

  host.appendChild(root);
  mountFrame(src);

  const handle = {
    root,
    pause() {
      if (!iframe || parked) return;
      iframe.src = "about:blank";
      parked = true;
    },
    restore() {
      if (!parked || !liveSrc) return;
      mountFrame(liveSrc);
    },
    destroy() {
      if (typeof oneiraPlayers !== "undefined") oneiraPlayers.delete(handle);
      if (host && host._oneiraEmbed === handle) host._oneiraEmbed = null;
      if (root.parentNode) root.remove();
    }
  };
  if (typeof oneiraPlayers !== "undefined") oneiraPlayers.add(handle);
  host._oneiraEmbed = handle;
  return handle;
}
