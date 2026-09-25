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
  img.src = item.image_url || "";
  img.draggable = false;
  return img;
}

function appendCustomEmojiNode(el, name, id) {
  const span = document.createElement("span");
  span.className = "msg-custom-emoji";
  span.dataset.emojiId = String(id);
  span.title = ":" + name + ":";
  const cached = lookupCustomEmoji(id);
  if (cached && cached.image_url) {
    const img = document.createElement("img");
    img.className = "msg-custom-emoji-img";
    img.alt = ":" + (cached.name || name) + ":";
    img.src = cached.image_url;
    img.draggable = false;
    span.appendChild(img);
  } else {
    span.textContent = ":" + name + ":";
    ensureCustomEmoji(id).then((row) => {
      if (!row || !row.image_url || !span.isConnected) return;
      span.textContent = "";
      const img = document.createElement("img");
      img.className = "msg-custom-emoji-img";
      img.alt = ":" + (row.name || name) + ":";
      img.src = row.image_url;
      img.draggable = false;
      span.appendChild(img);
    });
  }
  el.appendChild(span);
}

function appendTextWithCustomEmoji(el, text) {
  const source = text || "";
  let last = 0;
  CUSTOM_EMOJI_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = CUSTOM_EMOJI_TOKEN_RE.exec(source))) {
    if (match.index > last) {
      if (typeof renderMessageText === "function") renderMessageText(el, source.slice(last, match.index));
      else el.appendChild(document.createTextNode(source.slice(last, match.index)));
    }
    appendCustomEmojiNode(el, match[1], match[2]);
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

function placeEmojiPickerNear(leftPrefer, topPreferAbove, topPreferBelow) {
  const picker = document.getElementById("emoji-picker");
  picker.style.display = "flex";
  picker.style.left = "0px";
  picker.style.top = "0px";
  const pad = 8;
  const maxW = Math.max(280, window.innerWidth - pad * 2);
  const maxH = Math.max(280, window.innerHeight - pad * 2);
  picker.style.width = Math.min(520, maxW) + "px";
  picker.style.height = Math.min(520, maxH) + "px";
  const width = picker.offsetWidth;
  const height = picker.offsetHeight;
  let left = leftPrefer;
  let top = topPreferAbove;
  if (top < pad) top = topPreferBelow;
  if (top + height > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - height - pad);
  }
  if (top < pad) top = pad;
  left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
  picker.style.left = left + "px";
  picker.style.top = top + "px";
}

async function refreshEmojiPickerPacks() {
  await loadCustomEmojiPacks(true);
  buildEmojiPickerBody();
  filterEmojiPicker(document.getElementById("emoji-picker-search").value || "");
}

function openEmojiPicker(btn, input) {
  if (input.disabled) return;
  if (document.documentElement.classList.contains("legacy-chat-input")) return;
  emojiReactionTarget = null;
  const picker = document.getElementById("emoji-picker");
  if (picker.style.display === "flex" && emojiPickerTarget === input) {
    closeEmojiPicker();
    return;
  }
  emojiPickerTarget = input;
  const rect = btn.getBoundingClientRect();
  const widthGuess = Math.min(520, Math.max(280, window.innerWidth - 16));
  placeEmojiPickerNear(
    Math.max(8, rect.right - widthGuess),
    rect.top - 8 - Math.min(520, window.innerHeight - 16),
    rect.bottom + 8
  );
  document.getElementById("emoji-picker-search").value = "";
  document.getElementById("emoji-picker-footer").textContent = "";
  emojiSearchSaved = "";
  emojiHovering = false;
  loadCustomEmojiPacks(false).then(() => {
    if (emojiPickerTarget !== input && !emojiReactionTarget) return;
    buildEmojiPickerBody();
    filterEmojiPicker("");
    const firstServer = customEmojiPacks[0];
    highlightEmojiRail(firstServer ? ("server-" + firstServer.server_id) : "frequent");
  });
}

function closeEmojiPicker() {
  document.getElementById("emoji-picker").style.display = "none";
  emojiPickerTarget = null;
  emojiReactionTarget = null;
  clearEmojiPreview();
  emojiSearchSaved = "";
}

function openEmojiPickerForReaction(x, y, msg) {
  const picker = document.getElementById("emoji-picker");
  emojiPickerTarget = null;
  emojiReactionTarget = msg;
  const widthGuess = Math.min(520, Math.max(280, window.innerWidth - 16));
  placeEmojiPickerNear(
    Math.max(8, Math.min(x, window.innerWidth - widthGuess - 8)),
    y - 8 - Math.min(520, window.innerHeight - 16),
    y + 8
  );
  document.getElementById("emoji-picker-search").value = "";
  document.getElementById("emoji-picker-footer").textContent = "";
  emojiSearchSaved = "";
  emojiHovering = false;
  loadCustomEmojiPacks(false).then(() => {
    if (!emojiReactionTarget) return;
    buildEmojiPickerBody();
    filterEmojiPicker("");
    highlightEmojiRail("frequent");
  });
}

document.getElementById("composer-emoji-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openEmojiPicker(e.currentTarget, document.getElementById("composer-input"));
});
document.getElementById("channel-composer-emoji-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openEmojiPicker(e.currentTarget, document.getElementById("channel-composer-input"));
});
document.getElementById("announce-composer-emoji-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openEmojiPicker(e.currentTarget, document.getElementById("announcement-body-input"));
});
document.getElementById("forum-composer-emoji-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  openEmojiPicker(e.currentTarget, document.getElementById("forum-body-input"));
});

document.getElementById("emoji-picker").addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => closeEmojiPicker());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeEmojiPicker();
});

document.getElementById("emoji-picker-main").addEventListener("scroll", syncEmojiRailFromScroll);

document.getElementById("emoji-picker-search").addEventListener("input", (e) => {
  emojiSearchSaved = e.target.value;
  filterEmojiPicker(e.target.value);
});

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

buildEmojiPickerBody();
highlightEmojiRail("frequent");
loadCustomEmojiPacks(false).then(() => {
  buildEmojiPickerBody();
  highlightEmojiRail(customEmojiPacks[0] ? ("server-" + customEmojiPacks[0].server_id) : "frequent");
});
