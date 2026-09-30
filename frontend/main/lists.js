let currentListItems = [];
let openListItemId = null;

function canEditListItems() {
  return typeof channelPerm === "function" && channelPerm("manage_channels");
}

function paintListsAddButton() {
  const btn = document.getElementById("lists-add-btn");
  if (btn) btn.style.display = canEditListItems() ? "inline-flex" : "none";
}

function hideListsComposer() {
  const composer = document.getElementById("lists-composer");
  const title = document.getElementById("lists-title-input");
  const body = document.getElementById("lists-body-input");
  if (composer) composer.hidden = true;
  if (title) title.value = "";
  if (body) body.value = "";
}

function showListsComposer() {
  if (!canEditListItems()) return;
  const composer = document.getElementById("lists-composer");
  if (composer) composer.hidden = false;
  const title = document.getElementById("lists-title-input");
  if (title) title.focus();
}

function listItemById(itemId) {
  return currentListItems.find((item) => Number(item.id) === Number(itemId)) || null;
}

function renderListSections() {
  const pending = document.getElementById("lists-pending");
  const completed = document.getElementById("lists-completed");
  const completedTitle = document.getElementById("lists-completed-title");
  if (!pending || !completed) return;
  pending.replaceChildren();
  completed.replaceChildren();
  const open = currentListItems.filter((item) => !item.checked);
  const done = currentListItems.filter((item) => item.checked);
  if (!open.length) {
    const empty = document.createElement("div");
    empty.className = "lists-empty";
    empty.textContent = "No items yet.";
    pending.appendChild(empty);
  } else {
    open.forEach((item) => pending.appendChild(buildListRow(item)));
  }
  if (completedTitle) completedTitle.hidden = !done.length;
  done.forEach((item) => completed.appendChild(buildListRow(item)));
}

function buildListRow(item) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "list-row" + (item.checked ? " is-done" : "");
  row.dataset.itemId = String(item.id);
  const box = document.createElement("span");
  box.className = "list-check" + (item.checked ? " is-on" : "");
  box.setAttribute("role", "checkbox");
  box.setAttribute("aria-checked", item.checked ? "true" : "false");
  box.textContent = item.checked ? "\u2713" : "";
  box.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleListItem(item);
  });
  const title = document.createElement("span");
  title.className = "list-row-title";
  title.textContent = item.title || "Item";
  row.appendChild(box);
  row.appendChild(title);
  row.addEventListener("click", () => openListItem(item.id));
  return row;
}

async function toggleListItem(item) {
  const next = !item.checked;
  item.checked = next;
  renderListSections();
  try {
    const response = await fetch(`https://${serverAddress}/list_item_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ item_id: item.id, on: next }),
    });
    if (!response.ok) {
      item.checked = !next;
      renderListSections();
    }
  } catch (err) {
    item.checked = !next;
    renderListSections();
  }
}

function openListItem(itemId) {
  const item = listItemById(itemId);
  const overlay = document.getElementById("list-item-overlay");
  if (!item || !overlay) return;
  openListItemId = item.id;
  const title = document.getElementById("list-item-title");
  const meta = document.getElementById("list-item-meta");
  const body = document.getElementById("list-item-body");
  const remove = document.getElementById("list-item-delete");
  if (title) title.textContent = item.title || "Item";
  if (meta) {
    const when = typeof formatClusterTime === "function" && typeof parseUtcTimestamp === "function"
      ? formatClusterTime(parseUtcTimestamp(item.created_at))
      : "";
    meta.textContent = (item.username || "Someone") + (when ? " · " + when : "");
  }
  if (body) body.textContent = item.body || "";
  if (remove) remove.hidden = !canEditListItems();
  overlay.hidden = false;
}

function closeListItem() {
  openListItemId = null;
  const overlay = document.getElementById("list-item-overlay");
  if (overlay) overlay.hidden = true;
}

async function loadListItems(channelId) {
  currentListItems = [];
  closeListItem();
  hideListsComposer();
  paintListsAddButton();
  renderListSections();
  const response = await fetch(`https://${serverAddress}/get_list/${channelId}`, { credentials: "include" });
  if (!response.ok) return;
  const data = await response.json();
  if (Number(currentChannelId) !== Number(channelId)) return;
  currentListItems = data.items || [];
  renderListSections();
}

function appendListItem(item) {
  if (!item || Number(currentChannelId) !== Number(item.channel_id)) return;
  if (listItemById(item.id)) return;
  currentListItems.push(Object.assign({}, item, { checked: false }));
  renderListSections();
}

function removeListItem(itemId) {
  currentListItems = currentListItems.filter((item) => Number(item.id) !== Number(itemId));
  if (Number(openListItemId) === Number(itemId)) closeListItem();
  renderListSections();
}

async function submitListItem() {
  if (!canEditListItems() || !currentChannelId) return;
  const titleInput = document.getElementById("lists-title-input");
  const bodyInput = document.getElementById("lists-body-input");
  const title = titleInput ? titleInput.value.trim() : "";
  const body = bodyInput ? bodyInput.value.trim() : "";
  if (!title) return;
  const response = await fetch(`https://${serverAddress}/list_item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ channel_id: currentChannelId, title, body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not add that item.");
    return;
  }
  hideListsComposer();
  appendListItem(data);
}

async function deleteOpenListItem() {
  if (!openListItemId || !canEditListItems()) return;
  const itemId = openListItemId;
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

const listsAddBtn = document.getElementById("lists-add-btn");
if (listsAddBtn) listsAddBtn.addEventListener("click", showListsComposer);
const listsCancelBtn = document.getElementById("lists-cancel-btn");
if (listsCancelBtn) listsCancelBtn.addEventListener("click", hideListsComposer);
const listsSaveBtn = document.getElementById("lists-save-btn");
if (listsSaveBtn) listsSaveBtn.addEventListener("click", submitListItem);
const listItemClose = document.getElementById("list-item-close");
if (listItemClose) listItemClose.addEventListener("click", closeListItem);
const listItemDelete = document.getElementById("list-item-delete");
if (listItemDelete) listItemDelete.addEventListener("click", deleteOpenListItem);
const listItemOverlay = document.getElementById("list-item-overlay");
if (listItemOverlay) {
  listItemOverlay.addEventListener("click", (event) => {
    if (event.target === listItemOverlay) closeListItem();
  });
}
