// ==================================================================
// uploads.js - Composer media dock for announcement / forum posts.
// Tiles stay a fixed square. Hover reveals the add slot. Chat later.
// ==================================================================

const UPLOAD_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm";
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const UPLOAD_MAX_FILES = 4;
const UPLOAD_EXT_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm"
};

const postMediaPending = {
  announce: { files: [], previewUrls: [] },
  forum: { files: [], previewUrls: [] }
};

function parseAttachments(raw) {
  if (!raw) return [];
  let data = raw;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch (e) { return []; }
  }
  const list = Array.isArray(data) ? data : [data];
  return list.filter(item => item && item.url);
}

function parseAttachment(raw) {
  return parseAttachments(raw)[0] || null;
}

function fileMime(file) {
  let typed = (file.type || "").toLowerCase();
  if (typed === "image/jpg") typed = "image/jpeg";
  if (["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"].indexOf(typed) !== -1) {
    return typed;
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return UPLOAD_EXT_MIME[ext] || "";
}

function isAllowedUpload(file) {
  const mime = fileMime(file);
  if (!mime) return "Use jpeg, png, gif, webp, mp4, or webm";
  if (file.size < 1 || file.size > UPLOAD_MAX_BYTES) return "File must be 20 MB or smaller";
  return "";
}

function pendingFiles(kind) {
  return postMediaPending[kind].files;
}

function clearPostMedia(kind) {
  const slot = postMediaPending[kind];
  slot.previewUrls.forEach(url => URL.revokeObjectURL(url));
  slot.files = [];
  slot.previewUrls = [];
  paintComposerDock(kind);
}

function addPostMediaFiles(kind, fileList) {
  const slot = postMediaPending[kind];
  const incoming = Array.from(fileList || []);
  for (let i = 0; i < incoming.length; i++) {
    if (slot.files.length >= UPLOAD_MAX_FILES) break;
    const file = incoming[i];
    const reason = isAllowedUpload(file);
    if (reason) {
      console.error(reason);
      continue;
    }
    slot.files.push(file);
    slot.previewUrls.push(URL.createObjectURL(file));
  }
  paintComposerDock(kind);
}

function removePostMediaAt(kind, index) {
  const slot = postMediaPending[kind];
  if (!slot.files[index]) return;
  URL.revokeObjectURL(slot.previewUrls[index]);
  slot.files.splice(index, 1);
  slot.previewUrls.splice(index, 1);
  paintComposerDock(kind);
}

function defaultComposerTileIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "22");
  svg.setAttribute("height", "22");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<rect x="3" y="6" width="14" height="12" rx="2"></rect><circle cx="8" cy="11" r="1.2" fill="currentColor" stroke="none"></circle><path d="M17 14l-3.5-3.5L7 17"></path><path d="M17 4v6M14 7h6"></path>';
  return svg;
}

function fillTilePreview(tile, file, previewUrl) {
  const mime = fileMime(file);
  if (mime.startsWith("video/")) {
    const vid = document.createElement("video");
    vid.src = previewUrl;
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "metadata";
    tile.appendChild(vid);
  } else {
    const img = document.createElement("img");
    img.src = previewUrl;
    img.alt = "";
    tile.appendChild(img);
  }
}

function paintComposerDock(kind) {
  const dock = document.getElementById(kind === "announce" ? "announce-composer-media" : "forum-composer-media");
  if (!dock) return;
  const slot = postMediaPending[kind];
  const input = dock.querySelector("input[type=file]");
  dock.replaceChildren();
  dock.classList.toggle("is-empty", slot.files.length === 0);
  dock.classList.toggle("is-full", slot.files.length >= UPLOAD_MAX_FILES);

  slot.files.forEach((file, index) => {
    const tile = document.createElement("div");
    tile.className = "announce-composer-tile has-file";
    fillTilePreview(tile, file, slot.previewUrls[index]);
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "announce-composer-image-clear";
    clearBtn.title = "Remove file";
    clearBtn.textContent = "\u00d7";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePostMediaAt(kind, index);
    });
    tile.appendChild(clearBtn);
    dock.appendChild(tile);
  });

  if (slot.files.length < UPLOAD_MAX_FILES) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "announce-composer-tile announce-composer-add";
    add.title = "Add image or video";
    add.appendChild(defaultComposerTileIcon());
    add.addEventListener("click", () => {
      const picker = dock.querySelector("input[type=file]");
      if (!picker) return;
      picker.value = "";
      picker.click();
    });
    dock.appendChild(add);
  }

  if (input) dock.appendChild(input);
  else dock.appendChild(makeComposerFileInput(kind));
}

function makeComposerFileInput(kind) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = UPLOAD_ACCEPT;
  input.multiple = true;
  input.hidden = true;
  input.addEventListener("change", () => {
    if (input.files && input.files.length) addPostMediaFiles(kind, input.files);
  });
  return input;
}

function bindComposerMedia(kind, dockId) {
  const dock = document.getElementById(dockId);
  if (!dock) return;
  dock.appendChild(makeComposerFileInput(kind));
  paintComposerDock(kind);
}

async function uploadPendingFile(file) {
  const mime = fileMime(file);
  const reason = isAllowedUpload(file);
  if (reason) throw new Error(reason);
  const signed = await fetch(`https://${serverAddress}/upload_url`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime, size: file.size, name: file.name || "" })
  });
  if (!signed.ok) {
    let detail = await signed.text();
    try { detail = JSON.parse(detail).detail || detail; } catch (e) { /* keep text */ }
    throw new Error(detail || `Could not start upload (${signed.status})`);
  }
  const ticket = await signed.json();
  const put = await fetch(ticket.upload_url, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: file
  });
  if (!put.ok) throw new Error("Upload to storage failed");
  return { key: ticket.key, mime, size: file.size, name: file.name || "" };
}

async function uploadPendingFiles(kind) {
  const files = pendingFiles(kind);
  if (!files.length) return null;
  const uploaded = [];
  for (let i = 0; i < files.length; i++) {
    uploaded.push(await uploadPendingFile(files[i]));
  }
  return uploaded.length === 1 ? uploaded[0] : uploaded;
}

function buildPostMedia(attachment, extraClass) {
  const items = parseAttachments(attachment);
  if (!items.length) return null;
  const wrap = document.createElement("div");
  wrap.className = extraClass ? `post-media ${extraClass}` : "post-media";
  items.forEach(data => {
    const mime = (data.mime || "").toLowerCase();
    if (mime.startsWith("video/")) {
      const vid = document.createElement("video");
      vid.src = data.url;
      vid.controls = true;
      vid.preload = "metadata";
      wrap.appendChild(vid);
    } else {
      const img = document.createElement("img");
      img.src = data.url;
      img.alt = data.name || "";
      wrap.appendChild(img);
    }
  });
  return wrap;
}

function buildForumThumb(attachment) {
  const data = parseAttachment(attachment);
  if (!data || !data.url) return null;
  const thumb = document.createElement("div");
  thumb.className = "forum-post-thumb";
  const mime = (data.mime || "").toLowerCase();
  if (mime.startsWith("video/")) {
    const vid = document.createElement("video");
    vid.src = data.url;
    vid.muted = true;
    vid.preload = "metadata";
    thumb.appendChild(vid);
  } else {
    const img = document.createElement("img");
    img.src = data.url;
    img.alt = "";
    thumb.appendChild(img);
  }
  return thumb;
}

bindComposerMedia("announce", "announce-composer-media");
bindComposerMedia("forum", "forum-composer-media");
