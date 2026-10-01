let currentMediaItems = [];
let mediaItemId = null;
let mediaFormId = null;
let mediaFormFile = null;
let mediaFormKind = "";
let mediaFormUrl = "";
let mediaFormWidth = 0;
let mediaFormHeight = 0;
let mediaFormBusy = false;
let mediaFormSource = "file";

function canCreateMedia() {
  return typeof channelPerm === "function" && channelPerm("create_media");
}

function canManageMediaItem(item) {
  if (!item) return canCreateMedia();
  if (Number(item.sender_id) === Number(myUserId)) return true;
  return typeof channelPerm === "function" && channelPerm("manage_media");
}

function canDeleteMediaItem(item) {
  if (!item) return false;
  if (Number(item.sender_id) === Number(myUserId)) return true;
  return typeof channelPerm === "function" && channelPerm("remove_media");
}

function hideMediaChannelChrome() {
  ["media-channel-back", "media-channel-add"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const pins = document.getElementById("channel-pins-btn");
  if (pins && currentChannelType !== "media") pins.style.display = "";
  closeMediaForm();
}

function showMediaButton(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = on ? "inline-flex" : "none";
}

function mediaFaceSource(item) {
  const member = (typeof memberList !== "undefined" ? memberList : []).find((row) => Number(row.id) === Number(item && item.sender_id));
  if (member) return member;
  return { id: item && item.sender_id, username: item && item.sender_username };
}

function youtubeId(url) {
  const match = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : "";
}

function mediaThumbUrl(item) {
  if (!item) return "";
  if (item.kind === "link") {
    const id = youtubeId(item.url);
    if (id) return "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
    return "";
  }
  return item.url || "";
}

function mediaCardRatio(item) {
  const width = Number(item && item.width) || 0;
  const height = Number(item && item.height) || 0;
  let ratio = width > 0 && height > 0 ? width / height : (item && item.kind === "video" ? 16 / 9 : 1);
  if (ratio > 2.2) ratio = 2.2;
  if (ratio < 0.55) ratio = 0.55;
  return ratio;
}

function mediaColumnCount() {
  const grid = document.getElementById("media-channel-grid");
  const width = grid ? grid.clientWidth : 900;
  if (width < 640) return 2;
  if (width < 1100) return 3;
  return 4;
}

function paintMediaPlay(host) {
  const mark = document.createElement("span");
  mark.className = "media-channel-play";
  mark.textContent = "\u25B6";
  host.appendChild(mark);
}

function buildMediaCard(item) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "media-channel-card";
  const frame = document.createElement("span");
  frame.className = "media-channel-frame";
  frame.style.aspectRatio = String(mediaCardRatio(item));
  const thumb = mediaThumbUrl(item);
  if (thumb && item.kind !== "video") {
    const img = document.createElement("img");
    img.src = thumb;
    img.alt = item.title || "Untitled media";
    frame.appendChild(img);
  } else if (item.kind === "video" && item.url) {
    const vid = document.createElement("video");
    vid.src = item.url;
    vid.muted = true;
    vid.preload = "metadata";
    frame.appendChild(vid);
  } else {
    const link = document.createElement("span");
    link.className = "media-channel-linkface";
    link.textContent = item.url || "Link";
    frame.appendChild(link);
  }
  if (item.kind === "video" || (item.kind === "link" && youtubeId(item.url))) paintMediaPlay(frame);
  const title = document.createElement("span");
  title.className = "media-channel-title";
  title.textContent = item.title || "Untitled media";
  const copy = document.createElement("span");
  copy.className = "media-channel-copy";
  copy.appendChild(title);
  const foot = document.createElement("span");
  foot.className = "media-channel-foot";
  const face = document.createElement("span");
  face.className = "avatar-dot";
  const source = mediaFaceSource(item);
  if (typeof paintUserFace === "function") paintUserFace(face, source, { userId: item.sender_id, name: item.sender_username, circle: true });
  const name = document.createElement("span");
  name.className = "media-channel-name";
  name.textContent = item.sender_username || "Someone";
  if (typeof applyServerNameColor === "function") applyServerNameColor(name, item.sender_id);
  const comments = document.createElement("span");
  comments.className = "media-channel-comments";
  comments.textContent = "0";
  foot.appendChild(face);
  foot.appendChild(name);
  foot.appendChild(comments);
  card.appendChild(frame);
  card.appendChild(copy);
  card.appendChild(foot);
  card.addEventListener("click", () => openMediaItem(item));
  card.addEventListener("contextmenu", (event) => openMediaItemMenu(event, item));
  return card;
}

function paintMediaChannelList() {
  const grid = document.getElementById("media-channel-grid");
  const page = document.getElementById("media-channel-page");
  if (page) page.hidden = true;
  if (grid) grid.hidden = false;
  showMediaButton("media-channel-add", canCreateMedia());
  showMediaButton("media-channel-back", false);
  if (!grid) return;
  grid.replaceChildren();
  if (!currentMediaItems.length) {
    const empty = document.createElement("div");
    empty.className = "media-channel-empty";
    empty.textContent = "No media yet.";
    grid.appendChild(empty);
    return;
  }
  const count = mediaColumnCount();
  const columns = [];
  const heights = [];
  for (let i = 0; i < count; i += 1) {
    const col = document.createElement("div");
    col.className = "media-channel-col";
    columns.push(col);
    heights.push(0);
    grid.appendChild(col);
  }
  currentMediaItems.forEach((item) => {
    let index = 0;
    for (let i = 1; i < count; i += 1) {
      if (heights[i] < heights[index]) index = i;
    }
    columns[index].appendChild(buildMediaCard(item));
    heights[index] += (1 / mediaCardRatio(item)) + 0.35;
  });
}

function fillMediaStage(item) {
  const stage = document.getElementById("media-channel-stage");
  if (!stage) return;
  stage.replaceChildren();
  if (!item) return;
  if (item.kind === "video" && item.url) {
    const vid = document.createElement("video");
    vid.src = item.url;
    vid.controls = true;
    vid.playsInline = true;
    stage.appendChild(vid);
    watchMediaReadout(vid);
    return;
  }
  if (item.kind === "link") {
    const id = youtubeId(item.url);
    if (id) {
      const frame = document.createElement("iframe");
      frame.src = "https://www.youtube.com/embed/" + id;
      frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      frame.allowFullscreen = true;
      frame.title = item.title || "Untitled media";
      stage.appendChild(frame);
      watchMediaReadout(frame);
      return;
    }
  }
  const thumb = mediaThumbUrl(item);
  if (thumb) {
    const img = document.createElement("img");
    img.src = thumb;
    img.alt = item.title || "Untitled media";
    stage.appendChild(img);
    watchMediaReadout(img);
    return;
  }
  const link = document.createElement("a");
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = item.url || "Link";
  stage.appendChild(link);
  watchMediaReadout(stage.firstElementChild);
}

function watchMediaReadout(node) {
  if (!node) return;
  const pin = () => pinMediaReadout();
  if (node.tagName === "IMG") {
    if (node.complete) pin();
    else node.addEventListener("load", pin);
    return;
  }
  if (node.tagName === "VIDEO") {
    node.addEventListener("loadedmetadata", pin);
    return;
  }
  pin();
}

function openMediaItem(item) {
  mediaItemId = item ? item.id : null;
  const grid = document.getElementById("media-channel-grid");
  const page = document.getElementById("media-channel-page");
  const title = document.getElementById("media-channel-read-title");
  const body = document.getElementById("media-channel-read-body");
  const author = document.getElementById("media-channel-author");
  if (grid) grid.hidden = true;
  if (page) page.hidden = false;
  if (title) title.textContent = item ? (item.title || "Untitled media") : "Untitled media";
  if (body) {
    body.textContent = item ? (item.description || "") : "";
    body.hidden = !(item && item.description);
  }
  if (author) {
    author.replaceChildren();
    const face = document.createElement("button");
    face.type = "button";
    face.className = "avatar-dot media-channel-author-face";
    const source = mediaFaceSource(item);
    if (typeof paintUserFace === "function") paintUserFace(face, source, { userId: item.sender_id, name: item.sender_username, circle: true });
    face.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof openMiniProfile === "function") openMiniProfile(item.sender_id, face);
    });
    const name = document.createElement("button");
    name.type = "button";
    name.className = "media-channel-author-name";
    name.textContent = item.sender_username || "Someone";
    if (typeof applyServerNameColor === "function") applyServerNameColor(name, item.sender_id);
    name.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof openMiniProfile === "function") openMiniProfile(item.sender_id, name);
    });
    const role = document.createElement("div");
    role.className = "media-channel-author-role";
    role.textContent = item.sender_role || "";
    const text = document.createElement("div");
    text.appendChild(name);
    if (item.sender_role) text.appendChild(role);
    author.appendChild(face);
    author.appendChild(text);
  }
  fillMediaStage(item);
  showMediaButton("media-channel-add", false);
  showMediaButton("media-channel-back", true);
  pinMediaReadout();
}

function pinMediaReadout() {
  const stage = document.getElementById("media-channel-stage");
  const media = stage && stage.querySelector("img, video, iframe");
  const width = media ? Math.round(media.getBoundingClientRect().width) : 0;
  ["media-channel-read-title", "media-channel-author", "media-channel-read-body"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = width > 0 ? width + "px" : "";
  });
}

function showMediaChannelList() {
  mediaItemId = null;
  paintMediaChannelList();
}

function mediaMenuOptions(item) {
  const options = [{ label: "Open", onSelect: () => openMediaItem(item) }];
  if (canManageMediaItem(item)) options.push({ label: "Edit", onSelect: () => openMediaForm(item) });
  options.push({ label: "Move", disabled: true });
  if (canDeleteMediaItem(item)) options.push({ label: "Delete", danger: true, onSelect: () => deleteMediaItem(item.id) });
  return options;
}

function openMediaItemMenu(event, item) {
  event.preventDefault();
  event.stopPropagation();
  if (!item || typeof openContextMenu !== "function") return;
  openContextMenu(event.clientX, event.clientY, null, mediaMenuOptions(item));
}

function setMediaFormPreview() {
  const host = document.getElementById("media-channel-form-preview");
  if (!host) return;
  host.replaceChildren();
  if (mediaFormKind === "video") {
    const src = mediaFormFile ? URL.createObjectURL(mediaFormFile) : mediaFormUrl;
    if (!src) return;
    const vid = document.createElement("video");
    vid.src = src;
    vid.muted = true;
    vid.controls = true;
    vid.playsInline = true;
    vid.preload = "metadata";
    host.appendChild(vid);
    return;
  }
  const src = mediaFormFile ? URL.createObjectURL(mediaFormFile) : mediaThumbUrl({ kind: mediaFormKind, url: mediaFormUrl });
  if (!src) return;
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  host.appendChild(img);
}

function paintMediaFormSource() {
  const editing = mediaFormId != null;
  const heading = document.getElementById("media-channel-form-heading");
  const source = document.getElementById("media-channel-form-source");
  const fileRow = document.getElementById("media-channel-form-file-row");
  const linkRow = document.getElementById("media-channel-form-link-row");
  const card = document.querySelector("#media-channel-form .media-channel-form-card");
  if (heading) heading.textContent = editing ? "Edit Media" : "Upload Media";
  if (card) card.setAttribute("aria-label", editing ? "Edit Media" : "Upload Media");
  if (source) source.hidden = editing;
  if (fileRow) fileRow.hidden = editing || mediaFormSource !== "file";
  if (linkRow) linkRow.hidden = editing || mediaFormSource !== "link";
  document.querySelectorAll(".media-channel-source-btn").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.source === mediaFormSource);
  });
}

function chooseMediaFormSource(source) {
  if (mediaFormId) return;
  mediaFormSource = source === "link" ? "link" : "file";
  if (mediaFormSource === "file") {
    mediaFormUrl = "";
    const link = document.getElementById("media-channel-form-link");
    if (link) link.value = "";
    if (!mediaFormFile) {
      mediaFormKind = "";
      mediaFormWidth = 0;
      mediaFormHeight = 0;
    }
  } else {
    mediaFormFile = null;
    const link = document.getElementById("media-channel-form-link");
    mediaFormUrl = link ? link.value.trim() : "";
    mediaFormKind = mediaFormUrl ? "link" : "";
    const id = youtubeId(mediaFormUrl);
    mediaFormWidth = id ? 480 : 0;
    mediaFormHeight = id ? 360 : 0;
  }
  paintMediaFormSource();
  setMediaFormPreview();
}

function measureMediaFile(file) {
  return new Promise((resolve) => {
    const mime = typeof fileMime === "function" ? fileMime(file) : "";
    const kind = (typeof MEDIA_MIME !== "undefined" && MEDIA_MIME[mime]) || "image";
    const url = URL.createObjectURL(file);
    if (kind === "video") {
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.onloadedmetadata = () => {
        const width = vid.videoWidth || 0;
        const height = vid.videoHeight || 0;
        URL.revokeObjectURL(url);
        resolve({ kind, width, height });
      };
      vid.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ kind, width: 0, height: 0 });
      };
      vid.src = url;
      return;
    }
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 0;
      const height = img.naturalHeight || 0;
      URL.revokeObjectURL(url);
      resolve({ kind: "image", width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ kind: "image", width: 0, height: 0 });
    };
    img.src = url;
  });
}

function openMediaForm(item) {
  if (!item && !canCreateMedia()) return;
  if (item && !canManageMediaItem(item)) return;
  mediaFormId = item ? item.id : null;
  mediaFormFile = null;
  mediaFormKind = item ? (item.kind || "") : "";
  mediaFormUrl = item ? (item.url || "") : "";
  mediaFormWidth = item ? Number(item.width || 0) : 0;
  mediaFormHeight = item ? Number(item.height || 0) : 0;
  mediaFormSource = item && item.kind === "link" ? "link" : "file";
  const form = document.getElementById("media-channel-form");
  const title = document.getElementById("media-channel-form-title");
  const body = document.getElementById("media-channel-form-body");
  const link = document.getElementById("media-channel-form-link");
  if (title) title.value = item && item.title && item.title !== "Untitled media" ? item.title : "";
  if (body) body.value = item ? (item.description || "") : "";
  if (link) link.value = item && item.kind === "link" ? (item.url || "") : "";
  paintMediaFormSource();
  setMediaFormPreview();
  if (form) form.hidden = false;
  if (title) title.focus();
}

function closeMediaForm() {
  mediaFormId = null;
  mediaFormFile = null;
  mediaFormKind = "";
  mediaFormUrl = "";
  mediaFormSource = "file";
  mediaFormBusy = false;
  const form = document.getElementById("media-channel-form");
  if (form) form.hidden = true;
}

async function onMediaFormFile(file) {
  if (!file || mediaFormBusy) return;
  const measured = await measureMediaFile(file);
  mediaFormFile = file;
  mediaFormKind = measured.kind;
  mediaFormUrl = "";
  mediaFormWidth = measured.width;
  mediaFormHeight = measured.height;
  mediaFormSource = "file";
  const link = document.getElementById("media-channel-form-link");
  if (link) link.value = "";
  paintMediaFormSource();
  setMediaFormPreview();
}

async function saveMediaForm() {
  if (mediaFormBusy || !currentChannelId) return;
  const title = document.getElementById("media-channel-form-title");
  const body = document.getElementById("media-channel-form-body");
  const link = document.getElementById("media-channel-form-link");
  const fields = {
    title: title ? title.value : "",
    description: body ? body.value : "",
  };
  mediaFormBusy = true;
  try {
    let payload;
    if (mediaFormId) {
      payload = Object.assign({ item_id: mediaFormId }, fields);
    } else if (mediaFormSource === "file") {
      if (!mediaFormFile) {
        window.alert("Choose a file.");
        return;
      }
      if (typeof uploadMediaFile !== "function") throw new Error("Could not upload that file.");
      const uploaded = await uploadMediaFile(mediaFormFile);
      payload = Object.assign({
        channel_id: currentChannelId,
        kind: uploaded.kind === "video" ? "video" : "image",
        url: uploaded.url,
        width: mediaFormWidth,
        height: mediaFormHeight,
      }, fields);
    } else {
      const url = link ? link.value.trim() : "";
      if (!url) {
        window.alert("Add a YouTube link.");
        return;
      }
      payload = Object.assign({
        channel_id: currentChannelId,
        kind: "link",
        url,
        width: mediaFormWidth,
        height: mediaFormHeight,
      }, fields);
    }
    const path = mediaFormId ? "edit_media_item" : "create_media_item";
    const response = await fetch(`https://${serverAddress}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      window.alert((typeof data.detail === "string" && data.detail) || "Could not save that media.");
      return;
    }
    applyMediaItem(data);
    closeMediaForm();
    openMediaItem(data);
  } catch (error) {
    window.alert(error && error.message ? error.message : "Could not save that media.");
  } finally {
    mediaFormBusy = false;
  }
}

async function deleteMediaItem(itemId) {
  if (!itemId) return;
  const response = await fetch(`https://${serverAddress}/delete_media_item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ item_id: itemId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not delete that media.");
    return;
  }
  removeMediaItem(data.item_id || itemId);
}

function applyMediaItem(item) {
  if (!item || Number(item.channel_id) !== Number(currentChannelId)) return;
  const index = currentMediaItems.findIndex((row) => Number(row.id) === Number(item.id));
  if (index === -1) currentMediaItems.unshift(item);
  else currentMediaItems[index] = item;
  if (mediaItemId == null) paintMediaChannelList();
  else if (Number(mediaItemId) === Number(item.id)) openMediaItem(item);
}

function removeMediaItem(itemId) {
  currentMediaItems = currentMediaItems.filter((row) => Number(row.id) !== Number(itemId));
  if (Number(mediaItemId) === Number(itemId)) {
    showMediaChannelList();
    return;
  }
  if (mediaItemId == null) paintMediaChannelList();
}

async function loadMediaItems(channelId) {
  mediaItemId = null;
  currentMediaItems = [];
  const pins = document.getElementById("channel-pins-btn");
  if (pins) pins.style.display = "none";
  closeMediaForm();
  paintMediaChannelList();
  const response = await fetch(`https://${serverAddress}/get_media_items/${channelId}`, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || Number(currentChannelId) !== Number(channelId)) return;
  currentMediaItems = data.items || [];
  if (mediaItemId == null) paintMediaChannelList();
}

const mediaChannelAdd = document.getElementById("media-channel-add");
if (mediaChannelAdd) mediaChannelAdd.addEventListener("click", () => openMediaForm(null));
const mediaChannelBack = document.getElementById("media-channel-back");
if (mediaChannelBack) mediaChannelBack.addEventListener("click", showMediaChannelList);
const mediaFormDone = document.getElementById("media-channel-form-done");
if (mediaFormDone) mediaFormDone.addEventListener("click", saveMediaForm);
const mediaFormCancel = document.getElementById("media-channel-form-cancel");
if (mediaFormCancel) mediaFormCancel.addEventListener("click", closeMediaForm);
const mediaFormPick = document.getElementById("media-channel-form-pick");
const mediaFormFileInput = document.getElementById("media-channel-form-file");
if (mediaFormPick && mediaFormFileInput) {
  mediaFormPick.addEventListener("click", () => mediaFormFileInput.click());
  mediaFormFileInput.addEventListener("change", () => {
    const file = mediaFormFileInput.files && mediaFormFileInput.files[0];
    mediaFormFileInput.value = "";
    if (file) onMediaFormFile(file);
  });
}
const mediaFormLink = document.getElementById("media-channel-form-link");
if (mediaFormLink) {
  mediaFormLink.addEventListener("input", () => {
    if (mediaFormId || mediaFormSource !== "link") return;
    mediaFormFile = null;
    mediaFormUrl = mediaFormLink.value.trim();
    mediaFormKind = mediaFormUrl ? "link" : "";
    const id = youtubeId(mediaFormUrl);
    mediaFormWidth = id ? 480 : 0;
    mediaFormHeight = id ? 360 : 0;
    setMediaFormPreview();
  });
}
document.querySelectorAll(".media-channel-source-btn").forEach((btn) => {
  btn.addEventListener("click", () => chooseMediaFormSource(btn.dataset.source));
});
window.addEventListener("resize", () => {
  if (currentChannelType !== "media") return;
  if (mediaItemId == null) paintMediaChannelList();
  else pinMediaReadout();
});
const mediaChannelDrop = document.getElementById("media-channel-view");
if (mediaChannelDrop) {
  mediaChannelDrop.addEventListener("dragover", (event) => {
    if (!canCreateMedia()) return;
    const types = event.dataTransfer ? event.dataTransfer.types : [];
    if (![...types].includes("Files")) return;
    event.preventDefault();
  });
  mediaChannelDrop.addEventListener("drop", (event) => {
    if (!canCreateMedia()) return;
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    event.preventDefault();
    openMediaForm(null);
    onMediaFormFile(file);
  });
}
document.addEventListener("paste", (event) => {
  if (currentChannelType !== "media" || !canCreateMedia()) return;
  const form = document.getElementById("media-channel-form");
  if (form && !form.hidden) return;
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
  const text = event.clipboardData ? event.clipboardData.getData("text") : "";
  const url = (text || "").trim();
  if (!/^https?:\/\//i.test(url)) return;
  event.preventDefault();
  openMediaForm(null);
  chooseMediaFormSource("link");
  const link = document.getElementById("media-channel-form-link");
  if (!link) return;
  link.value = url;
  link.dispatchEvent(new Event("input"));
});
