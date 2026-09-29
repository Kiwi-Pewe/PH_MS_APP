let serverDndKind = null;
let serverDndId = null;
let serverDndCategoryId = null;
let serverDndMoved = false;
let serverDndDrop = null;

function serverDndConsumeClick() {
  if (!serverDndMoved) return false;
  serverDndMoved = false;
  return true;
}

function clearServerDndMarks() {
  document.querySelectorAll(".dnd-drop-before, .dnd-drop-after, .dnd-drop-into, .dnd-dragging").forEach((el) => {
    el.classList.remove("dnd-drop-before", "dnd-drop-after", "dnd-drop-into", "dnd-dragging");
  });
  serverDndDrop = null;
}

function markServerDndTarget(el, mode) {
  clearServerDndMarks();
  if (!el) return;
  if (serverDndKind === "server") {
    const wrap = document.querySelector(`.server-icon-wrap[data-server-id="${String(serverDndId)}"]`);
    if (wrap) wrap.classList.add("dnd-dragging");
  } else if (serverDndKind === "category") {
    const block = document.querySelector(`.category-block[data-category-id="${serverDndId}"]`);
    if (block) block.classList.add("dnd-dragging");
  } else if (serverDndKind === "channel") {
    const row = document.querySelector(`.channel-row[data-channel-id="${serverDndId}"]`);
    if (row) row.classList.add("dnd-dragging");
  }
  if (mode === "before") el.classList.add("dnd-drop-before");
  else if (mode === "after") el.classList.add("dnd-drop-after");
  else if (mode === "into") el.classList.add("dnd-drop-into");
}

function endServerDnd() {
  clearServerDndMarks();
  serverDndKind = null;
  serverDndId = null;
  serverDndCategoryId = null;
}

async function postServerDnd(path, body) {
  const response = await fetch(`https://${serverAddress}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not reorder.");
  return data;
}

function bindServerRailDrag(wrap, server) {
  wrap.draggable = true;
  wrap.addEventListener("dragstart", (e) => {
    serverDndKind = "server";
    serverDndId = server.id;
    serverDndMoved = true;
    wrap.classList.add("dnd-dragging");
    try { e.dataTransfer.setData("text/plain", String(server.id)); } catch (err) {}
    e.dataTransfer.effectAllowed = "move";
  });
  wrap.addEventListener("dragend", () => endServerDnd());
  wrap.addEventListener("dragover", (e) => {
    if (serverDndKind !== "server" || serverDndId == null) return;
    if (String(serverDndId) === String(server.id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = wrap.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    serverDndDrop = { kind: "server", beforeId: before ? server.id : nextServerIdAfter(server.id) };
    markServerDndTarget(wrap, before ? "before" : "after");
  });
  wrap.addEventListener("drop", async (e) => {
    if (serverDndKind !== "server" || serverDndId == null) return;
    e.preventDefault();
    e.stopPropagation();
    const movedId = serverDndId;
    const beforeId = serverDndDrop && serverDndDrop.kind === "server" ? serverDndDrop.beforeId : server.id;
    endServerDnd();
    if (String(movedId) === String(beforeId)) return;
    serverDndMoved = true;
    try {
      const data = await postServerDnd("/reorder_server_rail", {
        server_id: movedId,
        before_server_id: beforeId == null ? null : beforeId,
      });
      if (typeof applyServerRailOrder === "function") applyServerRailOrder(data.servers || []);
    } catch (err) {
      if (typeof loadServers === "function") loadServers();
    }
  });
}

function nextServerIdAfter(serverId) {
  const ids = (serverList || []).map((row) => row.id);
  const index = ids.findIndex((id) => String(id) === String(serverId));
  if (index < 0 || index >= ids.length - 1) return null;
  return ids[index + 1];
}

function bindCategoryDrag(block, category) {
  const header = block.querySelector(".category-header");
  if (!header) return;
  header.draggable = true;
  header.addEventListener("dragstart", (e) => {
    if (e.target.closest(".category-add-btn")) {
      e.preventDefault();
      return;
    }
    serverDndKind = "category";
    serverDndId = category.id;
    serverDndMoved = true;
    block.classList.add("dnd-dragging");
    try { e.dataTransfer.setData("text/plain", String(category.id)); } catch (err) {}
    e.dataTransfer.effectAllowed = "move";
  });
  header.addEventListener("dragend", () => endServerDnd());
  block.addEventListener("dragover", (e) => {
    if (serverDndKind !== "category" || serverDndId == null) return;
    if (Number(serverDndId) === Number(category.id)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = block.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    serverDndDrop = {
      kind: "category",
      beforeId: before ? category.id : nextCategoryIdAfter(category.id),
    };
    markServerDndTarget(block, before ? "before" : "after");
  });
  block.addEventListener("drop", async (e) => {
    if (serverDndKind !== "category" || serverDndId == null) return;
    e.preventDefault();
    e.stopPropagation();
    const movedId = Number(serverDndId);
    const beforeId = serverDndDrop && serverDndDrop.kind === "category" ? serverDndDrop.beforeId : category.id;
    endServerDnd();
    if (Number(movedId) === Number(beforeId)) return;
    serverDndMoved = true;
    try {
      const data = await postServerDnd("/reorder_category", {
        category_id: movedId,
        before_category_id: beforeId == null ? null : Number(beforeId),
      });
      if (typeof applyCategoriesReordered === "function") applyCategoriesReordered(data.categories || []);
    } catch (err) {
      if (currentServerId && typeof openServer === "function") openServer(currentServerId);
    }
  });
}

function nextCategoryIdAfter(categoryId) {
  const ids = ((currentServerData && currentServerData.categories) || []).map((row) => row.id);
  const index = ids.findIndex((id) => Number(id) === Number(categoryId));
  if (index < 0 || index >= ids.length - 1) return null;
  return ids[index + 1];
}

function bindChannelDrag(row, channel) {
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    serverDndKind = "channel";
    serverDndId = channel.id;
    serverDndCategoryId = channel.category_id;
    serverDndMoved = true;
    row.classList.add("dnd-dragging");
    try { e.dataTransfer.setData("text/plain", String(channel.id)); } catch (err) {}
    e.dataTransfer.effectAllowed = "move";
  });
  row.addEventListener("dragend", () => endServerDnd());
  row.addEventListener("dragover", (e) => {
    if (serverDndKind !== "channel" || serverDndId == null) return;
    if (Number(serverDndId) === Number(channel.id)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    serverDndDrop = {
      kind: "channel",
      categoryId: channel.category_id,
      beforeId: before ? channel.id : nextChannelIdAfter(channel.category_id, channel.id),
    };
    markServerDndTarget(row, before ? "before" : "after");
  });
  row.addEventListener("drop", async (e) => {
    if (serverDndKind !== "channel" || serverDndId == null) return;
    e.preventDefault();
    e.stopPropagation();
    await commitChannelDrop(serverDndDrop || {
      kind: "channel",
      categoryId: channel.category_id,
      beforeId: channel.id,
    });
  });
}

function nextChannelIdAfter(categoryId, channelId) {
  const category = ((currentServerData && currentServerData.categories) || []).find((row) => Number(row.id) === Number(categoryId));
  const ids = ((category && category.channels) || []).filter((row) => typeof channelVisibleInSidebar !== "function" || channelVisibleInSidebar(row)).map((row) => row.id);
  const index = ids.findIndex((id) => Number(id) === Number(channelId));
  if (index < 0 || index >= ids.length - 1) return null;
  return ids[index + 1];
}

function bindCategoryChannelDropZone(el, category) {
  el.addEventListener("dragover", (e) => {
    if (serverDndKind !== "channel" || serverDndId == null) return;
    if (e.target.closest(".channel-row")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    serverDndDrop = { kind: "channel", categoryId: category.id, beforeId: null };
    markServerDndTarget(el, "into");
  });
  el.addEventListener("drop", async (e) => {
    if (serverDndKind !== "channel" || serverDndId == null) return;
    if (e.target.closest(".channel-row")) return;
    e.preventDefault();
    e.stopPropagation();
    await commitChannelDrop({ kind: "channel", categoryId: category.id, beforeId: null });
  });
}

async function commitChannelDrop(drop) {
  const movedId = Number(serverDndId);
  const categoryId = drop && drop.categoryId;
  const beforeId = drop && drop.beforeId;
  endServerDnd();
  if (!movedId || categoryId == null) return;
  serverDndMoved = true;
  try {
    const data = await postServerDnd("/reorder_channel", {
      channel_id: movedId,
      category_id: Number(categoryId),
      before_channel_id: beforeId == null ? null : Number(beforeId),
    });
    if (typeof applyChannelsReordered === "function") applyChannelsReordered(data.channels || []);
  } catch (err) {
    if (currentServerId && typeof openServer === "function") openServer(currentServerId);
  }
}

document.addEventListener("dragover", (e) => {
  if (!serverDndKind) return;
  e.preventDefault();
});

document.addEventListener("drop", (e) => {
  if (!serverDndKind) return;
  e.preventDefault();
  endServerDnd();
});
