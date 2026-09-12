// ==================================================================
// embeds.js - Clickable chat links + preview cards under the message.
// Invite URLs are skipped; invite cards stay in invites.js untouched.
// ==================================================================

const EMBED_HIDDEN_KEY = "oneira_embed_hidden";
const embedPreviewCache = {};

function trimUrlTrail(raw) {
  return raw.replace(/[),.;!?]+$/g, "");
}

function isInviteUrl(url) {
  return /^https:\/\/oneira\.cc\/invite\/[A-Za-z0-9]{8}$/.test(url);
}

function parseHttpUrl(raw) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function extractEmbedUrls(text) {
  const found = [];
  const seen = {};
  const re = /https?:\/\/[^\s<>"']+/gi;
  let match;
  while ((match = re.exec(text || ""))) {
    const url = trimUrlTrail(match[0]);
    if (!url || seen[url] || isInviteUrl(url) || !parseHttpUrl(url)) continue;
    seen[url] = true;
    found.push(url);
  }
  return found;
}

function embedKind(url) {
  const host = ((parseHttpUrl(url) || {}).hostname || "").toLowerCase();
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return "youtube";
  if (host === "reddit.com" || host.endsWith(".reddit.com")) return "reddit";
  if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) return "twitter";
  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) return "twitch";
  if (host === "spotify.com" || host.endsWith(".spotify.com")) return "spotify";
  if (host.endsWith("steampowered.com") || host.endsWith("steamcommunity.com")) return "steam";
  return "default";
}

function hiddenEmbedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(EMBED_HIDDEN_KEY) || "[]")); }
  catch (e) { return new Set(); }
}

function isEmbedHidden(url) {
  return hiddenEmbedSet().has(url);
}

function hideEmbedUrl(url) {
  const hidden = hiddenEmbedSet();
  hidden.add(url);
  localStorage.setItem(EMBED_HIDDEN_KEY, JSON.stringify(Array.from(hidden)));
}

function renderMessageText(el, text) {
  const re = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  let match;
  while ((match = re.exec(text || ""))) {
    const trimmed = trimUrlTrail(match[0]);
    if (match.index > last) el.appendChild(document.createTextNode(text.slice(last, match.index)));
    if (trimmed && parseHttpUrl(trimmed)) {
      const link = document.createElement("a");
      link.className = "msg-link";
      link.href = trimmed;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = trimmed;
      el.appendChild(link);
      last = match.index + trimmed.length;
    } else {
      el.appendChild(document.createTextNode(match[0]));
      last = match.index + match[0].length;
    }
  }
  if (last < (text || "").length) el.appendChild(document.createTextNode(text.slice(last)));
}

function fillDefaultEmbedLayout(card, data) {
  const hide = card.querySelector(".link-embed-hide");
  card.innerHTML = "";
  if (hide) card.appendChild(hide);

  const body = document.createElement("div");
  body.className = "link-embed-body";

  const title = document.createElement("a");
  title.className = "link-embed-title";
  title.href = data.url;
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  title.textContent = data.title || data.site || data.url;
  body.appendChild(title);

  if (data.description) {
    const desc = document.createElement("div");
    desc.className = "link-embed-desc";
    desc.textContent = data.description;
    body.appendChild(desc);
  }
  card.appendChild(body);

  if (data.image) {
    const img = document.createElement("img");
    img.className = "link-embed-logo";
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    img.src = data.image;
    card.appendChild(img);
  }
}

function buildLinkEmbedCard(url) {
  const card = document.createElement("div");
  card.className = "link-embed link-embed-" + embedKind(url);

  const hide = document.createElement("button");
  hide.type = "button";
  hide.className = "link-embed-hide";
  hide.title = "Hide embed";
  hide.textContent = "\u00d7";
  hide.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideEmbedUrl(url);
    card.remove();
  });
  card.appendChild(hide);

  const parsed = parseHttpUrl(url);
  const fallbackSite = parsed ? parsed.hostname.replace(/^www\./, "") : url;
  fillDefaultEmbedLayout(card, { url, site: fallbackSite, title: fallbackSite, description: "", image: "" });

  if (embedPreviewCache[url]) {
    fillDefaultEmbedLayout(card, embedPreviewCache[url]);
    return card;
  }
  if (!serverAddress) return card;

  fetch(`https://${serverAddress}/embed_preview?url=${encodeURIComponent(url)}`, { credentials: "include" })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (!data || !data.url) return;
      embedPreviewCache[url] = data;
      fillDefaultEmbedLayout(card, data);
    })
    .catch(() => {});
  return card;
}

function attachLinkEmbedsIfNeeded(lineEl, content) {
  const urls = extractEmbedUrls(content);
  let after = lineEl;
  urls.forEach(url => {
    if (isEmbedHidden(url)) return;
    const card = buildLinkEmbedCard(url);
    after.after(card);
    after = card;
  });
}
