// ==================================================================
// server-emojis.js - Server Settings → Emojis (Guilded-like list).
// Upload / rename / delete custom server emoji. Picker + chat render
// are a later pass.
// ==================================================================

const SERVER_EMOJI_SLOT_CAP = 100;
const SERVER_EMOJI_MAX_BYTES = 256 * 1024;
const SERVER_EMOJI_NAME_RE = /^[a-zA-Z0-9_]{2,32}$/;

let serverEmojisList = [];
let serverEmojisLoadedFor = null;
let serverEmojisQuery = "";
let serverEmojisBusy = false;
let serverEmojisSlotCap = SERVER_EMOJI_SLOT_CAP;

function canOpenServerEmojis() {
  return typeof canServerPerm === "function" && canServerPerm("manage_emoji");
}

function serverEmojisPageOpen() {
  const page = document.getElementById("server-settings-emojis");
  return !!(typeof isServerSettingsOpen !== "undefined" && isServerSettingsOpen && page && !page.hidden);
}

function setServerEmojisStatus(text) {
  const status = document.getElementById("server-emojis-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function setServerEmojisBusy(busy) {
  serverEmojisBusy = !!busy;
  const upload = document.getElementById("server-emojis-upload");
  if (upload) upload.disabled = !!busy || !canOpenServerEmojis();
}

function formatEmojiStamp(ts) {
  if (!ts) return "—";
  const date = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(ts) : new Date(ts);
  if (!date || Number.isNaN(date.getTime())) return "—";
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = typeof formatClockTime === "function"
    ? formatClockTime(date)
    : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return day + " at " + time;
}

function nameFromEmojiFile(filename) {
  let base = String(filename || "").split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot > 0) base = base.slice(0, dot);
  base = base.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (base.length < 2) base = "emoji";
  if (base.length > 32) base = base.slice(0, 32).replace(/_+$/g, "") || "emoji";
  if (!SERVER_EMOJI_NAME_RE.test(base)) base = "emoji";
  return base;
}

function rejectServerEmojiFile(file) {
  const mime = typeof fileMime === "function" ? fileMime(file) : (file && file.type) || "";
  if (!mime || (typeof MEDIA_MIME !== "undefined" && MEDIA_MIME[mime] !== "image")) {
    return "Only jpeg, png, gif, or webp.";
  }
  if (file.size > SERVER_EMOJI_MAX_BYTES) return "Emoji file is over 256 KB.";
  return "";
}

async function uploadServerEmojiFile(file) {
  const reason = rejectServerEmojiFile(file);
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
        purpose: "emoji"
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

function filteredServerEmojis() {
  const needle = serverEmojisQuery.trim().toLowerCase();
  if (!needle) return serverEmojisList.slice();
  return serverEmojisList.filter((row) => {
    const name = String(row.name || "").toLowerCase();
    const uploader = row.uploader || {};
    const who = String(uploader.display_name || uploader.username || "").toLowerCase();
    return name.indexOf(needle) >= 0 || who.indexOf(needle) >= 0;
  });
}

function paintServerEmojisCount() {
  const el = document.getElementById("server-emojis-count");
  if (!el) return;
  const n = serverEmojisList.length;
  const cap = serverEmojisSlotCap || SERVER_EMOJI_SLOT_CAP;
  el.textContent = n + " / " + cap + " emojis";
}

function paintServerEmojisTable() {
  const body = document.getElementById("server-emojis-body");
  const empty = document.getElementById("server-emojis-empty");
  if (!body) return;
  body.innerHTML = "";
  const rows = filteredServerEmojis();
  if (empty) empty.hidden = rows.length > 0 || !!serverEmojisQuery.trim();
  paintServerEmojisCount();

  rows.forEach((emoji) => {
    const tr = document.createElement("tr");
    tr.className = "server-emojis-row";
    tr.dataset.emojiId = String(emoji.id);

    const nameTd = document.createElement("td");
    nameTd.className = "server-emojis-col-name";
    const nameWrap = document.createElement("div");
    nameWrap.className = "server-emojis-name-wrap";
    const preview = document.createElement("img");
    preview.className = "server-emojis-preview";
    preview.alt = "";
    preview.src = emoji.image_url || "";
    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "server-emojis-name-btn";
    nameBtn.textContent = ":" + emoji.name + ":";
    nameBtn.title = "Rename";
    nameBtn.addEventListener("click", () => beginRenameServerEmoji(emoji, nameBtn));
    nameWrap.appendChild(preview);
    nameWrap.appendChild(nameBtn);
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
    const uploader = emoji.uploader || {};
    who.textContent = uploader.display_name || uploader.username || "Unknown";
    by.appendChild(who);
    byTd.appendChild(by);
    tr.appendChild(byTd);

    const atTd = document.createElement("td");
    atTd.className = "server-emojis-col-at";
    atTd.textContent = formatEmojiStamp(emoji.created_at);
    tr.appendChild(atTd);

    const actTd = document.createElement("td");
    actTd.className = "server-emojis-col-actions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost-btn server-emojis-delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteServerEmoji(emoji));
    actTd.appendChild(del);
    tr.appendChild(actTd);

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

async function loadServerEmojisPage(force) {
  if (!currentServerId || !canOpenServerEmojis()) return;
  const upload = document.getElementById("server-emojis-upload");
  if (upload) {
    upload.disabled = serverEmojisBusy;
    upload.title = "";
  }
  if (!force && serverEmojisLoadedFor === currentServerId) {
    paintServerEmojisTable();
    return;
  }
  setServerEmojisStatus("");
  setServerEmojisBusy(true);
  try {
    const response = await fetch(
      `https://${serverAddress}/server_settings_emojis/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load emojis.");
    serverEmojisList = data.emojis || [];
    serverEmojisSlotCap = data.slot_cap || SERVER_EMOJI_SLOT_CAP;
    serverEmojisLoadedFor = currentServerId;
    serverEmojisList.forEach((row) => {
      const uploader = row.uploader;
      if (uploader && typeof rememberIdentityFace === "function") {
        rememberIdentityFace(uploader.id, uploader.avatar);
      }
    });
    paintServerEmojisTable();
  } catch (e) {
    setServerEmojisStatus(e.message || "Could not load emojis.");
    serverEmojisList = [];
    paintServerEmojisTable();
  } finally {
    setServerEmojisBusy(false);
  }
}

async function createServerEmojiFromFile(file) {
  if (!currentServerId || !canOpenServerEmojis() || serverEmojisBusy) return;
  if (serverEmojisList.length >= (serverEmojisSlotCap || SERVER_EMOJI_SLOT_CAP)) {
    setServerEmojisStatus("This server already has " + (serverEmojisSlotCap || SERVER_EMOJI_SLOT_CAP) + " emojis.");
    return;
  }
  setServerEmojisStatus("");
  setServerEmojisBusy(true);
  try {
    const att = await uploadServerEmojiFile(file);
    const response = await fetch(`https://${serverAddress}/create_server_emoji`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        name: nameFromEmojiFile(file.name),
        image_key: att.key,
        filename: file.name || ""
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not create emoji.");
    if (data.emoji) {
      serverEmojisList.unshift(data.emoji);
      const uploader = data.emoji.uploader;
      if (uploader && typeof rememberIdentityFace === "function") {
        rememberIdentityFace(uploader.id, uploader.avatar);
      }
      if (typeof refreshEmojiPickerPacks === "function") refreshEmojiPickerPacks();
    }
    if (data.slot_cap) serverEmojisSlotCap = data.slot_cap;
    paintServerEmojisTable();
  } catch (e) {
    setServerEmojisStatus(e.message || "Could not upload emoji.");
  } finally {
    setServerEmojisBusy(false);
  }
}

function beginRenameServerEmoji(emoji, btn) {
  if (!canOpenServerEmojis() || serverEmojisBusy || !btn) return;
  const next = window.prompt("Emoji name", emoji.name || "");
  if (next == null) return;
  const cleaned = String(next).replace(/^:|:$/g, "").trim();
  if (!SERVER_EMOJI_NAME_RE.test(cleaned)) {
    setServerEmojisStatus("Names must be 2–32 characters: letters, numbers, and underscores only.");
    return;
  }
  if (cleaned === emoji.name) return;
  renameServerEmoji(emoji, cleaned);
}

async function renameServerEmoji(emoji, name) {
  if (!currentServerId || !canOpenServerEmojis() || serverEmojisBusy) return;
  setServerEmojisStatus("");
  setServerEmojisBusy(true);
  try {
    const response = await fetch(`https://${serverAddress}/rename_server_emoji`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        emoji_id: emoji.id,
        name: name
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not rename emoji.");
    if (data.emoji) {
      const idx = serverEmojisList.findIndex((row) => row.id === emoji.id);
      if (idx >= 0) serverEmojisList[idx] = data.emoji;
    }
    paintServerEmojisTable();
  } catch (e) {
    setServerEmojisStatus(e.message || "Could not rename emoji.");
  } finally {
    setServerEmojisBusy(false);
  }
}

async function deleteServerEmoji(emoji) {
  if (!currentServerId || !canOpenServerEmojis() || serverEmojisBusy) return;
  if (!window.confirm("Delete :" + emoji.name + ":?")) return;
  setServerEmojisStatus("");
  setServerEmojisBusy(true);
  try {
    const response = await fetch(`https://${serverAddress}/delete_server_emoji`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        emoji_id: emoji.id
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not delete emoji.");
    serverEmojisList = serverEmojisList.filter((row) => row.id !== emoji.id);
    paintServerEmojisTable();
    if (typeof refreshEmojiPickerPacks === "function") refreshEmojiPickerPacks();
  } catch (e) {
    setServerEmojisStatus(e.message || "Could not delete emoji.");
  } finally {
    setServerEmojisBusy(false);
  }
}

(function bindServerEmojisChrome() {
  const upload = document.getElementById("server-emojis-upload");
  const file = document.getElementById("server-emojis-file");
  const search = document.getElementById("server-emojis-search");
  if (upload && file) {
    upload.addEventListener("click", () => {
      if (!canOpenServerEmojis() || serverEmojisBusy) return;
      file.value = "";
      file.click();
    });
    file.addEventListener("change", () => {
      const picked = file.files && file.files[0];
      if (picked) createServerEmojiFromFile(picked);
      file.value = "";
    });
  }
  if (search) {
    search.addEventListener("input", () => {
      serverEmojisQuery = search.value || "";
      paintServerEmojisTable();
    });
  }
})();
