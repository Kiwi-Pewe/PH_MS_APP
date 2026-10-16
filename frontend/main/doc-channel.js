let currentDocEntries = [];
let docEntryMode = "list";
let docEntryId = null;
let docEntrySnapshot = "";
let docPageAlign = "left";
let docPageScale = "normal";
let docTitleAlign = "left";
let docCommentBefore = "";
let docCommentAfterId = 0;
let docCommentHasMore = false;
let docCommentLoading = false;

function docEntryStamp(value) {
  if (!value) return null;
  if (typeof parseUtcTimestamp === "function") return parseUtcTimestamp(value);
  return new Date(value);
}

function docEntryAgo(value) {
  const then = docEntryStamp(value);
  if (!then || Number.isNaN(then.getTime())) return "Updated just now";
  const seconds = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return "Updated just now";
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return "Updated " + minutes + (minutes === 1 ? " minute ago" : " minutes ago");
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return "Updated " + hours + (hours === 1 ? " hour ago" : " hours ago");
  }
  const days = Math.floor(seconds / 86400);
  return "Updated " + days + (days === 1 ? " day ago" : " days ago");
}

function docEntryPreview(body) {
  const text = String(body || "").replace(/[*_~`|]/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= 140) return text;
  return text.slice(0, 137) + "...";
}


function docEntryDraft() {
  const title = document.getElementById("doc-channel-title");
  const body = document.getElementById("doc-channel-body");
  return (title ? title.value : "") + "\n" + (body ? body.value : "") + "\n" + docPageAlign + "\n" + docPageScale + "\n" + docTitleAlign;
}

function docPageChoice(value, allowed, fallback) {
  const text = String(value || "").toLowerCase();
  return allowed.indexOf(text) === -1 ? fallback : text;
}

function setDocPageFromEntry(entry) {
  docPageAlign = docPageChoice(entry && entry.text_align, ["left", "center", "right"], "left");
  docPageScale = docPageChoice(entry && entry.text_scale, ["small", "normal", "large"], "normal");
  docTitleAlign = docPageChoice(entry && entry.title_align, ["left", "center", "right"], "left");
}

function fitDocField(input) {
  if (!input || input.hidden) return;
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
  if (typeof refreshComposerMentions === "function") refreshComposerMentions(input);
}

function fitDocTitle() {
  fitDocField(document.getElementById("doc-channel-title"));
}

function fitDocBody() {
  fitDocField(document.getElementById("doc-channel-body"));
}

function setDocComposerHidden(input, hidden) {
  if (!input) return;
  input.hidden = hidden;
  const field = input.closest(".composer-field");
  if (field) field.hidden = hidden;
  const editor = input.closest(".doc-body-editor");
  if (editor) editor.hidden = hidden;
}

function syncDocCommentCompose() {
  const send = document.getElementById("doc-comment-send");
  const input = document.getElementById("doc-comment-input");
  const ready = !!docEntryId;
  if (send) send.disabled = !ready;
  if (input) {
    input.disabled = !ready;
    input.placeholder = ready ? "Add a comment..." : "Save the document before commenting";
  }
}

function showDocChannelToolbar(on) {
  const section = document.getElementById("doc-channel-toolbar");
  const host = document.getElementById("doc-channel-toolbar-host");
  if (section) section.hidden = !on;
  if (on && host && typeof mountDocsToolbar === "function") mountDocsToolbar(host, "docs");
  else if (typeof unmountDocsToolbar === "function") unmountDocsToolbar("docs");
}

function paintDocPageSettings() {
  const page = document.getElementById("doc-channel-page");
  if (page) {
    page.dataset.align = docPageAlign;
    page.dataset.titleAlign = docTitleAlign;
  }
  [["docs-align-left-btn", "left"], ["docs-align-center-btn", "center"], ["docs-align-right-btn", "right"]].forEach(([id, value]) => {
    const button = document.getElementById(id);
    if (button && currentChannelType === "docs") button.classList.toggle("is-on", docPageAlign === value);
    else if (button) button.classList.remove("is-on");
  });
}

function hideDocChannelChrome() {
  showDocChannelToolbar(false);
  ["doc-channel-back", "doc-channel-edit", "doc-channel-menu", "doc-channel-add", "doc-channel-save"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const pins = document.getElementById("channel-pins-btn");
  if (pins && currentChannelType !== "docs") pins.style.display = "";
}

function showDocChannelButton(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = on ? "inline-flex" : "none";
}

function canCreateDocEntries() {
  return typeof channelPerm === "function" && channelPerm("create_docs");
}

function canManageDocEntries() {
  return typeof channelPerm === "function" && channelPerm("manage_docs");
}

function canRemoveDocEntries() {
  return typeof channelPerm === "function" && channelPerm("remove_docs");
}

function canEditDocEntry(entry) {
  if (!entry) return canCreateDocEntries();
  if (Number(entry.sender_id) === Number(myUserId)) return true;
  return canManageDocEntries();
}

function canDeleteDocEntry(entry) {
  if (!entry) return false;
  if (Number(entry.sender_id) === Number(myUserId)) return true;
  return canRemoveDocEntries();
}

function docEntryMenuOptions(entry, includeOpen) {
  const options = [];
  if (includeOpen) options.push({ label: "Open", onSelect: () => openDocEntry(entry) });
  if (canEditDocEntry(entry)) options.push({ label: "Edit", onSelect: () => openDocEntryEditor(entry) });
  options.push({ label: "Move", disabled: true });
  if (canDeleteDocEntry(entry)) options.push({ label: "Delete", danger: true, onSelect: () => deleteDocEntry(entry.id) });
  return options;
}

function openDocEntryMenu(event, entry, includeOpen) {
  event.preventDefault();
  event.stopPropagation();
  if (!entry || typeof openContextMenu !== "function") return;
  openContextMenu(event.clientX, event.clientY, null, docEntryMenuOptions(entry, includeOpen));
}

function syncDocChannelMenu(entry) {
  const el = document.getElementById("doc-channel-menu");
  if (!el) return;
  const open = (docEntryMode === "read" || docEntryMode === "edit") && !!entry;
  el.style.display = open ? "inline-flex" : "none";
  el.disabled = !open;
}

function docEntryFaceSource(entry) {
  const member = (typeof memberList !== "undefined" ? memberList : []).find((row) => Number(row.id) === Number(entry && entry.sender_id));
  if (member) return member;
  return { id: entry && entry.sender_id, username: entry && entry.sender_username };
}

function paintDocChannelList() {
  const grid = document.getElementById("doc-channel-grid");
  const page = document.getElementById("doc-channel-page");
  if (page) page.hidden = true;
  if (grid) grid.hidden = false;
  showDocChannelButton("doc-channel-add", canCreateDocEntries());
  showDocChannelButton("doc-channel-back", false);
  showDocChannelButton("doc-channel-edit", false);
  showDocChannelButton("doc-channel-save", false);
  syncDocChannelMenu(null);
  if (!grid) return;
  grid.replaceChildren();
  if (!currentDocEntries.length) {
    const empty = document.createElement("div");
    empty.className = "doc-channel-empty";
    empty.textContent = "No documents yet.";
    grid.appendChild(empty);
    return;
  }
  currentDocEntries.forEach((entry) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "doc-channel-card";
    const copy = document.createElement("div");
    copy.className = "doc-channel-card-copy";
    const title = document.createElement("div");
    title.className = "doc-channel-card-title";
    title.textContent = entry.title || "Untitled document";
    const preview = document.createElement("div");
    preview.className = "doc-channel-card-preview";
    preview.textContent = docEntryPreview(entry.body) || "Empty document";
    copy.appendChild(title);
    copy.appendChild(preview);
    const foot = document.createElement("div");
    foot.className = "doc-channel-card-foot";
    const face = document.createElement("span");
    face.className = "avatar-dot";
    const source = docEntryFaceSource(entry);
    if (typeof paintUserFace === "function") {
      paintUserFace(face, source, { userId: entry.sender_id, name: entry.sender_username, circle: true });
    }
    const meta = document.createElement("div");
    const name = document.createElement("div");
    name.className = "doc-channel-card-name";
    name.textContent = entry.sender_username || "Someone";
    if (typeof applyServerNameColor === "function") applyServerNameColor(name, entry.sender_id);
    const when = document.createElement("div");
    when.className = "doc-channel-card-when";
    when.textContent = docEntryAgo(entry.updated_at || entry.created_at);
    meta.appendChild(name);
    meta.appendChild(when);
    foot.appendChild(face);
    foot.appendChild(meta);
    card.appendChild(copy);
    card.appendChild(foot);
    card.addEventListener("click", () => openDocEntry(entry));
    card.addEventListener("contextmenu", (event) => openDocEntryMenu(event, entry, true));
    grid.appendChild(card);
  });
}

function paintDocChannelAuthor(entry) {
  const host = document.getElementById("doc-channel-author");
  if (!host) return;
  host.replaceChildren();
  if (!entry) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const face = document.createElement("button");
  face.type = "button";
  face.className = "avatar-dot doc-channel-author-face";
  const name = entry.sender_username || "Someone";
  const source = docEntryFaceSource(entry);
  if (typeof paintUserFace === "function") paintUserFace(face, source, { userId: entry.sender_id, name, circle: true });
  face.addEventListener("click", (event) => {
    event.stopPropagation();
    if (typeof openMiniProfile === "function") openMiniProfile(entry.sender_id, face);
  });
  const text = document.createElement("div");
  const nameBtn = document.createElement("button");
  nameBtn.type = "button";
  nameBtn.className = "doc-channel-author-name";
  nameBtn.textContent = name;
  if (typeof applyServerNameColor === "function") applyServerNameColor(nameBtn, entry.sender_id);
  nameBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (typeof openMiniProfile === "function") openMiniProfile(entry.sender_id, nameBtn);
  });
  text.appendChild(nameBtn);
  if (entry.sender_role) {
    const roleLine = document.createElement("div");
    roleLine.className = "doc-channel-author-role";
    roleLine.textContent = entry.sender_role;
    text.appendChild(roleLine);
  }
  host.appendChild(face);
  host.appendChild(text);
}

function openDocEntry(entry) {
  docEntryMode = "read";
  docEntryId = entry ? entry.id : null;
  const grid = document.getElementById("doc-channel-grid");
  const page = document.getElementById("doc-channel-page");
  const titleRead = document.getElementById("doc-channel-title-read");
  const titleInput = document.getElementById("doc-channel-title");
  const bodyRead = document.getElementById("doc-channel-body-read");
  const bodyInput = document.getElementById("doc-channel-body");
  if (grid) grid.hidden = true;
  if (page) page.hidden = false;
  if (titleRead) {
    titleRead.hidden = false;
    titleRead.replaceChildren();
    if (typeof mdAppend === "function") mdAppend(titleRead, entry ? (entry.title || "Untitled document") : "Untitled document");
    else titleRead.textContent = entry ? (entry.title || "Untitled document") : "Untitled document";
  }
  setDocComposerHidden(titleInput, true);
  showDocChannelToolbar(false);
  if (bodyRead) {
    bodyRead.hidden = false;
    bodyRead.replaceChildren();
    if (typeof mdAppend === "function") mdAppend(bodyRead, entry ? (entry.body || "") : "");
    else bodyRead.textContent = entry ? (entry.body || "") : "";
  }
  setDocComposerHidden(bodyInput, true);
  setDocPageFromEntry(entry);
  paintDocPageSettings();
  paintDocChannelAuthor(entry);
  showDocChannelButton("doc-channel-add", false);
  showDocChannelButton("doc-channel-back", true);
  showDocChannelButton("doc-channel-edit", canEditDocEntry(entry));
  showDocChannelButton("doc-channel-save", false);
  const titleMenu = document.getElementById("doc-title-menu");
  if (titleMenu) titleMenu.hidden = true;
  syncDocChannelMenu(entry);
  syncDocCommentCompose();
  loadDocComments(true);
}

function openDocEntryEditor(entry) {
  docEntryMode = "edit";
  docEntryId = entry ? entry.id : null;
  const grid = document.getElementById("doc-channel-grid");
  const page = document.getElementById("doc-channel-page");
  const titleRead = document.getElementById("doc-channel-title-read");
  const titleInput = document.getElementById("doc-channel-title");
  const bodyRead = document.getElementById("doc-channel-body-read");
  const bodyInput = document.getElementById("doc-channel-body");
  const author = document.getElementById("doc-channel-author");
  if (grid) grid.hidden = true;
  if (page) page.hidden = false;
  if (titleRead) titleRead.hidden = true;
  if (titleInput) titleInput.value = entry ? (entry.title || "") : "";
  setDocComposerHidden(titleInput, false);
  showDocChannelToolbar(true);
  if (bodyRead) bodyRead.hidden = true;
  if (bodyInput) bodyInput.value = entry ? (entry.body || "") : "";
  setDocComposerHidden(bodyInput, false);
  if (author) {
    author.hidden = true;
    author.replaceChildren();
  }
  setDocPageFromEntry(entry);
  paintDocPageSettings();
  docEntrySnapshot = docEntryDraft();
  showDocChannelButton("doc-channel-add", false);
  showDocChannelButton("doc-channel-back", true);
  showDocChannelButton("doc-channel-edit", false);
  showDocChannelButton("doc-channel-save", true);
  const titleMenu = document.getElementById("doc-title-menu");
  if (titleMenu) titleMenu.hidden = false;
  syncDocChannelMenu(entry);
  fitDocTitle();
  fitDocBody();
  if (titleInput) titleInput.focus();
  syncDocCommentCompose();
  loadDocComments(true);
}

function docEntryDirty() {
  return docEntryMode === "edit" && docEntryDraft() !== docEntrySnapshot;
}

function leaveDocEntryEditor() {
  if (docEntryDirty() && !window.confirm("Leave this document without saving?")) return false;
  return true;
}

function showDocChannelList() {
  if (!leaveDocEntryEditor()) return;
  docEntryMode = "list";
  docEntryId = null;
  paintDocChannelList();
}

function applyDocEntry(entry) {
  if (!entry || Number(entry.channel_id) !== Number(currentChannelId)) return;
  const index = currentDocEntries.findIndex((row) => Number(row.id) === Number(entry.id));
  if (index === -1) currentDocEntries.unshift(entry);
  else currentDocEntries[index] = entry;
  currentDocEntries.sort((a, b) => {
    const left = docEntryStamp(b.updated_at || b.created_at);
    const right = docEntryStamp(a.updated_at || a.created_at);
    return (left ? left.getTime() : 0) - (right ? right.getTime() : 0);
  });
  if (docEntryMode === "list") paintDocChannelList();
  else if (docEntryMode === "read" && Number(docEntryId) === Number(entry.id)) openDocEntry(entry);
}

async function loadDocEntries(channelId) {
  docEntryMode = "list";
  docEntryId = null;
  currentDocEntries = [];
  const pins = document.getElementById("channel-pins-btn");
  if (pins) pins.style.display = "none";
  paintDocChannelList();
  const response = await fetch(`https://${serverAddress}/get_doc_entries/${channelId}`, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || Number(currentChannelId) !== Number(channelId)) return;
  currentDocEntries = data.docs || [];
  if (docEntryMode === "list") paintDocChannelList();
}

async function saveDocEntry() {
  if (docEntryMode !== "edit" || !currentChannelId) return;
  const title = document.getElementById("doc-channel-title");
  const body = document.getElementById("doc-channel-body");
  const fields = {
    title: title ? title.value : "",
    body: body ? body.value : "",
    text_align: docPageAlign,
    text_scale: docPageScale,
    title_align: docTitleAlign,
  };
  const path = docEntryId ? "edit_doc_entry" : "create_doc_entry";
  const payload = docEntryId ? Object.assign({ doc_id: docEntryId }, fields) : Object.assign({ channel_id: currentChannelId }, fields);
  const response = await fetch(`https://${serverAddress}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not save that document.");
    return;
  }
  applyDocEntry(data);
  docEntrySnapshot = docEntryDraft();
  openDocEntry(data);
}

function removeDocEntry(docId) {
  currentDocEntries = currentDocEntries.filter((row) => Number(row.id) !== Number(docId));
  if (Number(docEntryId) === Number(docId)) {
    docEntryMode = "list";
    docEntryId = null;
    docEntrySnapshot = "";
    paintDocChannelList();
    return;
  }
  if (docEntryMode === "list") paintDocChannelList();
}

async function deleteDocEntry(docId) {
  if (!docId) return;
  const response = await fetch(`https://${serverAddress}/delete_doc_entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ doc_id: docId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not delete that document.");
    return;
  }
  removeDocEntry(data.doc_id || docId);
}
const docChannelAdd = document.getElementById("doc-channel-add");
if (docChannelAdd) {
  docChannelAdd.addEventListener("click", () => {
    if (!canCreateDocEntries()) return;
    openDocEntryEditor(null);
  });
}
const docChannelBack = document.getElementById("doc-channel-back");
if (docChannelBack) docChannelBack.addEventListener("click", showDocChannelList);
const docChannelEdit = document.getElementById("doc-channel-edit");
if (docChannelEdit) {
  docChannelEdit.addEventListener("click", () => {
    const entry = currentDocEntries.find((row) => Number(row.id) === Number(docEntryId));
    if (entry) openDocEntryEditor(entry);
  });
}
const docChannelSave = document.getElementById("doc-channel-save");
if (docChannelSave) docChannelSave.addEventListener("click", saveDocEntry);
function docInsert(text) {
  const area = document.getElementById("doc-channel-body");
  if (!area || docEntryMode !== "edit") return;
  const start = area.selectionStart;
  const end = area.selectionEnd;
  area.value = area.value.slice(0, start) + text + area.value.slice(end);
  const cursor = start + text.length;
  area.focus();
  area.setSelectionRange(cursor, cursor);
  fitDocBody();
}

function docWrap(open, close) {
  const area = document.getElementById("doc-channel-body");
  if (!area || docEntryMode !== "edit") return;
  const start = area.selectionStart;
  const end = area.selectionEnd;
  const selected = area.value.slice(start, end);
  const wrapped = open + selected + close;
  area.value = area.value.slice(0, start) + wrapped + area.value.slice(end);
  const cursor = start + open.length + selected.length + (selected ? close.length : 0);
  area.focus();
  area.setSelectionRange(cursor, cursor);
  fitDocBody();
}

async function docUploadImage(file) {
  const intentRes = await fetch(`https://${serverAddress}/upload_intent`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content_type: file.type || "image/png",
      size: file.size,
      filename: file.name || ""
    })
  });
  const intent = await intentRes.json().catch(() => ({}));
  if (!intentRes.ok) throw new Error(intent.detail || "Could not start upload.");
  const putRes = await fetch(intent.upload_url, {
    method: "PUT",
    headers: { "Content-Type": intent.mime || file.type },
    body: file
  });
  if (!putRes.ok) throw new Error("Could not upload that image.");
  return intent.public_url;
}

function paintDocComment(comment) {
  const list = document.getElementById("doc-comment-list");
  if (list && comment.id && list.querySelector('[data-comment-id="' + comment.id + '"]')) return null;
  const row = document.createElement("div");
  row.className = "announce-comment";
  if (comment.id) row.dataset.commentId = comment.id;
  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  if (typeof paintUserFace === "function") paintUserFace(avatar, comment, { name: comment.username, userId: comment.sender_id });
  else avatar.textContent = (comment.username || "?").charAt(0).toUpperCase();
  const body = document.createElement("div");
  body.className = "announce-comment-body";
  const header = document.createElement("div");
  header.className = "announce-comment-header";
  const name = document.createElement("span");
  name.className = "announce-comment-name";
  name.textContent = comment.username || "Someone";
  if (typeof applyServerNameColor === "function") applyServerNameColor(name, comment.sender_id);
  header.appendChild(name);
  if (comment.created_at && typeof formatClusterTime === "function" && typeof parseUtcTimestamp === "function") {
    const time = document.createElement("span");
    time.className = "announce-comment-time";
    time.textContent = formatClusterTime(parseUtcTimestamp(comment.created_at));
    header.appendChild(time);
  }
  const text = document.createElement("div");
  text.className = "announce-comment-content";
  if (typeof mdAppend === "function") mdAppend(text, comment.content || "");
  else text.textContent = comment.content || "";
  body.appendChild(header);
  body.appendChild(text);
  row.appendChild(avatar);
  row.appendChild(body);
  return row;
}

async function loadDocComments(reset) {
  const list = document.getElementById("doc-comment-list");
  const more = document.getElementById("doc-comment-more");
  if (!list || !docEntryId || docCommentLoading) return;
  const count = document.getElementById("doc-comment-count");
  if (reset) {
    docCommentBefore = new Date().toISOString();
    docCommentAfterId = 0;
    docCommentHasMore = false;
    list.replaceChildren();
    if (count) count.textContent = "0";
  }
  docCommentLoading = true;
  const response = await fetch(`https://${serverAddress}/get_doc_comments/${docEntryId}?limit=20&after_id=${docCommentAfterId}&before=${encodeURIComponent(docCommentBefore)}`, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  docCommentLoading = false;
  if (!response.ok) return;
  (data.comments || []).forEach((comment) => {
    const row = paintDocComment(comment);
    if (row) list.appendChild(row);
    docCommentAfterId = comment.id;
  });
  docCommentHasMore = !!data.has_more;
  if (more) more.hidden = !docCommentHasMore;
  if (count && reset) count.textContent = String(data.total || 0);
}

async function sendDocComment() {
  const input = document.getElementById("doc-comment-input");
  const list = document.getElementById("doc-comment-list");
  if (!input || !docEntryId) return;
  const content = input.value.trim();
  if (!content) return;
  const response = await fetch(`https://${serverAddress}/create_doc_comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ doc_id: docEntryId, content })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return;
  input.value = "";
  if (typeof refreshComposerMentions === "function") refreshComposerMentions(input);
  const row = paintDocComment(data);
  if (list && row) list.appendChild(row);
  const count = document.getElementById("doc-comment-count");
  if (count && row) count.textContent = String(Number(count.textContent || 0) + 1);
}

function docChannelApplyFormat(kind, value) {
  if (docEntryMode !== "edit") return;
  if (kind === "size") docWrap("$S" + value + "(", ")");
  else if (kind === "color") docWrap("$C" + String(value).toUpperCase() + "(", ")");
  else if (kind === "highlight") docWrap("$H" + String(value).toUpperCase() + "(", ")");
  else if (kind === "align") {
    docPageAlign = value;
    paintDocPageSettings();
  }
}

const docBodyPlusBtn = document.getElementById("doc-body-plus-btn");
const docImageFile = document.getElementById("doc-image-file");
if (docBodyPlusBtn && docImageFile) {
  docBodyPlusBtn.addEventListener("click", () => docImageFile.click());
  docImageFile.addEventListener("change", async () => {
    const file = docImageFile.files && docImageFile.files[0];
    docImageFile.value = "";
    if (!file) return;
    try {
      const url = await docUploadImage(file);
      if (url) docInsert("![](" + url + ")");
    } catch (err) {
      return;
    }
  });
}
const docTitleMenu = document.getElementById("doc-title-menu");
if (docTitleMenu) {
  docTitleMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    if (docEntryMode !== "edit" || typeof openContextMenu !== "function") return;
    const rect = docTitleMenu.getBoundingClientRect();
    openContextMenu(rect.left, rect.bottom + 4, null, [
      { label: "Align left", onSelect: () => { docTitleAlign = "left"; paintDocPageSettings(); } },
      { label: "Align center", onSelect: () => { docTitleAlign = "center"; paintDocPageSettings(); } },
      { label: "Align right", onSelect: () => { docTitleAlign = "right"; paintDocPageSettings(); } }
    ]);
  });
}
const docCommentMore = document.getElementById("doc-comment-more");
if (docCommentMore) docCommentMore.addEventListener("click", () => loadDocComments(false));
const docCommentSend = document.getElementById("doc-comment-send");
if (docCommentSend) docCommentSend.addEventListener("click", sendDocComment);
const docCommentInput = document.getElementById("doc-comment-input");
if (docCommentInput) {
  docCommentInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendDocComment(); });
  docCommentInput.addEventListener("contextmenu", (e) => e.stopPropagation());
  if (typeof bindMentionComposer === "function") bindMentionComposer(docCommentInput);
}
const docBodyEmojiBtn = document.getElementById("doc-body-emoji-btn");
if (docBodyEmojiBtn) {
  docBodyEmojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof openEmojiPicker === "function") openEmojiPicker(docBodyEmojiBtn, document.getElementById("doc-channel-body"), e.clientX, e.clientY);
  });
}
const docChannelView = document.getElementById("doc-channel-view");
if (docChannelView) {
  docChannelView.addEventListener("scroll", () => {
    if (!docCommentHasMore || docCommentLoading || docEntryMode === "list") return;
    if (docChannelView.scrollTop + docChannelView.clientHeight >= docChannelView.scrollHeight - 80) loadDocComments(false);
  });
}
const docChannelBody = document.getElementById("doc-channel-body");
if (docChannelBody && typeof bindMentionComposer === "function") bindMentionComposer(docChannelBody);
if (docChannelBody) {
  docChannelBody.addEventListener("input", () => {
    if (typeof applyEmojiShortcodesToInput === "function") applyEmojiShortcodesToInput(docChannelBody);
    fitDocBody();
  });
}
const docChannelTitle = document.getElementById("doc-channel-title");
if (docChannelTitle && typeof bindMentionComposer === "function") bindMentionComposer(docChannelTitle);
if (docChannelTitle) {
  docChannelTitle.addEventListener("input", () => {
    if (typeof applyEmojiShortcodesToInput === "function") applyEmojiShortcodesToInput(docChannelTitle);
    fitDocTitle();
  });
  docChannelTitle.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
}
const docChannelMenu = document.getElementById("doc-channel-menu");
if (docChannelMenu) {
  docChannelMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    const entry = currentDocEntries.find((row) => Number(row.id) === Number(docEntryId));
    if (!entry || typeof openContextMenu !== "function") return;
    const rect = docChannelMenu.getBoundingClientRect();
    openContextMenu(rect.left, rect.bottom + 4, null, docEntryMenuOptions(entry, false));
  });
}
