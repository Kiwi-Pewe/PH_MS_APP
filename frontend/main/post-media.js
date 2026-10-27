// ==================================================================
// post-media.js - Announcement/forum post media strip (up to 4 files).
// Rest: thumbs only, or one add tile if empty. Hover/focus reveals the
// add tile again. Chat composers stay in media.js.
// ==================================================================

const POST_MEDIA_MAX = 4;
const postMediaPending = {
  announce: { files: [] },
  forum: { files: [] },
  announceEdit: { files: [] },
  forumEdit: { files: [] },
  community: { files: [] }
};
const POST_MEDIA_HOSTS = {
  announce: { addId: "announce-composer-image-btn", stripId: "announce-composer-media-strip" },
  forum: { addId: "forum-composer-image-btn", stripId: "forum-composer-media-strip" },
  announceEdit: { addId: "announce-edit-image-btn", stripId: "announce-edit-media-strip" },
  forumEdit: { addId: "forum-edit-image-btn", stripId: "forum-edit-media-strip" },
  community: { addId: "community-compose-image-btn", stripId: "community-compose-media-strip" }
};
const postMediaInputs = {};

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
    if (item.file && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  slot.files = [];
  paintPostComposerStrip(kind);
}

function postMediaAcceptAttr(kind) {
  const base = typeof MEDIA_ACCEPT === "string" ? MEDIA_ACCEPT : "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm";
  if (kind === "community") return base + ",audio/mpeg,.mp3";
  return base;
}

function postMediaIsAudioFile(file) {
  const name = ((file && file.name) || "").toLowerCase();
  const type = ((file && file.type) || "").toLowerCase();
  return name.endsWith(".mp3") || type === "audio/mpeg" || type === "audio/mp3";
}

function postMediaRejectReason(kind, file) {
  if (kind === "community" && postMediaIsAudioFile(file)) {
    if (file && file.size > (typeof maxUploadBytes === "function" ? maxUploadBytes() : 20 * 1024 * 1024)) return "File is over 20 MB.";
    return "";
  }
  return typeof rejectReason === "function" ? rejectReason(file) : "";
}

function addPostMediaFiles(kind, fileList) {
  const slot = postMediaPending[kind];
  const incoming = [...fileList];
  for (const file of incoming) {
    if (slot.files.length >= POST_MEDIA_MAX) {
      window.alert("Up to 4 files on a post.");
      break;
    }
    const reason = postMediaRejectReason(kind, file);
    if (reason) {
      window.alert(reason);
      continue;
    }
    slot.files.push({
      file,
      previewUrl: URL.createObjectURL(file),
      explicit: false
    });
  }
  paintPostComposerStrip(kind);
}

function removePostMediaAt(kind, index) {
  const slot = postMediaPending[kind];
  const item = slot.files[index];
  if (!item) return;
  if (item.file && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  slot.files.splice(index, 1);
  paintPostComposerStrip(kind);
}

function postMediaItemMime(item) {
  if (item.file) {
    if (typeof fileMime === "function") {
      const mime = fileMime(item.file);
      if (mime) return mime;
    }
    if (postMediaIsAudioFile(item.file)) return "audio/mpeg";
  }
  return ((item.existing && item.existing.mime) || "").toLowerCase();
}

function postMediaItemExplicit(item) {
  return !!(item && (item.explicit || (item.existing && item.existing.explicit)));
}

function postMediaItemKind(item) {
  const mime = postMediaItemMime(item);
  if (mime.startsWith("audio/") || (item.existing && item.existing.kind === "audio")) return "audio";
  if (mime.startsWith("video/") || (item.existing && item.existing.kind === "video")) return "video";
  return "image";
}

function postMediaItemName(item) {
  if (item.file && item.file.name) return item.file.name;
  return (item.existing && item.existing.name) || "file";
}

function paintPostComposerStrip(kind) {
  const host = POST_MEDIA_HOSTS[kind];
  const addBtn = host && document.getElementById(host.addId);
  const strip = host && document.getElementById(host.stripId);
  if (!addBtn || !strip) return;
  strip.querySelectorAll(".announce-composer-image-thumb").forEach((el) => el.remove());
  const items = postMediaPending[kind].files;
  items.forEach((item, index) => {
    const thumb = document.createElement("div");
    const explicit = postMediaItemExplicit(item);
    thumb.className = "announce-composer-image-btn announce-composer-image-thumb has-file" + (explicit ? " is-explicit" : "");
    const mime = postMediaItemMime(item);
    if (mime.startsWith("video/")) {
      const vid = document.createElement("video");
      vid.src = item.previewUrl;
      vid.muted = true;
      vid.playsInline = true;
      thumb.appendChild(vid);
    } else if (mime.startsWith("audio/")) {
      const note = document.createElement("span");
      note.className = "announce-composer-audio-label";
      note.textContent = postMediaItemName(item).replace(/\.[^.]+$/, "") || "Audio";
      thumb.appendChild(note);
    } else {
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = "";
      thumb.appendChild(img);
    }
    if (explicit) {
      const label = document.createElement("span");
      label.className = "md-explicit-media-label";
      label.textContent = "Explicit";
      thumb.appendChild(label);
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
    if (typeof bindAttachMarkdownMenu === "function") {
      bindAttachMarkdownMenu(thumb, () => ({
        name: postMediaItemName(item),
        kind: postMediaItemKind(item),
        marked: postMediaItemExplicit(item),
        image: item.previewUrl
      }), () => {
        const next = !postMediaItemExplicit(item);
        item.explicit = next;
        if (item.existing) item.existing.explicit = next;
        paintPostComposerStrip(kind);
      });
    }
    if (kind === "community") strip.appendChild(thumb);
    else strip.insertBefore(thumb, addBtn);
  });
  strip.classList.toggle("has-files", items.length > 0);
  strip.classList.toggle("is-full", items.length >= POST_MEDIA_MAX);
  addBtn.disabled = items.length >= POST_MEDIA_MAX;
  addBtn.title = items.length >= POST_MEDIA_MAX
    ? "Maximum of 4 files"
    : (kind === "community" ? "Add image, video, or music" : "Add image or video");
}

function ensurePostMediaInput(kind) {
  if (postMediaInputs[kind]) return postMediaInputs[kind];
  const input = document.createElement("input");
  input.type = "file";
  input.accept = postMediaAcceptAttr(kind);
  input.multiple = true;
  input.setAttribute("hidden", "");
  input.style.display = "none";
  input.tabIndex = -1;
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    if (input.files && input.files.length) addPostMediaFiles(kind, input.files);
  });
  postMediaInputs[kind] = input;
  return input;
}

function bindPostMediaButton(kind, btn) {
  if (!btn) return;
  const input = ensurePostMediaInput(kind);
  btn.disabled = false;
  btn.removeAttribute("title");
  btn.addEventListener("click", () => {
    if (postMediaPending[kind].files.length >= POST_MEDIA_MAX) return;
    input.value = "";
    input.click();
  });
  paintPostComposerStrip(kind);
}

function bindPostComposerMedia(kind, buttonId) {
  bindPostMediaButton(kind, document.getElementById(buttonId));
}

async function uploadPendingPostFile(file, kind) {
  const mime = (typeof fileMime === "function" && fileMime(file)) || (postMediaIsAudioFile(file) ? "audio/mpeg" : "");
  const reason = postMediaRejectReason(kind, file);
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
        filename: file.name || "",
        purpose: (kind === "community" && postMediaIsAudioFile(file)) ? "profile" : "chat"
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
  if (typeof uploadGifStillIfNeeded === "function") await uploadGifStillIfNeeded(intent, file);
  return {
    key: intent.key,
    mime: intent.mime,
    size: file.size,
    name: file.name || ""
  };
}

async function uploadPendingPostFiles(items, kind) {
  const uploaded = [];
  for (const item of items) {
    if (item.existing) {
      uploaded.push({
        key: item.existing.key,
        mime: item.existing.mime,
        size: item.existing.size,
        name: item.existing.name || "",
        explicit: postMediaItemExplicit(item)
      });
    } else {
      const payload = await uploadPendingPostFile(item.file, kind);
      payload.explicit = !!item.explicit;
      uploaded.push(payload);
    }
  }
  return uploaded;
}

function appendPostMediaItem(host, data) {
  const mime = (data.mime || "").toLowerCase();
  if (mime.startsWith("audio/") || data.kind === "audio") return;
  let mediaEl;
  if (mime.startsWith("video/") || data.kind === "video") {
    const vid = document.createElement("video");
    vid.src = data.url;
    vid.controls = true;
    vid.preload = "metadata";
    mediaEl = vid;
  } else {
    const img = document.createElement("img");
    img.alt = data.name || "";
    if (typeof bindAttentionGif === "function" && typeof isGifMedia === "function" && isGifMedia(data)) {
      bindAttentionGif(img, {
        live: data.url,
        still: data.still_url || (typeof stillUrlFromGif === "function" ? stillUrlFromGif(data.url) : ""),
        kind: "chat",
        mime: data.mime || ""
      });
    } else {
      img.src = data.url;
    }
    if (typeof bindChatImageLightbox === "function") bindChatImageLightbox(img, data.url);
    mediaEl = img;
  }
  host.appendChild(typeof wrapExplicitMedia === "function" ? wrapExplicitMedia(mediaEl, data) : mediaEl);
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
  let mediaEl;
  if (mime.startsWith("video/") || data.kind === "video") {
    const vid = document.createElement("video");
    vid.src = data.url;
    vid.muted = true;
    vid.preload = "metadata";
    mediaEl = vid;
  } else {
    const img = document.createElement("img");
    img.alt = "";
    if (typeof bindAttentionGif === "function" && typeof isGifMedia === "function" && isGifMedia(data)) {
      bindAttentionGif(img, {
        live: data.url,
        still: data.still_url || (typeof stillUrlFromGif === "function" ? stillUrlFromGif(data.url) : ""),
        kind: "user",
        mime: data.mime || ""
      });
    } else {
      img.src = data.url;
    }
    mediaEl = img;
  }
  thumb.appendChild(typeof wrapExplicitMedia === "function" ? wrapExplicitMedia(mediaEl, data) : mediaEl);
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
bindPostComposerMedia("community", "community-compose-image-btn");
