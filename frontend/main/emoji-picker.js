// ==================================================================
// emoji-picker.js - Composer emoji panel (unicode). GIF/sticker/add/favorites are placeholders.
// ==================================================================

const EMOJI_CHARS_DESC = Array.from(new Set(
  EMOJI_PACK.categories.flatMap(c => c.items.map(i => i.ch))
)).sort((a, b) => b.length - a.length);

function isEmojiOnlyContent(text) {
  let rest = (text || "").trim();
  if (!rest) return false;
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

let emojiPickerTarget = null;
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
  return Object.keys(freq)
    .filter(n => EMOJI_PACK.byName[n])
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, 32)
    .map(name => ({ ch: EMOJI_PACK.byName[name], name }));
}

function buildEmojiGrid(items) {
  const grid = document.createElement("div");
  grid.className = "emoji-grid";
  items.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-cell";
    btn.textContent = item.ch;
    btn.dataset.name = item.name;
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
  if (!emojiPickerTarget || emojiPickerTarget.disabled) return;
  const el = emojiPickerTarget;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = el.value.slice(0, start) + item.ch + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + item.ch.length;
  el.focus();
  el.dispatchEvent(new Event("input"));
  recordEmojiUse(item.name);
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

function buildEmojiPickerBody() {
  const rail = document.getElementById("emoji-cat-rail");
  const catalog = document.getElementById("emoji-picker-catalog");
  rail.innerHTML = "";
  catalog.innerHTML = "";

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

  EMOJI_PACK.categories.forEach(cat => {
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
  const sec = main.querySelector(`.emoji-section[data-cat="${id}"]`);
  if (!sec) return;
  emojiScrollLock = true;
  main.scrollTop += sec.getBoundingClientRect().top - main.getBoundingClientRect().top;
  highlightEmojiRail(id);
  setTimeout(() => { emojiScrollLock = false; }, 80);
}

function highlightEmojiRail(id) {
  document.querySelectorAll("#emoji-cat-rail .emoji-rail-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cat === id);
  });
  const active = document.querySelector(`#emoji-cat-rail .emoji-rail-btn[data-cat="${id}"]`);
  if (active) active.scrollIntoView({ block: "nearest" });
}

function syncEmojiRailFromScroll() {
  if (emojiScrollLock) return;
  const main = document.getElementById("emoji-picker-main");
  const top = main.getBoundingClientRect().top;
  let current = "frequent";
  main.querySelectorAll(".emoji-section").forEach(sec => {
    if (sec.getBoundingClientRect().top - top <= 48) current = sec.dataset.cat;
  });
  highlightEmojiRail(current);
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
  EMOJI_PACK.categories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.name.indexOf(q) !== -1) hits.push(item);
    });
  });
  if (hits.length === 0) {
    results.textContent = "No emoji found.";
    return;
  }
  results.appendChild(buildEmojiGrid(hits.slice(0, 200)));
}

function openEmojiPicker(btn, input) {
  if (input.disabled) return;
  const picker = document.getElementById("emoji-picker");
  if (picker.style.display === "flex" && emojiPickerTarget === input) {
    closeEmojiPicker();
    return;
  }
  emojiPickerTarget = input;
  picker.style.display = "flex";
  const rect = btn.getBoundingClientRect();
  const height = picker.offsetHeight || 520;
  const width = picker.offsetWidth || 520;
  picker.style.left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) + "px";
  if (rect.top - 8 - height >= 8) {
    picker.style.top = (rect.top - height - 8) + "px";
  } else {
    picker.style.top = Math.min(rect.bottom + 8, window.innerHeight - height - 8) + "px";
  }
  document.getElementById("emoji-picker-search").value = "";
  document.getElementById("emoji-picker-footer").textContent = "";
  emojiSearchSaved = "";
  emojiHovering = false;
  filterEmojiPicker("");
  highlightEmojiRail("frequent");
}

function closeEmojiPicker() {
  document.getElementById("emoji-picker").style.display = "none";
  emojiPickerTarget = null;
  clearEmojiPreview();
  emojiSearchSaved = "";
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
