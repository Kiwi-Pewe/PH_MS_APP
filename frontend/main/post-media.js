// ==================================================================
// post-media.js - Announcement/forum post media strip (up to 4 files).
// Rest: thumbs only, or one add tile if empty. Hover/focus reveals the
// add tile again. Chat composers stay in media.js.
// ==================================================================

const POST_MEDIA_MAX = 4;
const postMediaPending = {
  announce: { files: [] },
  forum: { files: [] }
};

function parsePostAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((item) => item && item.url);
  const parsed = typeof parseAttachment === "function" ? parseAttachment(raw) : raw;
  if (Array.isArray(parsed)) return parsed.filter((item) => item && item.url);
  return parsed && parsed.url ? [parsed] : [];
}

function clearPostMedia(kind) {
  const slot = postMediaPending[kind];
  if (!slot) return;
  slot.files.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  slot.files = [];
  paintPostComposerStrip(kind);
}

function addPostMediaFiles(kind, fileList) {
  const slot = postMediaPending[kind];
  const incoming = [...fileList];
  for (const file of incoming) {
    if (slot.files.length >= POST_MEDIA_MAX) {
      window.alert("Up to 4 files on a post.");
      break;
    }
    const reason = typeof rejectReason === "function" ? rejectReason(file) : "";
    if (reason) {
      window.alert(reason);
      continue;
    }
    slot.files.push({
      file,
      previewUrl: URL.createObjectURL(file)
    });
  }
  paintPostComposerStrip(kind);
}

function removePostMediaAt(kind, index) {
  const slot = postMediaPending[kind];
  const item = slot.files[index];
  if (!item) return;
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  slot.files.splice(index, 1);
  paintPostComposerStrip(kind);
}

function paintPostComposerStrip(kind) {
  const addBtn = document.getElementById(kind === "announce" ? "announce-composer-image-btn" : "forum-composer-image-btn");
  const strip = document.getElementById(kind === "announce" ? "announce-composer-media-strip" : "forum-composer-media-strip");
  if (!addBtn || !strip) return;
  strip.querySelectorAll(".announce-composer-image-thumb").forEach((el) => el.remove());
  const items = postMediaPending[kind].files;
  items.forEach((item, index) => {
    const thumb = document.createElement("div");
    thumb.className = "announce-composer-image-btn announce-composer-image-thumb has-file";
    const mime = fileMime(item.file);
    if (mime.startsWith("video/")) {
      const vid = document.createElement("video");
      vid.src = item.previewUrl;
      vid.muted = true;
      vid.playsInline = true;
      thumb.appendChild(vid);
    } else {
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = "";
      thumb.appendChild(img);
    }
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "announce-composer-image-clear";
    clearBtn.title = "Remove file";
    clearBtn.textContent = "\u00d7";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePostMediaAt(kind, index);
    });
    thumb.appendChild(clearBtn);
    strip.insertBefore(thumb, addBtn);
  });
  strip.classList.toggle("has-files", items.length > 0);
  strip.classList.toggle("is-full", items.length >= POST_MEDIA_MAX);
  addBtn.disabled = items.length >= POST_MEDIA_MAX;
  addBtn.title = items.length >= POST_MEDIA_MAX ? "Maximum of 4 files" : "Add image or video";
}

function bindPostComposerMedia(kind, buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = typeof MEDIA_ACCEPT === "string" ? MEDIA_ACCEPT : "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm";
  input.multiple = true;
  input.setAttribute("hidden", "");
  input.style.display = "none";
  input.tabIndex = -1;
  document.body.appendChild(input);
  btn.disabled = false;
  btn.removeAttribute("title");
  btn.addEventListener("click", () => {
    if (postMediaPending[kind].files.length >= POST_MEDIA_MAX) return;
    input.value = "";
    input.click();
  });
  input.addEventListener("change", () => {
    if (input.files && input.files.length) addPostMediaFiles(kind, input.files);
  });
  paintPostComposerStrip(kind);
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

async function uploadPendingPostFiles(items) {
  const uploaded = [];
  for (const item of items) {
    uploaded.push(await uploadPendingPostFile(item.file));
  }
  return uploaded;
}

function appendPostMediaItem(host, data) {
  const mime = (data.mime || "").toLowerCase();
  if (mime.startsWith("video/") || data.kind === "video") {
    const vid = document.createElement("video");
    vid.src = data.url;
    vid.controls = true;
    vid.preload = "metadata";
    host.appendChild(vid);
  } else {
    const img = document.createElement("img");
    img.src = data.url;
    img.alt = data.name || "";
    host.appendChild(img);
  }
}

function buildPostMedia(attachment, extraClass) {
  const items = parsePostAttachments(attachment);
  if (!items.length) return null;
  const wrap = document.createElement("div");
  wrap.className = extraClass ? `post-media ${extraClass}` : "post-media";
  if (items.length > 1) wrap.classList.add("post-media-multi");
  items.forEach((data) => appendPostMediaItem(wrap, data));
  return wrap;
}

function buildForumThumb(attachment) {
  const items = parsePostAttachments(attachment);
  if (!items.length) return null;
  const data = items[0];
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
  if (items.length > 1) {
    const more = document.createElement("div");
    more.className = "forum-post-thumb-more";
    more.textContent = "+" + (items.length - 1);
    thumb.appendChild(more);
  }
  return thumb;
}

bindPostComposerMedia("announce", "announce-composer-image-btn");
bindPostComposerMedia("forum", "forum-composer-image-btn");
