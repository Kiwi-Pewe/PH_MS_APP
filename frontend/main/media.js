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
    previewUrl: URL.createObjectURL(file)
  };
  renderAttachPreviews();
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
  if (pendingAttach.kind === "video") {
    const vid = document.createElement("video");
    vid.src = pendingAttach.previewUrl;
    vid.muted = true;
    chip.appendChild(vid);
  } else {
    const img = document.createElement("img");
    img.src = pendingAttach.previewUrl;
    img.alt = pendingAttach.file.name || "attachment";
    chip.appendChild(img);
  }
  const meta = document.createElement("div");
  meta.className = "attach-chip-meta";
  const name = document.createElement("div");
  name.className = "attach-chip-name";
  name.textContent = pendingAttach.file.name || "file";
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
      kind: intent.kind
    };
  } finally {
    if (pendingAttach) pendingAttach.busy = false;
    renderAttachPreviews();
  }
}

function attachMediaIfNeeded(bubble, msg) {
  const att = parseAttachment(msg && msg.attachment);
  if (!att || !att.url) return;
  const wrap = document.createElement("div");
  wrap.className = "msg-media";
  if (att.kind === "video") {
    const vid = document.createElement("video");
    vid.src = att.url;
    vid.controls = true;
    vid.preload = "metadata";
    wrap.appendChild(vid);
  } else {
    const img = document.createElement("img");
    img.src = att.url;
    img.alt = att.name || "image";
    img.addEventListener("click", () => window.open(att.url, "_blank", "noopener"));
    wrap.appendChild(img);
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
      if (!plus.disabled) openMediaPicker();
    });
  }
  if (textarea) {
    textarea.addEventListener("paste", (e) => {
      const files = e.clipboardData && e.clipboardData.files;
      if (files && files.length) {
        e.preventDefault();
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
