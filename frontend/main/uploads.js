// ==================================================================
// uploads.js - One pending file per post composer, sign + PUT to R2.
// Chat composers are later. Announcements and Forums share this.
// ==================================================================

const UPLOAD_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm";
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
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
  announce: { file: null, previewUrl: null },
  forum: { file: null, previewUrl: null }
};

function parseAttachment(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw.url ? raw : null;
  try {
    const data = JSON.parse(raw);
    return data && data.url ? data : null;
  } catch (e) {
    return null;
  }
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

function clearPostMedia(kind) {
  const slot = postMediaPending[kind];
  if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
  slot.file = null;
  slot.previewUrl = null;
  paintComposerTile(kind);
}

function setPostMediaFile(kind, file) {
  const reason = isAllowedUpload(file);
  if (reason) {
    console.error(reason);
    return;
  }
  clearPostMedia(kind);
  const slot = postMediaPending[kind];
  slot.file = file;
  slot.previewUrl = URL.createObjectURL(file);
  paintComposerTile(kind);
}

function paintComposerTile(kind) {
  const btn = document.getElementById(kind === "announce" ? "announce-composer-image-btn" : "forum-composer-image-btn");
  if (!btn) return;
  const slot = postMediaPending[kind];
  btn.replaceChildren();
  btn.classList.toggle("has-file", !!slot.file);
  btn.title = slot.file ? "Remove file" : "Add image or video";
  if (!slot.file) {
    btn.appendChild(defaultComposerTileIcon());
    return;
  }
  const mime = fileMime(slot.file);
  if (mime.startsWith("video/")) {
    const vid = document.createElement("video");
    vid.src = slot.previewUrl;
    vid.muted = true;
    vid.playsInline = true;
    btn.appendChild(vid);
  } else {
    const img = document.createElement("img");
    img.src = slot.previewUrl;
    img.alt = "";
    btn.appendChild(img);
  }
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "announce-composer-image-clear";
  clearBtn.title = "Remove file";
  clearBtn.textContent = "\u00d7";
  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearPostMedia(kind);
  });
  btn.appendChild(clearBtn);
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

function bindComposerMedia(kind, buttonId) {
  const btn = document.getElementById(buttonId);
  const input = document.createElement("input");
  input.type = "file";
  input.accept = UPLOAD_ACCEPT;
  input.hidden = true;
  btn.insertAdjacentElement("afterend", input);
  btn.disabled = false;
  btn.title = "Add image or video";
  btn.addEventListener("click", () => {
    if (postMediaPending[kind].file) return;
    input.value = "";
    input.click();
  });
  input.addEventListener("change", () => {
    if (input.files && input.files[0]) setPostMediaFile(kind, input.files[0]);
  });
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
    const detail = await signed.text();
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

function buildPostMedia(attachment, extraClass) {
  const data = parseAttachment(attachment) || attachment;
  if (!data || !data.url) return null;
  const wrap = document.createElement("div");
  wrap.className = extraClass ? `post-media ${extraClass}` : "post-media";
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
  return wrap;
}

function buildForumThumb(attachment) {
  const data = parseAttachment(attachment) || attachment;
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

bindComposerMedia("announce", "announce-composer-image-btn");
bindComposerMedia("forum", "forum-composer-image-btn");
