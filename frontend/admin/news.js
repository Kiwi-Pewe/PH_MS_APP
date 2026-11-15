const NEWS_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NEWS_EVENT_COLORS = {
  red: "#ed4245",
  orange: "#f26522",
  yellow: "#fee75c",
  green: "#23a559"
};
const NEWS_MEDIA_MIME = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
  "video/mp4": "video/mp4",
  "video/webm": "video/webm"
};

let newsCal = new Date();
newsCal.setDate(1);

function newsParseWhen(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(text) ? text.replace(" ", "T") : text.replace(" ", "T") + "Z";
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? null : when;
}

function newsDayKey(raw) {
  const when = newsParseWhen(raw);
  if (!when) return "";
  return when.getFullYear() + "-" + String(when.getMonth() + 1).padStart(2, "0") + "-" + String(when.getDate()).padStart(2, "0");
}

function newsLocalDayKey(day) {
  return day.getFullYear() + "-" + String(day.getMonth() + 1).padStart(2, "0") + "-" + String(day.getDate()).padStart(2, "0");
}

function newsEventHex(color) {
  return NEWS_EVENT_COLORS[color] || NEWS_EVENT_COLORS.orange;
}

function paintNewsMonth(host) {
  if (!host) return;
  host.innerHTML = "";
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name) => {
    host.appendChild(adminEl("div", "news-cal-dow", name));
  });
  const byDay = {};
  newsEvents.forEach((row) => {
    const key = newsDayKey(row.starts_at);
    if (!key) return;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(row);
  });
  const first = new Date(newsCal.getFullYear(), newsCal.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = new Date();
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const cell = adminEl("div", "news-cal-day");
    if (day.getMonth() !== newsCal.getMonth()) cell.classList.add("is-outside");
    if (day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth() && day.getDate() === today.getDate()) {
      cell.classList.add("is-today");
    }
    cell.appendChild(adminEl("div", "news-cal-num", String(day.getDate())));
    (byDay[newsLocalDayKey(day)] || []).forEach((row) => {
      const item = adminEl("div", "news-cal-item is-" + (row.color || "orange"), row.name || "Event");
      item.style.background = newsEventHex(row.color);
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        openNewsEventDetail(row);
      });
      cell.appendChild(item);
    });
    host.appendChild(cell);
  }
}

let newsPosts = [];
let newsEvents = [];
let newsQuery = "";
let newsSearchTimer = 0;
let newsPosting = false;
let newsTitleAlign = "left";
let newsBodyAlign = "left";
let newsEventColor = "orange";
let newsMedia = [];
let newsFocus = null;
let newsComposerBound = false;
let newsCommentsInput = null;
let newsEventInput = null;
let newsEditId = 0;
let newsEventLocked = false;
let newsOverlaysBound = false;
let newsDeleteId = 0;
let newsDetailEvent = null;
let newsDetailEditing = false;
let newsDetailColor = "orange";
let newsSaving = false;

function newsWhen(raw) {
  if (typeof usersWhen === "function") return usersWhen(raw);
  return raw || "—";
}

function fillNewsMarkdown(el, text) {
  if (!el) return;
  el.replaceChildren();
  const source = String(text || "");
  if (!source) return;
  if (typeof mdAppend === "function") mdAppend(el, source);
  else if (typeof fillMentionText === "function") fillMentionText(el, source, {}, {}, { rich: true });
  else el.textContent = source;
}

function paintNewsPostCard(row) {
  const card = adminEl("article", "announce-post");
  card.dataset.postId = String(row.id);
  const top = adminEl("div", "announce-post-top");
  const avatar = adminEl("div", "cluster-avatar");
  if (typeof usersFace === "function") usersFace(avatar, row, row.display_name || row.username);
  else avatar.textContent = typeof usersLetter === "function" ? usersLetter(row.display_name || row.username) : (row.username || "?").charAt(0);
  const meta = adminEl("div", "announce-post-meta");
  meta.appendChild(adminEl("div", "announce-post-name", row.display_name || row.username || "Oneira"));
  top.appendChild(avatar);
  top.appendChild(meta);
  const date = adminEl("div", "announce-post-date", newsWhen(row.created_at));
  const head = adminEl("div", "announce-post-head");
  const headline = adminEl("div", "announce-post-headline");
  head.appendChild(top);
  head.appendChild(headline);
  head.appendChild(date);
  const mid = adminEl("div", "announce-post-mid");
  const content = adminEl("div", "announce-post-content");
  const divider = adminEl("div", "announce-divider");
  const reactionsRow = adminEl("div", "announce-reactions-row is-later");
  const reactions = adminEl("div", "announce-reactions");
  const add = adminEl("button", "announce-add-reaction-btn", "+");
  add.type = "button";
  add.title = "Add Reaction";
  add.disabled = true;
  reactions.appendChild(add);
  reactionsRow.appendChild(reactions);
  mid.appendChild(content);
  mid.appendChild(divider);
  mid.appendChild(reactionsRow);
  const foot = adminEl("div", "announce-post-foot is-later");
  const commentsRow = adminEl("div", "announce-comments-row");
  const commentsBtn = adminEl("button", "announce-comments-btn", (Number(row.comment_count) || 0) + " comments");
  commentsBtn.type = "button";
  commentsBtn.disabled = true;
  commentsRow.appendChild(commentsBtn);
  foot.appendChild(commentsRow);
  card.appendChild(head);
  card.appendChild(mid);
  card.appendChild(foot);
  const titleRow = adminEl("div", "announce-post-title-row");
  const title = adminEl("div", "announce-post-title");
  title.style.textAlign = row.title_align || "left";
  fillNewsMarkdown(title, row.title || "");
  titleRow.appendChild(title);
  if (row.edited) titleRow.appendChild(adminEl("span", "edited-tag", "edited"));
  headline.appendChild(titleRow);
  if (row.event && row.event.name) {
    const chip = adminEl("div", "news-event-chip is-" + (row.event.color || "orange"), row.event.name);
    chip.style.background = newsEventHex(row.event.color);
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      openNewsEventDetail(row.event);
    });
    headline.appendChild(chip);
  }
  if (row.body) {
    const body = adminEl("div", "announce-post-body");
    body.style.textAlign = row.body_align || "left";
    fillNewsMarkdown(body, row.body);
    content.appendChild(body);
  }
  const media = newsPaintPostMedia(row.attachment);
  if (media) content.appendChild(media);
  card.addEventListener("contextmenu", (e) => showNewsPostContextMenu(e, row));
  return card;
}

function paintNewsPostList() {
  const host = document.getElementById("news-admin-posts");
  if (!host) return;
  host.innerHTML = "";
  newsPosts.forEach((row) => host.appendChild(paintNewsPostCard(row)));
  host.appendChild(adminEl("div", "announce-end-marker", newsPosts.length ? "You're up to date!" : (newsQuery ? "No announcements matched that search." : "You're up to date!")));
}

function loadNewsPosts() {
  const params = new URLSearchParams();
  if (newsQuery) params.set("q", newsQuery);
  const qs = params.toString();
  adminApi("/news/posts" + (qs ? "?" + qs : "")).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    newsPosts = (data && data.posts) || [];
    paintNewsPostList();
  }).catch(() => {
    const host = document.getElementById("news-admin-posts");
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(adminEl("div", "announce-end-marker", "Could not load announcements."));
  });
}

function newsPaintPostMedia(items) {
  const rows = Array.isArray(items) ? items.filter((item) => item && item.url) : [];
  if (!rows.length) return null;
  const host = adminEl("div", rows.length > 1 ? "post-media post-media-multi" : "post-media");
  rows.forEach((item) => {
    const mime = String(item.mime || "").toLowerCase();
    if (mime.indexOf("video/") === 0) {
      const vid = document.createElement("video");
      vid.src = item.url;
      vid.controls = true;
      host.appendChild(vid);
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.name || "";
      host.appendChild(img);
    }
  });
  return host;
}

function newsPaintAttach(items) {
  return newsPaintPostMedia(items);
}

function newsShowError(text) {
  const err = document.getElementById("news-post-error");
  if (!err) return;
  err.textContent = text || "";
  err.hidden = !text;
}

function newsRefreshMarkdown(el) {
  if (typeof mdRefreshComposer === "function") mdRefreshComposer(el);
}

function newsSetAlign(kind, value) {
  const align = value === "center" || value === "right" ? value : "left";
  if (kind === "title") newsTitleAlign = align;
  else newsBodyAlign = align;
  document.querySelectorAll('.news-align[data-align-for="' + kind + '"] .news-align-btn').forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-align") === align);
  });
  const el = document.getElementById(kind === "title" ? "news-title-input" : "news-body-input");
  if (!el) return;
  el.style.textAlign = align;
  const highlight = typeof mdComposerHighlightFor === "function" ? mdComposerHighlightFor(el) : null;
  if (highlight) highlight.style.textAlign = align;
}

function newsSetEventColor(value) {
  newsEventColor = NEWS_EVENT_COLORS[value] ? value : "orange";
  document.querySelectorAll("#news-event-colors .news-event-swatch").forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-color") === newsEventColor);
  });
}

function newsInsertAt(el, text) {
  if (!el) return;
  const start = el.selectionStart != null ? el.selectionStart : el.value.length;
  const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  const next = start + text.length;
  el.focus();
  if (el.setSelectionRange) el.setSelectionRange(next, next);
  el.dispatchEvent(new Event("input"));
}

function newsFocusField() {
  const title = document.getElementById("news-title-input");
  const body = document.getElementById("news-body-input");
  if (newsFocus === title || newsFocus === body) return newsFocus;
  return body || title;
}

function newsCloseEmoji() {
  const picker = document.getElementById("news-emoji-picker");
  if (picker) picker.hidden = true;
}

function newsFileMime(file) {
  if (file && file.type && NEWS_MEDIA_MIME[file.type]) return NEWS_MEDIA_MIME[file.type];
  const name = ((file && file.name) || "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  return "";
}

function newsRejectFile(file) {
  const name = ((file && file.name) || "").toLowerCase();
  if (name.endsWith(".mov")) return "Use mp4 or webm. iPhone .mov files are not supported yet.";
  if (!newsFileMime(file)) return "Only jpeg, png, gif, webp, mp4, or webm.";
  if (file.size > 20 * 1024 * 1024) return "File is over 20 MB.";
  return "";
}

function newsRevokePreview(item) {
  if (item && item.previewUrl && String(item.previewUrl).indexOf("blob:") === 0) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function newsClearMedia() {
  newsMedia.forEach((item) => newsRevokePreview(item));
  newsMedia = [];
  newsPaintStrip();
}

function newsPaintStrip() {
  const host = document.getElementById("news-post-media");
  const add = document.getElementById("news-media-btn");
  if (!host) return;
  host.replaceChildren();
  newsMedia.forEach((item, index) => {
    const thumb = adminEl("div", "news-post-thumb");
    const mime = item.file ? newsFileMime(item.file) : String((item.existing && item.existing.mime) || "");
    if (mime.indexOf("video/") === 0) {
      const vid = document.createElement("video");
      vid.src = item.previewUrl;
      vid.muted = true;
      thumb.appendChild(vid);
    } else {
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = "";
      thumb.appendChild(img);
    }
    const clear = adminEl("button", "news-post-thumb-x", "×");
    clear.type = "button";
    clear.addEventListener("click", () => {
      const gone = newsMedia.splice(index, 1)[0];
      newsRevokePreview(gone);
      newsPaintStrip();
    });
    thumb.appendChild(clear);
    host.appendChild(thumb);
  });
  if (add) host.appendChild(add);
  host.classList.toggle("has-files", newsMedia.length > 0);
  host.classList.toggle("is-full", newsMedia.length >= 4);
}

function newsAddFiles(list) {
  const incoming = [...list];
  for (const file of incoming) {
    if (newsMedia.length >= 4) {
      newsShowError("Up to 4 files on a post.");
      break;
    }
    const reason = newsRejectFile(file);
    if (reason) {
      newsShowError(reason);
      continue;
    }
    newsMedia.push({ file: file, previewUrl: URL.createObjectURL(file) });
  }
  newsPaintStrip();
}

function newsStamp(date, time) {
  if (!date || !time) return "";
  const local = new Date(date + "T" + time);
  if (Number.isNaN(local.getTime())) return "";
  return local.toISOString();
}

function newsSetEventOpen(on) {
  const panel = document.getElementById("news-event-panel");
  if (panel) panel.hidden = !on;
  if (newsEventInput) newsEventInput.checked = !!on;
}

function newsResetComposer() {
  newsEditId = 0;
  newsTitleAlign = "left";
  newsBodyAlign = "left";
  newsEventColor = "orange";
  newsFocus = null;
  newsClearMedia();
  newsCloseEmoji();
  newsShowError("");
  newsSetAlign("title", "left");
  newsSetAlign("body", "left");
  newsSetEventColor("orange");
  newsSetEventOpen(false);
  newsSetEventLock(false);
  const heading = document.getElementById("news-post-heading");
  const save = document.getElementById("news-post-save");
  const title = document.getElementById("news-title-input");
  const body = document.getElementById("news-body-input");
  const name = document.getElementById("news-event-name");
  const date = document.getElementById("news-event-date");
  const start = document.getElementById("news-event-start");
  const end = document.getElementById("news-event-end");
  const desc = document.getElementById("news-event-desc");
  const search = document.getElementById("news-emoji-search");
  if (heading) heading.textContent = "Create Post";
  if (save) save.textContent = "Post";
  if (title) title.value = "";
  if (body) body.value = "";
  if (name) name.value = "";
  if (date) date.value = "";
  if (start) start.value = "";
  if (end) end.value = "";
  if (desc) desc.value = "";
  if (search) search.value = "";
  if (newsCommentsInput) newsCommentsInput.checked = true;
  newsRefreshMarkdown(title);
  newsRefreshMarkdown(body);
  newsRefreshMarkdown(desc);
}

function closeNewsComposer() {
  const overlay = document.getElementById("news-post-overlay");
  if (overlay) overlay.hidden = true;
  newsCloseEmoji();
}

function newsLocalDate(when) {
  if (!when) return "";
  return when.getFullYear() + "-" + String(when.getMonth() + 1).padStart(2, "0") + "-" + String(when.getDate()).padStart(2, "0");
}

function newsLocalTime(when) {
  if (!when) return "";
  return String(when.getHours()).padStart(2, "0") + ":" + String(when.getMinutes()).padStart(2, "0");
}

function newsEventStarted(event) {
  const when = newsParseWhen(event && event.starts_at);
  return !!(when && when.getTime() <= Date.now());
}

function newsSetEventLock(on) {
  newsEventLocked = !!on;
  if (newsEventInput) newsEventInput.disabled = newsEventLocked;
  ["news-event-name", "news-event-date", "news-event-start", "news-event-end", "news-event-desc"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = newsEventLocked;
  });
  const colors = document.getElementById("news-event-colors");
  if (colors) colors.classList.toggle("is-locked", newsEventLocked);
}

function fillNewsComposer(row) {
  newsEditId = Number(row.id) || 0;
  const heading = document.getElementById("news-post-heading");
  const save = document.getElementById("news-post-save");
  if (heading) heading.textContent = "Edit Post";
  if (save) save.textContent = "Save";
  const title = document.getElementById("news-title-input");
  const body = document.getElementById("news-body-input");
  if (title) title.value = row.title || "";
  if (body) body.value = row.body || "";
  newsSetAlign("title", row.title_align || "left");
  newsSetAlign("body", row.body_align || "left");
  if (newsCommentsInput) newsCommentsInput.checked = row.comments_open !== false;
  (row.attachment || []).forEach((item) => {
    if (!item || !item.url) return;
    newsMedia.push({ existing: item, previewUrl: item.url });
  });
  newsPaintStrip();
  const event = row.event;
  if (event && event.starts_at) {
    const start = newsParseWhen(event.starts_at);
    const end = newsParseWhen(event.ends_at);
    const name = document.getElementById("news-event-name");
    const date = document.getElementById("news-event-date");
    const startEl = document.getElementById("news-event-start");
    const endEl = document.getElementById("news-event-end");
    const desc = document.getElementById("news-event-desc");
    if (name) name.value = event.name || "";
    if (date && start) date.value = newsLocalDate(start);
    if (startEl && start) startEl.value = newsLocalTime(start);
    if (endEl && end) endEl.value = newsLocalTime(end);
    if (desc) desc.value = event.description || "";
    newsSetEventColor(event.color || "orange");
    newsSetEventOpen(true);
    if (newsEventStarted(event)) newsSetEventLock(true);
    newsRefreshMarkdown(desc);
  }
  newsRefreshMarkdown(title);
  newsRefreshMarkdown(body);
}

function openNewsComposer(row) {
  bindNewsComposer();
  bindNewsOverlays();
  newsResetComposer();
  if (row && row.id) fillNewsComposer(row);
  const overlay = document.getElementById("news-post-overlay");
  if (overlay) overlay.hidden = false;
  const title = document.getElementById("news-title-input");
  if (title) title.focus();
}

function newsFillEmoji(query) {
  const host = document.getElementById("news-emoji-grid");
  if (!host) return;
  host.replaceChildren();
  const pack = typeof EMOJI_PACK !== "undefined" ? EMOJI_PACK : null;
  const cats = (pack && pack.categories) || [];
  const needle = String(query || "").trim().toLowerCase();
  cats.forEach((cat) => {
    if (!needle && cat.id !== "people") return;
    (cat.items || []).forEach((item) => {
      if (needle && String(item.name || "").indexOf(needle) < 0 && String(item.ch || "").indexOf(needle) < 0) return;
      const btn = adminEl("button", "news-emoji-cell", item.ch);
      btn.type = "button";
      btn.title = item.name || "";
      btn.addEventListener("click", () => {
        newsInsertAt(newsFocusField(), item.ch);
      });
      host.appendChild(btn);
    });
  });
}

function newsOpenEmoji() {
  const picker = document.getElementById("news-emoji-picker");
  const btn = document.getElementById("news-emoji-btn");
  if (!picker || !btn) return;
  picker.hidden = !picker.hidden;
  if (picker.hidden) return;
  const search = document.getElementById("news-emoji-search");
  newsFillEmoji(search && search.value);
  const box = btn.getBoundingClientRect();
  picker.style.left = Math.max(12, Math.min(box.left, window.innerWidth - 332)) + "px";
  picker.style.top = "auto";
  picker.style.bottom = (window.innerHeight - box.top + 8) + "px";
}

async function newsUploadFiles() {
  const uploaded = [];
  for (const item of newsMedia) {
    if (item.existing && item.existing.key) {
      uploaded.push({
        key: item.existing.key,
        mime: item.existing.mime,
        size: item.existing.size || 0,
        name: item.existing.name || ""
      });
      continue;
    }
    const mime = newsFileMime(item.file);
    const intentRes = await fetch("https://" + API_HOST + "/upload_intent", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: mime,
        size: item.file.size,
        filename: item.file.name || "",
        purpose: "chat"
      })
    });
    const intent = await intentRes.json().catch(() => ({}));
    if (!intentRes.ok) throw new Error(intent.detail || "Could not start upload.");
    const putRes = await fetch(intent.upload_url, {
      method: "PUT",
      headers: { "Content-Type": intent.mime },
      body: item.file
    });
    if (!putRes.ok) throw new Error("Upload was rejected.");
    uploaded.push({
      key: intent.key,
      mime: intent.mime,
      size: item.file.size,
      name: item.file.name || ""
    });
  }
  return uploaded;
}

function bindNewsComposer() {
  if (newsComposerBound) return;
  newsComposerBound = true;
  const commentsSlot = document.getElementById("news-comments-slot");
  const eventSlot = document.getElementById("news-event-slot");
  if (commentsSlot && typeof usersToggle === "function") {
    const comments = usersToggle(true);
    comments.input.id = "news-comments-input";
    commentsSlot.appendChild(comments.label);
    newsCommentsInput = comments.input;
  }
  if (eventSlot && typeof usersToggle === "function") {
    const event = usersToggle(false);
    event.input.id = "news-event-input";
    event.input.addEventListener("change", () => {
      if (newsEventLocked) {
        event.input.checked = true;
        newsSetEventOpen(true);
        return;
      }
      newsSetEventOpen(event.input.checked);
    });
    eventSlot.appendChild(event.label);
    newsEventInput = event.input;
  }
  document.querySelectorAll(".news-align-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.closest(".news-align") && btn.closest(".news-align").getAttribute("data-align-for");
      newsSetAlign(kind, btn.getAttribute("data-align"));
    });
  });
  document.querySelectorAll("#news-event-colors .news-event-swatch").forEach((btn) => {
    btn.addEventListener("click", () => newsSetEventColor(btn.getAttribute("data-color")));
  });
  const title = document.getElementById("news-title-input");
  const body = document.getElementById("news-body-input");
  if (typeof bindComposerMarkdown === "function") {
    bindComposerMarkdown(title);
    bindComposerMarkdown(body);
    bindComposerMarkdown(document.getElementById("news-event-desc"));
  }
  if (title) title.addEventListener("focus", () => { newsFocus = title; });
  if (body) body.addEventListener("focus", () => { newsFocus = body; });
  const emojiBtn = document.getElementById("news-emoji-btn");
  if (emojiBtn) emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    newsOpenEmoji();
  });
  const emojiSearch = document.getElementById("news-emoji-search");
  if (emojiSearch) emojiSearch.addEventListener("input", () => newsFillEmoji(emojiSearch.value));
  const picker = document.getElementById("news-emoji-picker");
  if (picker) picker.addEventListener("click", (e) => e.stopPropagation());
  const mediaBtn = document.getElementById("news-media-btn");
  const mediaInput = document.getElementById("news-media-input");
  if (mediaBtn && mediaInput) {
    mediaBtn.addEventListener("click", () => {
      mediaInput.value = "";
      mediaInput.click();
    });
    mediaInput.addEventListener("change", () => {
      if (mediaInput.files && mediaInput.files.length) newsAddFiles(mediaInput.files);
    });
  }
  const overlay = document.getElementById("news-post-overlay");
  if (overlay) overlay.addEventListener("click", (event) => {
    if (event.target && event.target.id === "news-post-overlay") closeNewsComposer();
  });
  const close = document.getElementById("news-post-close");
  const cancel = document.getElementById("news-post-cancel");
  const save = document.getElementById("news-post-save");
  if (close) close.addEventListener("click", closeNewsComposer);
  if (cancel) cancel.addEventListener("click", closeNewsComposer);
  if (save) save.addEventListener("click", submitNewsPost);
  document.addEventListener("click", () => newsCloseEmoji());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const pickerOpen = document.getElementById("news-emoji-picker");
    if (pickerOpen && !pickerOpen.hidden) {
      newsCloseEmoji();
      return;
    }
    const deleteOpen = document.getElementById("news-delete-overlay");
    if (deleteOpen && !deleteOpen.hidden) return;
    const eventOpen = document.getElementById("news-event-overlay");
    if (eventOpen && !eventOpen.hidden) return;
    const overlayOpen = document.getElementById("news-post-overlay");
    if (overlayOpen && !overlayOpen.hidden) closeNewsComposer();
  });
}

function submitNewsPost() {
  if (newsPosting) return;
  const titleEl = document.getElementById("news-title-input");
  const bodyEl = document.getElementById("news-body-input");
  const title = titleEl ? titleEl.value.trim() : "";
  const body = bodyEl ? bodyEl.value.trim() : "";
  if (!title) {
    newsShowError("Title is required.");
    return;
  }
  if (!body && !newsMedia.length) {
    newsShowError("Post is empty.");
    return;
  }
  let event = null;
  if (newsEventInput && newsEventInput.checked) {
    const name = (document.getElementById("news-event-name") || {}).value || "";
    const date = (document.getElementById("news-event-date") || {}).value || "";
    const start = (document.getElementById("news-event-start") || {}).value || "";
    const end = (document.getElementById("news-event-end") || {}).value || "";
    const desc = (document.getElementById("news-event-desc") || {}).value || "";
    const startsAt = newsStamp(date, start);
    const endsAt = newsStamp(date, end);
    if (!name.trim()) {
      newsShowError("Event name is required.");
      return;
    }
    if (!startsAt || !endsAt) {
      newsShowError("Event date and times are required.");
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      newsShowError("Event end must be after start.");
      return;
    }
    event = {
      name: name.trim(),
      starts_at: startsAt,
      ends_at: endsAt,
      description: desc.trim(),
      color: newsEventColor
    };
  }
  newsPosting = true;
  const save = document.getElementById("news-post-save");
  if (save) save.disabled = true;
  newsShowError("");
  newsUploadFiles().then((attachments) => {
    const payload = {
      title: title,
      body: body,
      comments_open: !newsCommentsInput || newsCommentsInput.checked,
      title_align: newsTitleAlign,
      body_align: newsBodyAlign,
      attachments: attachments
    };
    if (newsEditId) payload.post_id = newsEditId;
    if (!newsEventLocked) payload.event = event;
    return adminApi(newsEditId ? "/news/posts/edit" : "/news/posts", {
      method: "POST",
      body: payload
    }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data })));
  }).then((result) => {
    newsPosting = false;
    if (save) save.disabled = false;
    if (!result.ok) {
      const detail = result.data && result.data.detail;
      newsShowError(typeof detail === "string" ? detail : (newsEditId ? "Could not save that announcement." : "Could not post that announcement."));
      return;
    }
    applyNewsUpdated(result.data);
    closeNewsComposer();
  }).catch((err) => {
    newsPosting = false;
    if (save) save.disabled = false;
    newsShowError((err && err.message) || (newsEditId ? "Could not save that announcement." : "Could not post that announcement."));
  });
}

function paintNewsAnnouncements(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Announcements"],
    title: "Announcements",
    note: "Post site-wide News. Everyone is alerted, and a red count stays on the News tab until they open it.",
    clock: "est"
  }));
  const bar = adminEl("div", "news-composer-bar");
  const idle = adminEl("div", "news-composer-idle");
  idle.id = "news-composer-idle";
  const search = adminEl("input", "news-search");
  search.type = "search";
  search.placeholder = "Search";
  search.value = newsQuery;
  search.addEventListener("input", () => {
    newsQuery = search.value || "";
    window.clearTimeout(newsSearchTimer);
    newsSearchTimer = window.setTimeout(() => loadNewsPosts(), 250);
  });
  const create = adminEl("button", "admin-mod-confirm");
  create.type = "button";
  create.textContent = "New Post";
  create.addEventListener("click", openNewsComposer);
  idle.appendChild(search);
  idle.appendChild(create);
  bar.appendChild(idle);
  main.appendChild(bar);
  const list = adminEl("div", "news-announce-list");
  list.id = "news-admin-posts";
  main.appendChild(list);
  paintNewsPostList();
  loadNewsPosts();
}

function newsDonateWhen(raw) {
  if (typeof usersWhen === "function") return usersWhen(raw);
  return raw || "—";
}

function newsDonateDelta(now, prev, suffix) {
  if (typeof overviewPct === "function") return overviewPct(now, prev, suffix);
  return { text: "0% " + suffix, tone: "flat" };
}

function paintNewsDonate(main, stats) {
  if (stats === undefined) {
    paintNewsDonate(main, null);
    adminApi("/admin/kofi/stats").then((response) => response.ok ? response.json() : null).then((data) => {
      if (adminPage !== "news" || adminSection !== "donate") return;
      const host = document.getElementById("admin-main");
      if (!host) return;
      host.innerHTML = "";
      paintNewsDonate(host, data || {});
    }).catch(() => {});
    return;
  }
  const data = stats || {};
  const bars = (data.bars && data.bars.length) ? data.bars.map((bar) => ({
    label: bar.label,
    value: Number(bar.value) || 0
  })) : [{ label: "—", value: 0 }];
  const max = Math.max.apply(null, bars.map((bar) => Number(bar.value) || 0).concat([1]));
  const incomeDelta = newsDonateDelta(data.income_24h_raw, data.income_prev_raw, "vs previous day");
  const weekDelta = newsDonateDelta(data.week_raw, data.prev_week_raw, "vs previous week");
  const dayCount = Number(data.payments_24h) || 0;
  const donationsShare = dayCount ? Math.round(((Number(data.donations_24h) || 0) * 1000) / dayCount) / 10 : 0;
  const subsShare = dayCount ? Math.round(((Number(data.subscriptions_24h) || 0) * 1000) / dayCount) / 10 : 0;
  main.className = "is-fit";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Donate"],
    title: "Donate",
    note: "Ko-fi income for Oneira. Donations and memberships are the two sources that count here.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  let bannerLead = data.connected ? "Ko-fi connected" : "Ko-fi webhook idle";
  if (data.last_webhook_at && !data.last_webhook_ok) bannerLead = "Ko-fi webhook rejected";
  main.appendChild(adminBanner(
    bannerLead,
    adminNum(data.donations || 0) + " donations · " + adminNum(data.subscriptions || 0) + " membership payments."
  ));
  adminKpiRow(main, [
    {
      label: "Income",
      value: data.income || "$0.00",
      icon: "activity",
      detail: "Donations + memberships",
      delta: incomeDelta.text,
      tone: incomeDelta.tone
    },
    {
      label: "Donations",
      value: adminNum(data.donations),
      icon: "plus",
      detail: "One-off tips",
      delta: adminNum(data.donations_24h) + " in the last 24h",
      tone: Number(data.donations_24h) > 0 ? "up" : "flat"
    },
    {
      label: "Subscriptions",
      value: adminNum(data.subscriptions),
      icon: "users",
      detail: "Membership payments",
      delta: adminNum(data.subscriptions_24h) + " in the last 24h",
      tone: Number(data.subscriptions_24h) > 0 ? "up" : "flat"
    },
    {
      label: "Last 24h",
      value: data.income_24h || "$0.00",
      icon: "chart",
      detail: "Income in this window",
      delta: incomeDelta.text,
      tone: incomeDelta.tone
    }
  ]);
  const dash = adminEl("div", "overview-dash");
  const left = adminEl("div", "overview-stack");
  const growthPanel = adminPanel({ title: "Income", meta: "Last 7 days" });
  const line = adminEl("div", "overview-growth-line");
  const total = adminEl("div", "overview-growth-n", data.week || "$0.00");
  total.appendChild(adminEl("span", "", "this week"));
  line.appendChild(total);
  line.appendChild(adminEl("div", "overview-delta is-" + weekDelta.tone, weekDelta.text));
  growthPanel.body.appendChild(line);
  growthPanel.body.appendChild(adminBarChart({
    max: max,
    scale: [String(max), String(Math.round(max / 2 * 10) / 10), "0"],
    bars: bars
  }));
  left.appendChild(growthPanel.panel);
  const recentRows = (data.recent || []).map((row) => [
    row.kind || "—",
    row.from_name || "Anonymous",
    row.amount || "$0.00",
    newsDonateWhen(row.paid_at),
    row.is_public ? "Public" : "Private"
  ]);
  const recent = adminPanel({
    title: "Recent payments",
    meta: "Latest " + adminNum(recentRows.length),
    foot: "From Ko-fi · webhook only"
  });
  recent.body.appendChild(adminTable(
    ["Type", "From", "Amount", "When", "Public"],
    recentRows.length ? recentRows : [["No payments yet", "", "", "", ""]]
  ));
  left.appendChild(recent.panel);
  const right = adminEl("div", "overview-stack");
  const mix = adminPanel({ title: "Mix", meta: "Last 24h" });
  mix.body.appendChild(adminPulse(
    [
      { label: "Webhook", pill: data.connected ? "Connected" : "Idle" },
      { label: "Donations", value: adminNum(data.donations_24h), delta: donationsShare + "%", tone: "flat" },
      { label: "Subscriptions", value: adminNum(data.subscriptions_24h), delta: subsShare + "%", tone: "flat" },
      { label: "Public payments", value: adminNum(data.public_24h), delta: adminNum(data.public_24h) + " of " + adminNum(dayCount), tone: "flat" }
    ],
    "Shop orders and commissions are not counted on this page."
  ));
  right.appendChild(mix.panel);
  const noting = adminPanel({ title: "Worth noting", meta: "Today" });
  noting.body.appendChild(adminNotes([
    {
      title: "History",
      copy: "Ko-fi does not send payments from before the webhook. This page only shows what Oneira has received."
    }
  ]));
  right.appendChild(noting.panel);
  dash.appendChild(left);
  dash.appendChild(right);
  main.appendChild(dash);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function loadNewsEvents(done) {
  adminApi("/news/events").then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    newsEvents = (data && data.events) || [];
    if (typeof done === "function") done();
  }).catch(() => {
    if (typeof done === "function") done();
  });
}

function paintNewsEvents(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Events"],
    title: "Events",
    note: "Site-wide shutdowns and updates. Create the event from Announcements. Click an event for details.",
    clock: "est"
  }));
  const board = adminEl("div", "news-cal-board");
  const tools = adminEl("div", "news-cal-toolbar");
  const prev = adminEl("button", "news-cal-nav", "‹");
  prev.type = "button";
  const label = adminEl("div", "news-cal-label", NEWS_MONTHS[newsCal.getMonth()] + " " + newsCal.getFullYear());
  const next = adminEl("button", "news-cal-nav", "›");
  next.type = "button";
  prev.addEventListener("click", () => {
    newsCal.setMonth(newsCal.getMonth() - 1);
    label.textContent = NEWS_MONTHS[newsCal.getMonth()] + " " + newsCal.getFullYear();
    paintNewsMonth(grid);
  });
  next.addEventListener("click", () => {
    newsCal.setMonth(newsCal.getMonth() + 1);
    label.textContent = NEWS_MONTHS[newsCal.getMonth()] + " " + newsCal.getFullYear();
    paintNewsMonth(grid);
  });
  tools.appendChild(prev);
  tools.appendChild(label);
  tools.appendChild(next);
  board.appendChild(tools);
  const grid = adminEl("div", "news-cal-grid");
  board.appendChild(grid);
  main.appendChild(board);
  paintNewsMonth(grid);
  loadNewsEvents(() => {
    if (adminPage !== "news" || adminSection !== "events") return;
    paintNewsMonth(grid);
  });
}

function newsBroadcastColorClass(color) {
  return NEWS_EVENT_COLORS[color] ? " is-" + color : "";
}

function paintNewsBroadcastBannerHost(host, data) {
  if (!host) return;
  const payload = typeof data === "string" ? { message: data } : (data || {});
  const text = String(payload.message || "").trim();
  const color = payload.color || "";
  host.replaceChildren();
  host.className = "news-broadcast-preview" + newsBroadcastColorClass(color) + (text ? "" : " is-later");
  if (!text) {
    host.textContent = "Broadcast";
    return;
  }
  fillNewsMarkdown(host, text);
}

function paintNewsBroadcastHistory(host, rows) {
  if (!host) return;
  host.replaceChildren();
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    host.appendChild(adminEl("div", "users-empty", "No broadcasts yet."));
    return;
  }
  list.forEach((row) => {
    const item = adminEl("div", "news-broadcast-item");
    item.appendChild(adminEl("span", "news-broadcast-dot" + newsBroadcastColorClass(row.color)));
    const body = adminEl("div", "news-broadcast-item-body");
    const top = adminEl("div", "news-broadcast-item-top");
    top.appendChild(adminEl("span", "admin-pill", row.kind === "automatic" ? "Automatic" : "Manual"));
    if (row.live) top.appendChild(adminEl("span", "admin-pill is-live", "Live"));
    const when = newsDonateWhen(row.starts_at);
    const until = row.cleared_at ? newsDonateWhen(row.cleared_at) : (row.ends_at ? newsDonateWhen(row.ends_at) : "");
    top.appendChild(adminEl("span", "news-broadcast-when", until ? when + " – " + until : when));
    body.appendChild(top);
    if (row.event_name) body.appendChild(adminEl("div", "news-broadcast-event", row.event_name));
    const text = adminEl("div", "news-broadcast-item-text");
    if (row.message) fillNewsMarkdown(text, row.message);
    else text.textContent = "—";
    body.appendChild(text);
    item.appendChild(body);
    host.appendChild(item);
  });
}

function paintNewsBroadcast(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Broadcast"],
    title: "Broadcast",
    note: "Manual broadcasts sit on the top rail for the hours you set. Events post themselves 48 hours before they start and come down when they end.",
    clock: "est"
  }));
  const preview = adminEl("div", "news-broadcast-preview is-later");
  preview.id = "news-broadcast-preview";
  preview.textContent = "Broadcast";
  main.appendChild(preview);
  const panel = adminPanel({ title: "Broadcast", className: "news-broadcast-set" });
  panel.body.appendChild(adminEl("div", "users-field-k", "Description"));
  const area = adminEl("textarea", "admin-mod-reason");
  area.id = "news-broadcast-input";
  area.rows = 5;
  area.maxLength = 500;
  area.placeholder = "Maintenance window, outage, or other site-wide notice";
  const wrap = adminEl("div", "composer-field news-md-field news-broadcast-field");
  const highlight = adminEl("div", "composer-highlight");
  highlight.setAttribute("aria-hidden", "true");
  wrap.appendChild(highlight);
  wrap.appendChild(area);
  panel.body.appendChild(wrap);
  if (typeof bindComposerMarkdown === "function") bindComposerMarkdown(area);
  panel.body.appendChild(adminEl("div", "users-field-k", "Color"));
  const colors = adminEl("div", "news-event-colors");
  colors.id = "news-broadcast-colors";
  ["red", "orange", "yellow", "green"].forEach((color) => {
    const btn = adminEl("button", "news-event-swatch is-" + color + (color === "orange" ? " is-on" : ""));
    btn.type = "button";
    btn.setAttribute("data-color", color);
    btn.title = color.charAt(0).toUpperCase() + color.slice(1);
    colors.appendChild(btn);
  });
  panel.body.appendChild(colors);
  panel.body.appendChild(adminEl("div", "users-field-k", "Duration"));
  const duration = adminEl("div", "news-broadcast-duration");
  const hours = adminEl("input", "admin-mod-input news-broadcast-hours");
  hours.id = "news-broadcast-hours";
  hours.type = "number";
  hours.min = "1";
  hours.max = "720";
  hours.value = "24";
  const presets = adminEl("div", "news-broadcast-presets");
  [1, 6, 24, 48].forEach((value) => {
    const btn = adminEl("button", "news-align-btn" + (value === 24 ? " is-on" : ""));
    btn.type = "button";
    btn.setAttribute("data-hours", String(value));
    btn.textContent = value + "h";
    presets.appendChild(btn);
  });
  duration.appendChild(presets);
  duration.appendChild(hours);
  panel.body.appendChild(duration);
  const err = adminEl("p", "admin-settings-error");
  err.id = "news-broadcast-error";
  err.hidden = true;
  panel.body.appendChild(err);
  const row = adminEl("div", "news-broadcast-actions");
  const clear = adminEl("button", "admin-mod-cancel");
  clear.type = "button";
  clear.textContent = "Clear";
  const save = adminEl("button", "admin-mod-confirm");
  save.type = "button";
  save.textContent = "Save";
  row.appendChild(clear);
  row.appendChild(save);
  panel.body.appendChild(row);
  main.appendChild(panel.panel);
  const historyPanel = adminPanel({ title: "History", className: "is-fill" });
  const history = adminEl("div", "news-broadcast-history");
  history.id = "news-broadcast-history";
  historyPanel.body.appendChild(history);
  main.appendChild(historyPanel.panel);
  let color = "orange";
  function showBroadcastError(text) {
    err.textContent = text || "";
    err.hidden = !text;
  }
  function setBroadcastColor(value) {
    color = NEWS_EVENT_COLORS[value] ? value : "orange";
    colors.querySelectorAll(".news-event-swatch").forEach((btn) => {
      btn.classList.toggle("is-on", btn.getAttribute("data-color") === color);
    });
  }
  function setBroadcastHours(value) {
    const hoursValue = Math.max(1, Math.min(720, parseInt(value, 10) || 24));
    hours.value = String(hoursValue);
    presets.querySelectorAll(".news-align-btn").forEach((btn) => {
      btn.classList.toggle("is-on", btn.getAttribute("data-hours") === String(hoursValue));
    });
  }
  function applyBroadcastPage(data) {
    const payload = data || {};
    paintNewsBroadcastBannerHost(preview, payload.live || payload);
    paintNewsBroadcastHistory(history, payload.broadcasts || []);
  }
  function busy(on) {
    clear.disabled = !!on;
    save.disabled = !!on;
  }
  function loadBroadcastPage() {
    adminApi("/news/broadcasts").then((response) => response.ok ? response.json() : null).then((data) => {
      if (adminPage !== "news" || adminSection !== "broadcast") return;
      applyBroadcastPage(data || {});
    }).catch(() => {});
  }
  colors.querySelectorAll(".news-event-swatch").forEach((btn) => {
    btn.addEventListener("click", () => setBroadcastColor(btn.getAttribute("data-color")));
  });
  presets.querySelectorAll(".news-align-btn").forEach((btn) => {
    btn.addEventListener("click", () => setBroadcastHours(btn.getAttribute("data-hours")));
  });
  hours.addEventListener("input", () => setBroadcastHours(hours.value));
  clear.addEventListener("click", () => {
    showBroadcastError("");
    busy(true);
    adminApi("/news/broadcast/clear", { method: "POST", body: {} }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
      busy(false);
      if (!result.ok) {
        const detail = result.data && result.data.detail;
        showBroadcastError(typeof detail === "string" ? detail : "Could not clear the broadcast.");
        return;
      }
      loadBroadcastPage();
    }).catch(() => {
      busy(false);
      showBroadcastError("Could not clear the broadcast.");
    });
  });
  save.addEventListener("click", () => {
    showBroadcastError("");
    busy(true);
    adminApi("/news/broadcast", {
      method: "POST",
      body: {
        message: area.value,
        color: color,
        duration_hours: parseInt(hours.value, 10) || 24
      }
    }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
      busy(false);
      if (!result.ok) {
        const detail = result.data && result.data.detail;
        showBroadcastError(typeof detail === "string" ? detail : "Could not save the broadcast.");
        return;
      }
      area.value = "";
      if (typeof mdRefreshComposer === "function") mdRefreshComposer(area);
      setBroadcastColor("orange");
      setBroadcastHours(24);
      loadBroadcastPage();
    }).catch(() => {
      busy(false);
      showBroadcastError("Could not save the broadcast.");
    });
  });
  paintNewsBroadcastHistory(history, []);
  loadBroadcastPage();
}

function fillNewsDonateCard(disclaimer, href) {
  const note = document.getElementById("news-donate-disclaimer");
  const text = String(disclaimer || "").trim();
  if (note) {
    if (text) fillNewsMarkdown(note, text);
    else note.textContent = "Disclaimer will be set later.";
  }
  const go = document.getElementById("news-donate-continue");
  if (!go) return;
  const url = String(href || "").trim();
  go.dataset.href = url;
  go.disabled = !(url && text);
}

function openNewsDonateCard(disclaimer, href) {
  fillNewsDonateCard(disclaimer, href);
  const overlay = document.getElementById("news-donate-overlay");
  if (!overlay) return;
  overlay.hidden = false;
}

function closeNewsDonateCard() {
  const overlay = document.getElementById("news-donate-overlay");
  if (overlay) overlay.hidden = true;
}

function paintNews(main, sectionId) {
  if (sectionId === "donate") return paintNewsDonate(main);
  if (sectionId === "events") return paintNewsEvents(main);
  if (sectionId === "broadcast") return paintNewsBroadcast(main);
  paintNewsAnnouncements(main);
}

registerAdminPage({
  id: "news",
  label: "News",
  sections: [
    { id: "announcements", label: "Announcements", icon: "flag" },
    { id: "donate", label: "Donate", icon: "plus" },
    { id: "events", label: "Events", icon: "calendar" },
    { id: "broadcast", label: "Broadcast", icon: "activity" }
  ],
  paint: paintNews
});

function applyNewsUpdated(row) {
  if (!row || !row.id) return;
  const i = newsPosts.findIndex((item) => Number(item.id) === Number(row.id));
  if (i >= 0) newsPosts[i] = row;
  else newsPosts.unshift(row);
  newsEvents = newsEvents.filter((item) => Number(item.id) !== Number(row.id));
  if (row.event && row.event.starts_at) newsEvents.push(row.event);
  paintNewsPostList();
  const grid = document.querySelector("#admin-main .news-cal-grid");
  if (grid) paintNewsMonth(grid);
  if (newsDetailEvent && Number(newsDetailEvent.id) === Number(row.id)) {
    newsDetailEvent = row.event || newsDetailEvent;
  }
}

function applyNewsDeleted(postId) {
  newsPosts = newsPosts.filter((item) => Number(item.id) !== Number(postId));
  newsEvents = newsEvents.filter((item) => Number(item.id) !== Number(postId));
  if (newsEditId && Number(newsEditId) === Number(postId)) closeNewsComposer();
  if (newsDetailEvent && Number(newsDetailEvent.id) === Number(postId)) closeNewsEventDetail();
  if (newsDeleteId && Number(newsDeleteId) === Number(postId)) closeNewsDelete();
  paintNewsPostList();
  const grid = document.querySelector("#admin-main .news-cal-grid");
  if (grid) paintNewsMonth(grid);
}

function showNewsPostContextMenu(e, row) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof openContextMenu !== "function") return;
  openContextMenu(e.clientX, e.clientY, {
    avatarText: typeof usersLetter === "function" ? usersLetter(row.display_name || row.username) : (row.username || "?").charAt(0),
    title: row.display_name || row.username || "kiwi",
    timestamp: newsWhen(row.created_at),
    subtitle: typeof truncateForContextMenu === "function" ? truncateForContextMenu(row.title) : row.title
  }, [
    { label: "Edit Post", onSelect: () => openNewsComposer(row) },
    { label: "Delete Post", danger: true, onSelect: () => openNewsDelete(row) }
  ]);
}

function newsEventWhenText(event) {
  const start = newsParseWhen(event && event.starts_at);
  const end = newsParseWhen(event && event.ends_at);
  if (!start) return "—";
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = days[start.getDay()] + ", " + NEWS_MONTHS[start.getMonth()] + " " + start.getDate();
  function clock(when) {
    let h = when.getHours();
    const m = String(when.getMinutes()).padStart(2, "0");
    const am = h < 12 ? "AM" : "PM";
    h = h % 12 || 12;
    return h + ":" + m + " " + am;
  }
  return day + " · " + clock(start) + (end ? " – " + clock(end) : "");
}

function newsShowEventError(text) {
  const err = document.getElementById("news-event-error");
  if (!err) return;
  err.textContent = text || "";
  err.hidden = !text;
}

function newsSetDetailColor(value) {
  newsDetailColor = NEWS_EVENT_COLORS[value] ? value : "orange";
  document.querySelectorAll("#news-detail-colors .news-event-swatch").forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-color") === newsDetailColor);
  });
}

function newsFillEventForm(event) {
  const start = newsParseWhen(event && event.starts_at);
  const end = newsParseWhen(event && event.ends_at);
  const name = document.getElementById("news-detail-name");
  const date = document.getElementById("news-detail-date");
  const startEl = document.getElementById("news-detail-start");
  const endEl = document.getElementById("news-detail-end");
  const desc = document.getElementById("news-detail-desc");
  if (name) name.value = (event && event.name) || "";
  if (date) date.value = newsLocalDate(start);
  if (startEl) startEl.value = newsLocalTime(start);
  if (endEl) endEl.value = newsLocalTime(end);
  if (desc) desc.value = (event && event.description) || "";
  newsSetDetailColor((event && event.color) || "orange");
  newsRefreshMarkdown(desc);
}

function newsShowEventMode(editing) {
  newsDetailEditing = !!editing;
  const view = document.getElementById("news-event-view");
  const form = document.getElementById("news-event-form");
  const cancel = document.getElementById("news-event-cancel");
  const action = document.getElementById("news-event-action");
  if (view) view.hidden = newsDetailEditing;
  if (form) form.hidden = !newsDetailEditing;
  if (cancel) cancel.textContent = newsDetailEditing ? "Cancel" : "Close";
  if (action) action.textContent = newsDetailEditing ? "Save" : "Edit";
}

function closeNewsEventDetail() {
  const overlay = document.getElementById("news-event-overlay");
  if (overlay) overlay.hidden = true;
  newsDetailEvent = null;
  newsDetailEditing = false;
  newsShowEventError("");
}

function openNewsEventDetail(event) {
  if (!event) return;
  bindNewsOverlays();
  newsDetailEvent = event;
  newsShowEventError("");
  newsShowEventMode(false);
  const overlay = document.getElementById("news-event-overlay");
  const heading = document.getElementById("news-event-heading");
  const when = document.getElementById("news-event-when");
  const note = document.getElementById("news-event-note");
  const dot = document.getElementById("news-event-dot");
  const action = document.getElementById("news-event-action");
  if (heading) heading.textContent = event.name || "Event";
  if (when) when.textContent = newsEventWhenText(event);
  if (note) {
    const text = String(event.description || "").trim();
    if (text) fillNewsMarkdown(note, text);
    else note.textContent = "No additional information";
  }
  if (dot) dot.style.background = newsEventHex(event.color);
  if (action) action.hidden = newsEventStarted(event);
  newsFillEventForm(event);
  if (overlay) overlay.hidden = false;
}

function newsEventCancel() {
  if (newsDetailEditing) {
    newsShowEventError("");
    newsFillEventForm(newsDetailEvent);
    newsShowEventMode(false);
    return;
  }
  closeNewsEventDetail();
}

function newsEventAction() {
  if (!newsDetailEvent) return;
  if (!newsDetailEditing) {
    if (newsEventStarted(newsDetailEvent)) return;
    newsShowEventMode(true);
    return;
  }
  const name = (document.getElementById("news-detail-name") || {}).value || "";
  const date = (document.getElementById("news-detail-date") || {}).value || "";
  const start = (document.getElementById("news-detail-start") || {}).value || "";
  const end = (document.getElementById("news-detail-end") || {}).value || "";
  const desc = (document.getElementById("news-detail-desc") || {}).value || "";
  const startsAt = newsStamp(date, start);
  const endsAt = newsStamp(date, end);
  if (!name.trim()) {
    newsShowEventError("Event name is required.");
    return;
  }
  if (!startsAt || !endsAt) {
    newsShowEventError("Event date and times are required.");
    return;
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    newsShowEventError("Event end must be after start.");
    return;
  }
  if (newsSaving) return;
  newsSaving = true;
  const action = document.getElementById("news-event-action");
  if (action) action.disabled = true;
  newsShowEventError("");
  adminApi("/news/events/edit", {
    method: "POST",
    body: {
      post_id: newsDetailEvent.id,
      name: name.trim(),
      starts_at: startsAt,
      ends_at: endsAt,
      description: desc.trim(),
      color: newsDetailColor
    }
  }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
    newsSaving = false;
    if (action) action.disabled = false;
    if (!result.ok) {
      const detail = result.data && result.data.detail;
      newsShowEventError(typeof detail === "string" ? detail : "Could not save that event.");
      return;
    }
    applyNewsUpdated(result.data);
    openNewsEventDetail((result.data && result.data.event) || newsDetailEvent);
  }).catch(() => {
    newsSaving = false;
    if (action) action.disabled = false;
    newsShowEventError("Could not save that event.");
  });
}

function newsShowDeleteError(text) {
  const err = document.getElementById("news-delete-error");
  if (!err) return;
  err.textContent = text || "";
  err.hidden = !text;
}

function closeNewsDelete() {
  const overlay = document.getElementById("news-delete-overlay");
  if (overlay) overlay.hidden = true;
  newsDeleteId = 0;
  newsShowDeleteError("");
}

function openNewsDelete(row) {
  if (!row || !row.id) return;
  bindNewsOverlays();
  newsDeleteId = Number(row.id) || 0;
  newsShowDeleteError("");
  const copy = document.getElementById("news-delete-copy");
  if (copy) copy.textContent = "This announcement will be removed for everyone.";
  const overlay = document.getElementById("news-delete-overlay");
  if (overlay) overlay.hidden = false;
}

function confirmNewsDelete() {
  if (!newsDeleteId || newsSaving) return;
  newsSaving = true;
  const confirm = document.getElementById("news-delete-confirm");
  if (confirm) confirm.disabled = true;
  newsShowDeleteError("");
  adminApi("/news/posts/delete", {
    method: "POST",
    body: { post_id: newsDeleteId }
  }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
    newsSaving = false;
    if (confirm) confirm.disabled = false;
    if (!result.ok) {
      const detail = result.data && result.data.detail;
      newsShowDeleteError(typeof detail === "string" ? detail : "Could not delete that announcement.");
      return;
    }
    const gone = result.data && result.data.post_id ? result.data.post_id : newsDeleteId;
    closeNewsDelete();
    applyNewsDeleted(gone);
  }).catch(() => {
    newsSaving = false;
    if (confirm) confirm.disabled = false;
    newsShowDeleteError("Could not delete that announcement.");
  });
}

function bindNewsOverlays() {
  if (newsOverlaysBound) return;
  newsOverlaysBound = true;
  if (typeof bindComposerMarkdown === "function") bindComposerMarkdown(document.getElementById("news-detail-desc"));
  document.querySelectorAll("#news-detail-colors .news-event-swatch").forEach((btn) => {
    btn.addEventListener("click", () => newsSetDetailColor(btn.getAttribute("data-color")));
  });
  const eventOverlay = document.getElementById("news-event-overlay");
  if (eventOverlay) eventOverlay.addEventListener("click", (e) => {
    if (e.target && e.target.id === "news-event-overlay") closeNewsEventDetail();
  });
  const eventClose = document.getElementById("news-event-close");
  const eventCancel = document.getElementById("news-event-cancel");
  const eventAction = document.getElementById("news-event-action");
  if (eventClose) eventClose.addEventListener("click", closeNewsEventDetail);
  if (eventCancel) eventCancel.addEventListener("click", newsEventCancel);
  if (eventAction) eventAction.addEventListener("click", newsEventAction);
  const deleteOverlay = document.getElementById("news-delete-overlay");
  if (deleteOverlay) deleteOverlay.addEventListener("click", (e) => {
    if (e.target && e.target.id === "news-delete-overlay") closeNewsDelete();
  });
  const deleteClose = document.getElementById("news-delete-close");
  const deleteCancel = document.getElementById("news-delete-cancel");
  const deleteConfirm = document.getElementById("news-delete-confirm");
  if (deleteClose) deleteClose.addEventListener("click", closeNewsDelete);
  if (deleteCancel) deleteCancel.addEventListener("click", closeNewsDelete);
  if (deleteConfirm) deleteConfirm.addEventListener("click", confirmNewsDelete);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const deleteOpen = document.getElementById("news-delete-overlay");
    if (deleteOpen && !deleteOpen.hidden) {
      closeNewsDelete();
      return;
    }
    const eventOpen = document.getElementById("news-event-overlay");
    if (eventOpen && !eventOpen.hidden) {
      newsEventCancel();
    }
  });
}

document.addEventListener("click", (event) => {
  if (event.target && event.target.id === "news-donate-overlay") closeNewsDonateCard();
});
const newsDonateCancel = document.getElementById("news-donate-cancel");
if (newsDonateCancel) newsDonateCancel.addEventListener("click", closeNewsDonateCard);
const newsDonateContinue = document.getElementById("news-donate-continue");
if (newsDonateContinue) {
  newsDonateContinue.addEventListener("click", () => {
    const href = newsDonateContinue.dataset.href || "";
    if (href) window.open(href, "_blank", "noopener,noreferrer");
    closeNewsDonateCard();
  });
}
bindNewsOverlays();
