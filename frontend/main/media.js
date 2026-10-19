// ==================================================================
// media.js - Image/video attach: picker, paste, preview chip, R2 upload.
// ==================================================================

const MEDIA_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm";
const MEDIA_MIME = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video"
};

function maxUploadBytes() {
  return 20 * 1024 * 1024;
}

function parseAttachment(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function pendingAttachExplicit(att) {
  if (!att) return false;
  if (att.mode === "existing") return !!(att.attachment && att.attachment.explicit);
  return !!att.explicit;
}

function setPendingAttachExplicit(att, value) {
  if (!att) return;
  if (att.mode === "existing") {
    if (!att.attachment) att.attachment = {};
    att.attachment.explicit = !!value;
    return;
  }
  att.explicit = !!value;
}

function paintChipFace(chip, src, kind, name, explicit) {
  const face = document.createElement("div");
  face.className = "attach-chip-face" + (explicit ? " is-explicit" : "");
  if (kind === "video") {
    const vid = document.createElement("video");
    vid.src = src;
    vid.muted = true;
    face.appendChild(vid);
  } else if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = name || "";
    face.appendChild(img);
  }
  if (explicit) {
    const label = document.createElement("span");
    label.className = "md-explicit-media-label";
    label.textContent = "Explicit";
    face.appendChild(label);
  }
  chip.appendChild(face);
}

function bindAttachMarkdownMenu(el, getState, onToggle) {
  el.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".attach-chip-remove, .announce-composer-image-clear")) return;
    e.preventDefault();
    e.stopPropagation();
    const state = typeof getState === "function" ? (getState() || {}) : {};
    if (typeof showAttachMarkdownContextMenu === "function") {
      showAttachMarkdownContextMenu(e, {
        name: state.name || "file",
        kind: state.kind || "image",
        marked: !!state.marked,
        image: state.image || "",
        onToggle
      });
    }
  });
}

function wrapExplicitMedia(mediaEl, att) {
  if (!att || !att.explicit) return mediaEl;
  const cover = document.createElement("div");
  cover.className = "md-explicit-media";
  const label = document.createElement("span");
  label.className = "md-explicit-media-label";
  label.textContent = "Explicit";
  cover.appendChild(mediaEl);
  cover.appendChild(label);
  const video = mediaEl.tagName === "VIDEO" ? mediaEl : null;
  const hadControls = !!(video && video.controls);
  if (video && hadControls) video.controls = false;
  cover.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const open = cover.classList.toggle("is-open");
    if (video && hadControls) video.controls = open;
  });
  return cover;
}

function fileMime(file) {
  if (file && file.type && MEDIA_MIME[file.type]) return file.type === "image/jpg" ? "image/jpeg" : file.type;
  const name = ((file && file.name) || "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  return "";
}

function rejectReason(file) {
  const name = ((file && file.name) || "").toLowerCase();
  if (name.endsWith(".mov")) return "Use mp4 or webm. iPhone .mov files are not supported yet.";
  const mime = fileMime(file);
  if (!mime) return "Only jpeg, png, gif, webp, mp4, or webm.";
  if (file.size > maxUploadBytes()) return "File is over 20 MB.";
  return "";
}

function clearPendingAttach() {
  if (pendingAttach && pendingAttach.previewUrl) URL.revokeObjectURL(pendingAttach.previewUrl);
  pendingAttach = null;
  renderAttachPreviews();
}

function setPendingFile(file) {
  if (attachDestination === "edit" && editingMessageId) {
    setEditFile(file);
    return;
  }
  if (typeof canAttachChannelMedia === "function" && !canAttachChannelMedia()) return;
  const reason = rejectReason(file);
  if (reason) {
    window.alert(reason);
    return;
  }
  clearPendingAttach();
  const mime = fileMime(file);
  pendingAttach = {
    file,
    mime,
    kind: MEDIA_MIME[mime] || "image",
    previewUrl: URL.createObjectURL(file),
    explicit: false
  };
  renderAttachPreviews();
}

function clearEditAttach() {
  if (editAttach && editAttach.mode === "new" && editAttach.previewUrl) {
    URL.revokeObjectURL(editAttach.previewUrl);
  }
  editAttach = null;
  fillEditAttachPreview(document.getElementById("edit-composer-attach-preview"));
}

function setEditFile(file) {
  if (typeof canAttachChannelMedia === "function" && !canAttachChannelMedia()) return;
  const reason = rejectReason(file);
  if (reason) {
    window.alert(reason);
    return;
  }
  if (editAttach && editAttach.mode === "new" && editAttach.previewUrl) {
    URL.revokeObjectURL(editAttach.previewUrl);
  }
  const mime = fileMime(file);
  editAttach = {
    mode: "new",
    file,
    mime,
    kind: MEDIA_MIME[mime] || "image",
    previewUrl: URL.createObjectURL(file),
    explicit: false
  };
  fillEditAttachPreview(document.getElementById("edit-composer-attach-preview"));
}

function fillEditAttachPreview(host) {
  if (!host) return;
  host.innerHTML = "";
  if (!editAttach) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const chip = document.createElement("div");
  chip.className = "attach-chip";
  const src = editAttach.mode === "existing" ? (editAttach.attachment && editAttach.attachment.url) : editAttach.previewUrl;
  const kind = editAttach.mode === "existing" ? (editAttach.attachment && editAttach.attachment.kind) : editAttach.kind;
  const name = editAttach.mode === "existing"
    ? ((editAttach.attachment && editAttach.attachment.name) || "file")
    : (editAttach.file.name || "file");
  paintChipFace(chip, src, kind, name, pendingAttachExplicit(editAttach));
  const meta = document.createElement("div");
  meta.className = "attach-chip-meta";
  const nameEl = document.createElement("div");
  nameEl.className = "attach-chip-name";
  nameEl.textContent = name;
  meta.appendChild(nameEl);
  chip.appendChild(meta);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "attach-chip-remove";
  close.textContent = "\u00d7";
  close.onclick = (e) => {
    e.stopPropagation();
    clearEditAttach();
  };
  chip.appendChild(close);
  bindAttachMarkdownMenu(chip, () => ({
    name,
    kind,
    marked: pendingAttachExplicit(editAttach),
    image: src
  }), () => {
    setPendingAttachExplicit(editAttach, !pendingAttachExplicit(editAttach));
    fillEditAttachPreview(document.getElementById("edit-composer-attach-preview"));
  });
  host.appendChild(chip);
}

async function uploadEditIfNeeded() {
  if (!editAttach) return null;
  if (editAttach.mode === "existing") {
    const att = editAttach.attachment;
    return {
      key: att.key,
      mime: att.mime,
      size: att.size,
      name: att.name || "",
      explicit: !!att.explicit
    };
  }
  let intentRes;
  try {
    intentRes = await fetch(`https://${serverAddress}/upload_intent`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: editAttach.mime,
        size: editAttach.file.size,
        filename: editAttach.file.name || ""
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
      body: editAttach.file
    });
  } catch (e) {
    throw new Error("R2 blocked the browser upload. Re-save the bucket CORS policy.");
  }
  if (!putRes.ok) throw new Error("R2 rejected the file (HTTP " + putRes.status + ").");
  return {
    key: intent.key,
    mime: intent.mime,
    size: editAttach.file.size,
    name: editAttach.file.name || "",
    url: intent.public_url,
    kind: intent.kind,
    explicit: !!editAttach.explicit
  };
}

function renderAttachPreviews() {
  fillAttachPreview(document.getElementById("composer-attach-preview"));
  fillAttachPreview(document.getElementById("channel-composer-attach-preview"));
}

function fillAttachPreview(host) {
  if (!host) return;
  host.innerHTML = "";
  if (!pendingAttach) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const chip = document.createElement("div");
  chip.className = "attach-chip";
  const nameText = pendingAttach.file.name || "file";
  paintChipFace(chip, pendingAttach.previewUrl, pendingAttach.kind, nameText, !!pendingAttach.explicit);
  const meta = document.createElement("div");
  meta.className = "attach-chip-meta";
  const name = document.createElement("div");
  name.className = "attach-chip-name";
  name.textContent = nameText;
  const size = document.createElement("div");
  size.className = "attach-chip-size";
  size.textContent = pendingAttach.busy ? "Uploading\u2026" : formatFileSize(pendingAttach.file.size);
  meta.appendChild(name);
  meta.appendChild(size);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "attach-chip-remove";
  close.title = "Remove";
  close.textContent = "\u00d7";
  close.disabled = !!pendingAttach.busy;
  close.onclick = () => { if (!pendingAttach || pendingAttach.busy) return; clearPendingAttach(); };
  chip.appendChild(meta);
  chip.appendChild(close);
  bindAttachMarkdownMenu(chip, () => ({
    name: pendingAttach.file.name || "file",
    kind: pendingAttach.kind,
    marked: !!pendingAttach.explicit,
    image: pendingAttach.previewUrl
  }), () => {
    if (!pendingAttach) return;
    pendingAttach.explicit = !pendingAttach.explicit;
    renderAttachPreviews();
  });
  host.appendChild(chip);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function uploadPendingIfNeeded() {
  if (!pendingAttach) return null;
  pendingAttach.busy = true;
  renderAttachPreviews();
  try {
    let intentRes;
    try {
      intentRes = await fetch(`https://${serverAddress}/upload_intent`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: pendingAttach.mime,
          size: pendingAttach.file.size,
          filename: pendingAttach.file.name || ""
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
        body: pendingAttach.file
      });
    } catch (e) {
      throw new Error("R2 blocked the browser upload. Re-save the bucket CORS policy.");
    }
    if (!putRes.ok) throw new Error("R2 rejected the file (HTTP " + putRes.status + ").");
    return {
      key: intent.key,
      mime: intent.mime,
      size: pendingAttach.file.size,
      name: pendingAttach.file.name || "",
      url: intent.public_url,
      kind: intent.kind,
      explicit: !!pendingAttach.explicit
    };
  } finally {
    if (pendingAttach) pendingAttach.busy = false;
    renderAttachPreviews();
  }
}

function chatLightboxOverlay() {
  let overlay = document.getElementById("chat-lightbox-overlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "chat-lightbox-overlay";
  overlay.hidden = true;
  const img = document.createElement("img");
  img.id = "chat-lightbox-img";
  img.alt = "";
  img.addEventListener("click", (e) => e.stopPropagation());
  overlay.appendChild(img);
  overlay.addEventListener("click", closeChatLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeChatLightbox();
  });
  document.body.appendChild(overlay);
  return overlay;
}

function openChatLightbox(url) {
  if (!url) return;
  const overlay = chatLightboxOverlay();
  const img = document.getElementById("chat-lightbox-img");
  if (img) img.src = url;
  overlay.hidden = false;
}

function closeChatLightbox() {
  const overlay = document.getElementById("chat-lightbox-overlay");
  if (!overlay) return;
  overlay.hidden = true;
  const img = document.getElementById("chat-lightbox-img");
  if (img) img.src = "";
}

function bindChatImageLightbox(img, url) {
  if (!img) return;
  img.addEventListener("click", (e) => {
    if (img.closest(".composer-highlight, .attach-preview, .announce-composer-media-strip, .forum-post-thumb")) return;
    const cover = img.closest(".md-explicit-media");
    if (cover && !cover.classList.contains("is-open")) return;
    e.preventDefault();
    e.stopPropagation();
    openChatLightbox(url || img.src);
  });
}

function attachMediaIfNeeded(bubble, msg) {
  if (!appearancePref("show_uploads", true)) return;
  const att = parseAttachment(msg && msg.attachment);
  if (!att || !att.url) return;
  const wrap = document.createElement("div");
  wrap.className = "msg-media";
  if (att.kind === "video") {
    const vid = document.createElement("video");
    vid.src = att.url;
    vid.controls = true;
    vid.preload = "metadata";
    wrap.appendChild(wrapExplicitMedia(vid, att));
  } else {
    const img = document.createElement("img");
    img.src = att.url;
    img.alt = att.name || "image";
    bindChatImageLightbox(img, att.url);
    wrap.appendChild(wrapExplicitMedia(img, att));
  }
  wrap.addEventListener("contextmenu", (e) => showMessageContextMenu(e, msg));
  bubble.appendChild(wrap);
}

function openMediaPicker() {
  const input = document.getElementById("media-file-input");
  if (input) input.click();
}

function bindComposerMedia(rootId, textareaId, plusId) {
  const root = document.getElementById(rootId);
  const textarea = document.getElementById(textareaId);
  const plus = document.getElementById(plusId);
  if (plus) {
    plus.title = "Attach image or video";
    plus.addEventListener("click", (e) => {
      e.preventDefault();
      attachDestination = "composer";
      if (!plus.disabled) openMediaPicker();
    });
  }
  if (textarea) {
    textarea.addEventListener("paste", (e) => {
      const files = e.clipboardData && e.clipboardData.files;
      if (files && files.length) {
        e.preventDefault();
        attachDestination = "composer";
        setPendingFile(files[0]);
      }
    });
  }
  if (root) {
    root.addEventListener("dragover", (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
        e.preventDefault();
        root.classList.add("attach-drop");
      }
    });
    root.addEventListener("dragleave", () => root.classList.remove("attach-drop"));
    root.addEventListener("drop", (e) => {
      root.classList.remove("attach-drop");
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) {
        e.preventDefault();
        attachDestination = "composer";
        setPendingFile(files[0]);
      }
    });
  }
}

document.getElementById("media-file-input").addEventListener("change", () => {
  const input = document.getElementById("media-file-input");
  const file = input.files && input.files[0];
  input.value = "";
  if (file) setPendingFile(file);
});

bindComposerMedia("composer", "composer-input", "composer-plus-btn");
bindComposerMedia("channel-composer", "channel-composer-input", "channel-composer-plus-btn");

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function rejectProfileImage(file) {
  const mime = fileMime(file);
  if (!mime || MEDIA_MIME[mime] !== "image") return "Only jpeg, png, gif, or webp.";
  if (file.size > PROFILE_IMAGE_MAX_BYTES) return "File is over 5 MB.";
  return "";
}

async function uploadProfileImageFile(file) {
  const reason = rejectProfileImage(file);
  if (reason) throw new Error(reason);
  const mime = fileMime(file);
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
        purpose: "profile"
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
    url: intent.public_url,
    kind: intent.kind
  };
}

async function uploadServerIconFile(file) {
  const reason = rejectProfileImage(file);
  if (reason) throw new Error(reason);
  const mime = fileMime(file);
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
        purpose: "server"
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
    url: intent.public_url,
    kind: intent.kind
  };
}

const PROFILE_VIDEO_MAX_BYTES = 20 * 1024 * 1024;

function rejectProfileVideo(file) {
  const mime = fileMime(file);
  if (!mime || MEDIA_MIME[mime] !== "video") return "Only mp4 or webm.";
  if (file.size > PROFILE_VIDEO_MAX_BYTES) return "File is over 20 MB.";
  return "";
}

async function uploadProfileVideoFile(file) {
  const reason = rejectProfileVideo(file);
  if (reason) throw new Error(reason);
  const mime = fileMime(file);
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
        purpose: "profile"
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
    url: intent.public_url,
    kind: intent.kind
  };
}

const PROFILE_MUSIC_MAX_BYTES = 20 * 1024 * 1024;

function musicFileMime(file) {
  const type = ((file && file.type) || "").toLowerCase();
  if (type === "audio/mpeg" || type === "audio/mp3") return "audio/mpeg";
  if (type === "video/mp4") return "video/mp4";
  const name = ((file && file.name) || "").toLowerCase();
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".mp4")) return "video/mp4";
  return "";
}

function rejectProfileMusic(file) {
  const name = ((file && file.name) || "").toLowerCase();
  if (name.endsWith(".m4a") || name.endsWith(".wav") || name.endsWith(".flac") || name.endsWith(".ogg") || name.endsWith(".webm")) {
    return "Use mp3 or mp4.";
  }
  const mime = musicFileMime(file);
  if (!mime) return "Only mp3 or mp4.";
  if (file.size > PROFILE_MUSIC_MAX_BYTES) return "File is over 20 MB.";
  return "";
}

async function uploadProfileMusicFile(file) {
  const reason = rejectProfileMusic(file);
  if (reason) throw new Error(reason);
  const mime = musicFileMime(file);
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
        purpose: "profile"
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
    url: intent.public_url,
    kind: intent.kind
  };
}

async function uploadMediaFile(file) {
  const reason = rejectReason(file);
  if (reason) throw new Error(reason);
  const mime = fileMime(file);
  const intentRes = await fetch(`https://${serverAddress}/upload_intent`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content_type: mime,
      size: file.size,
      filename: file.name || ""
    })
  });
  const intent = await intentRes.json().catch(() => ({}));
  if (!intentRes.ok) throw new Error((typeof intent.detail === "string" && intent.detail) || "Could not start upload.");
  const putRes = await fetch(intent.upload_url, {
    method: "PUT",
    headers: { "Content-Type": intent.mime },
    body: file
  });
  if (!putRes.ok) throw new Error("Could not upload that file.");
  return {
    url: intent.public_url,
    kind: intent.kind || (MEDIA_MIME[mime] || "image"),
    mime: intent.mime || mime
  };
}
