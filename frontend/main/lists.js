let currentListItems = [];
let listMoveTargets = [];
let listCompletedOpen = false;
let openListThreadId = null;
let openListNoteId = null;
let editingListItemId = null;
const listThreadCache = {};

function listItemById(itemId) {
  return currentListItems.find((item) => Number(item.id) === Number(itemId)) || null;
}

function listWhen(stamp) {
  if (!stamp || typeof formatClusterTime !== "function" || typeof parseUtcTimestamp !== "function") return "";
  return formatClusterTime(parseUtcTimestamp(stamp));
}

function paintListAddState() {
  const title = document.getElementById("lists-title-input");
  const save = document.getElementById("lists-save-btn");
  if (save) save.hidden = !(title && title.value.trim());
}

function renderList() {
  const openHost = document.getElementById("lists-open");
  const doneHost = document.getElementById("lists-completed");
  const toggle = document.getElementById("lists-completed-toggle");
  if (!openHost || !doneHost) return;
  openHost.replaceChildren();
  doneHost.replaceChildren();
  const open = currentListItems.filter((item) => !item.completed);
  const done = currentListItems.filter((item) => item.completed);
  open.forEach((item) => openHost.appendChild(buildListBlock(item)));
  if (toggle) toggle.textContent = done.length + " Completed";
  doneHost.hidden = !listCompletedOpen;
  if (listCompletedOpen) done.forEach((item) => doneHost.appendChild(buildListBlock(item)));
}

function buildListBlock(item) {
  const block = document.createElement("div");
  block.className = "list-block";
  block.dataset.itemId = String(item.id);
  const row = document.createElement("div");
  row.className = "list-row" + (item.completed ? " is-done" : "");
  const box = document.createElement("button");
  box.type = "button";
  box.className = "list-check" + (item.completed ? " is-on" : "");
  box.setAttribute("aria-checked", item.completed ? "true" : "false");
  box.textContent = item.completed ? "\u2713" : "";
  box.addEventListener("click", () => toggleListItem(item));
  row.appendChild(box);
  if (Number(editingListItemId) === Number(item.id)) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "list-edit-input";
    input.maxLength = 200;
    input.value = item.title || "";
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveListTitle(item.id, input.value);
      if (event.key === "Escape") {
        editingListItemId = null;
        renderList();
      }
    });
    input.addEventListener("blur", () => saveListTitle(item.id, input.value));
    row.appendChild(input);
    setTimeout(() => input.focus(), 0);
  } else {
    const title = document.createElement("div");
    title.className = "list-row-title";
    title.textContent = item.title || "Item";
    row.appendChild(title);
  }
  const tools = document.createElement("div");
  tools.className = "list-row-tools";
  const note = document.createElement("button");
  note.type = "button";
  note.className = "list-icon-btn" + (item.note ? " has-note" : "");
  note.title = "Note";
  note.textContent = "\u270E";
  note.addEventListener("click", () => openListNote(item.id));
  const thread = document.createElement("button");
  thread.type = "button";
  thread.className = "list-icon-btn";
  thread.title = "Thread";
  thread.textContent = String(item.thread_count || 0);
  thread.addEventListener("click", () => toggleListThread(item.id));
  const more = document.createElement("button");
  more.type = "button";
  more.className = "list-icon-btn";
  more.title = "More";
  more.textContent = "\u22EE";
  more.addEventListener("click", (event) => openListItemMenu(event, item));
  tools.appendChild(note);
  tools.appendChild(thread);
  tools.appendChild(more);
  row.appendChild(tools);
  row.addEventListener("contextmenu", (event) => openListItemMenu(event, item));
  block.appendChild(row);
  if (Number(openListThreadId) === Number(item.id)) block.appendChild(buildListThread(item));
  return block;
}

function openListItemMenu(event, item) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof openContextMenu !== "function") return;
  const move = (listMoveTargets || []).map((channel) => ({
    label: "#" + (channel.name || "list"),
    onSelect: () => moveListItem(item.id, channel.id),
  }));
  const options = [
    { label: "Edit", onSelect: () => { editingListItemId = item.id; renderList(); } },
    move.length ? { label: "Move to channel", submenu: move } : { label: "Move to channel", disabled: true },
    { label: "Delete", danger: true, onSelect: () => deleteListItem(item.id) },
  ];
  openContextMenu(event.clientX, event.clientY, null, options);
}

function buildListThread(item) {
  const panel = document.createElement("div");
  panel.className = "list-thread";
  const messages = listThreadCache[item.id] || [];
  messages.forEach((message) => {
    const line = document.createElement("div");
    line.className = "list-thread-msg";
    const name = document.createElement("span");
    name.className = "list-thread-name";
    name.textContent = message.username || "Someone";
    const text = document.createElement("span");
    text.className = "list-thread-text";
    text.textContent = message.content || "";
    line.appendChild(name);
    line.appendChild(text);
    panel.appendChild(line);
  });
  const compose = document.createElement("div");
  compose.className = "list-thread-compose";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "list-thread-input";
  input.placeholder = "Message";
  input.maxLength = 2000;
  const send = document.createElement("button");
  send.type = "button";
  send.className = "pill-btn";
  send.textContent = "Send";
  const submit = () => sendListThread(item.id, input);
  send.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit();
  });
  compose.appendChild(input);
  compose.appendChild(send);
  panel.appendChild(compose);
  return panel;
}

async function toggleListThread(itemId) {
  if (Number(openListThreadId) === Number(itemId)) {
    openListThreadId = null;
    renderList();
    return;
  }
  openListThreadId = itemId;
  if (!listThreadCache[itemId]) {
    const response = await fetch(`https://${serverAddress}/list_thread/${itemId}`, { credentials: "include" });
    if (response.ok) {
      const data = await response.json();
      listThreadCache[itemId] = data.messages || [];
    } else {
      listThreadCache[itemId] = [];
    }
  }
  renderList();
}

async function sendListThread(itemId, input) {
  const content = input.value.trim();
  if (!content) return;
  const response = await fetch(`https://${serverAddress}/list_thread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ item_id: itemId, content }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not send that message.");
    return;
  }
  input.value = "";
  applyListThreadMessage(itemId, data.message, data.thread_count);
}

function applyListThreadMessage(itemId, message, threadCount) {
  if (listThreadCache[itemId] && message && !listThreadCache[itemId].some((row) => Number(row.id) === Number(message.id))) {
    listThreadCache[itemId].push(message);
  }
  const item = listItemById(itemId);
  if (item && threadCount != null) item.thread_count = threadCount;
  if (Number(currentChannelId) === Number(item && item.channel_id)) renderList();
}

async function toggleListItem(item) {
  const next = !item.completed;
  item.completed = next;
  renderList();
  const response = await fetch(`https://${serverAddress}/list_item_check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ item_id: item.id, on: next }),
  });
  if (!response.ok) {
    item.completed = !next;
    renderList();
    return;
  }
  const data = await response.json().catch(() => null);
  if (data) applyListItem(data, true);
}

function applyListItem(item, local) {
  if (!item) return;
  if (!local && Number(item.channel_id) !== Number(currentChannelId)) return;
  const index = currentListItems.findIndex((row) => Number(row.id) === Number(item.id));
  if (index === -1) {
    if (Number(item.channel_id) === Number(currentChannelId)) currentListItems.push(item);
  } else {
    currentListItems[index] = Object.assign({}, currentListItems[index], item);
  }
  if (Number(openListNoteId) === Number(item.id)) paintListNote();
  renderList();
}

function appendListItem(item) {
  if (!item || Number(currentChannelId) !== Number(item.channel_id)) return;
  if (listItemById(item.id)) {
    applyListItem(item, true);
    return;
  }
  currentListItems.push(item);
  renderList();
}

function removeListItem(itemId) {
  currentListItems = currentListItems.filter((item) => Number(item.id) !== Number(itemId));
  if (Number(openListNoteId) === Number(itemId)) closeListNote();
  if (Number(openListThreadId) === Number(itemId)) openListThreadId = null;
  delete listThreadCache[itemId];
  renderList();
}

async function loadListItems(channelId) {
  currentListItems = [];
  listMoveTargets = [];
  listCompletedOpen = false;
  openListThreadId = null;
  editingListItemId = null;
  closeListNote();
  Object.keys(listThreadCache).forEach((key) => delete listThreadCache[key]);
  const title = document.getElementById("lists-title-input");
  const note = document.getElementById("lists-note-input");
  if (title) title.value = "";
  if (note) {
    note.value = "";
    note.hidden = true;
  }
  paintListAddState();
  renderList();
  const response = await fetch(`https://${serverAddress}/get_list/${channelId}`, { credentials: "include" });
  if (!response.ok || Number(currentChannelId) !== Number(channelId)) return;
  const data = await response.json();
  currentListItems = data.items || [];
  listMoveTargets = data.destinations || [];
  renderList();
}

async function submitListItem() {
  if (!currentChannelId) return;
  const titleInput = document.getElementById("lists-title-input");
  const noteInput = document.getElementById("lists-note-input");
  const title = titleInput ? titleInput.value.trim() : "";
  const note = noteInput && !noteInput.hidden ? noteInput.value.trim() : "";
  if (!title) return;
  const response = await fetch(`https://${serverAddress}/list_item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ channel_id: currentChannelId, title, note }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not add that item.");
    return;
  }
  if (titleInput) titleInput.value = "";
  if (noteInput) {
    noteInput.value = "";
    noteInput.hidden = true;
  }
  paintListAddState();
  appendListItem(data);
}

async function saveListTitle(itemId, value) {
  const title = (value || "").trim();
  editingListItemId = null;
  if (!title) {
    renderList();
    return;
  }
  const response = await fetch(`https://${serverAddress}/edit_list_item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ item_id: itemId, title }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not edit that item.");
    renderList();
    return;
  }
  applyListItem(data, true);
}

async function deleteListItem(itemId) {
  const response = await fetch(`https://${serverAddress}/delete_list_item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ item_id: itemId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    window.alert((typeof data.detail === "string" && data.detail) || "Could not delete that item.");
    return;
  }
  removeListItem(itemId);
}

async function moveListItem(itemId, channelId) {
  const response = await fetch(`https://${serverAddress}/move_list_item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ item_id: itemId, channel_id: channelId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not move that item.");
    return;
  }
  removeListItem(itemId);
}

function openListNote(itemId) {
  openListNoteId = itemId;
  const overlay = document.getElementById("list-note-overlay");
  if (overlay) overlay.hidden = false;
  paintListNote();
}

function closeListNote() {
  openListNoteId = null;
  const overlay = document.getElementById("list-note-overlay");
  if (overlay) overlay.hidden = true;
}

function paintListNote() {
  const item = listItemById(openListNoteId);
  const title = document.getElementById("list-note-item");
  const meta = document.getElementById("list-note-meta");
  const display = document.getElementById("list-note-display");
  const input = document.getElementById("list-note-input");
  if (!item || !input) return;
  if (title) title.textContent = item.title || "Item";
  if (meta) {
    const who = item.note ? (item.note_username || item.username || "Someone") : (item.username || "Someone");
    const when = listWhen(item.note ? item.note_at : item.created_at);
    meta.textContent = who + (when ? " \u00b7 " + when : "") + " \u00b7 " + (item.thread_count || 0);
  }
  if (display) display.textContent = item.note || "";
  input.value = item.note || "";
}

async function saveListNote() {
  if (!openListNoteId) return;
  const input = document.getElementById("list-note-input");
  const note = input ? input.value.trim() : "";
  const response = await fetch(`https://${serverAddress}/list_item_note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ item_id: openListNoteId, note }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not save that note.");
    return;
  }
  applyListItem(data, true);
}

const listsTitleInput = document.getElementById("lists-title-input");
if (listsTitleInput) {
  listsTitleInput.addEventListener("input", paintListAddState);
  listsTitleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitListItem();
  });
}
const listsAddNoteBtn = document.getElementById("lists-add-note-btn");
if (listsAddNoteBtn) {
  listsAddNoteBtn.addEventListener("click", () => {
    const note = document.getElementById("lists-note-input");
    if (note) note.hidden = !note.hidden;
  });
}
const listsSaveBtn = document.getElementById("lists-save-btn");
if (listsSaveBtn) listsSaveBtn.addEventListener("click", submitListItem);
const listsCompletedToggle = document.getElementById("lists-completed-toggle");
if (listsCompletedToggle) {
  listsCompletedToggle.addEventListener("click", () => {
    listCompletedOpen = !listCompletedOpen;
    renderList();
  });
}
const listNoteClose = document.getElementById("list-note-close");
if (listNoteClose) listNoteClose.addEventListener("click", closeListNote);
const listNoteSave = document.getElementById("list-note-save");
if (listNoteSave) listNoteSave.addEventListener("click", saveListNote);
const listNoteOverlay = document.getElementById("list-note-overlay");
if (listNoteOverlay) {
  listNoteOverlay.addEventListener("click", (event) => {
    if (event.target === listNoteOverlay) closeListNote();
  });
}
