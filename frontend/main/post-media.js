// ==================================================================
// post-media.js - One pending file on announcement/forum post composers.
// Chat composers stay in media.js. Same /upload_intent + R2 PUT.
// ==================================================================

const postMediaPending = {
  announce: { file: null, previewUrl: null },
  forum: { file: null, previewUrl: null }
};

function clearPostMedia(kind) {
  const slot = postMediaPending[kind];
  if (!slot) return;
  if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
  slot.file = null;
  slot.previewUrl = null;
  paintPostComposerTile(kind);
}

function setPostMediaFile(kind, file) {
  const reason = typeof rejectReason === "function" ? rejectReason(file) : "";
  if (reason) {
    window.alert(reason);
    return;
  }
  clearPostMedia(kind);
  const slot = postMediaPending[kind];
  slot.file = file;
  slot.previewUrl = URL.createObjectURL(file);
  paintPostComposerTile(kind);
}

function paintPostComposerTile(kind) {
  const btn = document.getElementById(kind === "announce" ? "announce-composer-image-btn" : "forum-composer-image-btn");
  if (!btn) return;
  const slot = postMediaPending[kind];
  btn.replaceChildren();
  btn.classList.toggle("has-file", !!slot.file);
  btn.title = slot.file ? "Remove file" : "Add image or video";
  if (!slot.file) {
    btn.appendChild(defaultPostComposerTileIcon());
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

function defaultPostComposerTileIcon() {
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

function bindPostComposerMedia(kind, buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = typeof MEDIA_ACCEPT === "string" ? MEDIA_ACCEPT : "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm";
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

async function uploadPendingPostFile(file) {
  const mime = fileMime(file);
  const reason = typeof rejectReason === "function" ? rejectReason(file) : "";
  if (reason) throw new Error(reason);
  let intentRes;
  try {
    intentRes = await fetch(`https://${serverAddress}/upload_intent`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: mime,
        size: file.size,
        filename: file.name || ""
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
    name: file.name || ""
  };
}

function buildPostMedia(attachment, extraClass) {
  const data = (typeof parseAttachment === "function" ? parseAttachment(attachment) : attachment) || attachment;
  if (!data || !data.url) return null;
  const wrap = document.createElement("div");
  wrap.className = extraClass ? `post-media ${extraClass}` : "post-media";
  const mime = (data.mime || "").toLowerCase();
  if (mime.startsWith("video/") || data.kind === "video") {
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
  const data = (typeof parseAttachment === "function" ? parseAttachment(attachment) : attachment) || attachment;
  if (!data || !data.url) return null;
  const thumb = document.createElement("div");
  thumb.className = "forum-post-thumb";
  const mime = (data.mime || "").toLowerCase();
  if (mime.startsWith("video/") || data.kind === "video") {
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

bindPostComposerMedia("announce", "announce-composer-image-btn");
bindPostComposerMedia("forum", "forum-composer-image-btn");
