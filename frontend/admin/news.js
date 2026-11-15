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
  const card = adminEl("article", "news-announce-card");
  const head = adminEl("div", "news-announce-head");
  const top = adminEl("div", "news-announce-top");
  const face = adminEl("div", "users-entry-face");
  if (typeof usersFace === "function") usersFace(face, row, row.display_name || row.username);
  const names = adminEl("div", "news-announce-meta");
  names.appendChild(adminEl("div", "news-announce-name", row.display_name || row.username || "kiwi"));
  names.appendChild(adminEl("div", "news-announce-date", newsWhen(row.created_at)));
  top.appendChild(face);
  top.appendChild(names);
  head.appendChild(top);
  const title = adminEl("div", "news-announce-title");
  title.style.textAlign = row.title_align || "left";
  fillNewsMarkdown(title, row.title || "—");
  if (row.edited) title.appendChild(adminEl("span", "edited-tag", "edited"));
  head.appendChild(title);
  card.appendChild(head);
  const body = adminEl("div", "news-announce-body");
  body.style.textAlign = row.body_align || "left";
  const source = String(row.body || "").trim();
  if (source) fillNewsMarkdown(body, source);
  else body.textContent = "No additional information";
  card.appendChild(body);
  const media = newsPaintAttach(row.attachment);
  if (media) card.appendChild(media);
  if (row.event && row.event.name) {
    const chip = adminEl("div", "news-event-chip is-" + (row.event.color || "orange"));
    chip.style.background = newsEventHex(row.event.color);
    chip.appendChild(adminEl("span", "news-event-chip-dot"));
    chip.appendChild(document.createTextNode(row.event.name));
    card.appendChild(chip);
  }
  const foot = adminEl("div", "news-announce-foot");
  foot.appendChild(adminEl("span", "", adminNum(row.comment_count) + " comments"));
  foot.appendChild(adminEl("span", "", "Reactions"));
  card.appendChild(foot);
  return card;
}

function paintNewsPostList() {
  const host = document.getElementById("news-admin-posts");
  if (!host) return;
  host.innerHTML = "";
  newsPosts.forEach((row) => host.appendChild(paintNewsPostCard(row)));
  host.appendChild(adminEl("div", "news-end", newsPosts.length ? "You're up to date!" : (newsQuery ? "No announcements matched that search." : "You're up to date!")));
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
    host.appendChild(adminEl("div", "news-end", "Could not load announcements."));
  });
}

function newsPaintAttach(items) {
  const rows = Array.isArray(items) ? items.filter((item) => item && item.url) : [];
  if (!rows.length) return null;
  const host = adminEl("div", "news-announce-media");
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

function newsShowError(text) {
  const err = document.getElementById("news-post-error");
  if (!err) return;
  err.textContent = text || "";
  err.hidden = !text;
}

function newsSetAlign(kind, value) {
  const align = value === "center" || value === "right" ? value : "left";
  if (kind === "title") newsTitleAlign = align;
  else newsBodyAlign = align;
  document.querySelectorAll('.news-align[data-align-for="' + kind + '"] .news-align-btn').forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-align") === align);
  });
  const el = document.getElementById(kind === "title" ? "news-title-input" : "news-body-input");
  if (el) el.style.textAlign = align;
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

function newsClearMedia() {
  newsMedia.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
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
    const mime = newsFileMime(item.file);
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
      if (gone && gone.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      newsPaintStrip();
    });
    thumb.appendChild(clear);
    host.appendChild(thumb);
  });
  if (add) host.appendChild(add);
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
  const title = document.getElementById("news-title-input");
  const body = document.getElementById("news-body-input");
  const name = document.getElementById("news-event-name");
  const date = document.getElementById("news-event-date");
  const start = document.getElementById("news-event-start");
  const end = document.getElementById("news-event-end");
  const desc = document.getElementById("news-event-desc");
  const search = document.getElementById("news-emoji-search");
  if (title) title.value = "";
  if (body) body.value = "";
  if (name) name.value = "";
  if (date) date.value = "";
  if (start) start.value = "";
  if (end) end.value = "";
  if (desc) desc.value = "";
  if (search) search.value = "";
  if (newsCommentsInput) newsCommentsInput.checked = true;
}

function closeNewsComposer() {
  const overlay = document.getElementById("news-post-overlay");
  if (overlay) overlay.hidden = true;
  newsCloseEmoji();
}

function openNewsComposer() {
  bindNewsComposer();
  newsResetComposer();
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
    event.input.addEventListener("change", () => newsSetEventOpen(event.input.checked));
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
    return adminApi("/news/posts", {
      method: "POST",
      body: {
        title: title,
        body: body,
        comments_open: !newsCommentsInput || newsCommentsInput.checked,
        title_align: newsTitleAlign,
        body_align: newsBodyAlign,
        attachments: attachments,
        event: event
      }
    }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data })));
  }).then((result) => {
    newsPosting = false;
    if (save) save.disabled = false;
    if (!result.ok) {
      const detail = result.data && result.data.detail;
      newsShowError(typeof detail === "string" ? detail : "Could not post that announcement.");
      return;
    }
    if (result.data && result.data.id) newsPosts.unshift(result.data);
    if (result.data && result.data.event) newsEvents.push(result.data.event);
    closeNewsComposer();
    paintNewsPostList();
  }).catch((err) => {
    newsPosting = false;
    if (save) save.disabled = false;
    newsShowError((err && err.message) || "Could not post that announcement.");
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
    note: "Read-only calendar of site-wide events. Create the event from Announcements. No RSVP.",
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

function paintNewsBroadcastPreview(host, text) {
  if (!host) return;
  host.replaceChildren();
  const source = String(text || "").trim();
  if (!source) {
    host.textContent = "Broadcast";
    host.classList.add("is-later");
    return;
  }
  host.classList.remove("is-later");
  fillNewsMarkdown(host, source);
}

function paintNewsBroadcast(main) {
  main.className = "is-news";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "News", "Broadcast"],
    title: "Broadcast",
    note: "Stapled to the top rail between the page tabs and Feedback. Stays up until you clear it.",
    clock: "est"
  }));
  const preview = adminEl("div", "news-broadcast-preview");
  preview.id = "news-broadcast-preview";
  main.appendChild(preview);
  const panel = adminPanel({ title: "Alert", fill: true });
  panel.body.appendChild(adminEl("div", "users-field-k", "Message"));
  const area = adminEl("textarea", "admin-mod-reason");
  area.id = "news-broadcast-input";
  area.rows = 5;
  area.maxLength = 500;
  area.placeholder = "Maintenance window, outage, or other site-wide notice";
  area.addEventListener("input", () => paintNewsBroadcastPreview(preview, area.value));
  panel.body.appendChild(area);
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
  function showBroadcastError(text) {
    err.textContent = text || "";
    err.hidden = !text;
  }
  function applyBroadcastMessage(message) {
    area.value = message || "";
    paintNewsBroadcastPreview(preview, area.value);
  }
  clear.addEventListener("click", () => {
    showBroadcastError("");
    clear.disabled = true;
    save.disabled = true;
    adminApi("/news/broadcast", { method: "POST", body: { message: "" } }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
      clear.disabled = false;
      save.disabled = false;
      if (!result.ok) {
        const detail = result.data && result.data.detail;
        showBroadcastError(typeof detail === "string" ? detail : "Could not clear the broadcast.");
        return;
      }
      applyBroadcastMessage("");
    }).catch(() => {
      clear.disabled = false;
      save.disabled = false;
      showBroadcastError("Could not clear the broadcast.");
    });
  });
  save.addEventListener("click", () => {
    showBroadcastError("");
    clear.disabled = true;
    save.disabled = true;
    adminApi("/news/broadcast", { method: "POST", body: { message: area.value } }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
      clear.disabled = false;
      save.disabled = false;
      if (!result.ok) {
        const detail = result.data && result.data.detail;
        showBroadcastError(typeof detail === "string" ? detail : "Could not save the broadcast.");
        return;
      }
      applyBroadcastMessage(result.data && result.data.message);
    }).catch(() => {
      clear.disabled = false;
      save.disabled = false;
      showBroadcastError("Could not save the broadcast.");
    });
  });
  row.appendChild(clear);
  row.appendChild(save);
  panel.body.appendChild(row);
  main.appendChild(panel.panel);
  paintNewsBroadcastPreview(preview, "");
  adminApi("/news/broadcast").then((response) => response.ok ? response.json() : null).then((data) => {
    if (adminPage !== "news" || adminSection !== "broadcast") return;
    applyBroadcastMessage(data && data.message);
  }).catch(() => {});
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
