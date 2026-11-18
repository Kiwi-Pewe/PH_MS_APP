const SERVER_STICKER_SLOT_CAP = 50;
const SERVER_STICKER_MAX_BYTES = 512 * 1024;
const SERVER_STICKER_NAME_RE = /^[a-zA-Z0-9_]{2,32}$/;

let serverStickersList = [];
let serverStickersLoadedFor = null;
let serverStickersQuery = "";
let serverStickersBusy = false;
let serverStickersSlotCap = SERVER_STICKER_SLOT_CAP;
let stickerEditDraft = null;

function canOpenServerStickers() {
  return typeof canServerPerm === "function" && canServerPerm("manage_emoji");
}

function setServerStickersStatus(text) {
  const status = document.getElementById("server-stickers-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function setServerStickersBusy(busy) {
  serverStickersBusy = !!busy;
  const upload = document.getElementById("server-stickers-upload");
  if (upload) upload.disabled = !!busy || !canOpenServerStickers();
}

function nameFromStickerFile(filename) {
  let base = String(filename || "").split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot > 0) base = base.slice(0, dot);
  base = base.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (base.length < 2) base = "sticker";
  if (base.length > 32) base = base.slice(0, 32).replace(/_+$/g, "") || "sticker";
  if (!SERVER_STICKER_NAME_RE.test(base)) base = "sticker";
  return base;
}

function rejectServerStickerFile(file) {
  const mime = typeof fileMime === "function" ? fileMime(file) : (file && file.type) || "";
  if (!mime || (typeof MEDIA_MIME !== "undefined" && MEDIA_MIME[mime] !== "image")) {
    return "Only jpeg, png, gif, or webp.";
  }
  if (file.size > SERVER_STICKER_MAX_BYTES) return "Sticker file is over 512 KB.";
  return "";
}

async function uploadServerStickerFile(file) {
  const reason = rejectServerStickerFile(file);
  if (reason) throw new Error(reason);
  const mime = typeof fileMime === "function" ? fileMime(file) : file.type;
  let intentRes;
  try {
    intentRes = await fetch(`https://${serverAddress}/upload_intent`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: mime,
        size: file.size,
        filename: file.name || "",
        purpose: "sticker"
      })
    });
  } catch (e) {
    throw new Error("Could not reach the API to start the upload. Is uvicorn running?");
  }
  const intent = await intentRes.json().catch(() => ({}));
  if (!intentRes.ok) throw new Error(intent.detail || "Could not start upload.");
  let putRes;
  try {
    putRes = await fetch(intent.upload_url, {
      method: "PUT",
      headers: { "Content-Type": intent.mime },
      body: file
    });
  } catch (e) {
    throw new Error("R2 blocked the browser upload. Re-save the bucket CORS policy.");
  }
  if (!putRes.ok) throw new Error("R2 rejected the file (HTTP " + putRes.status + ").");
  return {
    key: intent.key,
    mime: intent.mime,
    size: file.size,
    name: file.name || "",
    url: intent.public_url
  };
}

function filteredServerStickers() {
  const needle = serverStickersQuery.trim().toLowerCase();
  if (!needle) return serverStickersList.slice();
  return serverStickersList.filter((row) => {
    const name = String(row.name || "").toLowerCase();
    const uploader = row.uploader || {};
    const who = String(uploader.display_name || uploader.username || "").toLowerCase();
    return name.indexOf(needle) >= 0 || who.indexOf(needle) >= 0;
  });
}

function paintServerStickersCount() {
  const el = document.getElementById("server-stickers-count");
  if (!el) return;
  const n = serverStickersList.length;
  const cap = serverStickersSlotCap || SERVER_STICKER_SLOT_CAP;
  el.textContent = n + " / " + cap + " stickers";
}

function paintServerStickersTable() {
  const body = document.getElementById("server-stickers-body");
  const empty = document.getElementById("server-stickers-empty");
  if (!body) return;
  body.innerHTML = "";
  const rows = filteredServerStickers();
  if (empty) empty.hidden = rows.length > 0 || !!serverStickersQuery.trim();
  paintServerStickersCount();

  rows.forEach((sticker) => {
    const tr = document.createElement("tr");
    tr.className = "server-emojis-row";
    tr.dataset.stickerId = String(sticker.id);

    const nameTd = document.createElement("td");
    nameTd.className = "server-emojis-col-name";
    const nameWrap = document.createElement("div");
    nameWrap.className = "server-emojis-name-wrap";
    const preview = document.createElement("img");
    preview.className = "server-emojis-preview is-sticker";
    preview.alt = "";
    if (sticker.image_url) {
      if (typeof bindAnimatedSticker === "function") bindAnimatedSticker(preview, sticker.image_url);
      else if (typeof bindAnimatedEmoji === "function") bindAnimatedEmoji(preview, sticker.image_url);
      else preview.src = sticker.image_url;
    }
    const nameEl = document.createElement("span");
    nameEl.className = "server-emojis-name";
    nameEl.textContent = ":" + sticker.name + ":";
    nameWrap.appendChild(preview);
    nameWrap.appendChild(nameEl);
    nameTd.appendChild(nameWrap);
    tr.appendChild(nameTd);

    const byTd = document.createElement("td");
    byTd.className = "server-emojis-col-by";
    const by = document.createElement("div");
    by.className = "server-emojis-uploader";
    const face = document.createElement("div");
    face.className = "avatar-dot server-emojis-avatar";
    by.appendChild(face);
    const who = document.createElement("span");
    who.className = "server-emojis-uploader-name";
    const uploader = sticker.uploader || {};
    who.textContent = uploader.display_name || uploader.username || "Unknown";
    by.appendChild(who);
    byTd.appendChild(by);
    tr.appendChild(byTd);

    const atTd = document.createElement("td");
    atTd.className = "server-emojis-col-at";
    atTd.textContent = typeof formatEmojiStamp === "function" ? formatEmojiStamp(sticker.created_at) : (sticker.created_at || "—");
    tr.appendChild(atTd);
    tr.addEventListener("click", () => openStickerEdit(sticker));

    body.appendChild(tr);
    if (typeof paintUserFace === "function" && uploader.id) {
      paintUserFace(face, uploader, { name: uploader.username, userId: uploader.id });
    } else if (typeof rememberIdentityFace === "function" && uploader.id) {
      rememberIdentityFace(uploader.id, uploader.avatar);
      if (typeof paintUserFace === "function") {
        paintUserFace(face, uploader, { name: uploader.username, userId: uploader.id });
      }
    }
  });
}

async function loadServerStickersPage(force) {
  if (!currentServerId || !canOpenServerStickers()) return;
  const upload = document.getElementById("server-stickers-upload");
  if (upload) {
    upload.disabled = serverStickersBusy;
    upload.title = "";
  }
  if (!force && serverStickersLoadedFor === currentServerId) {
    paintServerStickersTable();
    return;
  }
  setServerStickersStatus("");
  setServerStickersBusy(true);
  try {
    const response = await fetch(
      `https://${serverAddress}/server_settings_stickers/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load stickers.");
    serverStickersList = data.stickers || [];
    serverStickersSlotCap = data.slot_cap || SERVER_STICKER_SLOT_CAP;
    serverStickersLoadedFor = currentServerId;
    serverStickersList.forEach((row) => {
      const uploader = row.uploader;
      if (uploader && typeof rememberIdentityFace === "function") {
        rememberIdentityFace(uploader.id, uploader.avatar);
      }
    });
    paintServerStickersTable();
  } catch (e) {
    setServerStickersStatus(e.message || "Could not load stickers.");
    serverStickersList = [];
    paintServerStickersTable();
  } finally {
    setServerStickersBusy(false);
  }
}

async function createServerStickerFromFile(file) {
  if (!currentServerId || !canOpenServerStickers() || serverStickersBusy) return;
  if (serverStickersList.length >= (serverStickersSlotCap || SERVER_STICKER_SLOT_CAP)) {
    setServerStickersStatus("This server already has " + (serverStickersSlotCap || SERVER_STICKER_SLOT_CAP) + " stickers.");
    return;
  }
  setServerStickersStatus("");
  setServerStickersBusy(true);
  try {
    const att = await uploadServerStickerFile(file);
    const response = await fetch(`https://${serverAddress}/create_server_sticker`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        name: nameFromStickerFile(file.name),
        image_key: att.key,
        filename: file.name || ""
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not create sticker.");
    if (data.sticker) {
      serverStickersList.unshift(data.sticker);
      const uploader = data.sticker.uploader;
      if (uploader && typeof rememberIdentityFace === "function") {
        rememberIdentityFace(uploader.id, uploader.avatar);
      }
      if (typeof refreshStickerPickerPacks === "function") refreshStickerPickerPacks();
    }
    if (data.slot_cap) serverStickersSlotCap = data.slot_cap;
    paintServerStickersTable();
  } catch (e) {
    setServerStickersStatus(e.message || "Could not upload sticker.");
  } finally {
    setServerStickersBusy(false);
  }
}

function closeStickerEdit() {
  const overlay = document.getElementById("sticker-edit-overlay");
  if (overlay) overlay.style.display = "none";
  stickerEditDraft = null;
}

function setStickerEditError(text) {
  const err = document.getElementById("sticker-edit-error");
  if (!err) return;
  err.hidden = !text;
  err.textContent = text || "";
}

function openStickerEdit(sticker) {
  if (!sticker || !currentServerId || !canOpenServerStickers()) return;
  const overlay = document.getElementById("sticker-edit-overlay");
  const heading = document.getElementById("sticker-edit-heading");
  const preview = document.getElementById("sticker-edit-preview");
  const name = document.getElementById("sticker-edit-name");
  const byName = document.getElementById("sticker-edit-by-name");
  const when = document.getElementById("sticker-edit-when");
  const face = document.getElementById("sticker-edit-by-face");
  if (!overlay || !heading || !name) return;
  const uploader = sticker.uploader || {};
  stickerEditDraft = sticker;
  heading.textContent = ":" + (sticker.name || "sticker") + ":";
  if (preview) {
    preview.alt = ":" + (sticker.name || "sticker") + ":";
    if (sticker.image_url) {
      if (typeof bindAnimatedSticker === "function") bindAnimatedSticker(preview, sticker.image_url);
      else if (typeof bindAnimatedEmoji === "function") bindAnimatedEmoji(preview, sticker.image_url);
      else preview.src = sticker.image_url;
    }
  }
  name.value = sticker.name || "";
  if (byName) byName.textContent = uploader.display_name || uploader.username || "Unknown";
  if (when) when.textContent = typeof formatEmojiStamp === "function" ? formatEmojiStamp(sticker.created_at) : (sticker.created_at || "—");
  if (face) {
    face.innerHTML = "";
    if (uploader.id && typeof paintUserFace === "function") {
      paintUserFace(face, uploader, { name: uploader.username, userId: uploader.id });
    }
  }
  setStickerEditError("");
  overlay.style.display = "flex";
  name.focus();
  name.select();
}

async function saveStickerEdit() {
  if (!stickerEditDraft || serverStickersBusy) return;
  const input = document.getElementById("sticker-edit-name");
  const cleaned = String(input ? input.value : "").replace(/^:|:$/g, "").trim();
  if (!SERVER_STICKER_NAME_RE.test(cleaned)) {
    setStickerEditError("Names must be 2–32 characters: letters, numbers, and underscores only.");
    return;
  }
  if (cleaned === stickerEditDraft.name) {
    closeStickerEdit();
    return;
  }
  setStickerEditError("");
  const sticker = stickerEditDraft;
  const ok = await renameServerSticker(sticker, cleaned);
  if (ok) closeStickerEdit();
}

async function renameServerSticker(sticker, name) {
  if (!currentServerId || !canOpenServerStickers() || serverStickersBusy) return false;
  setServerStickersStatus("");
  setServerStickersBusy(true);
  try {
    const response = await fetch(`https://${serverAddress}/rename_server_sticker`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        sticker_id: sticker.id,
        name: name
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not rename sticker.");
    if (data.sticker) {
      const idx = serverStickersList.findIndex((row) => row.id === sticker.id);
      if (idx >= 0) serverStickersList[idx] = data.sticker;
      if (typeof refreshStickerInMessages === "function") refreshStickerInMessages(data.sticker);
    }
    paintServerStickersTable();
    return true;
  } catch (e) {
    setStickerEditError(e.message || "Could not rename sticker.");
    return false;
  } finally {
    setServerStickersBusy(false);
  }
}

async function deleteStickerFromEdit() {
  if (!stickerEditDraft) return;
  const ok = await deleteServerSticker(stickerEditDraft);
  if (ok) closeStickerEdit();
}

async function deleteServerSticker(sticker) {
  if (!currentServerId || !canOpenServerStickers() || serverStickersBusy || !sticker) return false;
  setServerStickersStatus("");
  setServerStickersBusy(true);
  try {
    const response = await fetch(`https://${serverAddress}/delete_server_sticker`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        sticker_id: sticker.id
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not delete sticker.");
    serverStickersList = serverStickersList.filter((row) => row.id !== sticker.id);
    paintServerStickersTable();
    if (typeof refreshStickerPickerPacks === "function") refreshStickerPickerPacks();
    return true;
  } catch (e) {
    setStickerEditError(e.message || "Could not delete sticker.");
    return false;
  } finally {
    setServerStickersBusy(false);
  }
}

(function bindServerStickersChrome() {
  const upload = document.getElementById("server-stickers-upload");
  const file = document.getElementById("server-stickers-file");
  const search = document.getElementById("server-stickers-search");
  if (upload && file) {
    upload.addEventListener("click", () => {
      if (!canOpenServerStickers() || serverStickersBusy) return;
      file.value = "";
      file.click();
    });
    file.addEventListener("change", () => {
      const picked = file.files && file.files[0];
      if (picked) createServerStickerFromFile(picked);
      file.value = "";
    });
  }
  if (search) {
    search.addEventListener("input", () => {
      serverStickersQuery = search.value || "";
      paintServerStickersTable();
    });
  }
  const cancel = document.getElementById("sticker-edit-cancel");
  const save = document.getElementById("sticker-edit-save");
  const remove = document.getElementById("sticker-edit-delete");
  const overlay = document.getElementById("sticker-edit-overlay");
  const name = document.getElementById("sticker-edit-name");
  if (cancel) cancel.addEventListener("click", closeStickerEdit);
  if (save) save.addEventListener("click", saveStickerEdit);
  if (remove) remove.addEventListener("click", deleteStickerFromEdit);
  if (name) {
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveStickerEdit();
      }
    });
  }
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target.id === "sticker-edit-overlay") closeStickerEdit();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const card = document.getElementById("sticker-edit-overlay");
    if (!card || card.style.display !== "flex") return;
    e.stopPropagation();
    closeStickerEdit();
  }, true);
})();
