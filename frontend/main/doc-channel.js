let currentDocEntries = [];
let docEntryMode = "list";
let docEntryId = null;
let docEntrySnapshot = "";

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
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (text.length <= 140) return text;
  return text.slice(0, 137) + "...";
}

function docEntryDraft() {
  const title = document.getElementById("doc-channel-title");
  const body = document.getElementById("doc-channel-body");
  return (title ? title.value : "") + "\n" + (body ? body.value : "");
}

function hideDocChannelChrome() {
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

function canEditDocEntry(entry) {
  if (!entry) return true;
  if (Number(entry.sender_id) === Number(myUserId)) return true;
  return currentServerOwnerId === myUserId;
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
  showDocChannelButton("doc-channel-add", true);
  showDocChannelButton("doc-channel-back", false);
  showDocChannelButton("doc-channel-edit", false);
  showDocChannelButton("doc-channel-menu", false);
  showDocChannelButton("doc-channel-save", false);
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
  const toolbar = document.getElementById("doc-channel-toolbar");
  if (grid) grid.hidden = true;
  if (page) page.hidden = false;
  if (titleRead) {
    titleRead.hidden = false;
    titleRead.textContent = entry ? (entry.title || "Untitled document") : "Untitled document";
  }
  if (titleInput) titleInput.hidden = true;
  if (toolbar) toolbar.hidden = true;
  if (bodyRead) {
    bodyRead.hidden = false;
    bodyRead.textContent = entry ? (entry.body || "") : "";
  }
  if (bodyInput) bodyInput.hidden = true;
  paintDocChannelAuthor(entry);
  showDocChannelButton("doc-channel-add", false);
  showDocChannelButton("doc-channel-back", true);
  showDocChannelButton("doc-channel-edit", canEditDocEntry(entry));
  showDocChannelButton("doc-channel-menu", true);
  showDocChannelButton("doc-channel-save", false);
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
  const toolbar = document.getElementById("doc-channel-toolbar");
  const author = document.getElementById("doc-channel-author");
  if (grid) grid.hidden = true;
  if (page) page.hidden = false;
  if (titleRead) titleRead.hidden = true;
  if (titleInput) {
    titleInput.hidden = false;
    titleInput.value = entry ? (entry.title || "") : "";
  }
  if (toolbar) toolbar.hidden = false;
  if (bodyRead) bodyRead.hidden = true;
  if (bodyInput) {
    bodyInput.hidden = false;
    bodyInput.value = entry ? (entry.body || "") : "";
  }
  if (author) {
    author.hidden = true;
    author.replaceChildren();
  }
  docEntrySnapshot = docEntryDraft();
  showDocChannelButton("doc-channel-add", false);
  showDocChannelButton("doc-channel-back", true);
  showDocChannelButton("doc-channel-edit", false);
  showDocChannelButton("doc-channel-menu", false);
  showDocChannelButton("doc-channel-save", true);
  if (titleInput) titleInput.focus();
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

const docChannelAdd = document.getElementById("doc-channel-add");
if (docChannelAdd) docChannelAdd.addEventListener("click", () => openDocEntryEditor(null));
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
