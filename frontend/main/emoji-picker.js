// ==================================================================
// emoji-picker.js - Composer emoji panel. Unicode + custom server
// packs (membership-gated). GIF/Stickers/Favorites still placeholders.
// ==================================================================

const EMOJI_CHARS_DESC = Array.from(new Set(
  EMOJI_PACK.categories.flatMap(c => c.items.map(i => i.ch))
)).sort((a, b) => b.length - a.length);

const CUSTOM_EMOJI_TOKEN_RE = /<:([a-zA-Z0-9_]{2,32}):(\d+)>/g;

let customEmojiPacks = [];
let customEmojiById = {};
let customEmojiPacksLoadedAt = 0;
let customEmojiPacksPromise = null;

function isEmojiOnlyContent(text) {
  let rest = (text || "").trim();
  if (!rest) return false;
  if (typeof STICKER_TOKEN_RE !== "undefined") {
    STICKER_TOKEN_RE.lastIndex = 0;
    if (STICKER_TOKEN_RE.test(rest)) return false;
  }
  rest = rest.replace(CUSTOM_EMOJI_TOKEN_RE, "");
  EMOJI_CHARS_DESC.forEach(ch => {
    if (ch && rest.indexOf(ch) !== -1) rest = rest.split(ch).join("");
  });
  return rest.trim() === "";
}

function replaceEmojiShortcodes(text) {
  return text.replace(/:([a-z0-9_+\-]+):/g, (m, name) => EMOJI_PACK.byName[name] || m);
}

function applyEmojiShortcodesToInput(el) {
  const start = el.selectionStart;
  const next = replaceEmojiShortcodes(el.value);
  if (next === el.value) return;
  const pos = replaceEmojiShortcodes(el.value.slice(0, start)).length;
  el.value = next;
  el.selectionStart = el.selectionEnd = pos;
}

function customEmojiToken(item) {
  return "<:" + item.name + ":" + item.id + ">";
}

function rememberCustomEmoji(row) {
  if (!row || row.id == null) return;
  customEmojiById[String(row.id)] = {
    id: row.id,
    name: row.name,
    image_url: row.image_url || "",
    server_id: row.server_id || ""
  };
}

function lookupCustomEmoji(id) {
  return customEmojiById[String(id)] || null;
}

function refreshCustomEmojiInMessages(row) {
  if (!row || row.id == null) return;
  rememberCustomEmoji(row);
  const label = ":" + (row.name || "emoji") + ":";
  document.querySelectorAll('.msg-custom-emoji[data-emoji-id="' + row.id + '"]').forEach((span) => {
    span.title = label;
    let img = span.querySelector("img");
    if (!img) {
      span.textContent = "";
      img = document.createElement("img");
      img.className = "msg-custom-emoji-img";
      img.draggable = false;
      span.appendChild(img);
    }
    img.alt = label;
    if (row.image_url) {
      if (typeof bindAnimatedEmoji === "function") bindAnimatedEmoji(img, row.image_url);
      else img.src = row.image_url;
    }
  });
}

async function ensureCustomEmoji(id) {
  const cached = lookupCustomEmoji(id);
  if (cached && cached.image_url) return cached;
  try {
    const response = await fetch(
      `https://${serverAddress}/server_emoji/${encodeURIComponent(id)}`,
      { credentials: "include" }
    );
    if (!response.ok) return cached;
    const data = await response.json().catch(() => null);
    if (data && data.id != null) {
      rememberCustomEmoji(data);
      return lookupCustomEmoji(data.id);
    }
  } catch (e) { /* keep cache miss */ }
  return cached;
}

async function loadCustomEmojiPacks(force) {
  const fresh = Date.now() - customEmojiPacksLoadedAt < 30000;
  if (!force && fresh && customEmojiPacksLoadedAt) return customEmojiPacks;
  if (customEmojiPacksPromise) return customEmojiPacksPromise;
  customEmojiPacksPromise = (async () => {
    try {
      const response = await fetch(`https://${serverAddress}/my_emoji_packs`, { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not load emoji packs.");
      const packs = data.packs || [];
      const order = (typeof serverList !== "undefined" && Array.isArray(serverList))
        ? serverList.map((s) => String(s.id))
        : [];
      packs.sort((a, b) => {
        const ai = order.indexOf(String(a.server_id));
        const bi = order.indexOf(String(b.server_id));
        if (ai < 0 && bi < 0) return 0;
        if (ai < 0) return 1;
        if (bi < 0) return -1;
        return ai - bi;
      });
      customEmojiPacks = packs;
      packs.forEach((pack) => {
        (pack.emojis || []).forEach(rememberCustomEmoji);
      });
      customEmojiPacksLoadedAt = Date.now();
    } catch (e) {
      if (!customEmojiPacksLoadedAt) customEmojiPacks = [];
    } finally {
      customEmojiPacksPromise = null;
    }
    return customEmojiPacks;
  })();
  return customEmojiPacksPromise;
}

function buildCustomEmojiImg(item, className) {
  const img = document.createElement("img");
  img.className = className || "emoji-cell-img";
  img.alt = ":" + item.name + ":";
  img.draggable = false;
  if (item.image_url) {
    if (typeof bindAnimatedEmoji === "function") bindAnimatedEmoji(img, item.image_url);
    else img.src = item.image_url;
  }
  return img;
}

function appendCustomEmojiNode(el, name, id) {
  const span = document.createElement("span");
  span.className = "msg-custom-emoji";
  span.dataset.emojiId = String(id);
  const cached = lookupCustomEmoji(id);
  span.title = ":" + ((cached && cached.name) || name) + ":";
  if (cached && cached.image_url) {
    const img = document.createElement("img");
    img.className = "msg-custom-emoji-img";
    img.alt = ":" + (cached.name || name) + ":";
    img.draggable = false;
    if (typeof bindAnimatedEmoji === "function") bindAnimatedEmoji(img, cached.image_url);
    else img.src = cached.image_url;
    span.appendChild(img);
  } else {
    span.textContent = ":" + name + ":";
    ensureCustomEmoji(id).then((row) => {
      if (!row || !row.image_url || !span.isConnected) return;
      span.textContent = "";
      const img = document.createElement("img");
      img.className = "msg-custom-emoji-img";
      img.alt = ":" + (row.name || name) + ":";
      img.draggable = false;
      if (typeof bindAnimatedEmoji === "function") bindAnimatedEmoji(img, row.image_url);
      else img.src = row.image_url;
      span.appendChild(img);
    });
  }
  el.appendChild(span);
}

function appendTextWithCustomEmoji(el, text) {
  const source = text || "";
  let last = 0;
  CUSTOM_EMOJI_TOKEN_RE.lastIndex = 0;
  if (typeof STICKER_TOKEN_RE !== "undefined") STICKER_TOKEN_RE.lastIndex = 0;
  let match;
  while (last < source.length) {
    CUSTOM_EMOJI_TOKEN_RE.lastIndex = last;
    if (typeof STICKER_TOKEN_RE !== "undefined") STICKER_TOKEN_RE.lastIndex = last;
    const emojiMatch = CUSTOM_EMOJI_TOKEN_RE.exec(source);
    const stickerMatch = typeof STICKER_TOKEN_RE !== "undefined" && typeof appendStickerNode === "function"
      ? STICKER_TOKEN_RE.exec(source)
      : null;
    match = emojiMatch;
    let kind = "emoji";
    if (stickerMatch && (!emojiMatch || stickerMatch.index < emojiMatch.index)) {
      match = stickerMatch;
      kind = "sticker";
    }
    if (!match) break;
    if (match.index > last) {
      if (typeof renderMessageText === "function") renderMessageText(el, source.slice(last, match.index));
      else el.appendChild(document.createTextNode(source.slice(last, match.index)));
    }
    if (kind === "sticker") appendStickerNode(el, match[1], match[2]);
    else appendCustomEmojiNode(el, match[1], match[2]);
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    if (typeof renderMessageText === "function") renderMessageText(el, source.slice(last));
    else el.appendChild(document.createTextNode(source.slice(last)));
  } else if (last === 0 && source) {
    if (typeof renderMessageText === "function") renderMessageText(el, source);
    else el.appendChild(document.createTextNode(source));
  }
}

let emojiPickerTarget = null;
let emojiReactionTarget = null;
let emojiSearchSaved = "";
let emojiHovering = false;
let emojiScrollLock = false;
let emojiPickerTab = "emoji";
let gifSearchSaved = "";
let gifConnected = null;
let gifRows = [];
let gifNext = null;
let gifBusy = false;
let gifQuery = "";
let gifTimer = null;
let gifSeq = 0;
let gifMode = "home";

function emojiFreqMap() {
  try { return JSON.parse(localStorage.getItem("oneira_emoji_freq") || "{}"); }
  catch (e) { return {}; }
}

function recordEmojiUse(name) {
  const freq = emojiFreqMap();
  freq[name] = (freq[name] || 0) + 1;
  localStorage.setItem("oneira_emoji_freq", JSON.stringify(freq));
  renderEmojiFrequent();
}

function frequentEmojiItems() {
  const freq = emojiFreqMap();
  const customHits = [];
  Object.keys(customEmojiById).forEach((id) => {
    const row = customEmojiById[id];
    const key = "c:" + id;
    if (freq[key] || freq[row.name]) {
      customHits.push({
        custom: true,
        id: row.id,
        name: row.name,
        image_url: row.image_url,
        server_id: row.server_id,
        freq: freq[key] || freq[row.name] || 0
      });
    }
  });
  const unicode = Object.keys(freq)
    .filter((n) => EMOJI_PACK.byName[n])
    .map((name) => ({ ch: EMOJI_PACK.byName[name], name, freq: freq[name] }));
  return unicode.concat(customHits)
    .sort((a, b) => b.freq - a.freq)
    .slice(0, 32)
    .map(({ freq, ...item }) => item);
}

function buildEmojiGrid(items) {
  const grid = document.createElement("div");
  grid.className = "emoji-grid";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-cell" + (item.custom ? " is-custom" : "");
    btn.dataset.name = item.name;
    if (item.custom) {
      btn.dataset.emojiId = String(item.id);
      btn.appendChild(buildCustomEmojiImg(item));
    } else {
      btn.textContent = item.ch;
    }
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("mouseenter", () => previewEmoji(item.name));
    btn.addEventListener("mouseleave", clearEmojiPreview);
    btn.addEventListener("click", () => pickEmoji(item));
    grid.appendChild(btn);
  });
  return grid;
}

function previewEmoji(name) {
  const code = `:${name}:`;
  document.getElementById("emoji-picker-footer").textContent = code;
  const search = document.getElementById("emoji-picker-search");
  if (document.activeElement !== search) {
    if (!emojiHovering) emojiSearchSaved = search.value;
    search.value = code;
  }
  emojiHovering = true;
}

function clearEmojiPreview() {
  emojiHovering = false;
  document.getElementById("emoji-picker-footer").textContent = "";
  const search = document.getElementById("emoji-picker-search");
  if (document.activeElement !== search) {
    search.value = emojiSearchSaved;
  }
}

function pickEmoji(item) {
  if (item.custom && emojiReactionTarget) {
    closeEmojiPicker();
    return;
  }
  if (emojiReactionTarget) {
    const msg = emojiReactionTarget;
    recordEmojiUse(item.name);
    closeEmojiPicker();
    toggleReaction(msg, item.ch);
    return;
  }
  if (!emojiPickerTarget || emojiPickerTarget.disabled) return;
  const el = emojiPickerTarget;
  const insert = item.custom ? customEmojiToken(item) : item.ch;
  if (el.dataset.emojiReplace === "1") {
    el.value = item.custom ? customEmojiToken(item) : item.ch;
    el.dispatchEvent(new Event("input"));
    recordEmojiUse(item.custom ? ("c:" + item.id) : item.name);
    closeEmojiPicker();
    return;
  }
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = el.value.slice(0, start) + insert + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + insert.length;
  el.focus();
  el.dispatchEvent(new Event("input"));
  recordEmojiUse(item.custom ? ("c:" + item.id) : item.name);
}

function renderEmojiFrequent() {
  const wrap = document.getElementById("emoji-section-frequent");
  if (!wrap) return;
  wrap.innerHTML = "";
  const title = document.createElement("div");
  title.className = "emoji-section-title";
  title.textContent = "Frequently Used";
  wrap.appendChild(title);
  const items = frequentEmojiItems();
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "emoji-section-empty";
    empty.textContent = "Emoji you use will show up here.";
    wrap.appendChild(empty);
  } else {
    wrap.appendChild(buildEmojiGrid(items));
  }
}

function paintServerRailBtn(btn, pack) {
  btn.replaceChildren();
  if (pack.icon_url) {
    const img = document.createElement("img");
    img.className = "emoji-rail-server-img";
    img.alt = "";
    img.src = pack.icon_url;
    img.draggable = false;
    btn.appendChild(img);
  } else {
    const letter = document.createElement("span");
    letter.className = "emoji-rail-server-letter";
    letter.textContent = typeof serverAvatarLetters === "function"
      ? serverAvatarLetters(pack.server_name)
      : String(pack.server_name || "?").slice(0, 1);
    btn.appendChild(letter);
  }
}

function buildEmojiPickerBody() {
  const rail = document.getElementById("emoji-cat-rail");
  const catalog = document.getElementById("emoji-picker-catalog");
  rail.innerHTML = "";
  catalog.innerHTML = "";

  customEmojiPacks.forEach((pack) => {
    const catId = "server-" + pack.server_id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-rail-btn emoji-rail-server";
    btn.dataset.cat = catId;
    btn.title = pack.server_name || "Server";
    paintServerRailBtn(btn, pack);
    btn.addEventListener("click", () => jumpEmojiCategory(catId));
    rail.appendChild(btn);

    const sec = document.createElement("div");
    sec.className = "emoji-section";
    sec.dataset.cat = catId;
    const title = document.createElement("div");
    title.className = "emoji-section-title";
    title.textContent = pack.server_name || "Server";
    sec.appendChild(title);
    const items = (pack.emojis || []).map((row) => ({
      custom: true,
      id: row.id,
      name: row.name,
      image_url: row.image_url,
      server_id: pack.server_id
    }));
    if (items.length) sec.appendChild(buildEmojiGrid(items));
    catalog.appendChild(sec);
  });

  const favBtn = document.createElement("button");
  favBtn.type = "button";
  favBtn.className = "emoji-rail-btn disabled";
  favBtn.title = "Favorites (coming soon)";
  favBtn.textContent = "\u2B50";
  favBtn.disabled = true;
  rail.appendChild(favBtn);

  const freqBtn = document.createElement("button");
  freqBtn.type = "button";
  freqBtn.className = "emoji-rail-btn";
  freqBtn.dataset.cat = "frequent";
  freqBtn.title = "Frequently Used";
  freqBtn.textContent = "\u23F3";
  freqBtn.addEventListener("click", () => jumpEmojiCategory("frequent"));
  rail.appendChild(freqBtn);

  const freqSec = document.createElement("div");
  freqSec.className = "emoji-section";
  freqSec.id = "emoji-section-frequent";
  freqSec.dataset.cat = "frequent";
  catalog.appendChild(freqSec);
  renderEmojiFrequent();

  EMOJI_PACK.categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-rail-btn";
    btn.dataset.cat = cat.id;
    btn.title = cat.name;
    btn.textContent = cat.items[0] ? cat.items[0].ch : "?";
    btn.addEventListener("click", () => jumpEmojiCategory(cat.id));
    rail.appendChild(btn);

    const sec = document.createElement("div");
    sec.className = "emoji-section";
    sec.dataset.cat = cat.id;
    const title = document.createElement("div");
    title.className = "emoji-section-title";
    title.textContent = cat.name;
    sec.appendChild(title);
    sec.appendChild(buildEmojiGrid(cat.items));
    catalog.appendChild(sec);
  });
}

function jumpEmojiCategory(id) {
  const main = document.getElementById("emoji-picker-main");
  const sec = main.querySelector('.emoji-section[data-cat="' + id + '"]');
  if (!sec) return;
  emojiScrollLock = true;
  main.scrollTop += sec.getBoundingClientRect().top - main.getBoundingClientRect().top;
  highlightEmojiRail(id);
  setTimeout(() => { emojiScrollLock = false; }, 80);
}

function highlightEmojiRail(id) {
  document.querySelectorAll("#emoji-cat-rail .emoji-rail-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.cat === id);
  });
  const active = document.querySelector('#emoji-cat-rail .emoji-rail-btn[data-cat="' + id + '"]');
  if (active) active.scrollIntoView({ block: "nearest" });
}

function syncEmojiRailFromScroll() {
  if (emojiScrollLock) return;
  const main = document.getElementById("emoji-picker-main");
  const top = main.getBoundingClientRect().top;
  let current = null;
  main.querySelectorAll(".emoji-section").forEach((sec) => {
    if (sec.getBoundingClientRect().top - top <= 48) current = sec.dataset.cat;
  });
  if (current) highlightEmojiRail(current);
}

function filterEmojiPicker(query) {
  const q = query.toLowerCase().replace(/:/g, "").trim();
  const results = document.getElementById("emoji-search-results");
  const catalog = document.getElementById("emoji-picker-catalog");
  if (!q) {
    results.style.display = "none";
    catalog.style.display = "block";
    return;
  }
  catalog.style.display = "none";
  results.style.display = "block";
  results.innerHTML = "";
  const hits = [];
  customEmojiPacks.forEach((pack) => {
    (pack.emojis || []).forEach((row) => {
      if (String(row.name || "").toLowerCase().indexOf(q) !== -1) {
        hits.push({
          custom: true,
          id: row.id,
          name: row.name,
          image_url: row.image_url,
          server_id: pack.server_id
        });
      }
    });
  });
  EMOJI_PACK.categories.forEach((cat) => {
    cat.items.forEach((item) => {
      if (item.name.indexOf(q) !== -1) hits.push(item);
    });
  });
  if (hits.length === 0) {
    results.textContent = "No emoji found.";
    return;
  }
  results.appendChild(buildEmojiGrid(hits.slice(0, 200)));
}

// Same placement model as shared/context-menu.js positionMenu:
// open at a viewport point, then flip left/up if the panel would
// leave the window. Must divide by pageZoom() — accessibility zoom
// makes client coords and style.left/top different spaces.
// Place once per open — never re-place after async pack loads.
function placeEmojiPickerAt(x, y) {
  const picker = document.getElementById("emoji-picker");
  if (!picker) return;
  const z = typeof pageZoom === "function" ? pageZoom() : 1;
  picker.style.display = "flex";
  picker.style.left = (x / z) + "px";
  picker.style.top = (y / z) + "px";
  const rect = picker.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    picker.style.left = (Math.max(0, x - rect.width) / z) + "px";
  }
  if (rect.bottom > window.innerHeight) {
    picker.style.top = (Math.max(0, y - rect.height) / z) + "px";
  }
}

async function refreshEmojiPickerPacks() {
  await loadCustomEmojiPacks(true);
  buildEmojiPickerBody();
  filterEmojiPicker(document.getElementById("emoji-picker-search").value || "");
}

function paintEmojiAddButton() {
  const btn = document.querySelector("#emoji-picker .emoji-add-btn");
  if (!btn) return;
  const stickers = emojiPickerTab === "stickers";
  const allowed = !!currentServerId && typeof canOpenServerEmojis === "function" && canOpenServerEmojis();
  btn.disabled = !allowed;
  btn.classList.toggle("disabled", !allowed);
  btn.textContent = stickers ? "Add sticker" : "Add emoji";
  btn.title = allowed
    ? (stickers ? "Add sticker" : "Add emoji")
    : (stickers ? "You do not have permission to add stickers here." : "You do not have permission to add emoji here.");
}

function gifMarkdown(url) {
  return "![gif](" + url + ")";
}

function gifListEl() {
  return document.getElementById("emoji-gif-list");
}

function setGifListMode(mode) {
  const list = gifListEl();
  if (!list) return list;
  list.className = "emoji-gif-list is-" + (mode === "home" ? "home" : "results");
  return list;
}

function paintGifEmpty(text) {
  const list = setGifListMode(gifMode === "home" ? "home" : "results");
  if (!list) return;
  list.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "emoji-gif-empty";
  empty.textContent = text;
  list.appendChild(empty);
}

function paintGifFooter(text) {
  const foot = document.getElementById("emoji-picker-footer");
  if (!foot) return;
  foot.textContent = text || (gifConnected ? "Powered by GIPHY" : "");
}

function gifFavRows() {
  try {
    const rows = JSON.parse(localStorage.getItem("oneira_gif_fav") || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

function pickGif(row) {
  if (emojiReactionTarget) return;
  if (!emojiPickerTarget || emojiPickerTarget.disabled) return;
  if (emojiPickerTarget.dataset.emojiReplace === "1") return;
  const url = (row && row.url) || "";
  if (!url) return;
  const el = emojiPickerTarget;
  const insert = gifMarkdown(url);
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = el.value.slice(0, start) + insert + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + insert.length;
  el.focus();
  el.dispatchEvent(new Event("input"));
  closeEmojiPicker();
}

function appendGifCells(rows) {
  const list = gifListEl();
  if (!list) return;
  rows.forEach((row) => {
    if (!row || !row.url) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-gif-cell";
    btn.title = row.title || "GIF";
    const img = document.createElement("img");
    img.alt = row.title || "";
    img.src = row.preview || row.url;
    img.draggable = false;
    btn.appendChild(img);
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("mouseleave", () => paintGifFooter("Powered by GIPHY"));
    btn.addEventListener("mouseenter", () => paintGifFooter(row.title || "Powered by GIPHY"));
    btn.addEventListener("click", () => pickGif(row));
    list.appendChild(btn);
  });
}

function paintGifSection(name, preview, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "emoji-gif-section";
  if (preview) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = preview;
    img.draggable = false;
    btn.appendChild(img);
  }
  const label = document.createElement("span");
  label.className = "emoji-gif-section-label";
  label.textContent = name;
  btn.appendChild(label);
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", onClick);
  return btn;
}

function openGifTopic(name) {
  const search = document.getElementById("emoji-picker-search");
  gifMode = "search";
  gifSearchSaved = name || "";
  gifQuery = gifSearchSaved.trim();
  if (search) search.value = gifSearchSaved;
  loadGifPage(true);
}

function openGifTrending() {
  const search = document.getElementById("emoji-picker-search");
  gifMode = "trending";
  gifSearchSaved = "";
  gifQuery = "";
  if (search) search.value = "";
  loadGifPage(true);
}

function openGifFavorites() {
  gifMode = "favorites";
  gifNext = null;
  const list = setGifListMode("results");
  if (!list) return;
  const rows = gifFavRows().filter((row) => row && row.url);
  list.innerHTML = "";
  if (!rows.length) {
    paintGifEmpty("Favorite GIFs will show up here.");
    paintGifFooter("Powered by GIPHY");
    return;
  }
  gifRows = rows;
  appendGifCells(rows);
  paintGifFooter("Powered by GIPHY");
}

function paintGifHome(data) {
  const list = setGifListMode("home");
  if (!list) return;
  list.innerHTML = "";
  const favs = gifFavRows();
  list.appendChild(paintGifSection("Favorites", (favs[0] && (favs[0].preview || favs[0].url)) || "", openGifFavorites));
  const trending = (data && data.trending) || {};
  list.appendChild(paintGifSection(trending.name || "Trending GIFs", trending.preview || "", openGifTrending));
  ((data && data.sections) || []).forEach((row) => {
    if (!row || !row.name) return;
    list.appendChild(paintGifSection(row.name, row.preview || "", () => openGifTopic(row.name)));
  });
  paintGifFooter("Powered by GIPHY");
}

async function loadGifHome() {
  gifMode = "home";
  gifNext = null;
  const seq = ++gifSeq;
  paintGifEmpty("Loading GIFs.");
  try {
    const response = await fetch("https://" + serverAddress + "/gifs/home", { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (seq !== gifSeq || emojiPickerTab !== "gifs") return;
    if (!response.ok) {
      paintGifEmpty(typeof data.detail === "string" ? data.detail : "Could not load GIFs.");
      return;
    }
    paintGifHome(data);
  } catch (e) {
    if (seq === gifSeq) paintGifEmpty("Could not load GIFs.");
  }
}

async function loadGifPage(reset) {
  if (!gifConnected || gifBusy) return;
  if (!reset && (gifMode === "home" || gifMode === "favorites" || gifNext == null)) return;
  const list = setGifListMode("results");
  if (!list) return;
  const seq = ++gifSeq;
  gifBusy = true;
  const offset = reset ? 0 : gifNext;
  const query = gifQuery;
  try {
    const response = await fetch(
      "https://" + serverAddress + "/gifs/search?q=" + encodeURIComponent(query) + "&offset=" + encodeURIComponent(offset || 0),
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (seq !== gifSeq) return;
    if (!response.ok) {
      if (reset) paintGifEmpty(typeof data.detail === "string" ? data.detail : "GIF search is not connected.");
      return;
    }
    const rows = data.gifs || [];
    if (reset) {
      gifRows = rows;
      list.innerHTML = "";
      if (!rows.length) {
        paintGifEmpty(query ? "No GIFs matched that search." : "No trending GIFs right now.");
        gifNext = data.next == null ? null : data.next;
        return;
      }
    } else {
      gifRows = gifRows.concat(rows);
    }
    appendGifCells(rows);
    gifNext = data.next == null ? null : data.next;
    paintGifFooter("Powered by GIPHY");
  } catch (e) {
    if (seq === gifSeq && reset) paintGifEmpty("Could not load GIFs.");
  } finally {
    if (seq === gifSeq) gifBusy = false;
  }
}

function scheduleGifSearch() {
  window.clearTimeout(gifTimer);
  gifTimer = window.setTimeout(() => {
    gifQuery = gifSearchSaved.trim();
    if (!gifQuery) {
      loadGifHome();
      return;
    }
    gifMode = "search";
    loadGifPage(true);
  }, 250);
}

async function ensureGifStatus() {
  try {
    const response = await fetch("https://" + serverAddress + "/gifs/status", { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    gifConnected = !!(response.ok && data && data.connected);
  } catch (e) {
    gifConnected = false;
  }
  return gifConnected;
}

async function openGifPane() {
  paintGifFooter("");
  if (gifConnected === null) paintGifEmpty("Loading GIFs.");
  const connected = await ensureGifStatus();
  if (emojiPickerTab !== "gifs") return;
  if (!connected) {
    gifRows = [];
    gifNext = null;
    paintGifEmpty("GIF search is not connected. Add a GIPHY API key in Admin Settings.");
    paintGifFooter("");
    return;
  }
  gifQuery = gifSearchSaved.trim();
  paintGifFooter("Powered by GIPHY");
  if (!gifQuery) {
    loadGifHome();
    return;
  }
  gifMode = "search";
  loadGifPage(true);
}

function showEmojiPickerTab(tab) {
  const picker = document.getElementById("emoji-picker");
  const search = document.getElementById("emoji-picker-search");
  const gifTab = picker.querySelector('.emoji-tab[data-tab="gifs"]');
  const stickerTab = picker.querySelector('.emoji-tab[data-tab="stickers"]');
  if (gifTab) gifTab.style.display = emojiReactionTarget ? "none" : "";
  if (stickerTab) stickerTab.style.display = emojiReactionTarget ? "none" : "";
  if (emojiReactionTarget) emojiPickerTab = "emoji";
  else if (tab === "gifs") emojiPickerTab = "gifs";
  else if (tab === "stickers") emojiPickerTab = "stickers";
  else emojiPickerTab = "emoji";
  picker.classList.toggle("is-gifs", emojiPickerTab === "gifs");
  picker.classList.toggle("is-stickers", emojiPickerTab === "stickers");
  picker.querySelectorAll(".emoji-tab").forEach((btn) => {
    if (btn.disabled) return;
    btn.classList.toggle("active", btn.getAttribute("data-tab") === emojiPickerTab);
  });
  paintEmojiAddButton();
  if (emojiPickerTab === "gifs") {
    if (document.activeElement !== search) search.value = gifSearchSaved;
    search.placeholder = "Search GIFs";
    openGifPane();
    return;
  }
  if (emojiPickerTab === "stickers") {
    if (document.activeElement !== search) search.value = emojiSearchSaved;
    search.placeholder = "Find the perfect sticker";
    paintGifFooter("");
    document.getElementById("emoji-picker-footer").textContent = "";
    if (typeof openStickerPane === "function") openStickerPane();
    return;
  }
  if (document.activeElement !== search) search.value = emojiSearchSaved;
  search.placeholder = "Find the perfect emoji";
  paintGifFooter("");
  document.getElementById("emoji-picker-footer").textContent = "";
  buildEmojiPickerBody();
  filterEmojiPicker(search.value || "");
}

function openEmojiSettingsFromPicker() {
  const btn = document.querySelector("#emoji-picker .emoji-add-btn");
  if (!btn || btn.disabled) return;
  closeEmojiPicker();
  if (typeof openServerSettings !== "function") return;
  openServerSettings();
  if (typeof showServerSettingsTab === "function") {
    showServerSettingsTab(emojiPickerTab === "stickers" ? "stickers" : "emojis");
  }
}

function openEmojiPicker(btn, input, clientX, clientY) {
  if (input.disabled) return;
  if (document.documentElement.classList.contains("legacy-chat-input")) return;
  emojiReactionTarget = null;
  const picker = document.getElementById("emoji-picker");
  if (picker.style.display === "flex" && emojiPickerTarget === input) {
    closeEmojiPicker();
    return;
  }
  emojiPickerTarget = input;
  let x = clientX;
  let y = clientY;
  if (x == null || y == null) {
    const rect = btn.getBoundingClientRect();
    x = rect.left;
    y = rect.top;
  }
  placeEmojiPickerAt(x, y);
  paintEmojiAddButton();
  document.getElementById("emoji-picker-search").value = "";
  document.getElementById("emoji-picker-footer").textContent = "";
  emojiSearchSaved = "";
  gifSearchSaved = "";
  emojiHovering = false;
  showEmojiPickerTab("emoji");
  filterEmojiPicker("");
  const firstServer = customEmojiPacks[0];
  highlightEmojiRail(firstServer ? ("server-" + firstServer.server_id) : "frequent");
  loadCustomEmojiPacks(false).then(() => {
    if (emojiPickerTarget !== input && !emojiReactionTarget) return;
    buildEmojiPickerBody();
    filterEmojiPicker(document.getElementById("emoji-picker-search").value || "");
    const pack = customEmojiPacks[0];
    highlightEmojiRail(pack ? ("server-" + pack.server_id) : "frequent");
  });
}

function closeEmojiPicker() {
  document.getElementById("emoji-picker").style.display = "none";
  emojiPickerTarget = null;
  emojiReactionTarget = null;
  clearEmojiPreview();
  emojiSearchSaved = "";
  gifSearchSaved = "";
  gifMode = "home";
  gifSeq += 1;
  window.clearTimeout(gifTimer);
}

function openEmojiPickerForReaction(x, y, msg) {
  emojiPickerTarget = null;
  emojiReactionTarget = msg;
  placeEmojiPickerAt(x, y);
  paintEmojiAddButton();
  document.getElementById("emoji-picker-search").value = "";
  document.getElementById("emoji-picker-footer").textContent = "";
  emojiSearchSaved = "";
  gifSearchSaved = "";
  emojiHovering = false;
  showEmojiPickerTab("emoji");
  filterEmojiPicker("");
  highlightEmojiRail("frequent");
  loadCustomEmojiPacks(false).then(() => {
    if (!emojiReactionTarget) return;
    buildEmojiPickerBody();
    filterEmojiPicker(document.getElementById("emoji-picker-search").value || "");
    highlightEmojiRail("frequent");
  });
}

document.getElementById("composer-emoji-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openEmojiPicker(e.currentTarget, document.getElementById("composer-input"), e.clientX, e.clientY);
});
document.getElementById("channel-composer-emoji-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openEmojiPicker(e.currentTarget, document.getElementById("channel-composer-input"), e.clientX, e.clientY);
});
document.getElementById("announce-composer-emoji-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openEmojiPicker(e.currentTarget, document.getElementById("announcement-body-input"), e.clientX, e.clientY);
});
document.getElementById("forum-composer-emoji-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openEmojiPicker(e.currentTarget, document.getElementById("forum-body-input"), e.clientX, e.clientY);
});
document.getElementById("community-compose-emoji-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openEmojiPicker(e.currentTarget, document.getElementById("community-compose-input"), e.clientX, e.clientY);
});

document.getElementById("emoji-picker").addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => closeEmojiPicker());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeEmojiPicker();
});

document.getElementById("emoji-picker-main").addEventListener("scroll", syncEmojiRailFromScroll);

document.getElementById("emoji-picker-search").addEventListener("input", (e) => {
  if (emojiPickerTab === "gifs") {
    gifSearchSaved = e.target.value;
    scheduleGifSearch();
    return;
  }
  emojiSearchSaved = e.target.value;
  if (emojiPickerTab === "stickers" && typeof filterStickerPicker === "function") {
    filterStickerPicker(e.target.value);
    return;
  }
  filterEmojiPicker(e.target.value);
});
document.querySelectorAll("#emoji-picker .emoji-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    showEmojiPickerTab(btn.getAttribute("data-tab") || "emoji");
  });
});
const emojiGifList = document.getElementById("emoji-gif-list");
if (emojiGifList) {
  emojiGifList.addEventListener("scroll", () => {
    if (emojiPickerTab !== "gifs" || gifMode === "home" || gifMode === "favorites" || gifBusy || gifNext == null) return;
    if (emojiGifList.scrollTop + emojiGifList.clientHeight < emojiGifList.scrollHeight - 80) return;
    loadGifPage(false);
  });
}

document.getElementById("composer-input").addEventListener("input", () => {
  applyEmojiShortcodesToInput(document.getElementById("composer-input"));
  autoGrowComposer();
});
document.getElementById("channel-composer-input").addEventListener("input", () => {
  applyEmojiShortcodesToInput(document.getElementById("channel-composer-input"));
  autoGrowChannelComposer();
});
document.getElementById("announcement-body-input").addEventListener("input", () => {
  applyEmojiShortcodesToInput(document.getElementById("announcement-body-input"));
});
document.getElementById("forum-body-input").addEventListener("input", () => {
  applyEmojiShortcodesToInput(document.getElementById("forum-body-input"));
});

const emojiAddBtn = document.querySelector("#emoji-picker .emoji-add-btn");
if (emojiAddBtn) emojiAddBtn.addEventListener("click", openEmojiSettingsFromPicker);

buildEmojiPickerBody();
highlightEmojiRail("frequent");
loadCustomEmojiPacks(false).then(() => {
  buildEmojiPickerBody();
  highlightEmojiRail(customEmojiPacks[0] ? ("server-" + customEmojiPacks[0].server_id) : "frequent");
});
