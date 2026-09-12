// ==================================================================
// embeds.js - Clickable links + in-chat link cards.
// Title/description/image fill in when GET /embed_preview exists.
// ==================================================================

const embedPreviewCache = {};

function trimUrlTrail(raw) {
  return raw.replace(/[),.;!?]+$/g, "");
}

function isInviteUrl(url) {
  return /^https:\/\/oneira\.cc\/invite\/[A-Za-z0-9]{8}$/.test(url);
}

function isSkippableEmbedHost(hostname) {
  const h = (hostname || "").toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") ||
    h === "127.0.0.1" || h === "0.0.0.0" || h === "[::1]";
}

function parseHttpUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isSkippableEmbedHost(u.hostname)) return null;
    return u;
  } catch (e) {
    return null;
  }
}

function firstEmbedUrl(text) {
  const re = /https?:\/\/[^\s<>"']+/gi;
  let m;
  while ((m = re.exec(text || ""))) {
    const url = trimUrlTrail(m[0]);
    if (isInviteUrl(url)) continue;
    if (parseHttpUrl(url)) return url;
  }
  return null;
}

function renderMessageText(el, text) {
  const re = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  let m;
  while ((m = re.exec(text || ""))) {
    const trimmed = trimUrlTrail(m[0]);
    const keep = m[0].length - (m[0].length - trimmed.length);
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (trimmed && parseHttpUrl(trimmed)) {
      const a = document.createElement("a");
      a.className = "msg-link";
      a.href = trimmed;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = trimmed;
      el.appendChild(a);
      last = m.index + keep;
    } else {
      el.appendChild(document.createTextNode(m[0]));
      last = m.index + m[0].length;
    }
  }
  if (last < (text || "").length) el.appendChild(document.createTextNode(text.slice(last)));
}

function siteLabelFromUrl(url) {
  const parsed = parseHttpUrl(url);
  if (!parsed) return "";
  return parsed.hostname.replace(/^www\./, "");
}

function fillLinkEmbedCard(card, data) {
  card.innerHTML = "";
  const body = document.createElement("div");
  body.className = "link-embed-body";

  const site = document.createElement("div");
  site.className = "link-embed-site";
  site.textContent = data.site || siteLabelFromUrl(data.url);
  body.appendChild(site);

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
    img.className = "link-embed-thumb";
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    img.src = data.image;
    card.appendChild(img);
  }
}

function attachLinkEmbedIfNeeded(bubbleEl, content) {
  const url = firstEmbedUrl(content);
  if (!url) return;

  const card = document.createElement("div");
  card.className = "link-embed";
  fillLinkEmbedCard(card, { url, site: siteLabelFromUrl(url), title: "", description: "", image: "" });
  bubbleEl.appendChild(card);

  if (embedPreviewCache[url]) {
    fillLinkEmbedCard(card, embedPreviewCache[url]);
    return;
  }
  if (!serverAddress) return;

  fetch(`https://${serverAddress}/embed_preview?url=${encodeURIComponent(url)}`, { credentials: "include" })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (!data || !data.url) return;
      embedPreviewCache[url] = data;
      fillLinkEmbedCard(card, data);
    })
    .catch(() => {});
}
