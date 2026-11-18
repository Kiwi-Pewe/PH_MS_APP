const STICKER_TOKEN_RE = /<s:([a-zA-Z0-9_]{2,32}):(\d+)>/g;

let customStickerPacks = [];
let customStickerById = {};
let customStickerPacksLoadedAt = 0;
let customStickerPacksPromise = null;

function stickerToken(item) {
  return "<s:" + item.name + ":" + item.id + ">";
}

function rememberSticker(row) {
  if (!row || row.id == null) return;
  customStickerById[String(row.id)] = {
    id: row.id,
    name: row.name,
    image_url: row.image_url || "",
    server_id: row.server_id || ""
  };
}

function lookupSticker(id) {
  return customStickerById[String(id)] || null;
}

function bindStickerImg(img, url) {
  if (!img || !url) return;
  if (typeof bindAnimatedSticker === "function") bindAnimatedSticker(img, url);
  else if (typeof bindAnimatedEmoji === "function") bindAnimatedEmoji(img, url);
  else img.src = url;
}

function refreshStickerInMessages(row) {
  if (!row || row.id == null) return;
  rememberSticker(row);
  const label = ":" + (row.name || "sticker") + ":";
  document.querySelectorAll('.msg-sticker[data-sticker-id="' + row.id + '"]').forEach((wrap) => {
    wrap.title = label;
    let img = wrap.querySelector("img");
    if (!img) {
      wrap.textContent = "";
      img = document.createElement("img");
      img.className = "msg-sticker-img";
      img.draggable = false;
      wrap.appendChild(img);
    }
    img.alt = label;
    if (row.image_url) bindStickerImg(img, row.image_url);
  });
}

async function ensureSticker(id) {
  const cached = lookupSticker(id);
  if (cached && cached.image_url) return cached;
  try {
    const response = await fetch(
      "https://" + serverAddress + "/server_sticker/" + encodeURIComponent(id),
      { credentials: "include" }
    );
    if (!response.ok) return cached;
    const data = await response.json().catch(() => null);
    if (data && data.id != null) {
      rememberSticker(data);
      return lookupSticker(data.id);
    }
  } catch (e) {}
  return cached;
}

async function loadCustomStickerPacks(force) {
  const fresh = Date.now() - customStickerPacksLoadedAt < 30000;
  if (!force && fresh && customStickerPacksLoadedAt) return customStickerPacks;
  if (customStickerPacksPromise) return customStickerPacksPromise;
  customStickerPacksPromise = (async () => {
    try {
      const response = await fetch("https://" + serverAddress + "/my_sticker_packs", { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not load sticker packs.");
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
      customStickerPacks = packs;
      packs.forEach((pack) => {
        (pack.stickers || []).forEach(rememberSticker);
      });
      customStickerPacksLoadedAt = Date.now();
    } catch (e) {
      if (!customStickerPacksLoadedAt) customStickerPacks = [];
    } finally {
      customStickerPacksPromise = null;
    }
    return customStickerPacks;
  })();
  return customStickerPacksPromise;
}

function appendStickerNode(el, name, id) {
  const wrap = document.createElement("span");
  wrap.className = "msg-sticker";
  wrap.dataset.stickerId = String(id);
  const cached = lookupSticker(id);
  wrap.title = ":" + ((cached && cached.name) || name) + ":";
  if (cached && cached.image_url) {
    const img = document.createElement("img");
    img.className = "msg-sticker-img";
    img.alt = ":" + (cached.name || name) + ":";
    img.draggable = false;
    bindStickerImg(img, cached.image_url);
    wrap.appendChild(img);
  } else {
    wrap.textContent = ":" + name + ":";
    ensureSticker(id).then((row) => {
      if (!row || !row.image_url || !wrap.isConnected) return;
      wrap.textContent = "";
      const img = document.createElement("img");
      img.className = "msg-sticker-img";
      img.alt = ":" + (row.name || name) + ":";
      img.draggable = false;
      bindStickerImg(img, row.image_url);
      wrap.appendChild(img);
    });
  }
  el.appendChild(wrap);
}

function pickSticker(item) {
  if (emojiReactionTarget) return;
  if (!emojiPickerTarget || emojiPickerTarget.disabled) return;
  if (emojiPickerTarget.dataset.emojiReplace === "1") return;
  const el = emojiPickerTarget;
  const insert = stickerToken(item);
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = el.value.slice(0, start) + insert + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + insert.length;
  el.focus();
  el.dispatchEvent(new Event("input"));
}

function buildStickerGrid(items) {
  const grid = document.createElement("div");
  grid.className = "emoji-grid is-stickers";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-cell is-sticker";
    btn.dataset.name = item.name;
    btn.dataset.stickerId = String(item.id);
    const img = document.createElement("img");
    img.className = "emoji-cell-img";
    img.alt = ":" + item.name + ":";
    img.draggable = false;
    bindStickerImg(img, item.image_url);
    btn.appendChild(img);
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("mouseenter", () => {
      const foot = document.getElementById("emoji-picker-footer");
      if (foot) foot.textContent = ":" + item.name + ":";
    });
    btn.addEventListener("mouseleave", () => {
      const foot = document.getElementById("emoji-picker-footer");
      if (foot) foot.textContent = "";
    });
    btn.addEventListener("click", () => pickSticker(item));
    grid.appendChild(btn);
  });
  return grid;
}

function buildStickerPickerBody() {
  const rail = document.getElementById("emoji-cat-rail");
  const catalog = document.getElementById("emoji-picker-catalog");
  const results = document.getElementById("emoji-search-results");
  if (!rail || !catalog) return;
  rail.innerHTML = "";
  catalog.innerHTML = "";
  if (results) {
    results.style.display = "none";
    results.innerHTML = "";
  }

  if (!customStickerPacks.length) {
    const empty = document.createElement("div");
    empty.className = "emoji-section-empty";
    empty.textContent = "No stickers from your servers yet.";
    catalog.appendChild(empty);
    return;
  }

  customStickerPacks.forEach((pack) => {
    const catId = "sticker-" + pack.server_id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-rail-btn emoji-rail-server";
    btn.dataset.cat = catId;
    btn.title = pack.server_name || "Server";
    if (typeof paintServerRailBtn === "function") paintServerRailBtn(btn, pack);
    btn.addEventListener("click", () => {
      if (typeof jumpEmojiCategory === "function") jumpEmojiCategory(catId);
    });
    rail.appendChild(btn);

    const sec = document.createElement("div");
    sec.className = "emoji-section";
    sec.dataset.cat = catId;
    const title = document.createElement("div");
    title.className = "emoji-section-title";
    title.textContent = pack.server_name || "Server";
    sec.appendChild(title);
    const items = (pack.stickers || []).map((row) => ({
      id: row.id,
      name: row.name,
      image_url: row.image_url,
      server_id: pack.server_id
    }));
    if (items.length) sec.appendChild(buildStickerGrid(items));
    catalog.appendChild(sec);
  });

  const first = customStickerPacks[0];
  if (first && typeof highlightEmojiRail === "function") highlightEmojiRail("sticker-" + first.server_id);
}

function filterStickerPicker(query) {
  const q = (query || "").toLowerCase().replace(/:/g, "").trim();
  const results = document.getElementById("emoji-search-results");
  const catalog = document.getElementById("emoji-picker-catalog");
  if (!results || !catalog) return;
  if (!q) {
    results.style.display = "none";
    results.innerHTML = "";
    catalog.style.display = "";
    return;
  }
  const hits = [];
  customStickerPacks.forEach((pack) => {
    (pack.stickers || []).forEach((row) => {
      if (String(row.name || "").toLowerCase().indexOf(q) >= 0) {
        hits.push({
          id: row.id,
          name: row.name,
          image_url: row.image_url,
          server_id: pack.server_id
        });
      }
    });
  });
  catalog.style.display = "none";
  results.style.display = "";
  results.innerHTML = "";
  if (!hits.length) {
    const empty = document.createElement("div");
    empty.className = "emoji-section-empty";
    empty.textContent = "No stickers matched that search.";
    results.appendChild(empty);
    return;
  }
  results.appendChild(buildStickerGrid(hits));
}

async function openStickerPane() {
  const search = document.getElementById("emoji-picker-search");
  if (search) search.placeholder = "Find the perfect sticker";
  await loadCustomStickerPacks(false);
  if (typeof emojiPickerTab !== "undefined" && emojiPickerTab !== "stickers") return;
  buildStickerPickerBody();
  filterStickerPicker(search ? search.value : "");
}

async function refreshStickerPickerPacks() {
  await loadCustomStickerPacks(true);
  if (typeof emojiPickerTab !== "undefined" && emojiPickerTab === "stickers") {
    buildStickerPickerBody();
    const search = document.getElementById("emoji-picker-search");
    filterStickerPicker(search ? search.value : "");
  }
}

loadCustomStickerPacks(false);
