// ==================================================================
// profile-comments.js - Steam-style profile wall. Newest first,
// 6 per page. Owner never posts here. Author edit/delete; owner
// can remove anyone's.
// ==================================================================

const PROFILE_COMMENT_PAGE = 6;

function profileCommentShownName(row) {
  return (row && (row.display_name || row.username)) || "Unknown";
}

function profileCommentTime(row) {
  const raw = row && row.created_at;
  if (!raw) return "";
  if (typeof formatClusterTime === "function" && typeof parseUtcTimestamp === "function") {
    return formatClusterTime(parseUtcTimestamp(raw));
  }
  return String(raw);
}

function mountProfileComments(host, tile) {
  if (host && host._profileComments && host._profileComments.destroy) {
    host._profileComments.destroy();
    host._profileComments = null;
  }
  const ownerId = typeof profileOwnerId !== "undefined" ? profileOwnerId : null;
  const root = document.createElement("div");
  root.className = "oneira-wall";
  const head = document.createElement("div");
  head.className = "oneira-wall-head";
  const title = document.createElement("div");
  title.className = "oneira-wall-title";
  title.textContent = "Comments";
  const topPager = document.createElement("div");
  topPager.className = "oneira-wall-pager";
  head.appendChild(title);
  head.appendChild(topPager);
  const topRule = document.createElement("div");
  topRule.className = "oneira-wall-rule";
  const compose = document.createElement("div");
  compose.className = "oneira-wall-compose";
  compose.hidden = true;
  const input = document.createElement("textarea");
  input.className = "oneira-wall-input";
  input.rows = 2;
  input.maxLength = 1000;
  input.placeholder = "Add a comment";
  compose.appendChild(input);
  const list = document.createElement("div");
  list.className = "oneira-wall-list";
  const empty = document.createElement("div");
  empty.className = "oneira-wall-empty";
  empty.textContent = "No comments yet.";
  const botRule = document.createElement("div");
  botRule.className = "oneira-wall-rule";
  const foot = document.createElement("div");
  foot.className = "oneira-wall-foot";
  const notifyLabel = document.createElement("label");
  notifyLabel.className = "oneira-wall-notify";
  const notifyBox = document.createElement("input");
  notifyBox.type = "checkbox";
  const notifyText = document.createElement("span");
  notifyText.textContent = "Get Notifications";
  notifyLabel.appendChild(notifyBox);
  notifyLabel.appendChild(notifyText);
  const botPager = document.createElement("div");
  botPager.className = "oneira-wall-pager";
  foot.appendChild(notifyLabel);
  foot.appendChild(botPager);
  root.appendChild(head);
  root.appendChild(topRule);
  root.appendChild(compose);
  root.appendChild(list);
  root.appendChild(empty);
  root.appendChild(botRule);
  root.appendChild(foot);
  host.appendChild(root);

  let page = 1;
  let pages = 1;
  let total = 0;
  let canPost = false;
  let isOwner = ownerId === myUserId;
  let watching = false;
  let rows = [];
  let loading = false;
  let editingId = null;

  function stopTileDrag(node) {
    node.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  stopTileDrag(root);

  async function load() {
    if (!ownerId || typeof profileApi !== "function") {
      paint();
      return;
    }
    loading = true;
    paint();
    try {
      const response = await profileApi("/profile/" + ownerId + "/comments?page=" + page);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not load comments.");
      page = Number(data.page) || 1;
      pages = Math.max(1, Number(data.pages) || 1);
      total = Number(data.total) || 0;
      canPost = !!data.can_post;
      watching = !!data.watching;
      rows = Array.isArray(data.comments) ? data.comments : [];
    } catch (e) {
      rows = [];
      canPost = false;
      watching = false;
      total = 0;
      pages = 1;
      empty.textContent = e.message || "Could not load comments.";
    }
    loading = false;
    paint();
  }

  function paintPager(hostEl) {
    hostEl.innerHTML = "";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "\u2039";
    prev.disabled = page <= 1;
    prev.setAttribute("aria-label", "Previous page");
    prev.addEventListener("click", () => {
      if (page <= 1) return;
      page -= 1;
      load();
    });
    const label = document.createElement("span");
    label.className = "oneira-wall-page";
    label.textContent = String(page);
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "\u203a";
    next.disabled = page >= pages;
    next.setAttribute("aria-label", "Next page");
    next.addEventListener("click", () => {
      if (page >= pages) return;
      page += 1;
      load();
    });
    hostEl.appendChild(prev);
    hostEl.appendChild(label);
    hostEl.appendChild(next);
    hostEl.hidden = total < 7;
  }

  function bindMenu(rowEl, row) {
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof openContextMenu !== "function") return;
      const isMine = row.sender_id === myUserId;
      const isOwner = ownerId === myUserId;
      openContextMenu(e.clientX, e.clientY, {
        avatarText: typeof avatarLetter === "function" ? avatarLetter(profileCommentShownName(row)) : "?",
        title: profileCommentShownName(row),
        timestamp: profileCommentTime(row),
        subtitle: typeof truncateForContextMenu === "function" ? truncateForContextMenu(row.content) : row.content
      }, [
        { label: "Copy Comment", onSelect: () => navigator.clipboard && navigator.clipboard.writeText(row.content || "") },
        isMine && { label: "Edit Comment", onSelect: () => startEdit(rowEl, row) },
        (isMine || isOwner) && { label: "Delete Comment", danger: true, onSelect: () => removeRow(row) }
      ]);
    };
    rowEl.addEventListener("contextmenu", open);
  }

  function startEdit(rowEl, row) {
    editingId = row.id;
    const content = rowEl.querySelector(".oneira-wall-text");
    if (!content) return;
    const area = document.createElement("textarea");
    area.className = "oneira-wall-edit";
    area.maxLength = 1000;
    area.value = row.content || "";
    content.replaceWith(area);
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    async function save() {
      const text = area.value.trim();
      if (!text) {
        window.alert("Write a comment first.");
        return;
      }
      try {
        const response = await profileApi("/profile_comment/" + row.id + "/edit", {
          method: "POST",
          body: JSON.stringify({ content: text })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Could not edit that comment.");
        Object.assign(row, data);
        editingId = null;
        paint();
      } catch (e) {
        window.alert(e.message || "Could not edit that comment.");
      }
    }
    area.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        editingId = null;
        paint();
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        save();
      }
    });
    area.addEventListener("blur", () => {
      if (editingId !== row.id) return;
      save();
    });
  }

  async function removeRow(row) {
    if (!window.confirm("Remove this comment?")) return;
    try {
      const response = await profileApi("/profile_comment/" + row.id + "/delete", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not remove that comment.");
      }
      if (rows.length <= 1 && page > 1) page -= 1;
      await load();
    } catch (e) {
      window.alert(e.message || "Could not remove that comment.");
    }
  }

  function paint() {
    compose.hidden = !canPost;
    notifyLabel.hidden = isOwner;
    notifyBox.checked = watching;
    paintPager(topPager);
    paintPager(botPager);
    list.innerHTML = "";
    if (loading && !rows.length) {
      empty.hidden = false;
      empty.textContent = "Loading comments…";
      return;
    }
    if (!rows.length) {
      empty.hidden = false;
      empty.textContent = "No comments yet.";
      return;
    }
    empty.hidden = true;
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "oneira-wall-row";
      item.dataset.commentId = String(row.id);
      const avatar = document.createElement("div");
      avatar.className = "oneira-wall-avatar";
      avatar.textContent = typeof avatarLetter === "function" ? avatarLetter(profileCommentShownName(row)) : "?";
      const body = document.createElement("div");
      body.className = "oneira-wall-body";
      const meta = document.createElement("div");
      meta.className = "oneira-wall-meta";
      const name = document.createElement("span");
      name.className = "oneira-wall-name";
      name.textContent = profileCommentShownName(row);
      const time = document.createElement("span");
      time.className = "oneira-wall-time";
      time.textContent = profileCommentTime(row) + (row.edited ? " (edited)" : "");
      meta.appendChild(name);
      meta.appendChild(time);
      const text = document.createElement("div");
      text.className = "oneira-wall-text";
      text.textContent = row.content || "";
      body.appendChild(meta);
      body.appendChild(text);
      item.appendChild(avatar);
      item.appendChild(body);
      bindMenu(item, row);
      list.appendChild(item);
    });
  }

  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    try {
      const response = await profileApi("/profile/" + ownerId + "/comments", {
        method: "POST",
        body: JSON.stringify({ content: text })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not post that comment.");
      input.value = "";
      page = 1;
      await load();
    } catch (err) {
      window.alert(err.message || "Could not post that comment.");
    }
    input.disabled = false;
    input.focus();
  });

  notifyBox.addEventListener("change", async () => {
    const on = notifyBox.checked;
    try {
      const response = await profileApi("/profile/" + ownerId + "/comments/watch", {
        method: "POST",
        body: JSON.stringify({ watching: on })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save that.");
      watching = !!data.watching;
      notifyBox.checked = watching;
    } catch (err) {
      notifyBox.checked = watching;
      window.alert(err.message || "Could not save that.");
    }
  });

  const handle = {
    destroy() {
      if (root.parentNode) root.remove();
    }
  };
  host._profileComments = handle;
  load();
  return handle;
}
