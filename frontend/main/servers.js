// ==================================================================
// servers.js - Server rail, opening a server, its sidebar, channel selection.
// ==================================================================

async function loadServers() {
  try {
    const response = await fetch(`https://${serverAddress}/get_servers`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    serverList = data.servers || [];
    renderServerList();
  } catch (e) { /* leave last render in place */ }
}

function renderServerList() {
  const container = document.getElementById("server-list");
  container.innerHTML = "";
  serverList.forEach(server => {
    const wrap = document.createElement("div");
    wrap.className = "server-icon-wrap";
    wrap.dataset.serverId = server.id;

    const pill = document.createElement("span");
    pill.className = "rail-unread-pill";
    wrap.appendChild(pill);

    const icon = document.createElement("div");
    icon.className = "rail-icon server-icon" + (selectedRailIcon === server.id ? " active" : "");
    icon.title = server.name;
    icon.dataset.serverId = server.id;
    paintRailServerIcon(icon, server);
    icon.addEventListener("click", () => openServer(server.id, icon));
    icon.addEventListener("contextmenu", (e) => showServerContextMenu(e, server.id, server.name, server.owner_id));

    const badge = document.createElement("span");
    badge.className = "icon-badge";
    icon.appendChild(badge);
    wrap.appendChild(icon);
    if (typeof decorateRailIcon === "function") decorateRailIcon(wrap, server);
    container.appendChild(wrap);
  });
}

function paintRailServerIcon(icon, server) {
  if (!icon) return;
  const badge = icon.querySelector(".icon-badge");
  icon.querySelectorAll(".server-icon-img").forEach(el => el.remove());
  [...icon.childNodes].forEach(node => {
    if (node.nodeType === 3) node.remove();
  });
  const url = server && server.icon_url;
  if (url) {
    icon.classList.add("has-icon");
    const img = document.createElement("img");
    img.className = "server-icon-img";
    img.src = url;
    img.alt = "";
    icon.insertBefore(img, icon.firstChild);
  } else {
    icon.classList.remove("has-icon");
    const name = (server && server.name) || icon.title || "";
    icon.insertBefore(document.createTextNode(serverAvatarLetters(name)), badge || null);
  }
}

function applyServerIcon(serverId, iconUrl) {
  const meta = serverList.find(s => s.id === serverId);
  if (meta) meta.icon_url = iconUrl || "";
  if (currentServerData && currentServerId === serverId) {
    currentServerData.icon_url = iconUrl || "";
  }
  const icon = document.querySelector(`.rail-icon.server-icon[data-server-id="${serverId}"]`);
  if (icon) paintRailServerIcon(icon, { name: (meta && meta.name) || icon.title, icon_url: iconUrl || "" });
  if (typeof paintServerSettingsAvatar === "function") paintServerSettingsAvatar();
}

function paintServerSidebarBanner(server) {
  const view = document.getElementById("server-sidebar-view");
  const strip = document.getElementById("server-sidebar-banner");
  if (!view || !strip) return;
  const url = (server && server.banner_url) || "";
  const color = (server && server.banner_color) || "";
  strip.style.backgroundImage = url ? "url(" + JSON.stringify(url) + ")" : "";
  strip.style.backgroundColor = (!url && color) ? color : "";
  view.classList.toggle("has-banner", !!(url || color));
}

function applyServerName(serverId, name) {
  const next = name || "";
  const meta = serverList.find(s => s.id === serverId);
  if (meta) meta.name = next;
  const icon = document.querySelector(`.rail-icon.server-icon[data-server-id="${serverId}"]`);
  if (icon) {
    icon.title = next;
    paintRailServerIcon(icon, { name: next, icon_url: (meta && meta.icon_url) || "" });
  }
  if (currentServerId === serverId) {
    const sidebar = document.getElementById("server-sidebar-name");
    if (sidebar) sidebar.textContent = next;
    const label = document.getElementById("server-settings-index-label");
    if (label) label.textContent = next;
    if (typeof paintServerSettingsAvatar === "function") paintServerSettingsAvatar();
  }
  if (typeof syncServerSettingsName === "function") syncServerSettingsName(next);
}

function applyServerAbout(serverId, about) {
  const next = about || "";
  const meta = serverList.find(s => s.id === serverId);
  if (meta) meta.about = next;
  if (currentServerData && currentServerId === serverId) {
    currentServerData.about = next;
  }
  if (typeof syncServerSettingsAbout === "function") syncServerSettingsAbout(next);
}

function applyServerTimezone(serverId, zone) {
  const next = zone || "";
  const meta = serverList.find(s => s.id === serverId);
  if (meta) meta.timezone = next;
  if (currentServerData && currentServerId === serverId) {
    currentServerData.timezone = next;
  }
  if (typeof syncServerSettingsTimezone === "function") syncServerSettingsTimezone(next);
}

function applyServerNotifications(serverId, kind) {
  const next = kind || "mentions";
  const meta = serverList.find(s => s.id === serverId);
  if (meta) meta.default_notifications = next;
  if (currentServerData && currentServerId === serverId) {
    currentServerData.default_notifications = next;
  }
  if (typeof syncServerSettingsNotifications === "function") syncServerSettingsNotifications(next);
}

function applyServerType(serverId, kind) {
  const next = kind || "";
  const meta = serverList.find(s => s.id === serverId);
  if (meta) meta.server_type = next;
  if (currentServerData && currentServerId === serverId) {
    currentServerData.server_type = next;
  }
  if (typeof syncServerSettingsType === "function") syncServerSettingsType(next);
}

function applyServerUrl(serverId, slug) {
  const next = slug || "";
  const meta = serverList.find(s => s.id === serverId);
  if (meta) meta.url_slug = next;
  if (currentServerData && currentServerId === serverId) {
    currentServerData.url_slug = next;
  }
  if (typeof syncServerSettingsUrl === "function") syncServerSettingsUrl(next);
}

function applyServerBanner(serverId, banner) {
  const url = (banner && banner.banner_url) || "";
  const color = (banner && banner.banner_color) || "";
  const meta = serverList.find(s => s.id === serverId);
  if (meta) {
    meta.banner_url = url;
    meta.banner_color = color;
  }
  if (currentServerData && currentServerId === serverId) {
    currentServerData.banner_url = url;
    currentServerData.banner_color = color;
    paintServerSidebarBanner(currentServerData);
  }
  if (typeof paintServerSettingsBanner === "function") paintServerSettingsBanner();
}

function selectRailIcon(id, iconEl) {
  selectedRailIcon = id;
  document.querySelectorAll(".rail-icon").forEach(i => i.classList.remove("active"));
  iconEl.classList.add("active");
}

async function openServer(serverId, iconEl) {
  selectRailIcon(serverId, iconEl);

  let data;
  try {
    const response = await fetch(`https://${serverAddress}/get_server_contents/${serverId}`, { credentials: "include" });
    if (!response.ok) return;
    data = await response.json();
  } catch (e) {
    return;
  }

  if (typeof closeMiniProfile === "function") closeMiniProfile();
  if (typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (typeof closeServerSettingsChrome === "function") closeServerSettingsChrome();
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof setTopbarTab === "function") setTopbarTab("messages");

  currentServerId = serverId;
  currentServerOwnerId = data.owner;
  currentServerPerms = data.permissions || {};
  currentServerHighestRole = data.highest_role || null;
  currentServerTimeoutUntil = data.timeout_until || null;
  if (typeof paintServerSettingsAccess === "function") paintServerSettingsAccess();
  if (typeof paintServerTimeoutLock === "function") paintServerTimeoutLock();
  currentServerData = data;

  document.getElementById("dm-sidebar-view").style.display = "none";
  document.getElementById("server-sidebar-view").style.display = "flex";

  const serverMeta = serverList.find(s => s.id === serverId);
  document.getElementById("server-sidebar-name").textContent = serverMeta ? serverMeta.name : "";
  paintServerSidebarBanner({
    banner_url: data.banner_url || (serverMeta && serverMeta.banner_url) || "",
    banner_color: data.banner_color || (serverMeta && serverMeta.banner_color) || ""
  });

  renderServerSidebar(data);
  if (typeof loadMemberList === "function") loadMemberList("server", serverId);
  if (typeof loadMentionRoles === "function") loadMentionRoles(serverId);

  // Auto-selects first channel. Remembering last-viewed channel is
  // deferred (see Handoff).
  const firstChannel = data.categories.flatMap(c => c.channels)[0];
  if (firstChannel) {
    selectChannel(firstChannel);
  } else {
    showNoChannelSelected();
  }
}

function renderServerSidebar(data) {
  const list = document.getElementById("category-list");
  list.innerHTML = "";
  const canLayout = typeof canManageChannels === "function" ? canManageChannels() : data.owner === myUserId;

  data.categories.forEach(category => {
    const block = document.createElement("div");
    block.className = "category-block";

    const header = document.createElement("div");
    header.className = "category-header";

    const arrow = document.createElement("span");
    arrow.className = "category-arrow";
    arrow.textContent = "\u25BE";
    header.appendChild(arrow);

    const nameEl = document.createElement("span");
    nameEl.className = "category-name";
    nameEl.textContent = category.name;
    nameEl.addEventListener("contextmenu", (e) => showCategoryContextMenu(e, category));
    header.appendChild(nameEl);

    if (canLayout) {
      const addBtn = document.createElement("button");
      addBtn.className = "category-add-btn";
      addBtn.title = "Create Channel";
      addBtn.textContent = "+";
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openChannelModal(category.id);
      });
      header.appendChild(addBtn);
    }

    const channelsEl = document.createElement("div");
    channelsEl.className = "category-channels";
    category.channels.forEach(channel => {
      const row = document.createElement("div");
      row.className = "channel-row";
      row.dataset.channelId = channel.id;

      const icon = document.createElement("span");
      icon.className = "channel-icon";
      icon.textContent = channel.channel_type === "voice" ? "\u{1F50A}" : "#";
      row.appendChild(icon);

      const label = document.createElement("span");
      label.className = "channel-label";
      label.textContent = channel.name;
      row.appendChild(label);

      if (typeof decorateChannelRow === "function") decorateChannelRow(row, channel);

      row.addEventListener("click", () => selectChannel(channel, row));
      row.addEventListener("contextmenu", (e) => showChannelContextMenu(e, channel));
      channelsEl.appendChild(row);
    });

    // Collapse/expand is purely visual, doesn't persist across refresh.
    header.addEventListener("click", () => block.classList.toggle("collapsed"));

    block.appendChild(header);
    block.appendChild(channelsEl);
    list.appendChild(block);
  });

  if (currentChannelId) {
    const activeRow = document.querySelector(`.channel-row[data-channel-id="${currentChannelId}"]`);
    if (activeRow) activeRow.classList.add("active");
  }
}

async function selectChannel(channel, rowEl) {
  if (typeof hideMentionPicker === "function") hideMentionPicker();
  if (typeof abandonMessageEdit === "function") abandonMessageEdit();
  if (typeof abandonAnnouncementEdit === "function") abandonAnnouncementEdit();
  if (typeof abandonForumEdit === "function") abandonForumEdit();
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof resetTypingOnLeave === "function") resetTypingOnLeave();
  if (!(await leaveDocIfNeeded())) return;

  // A forum thread borrows the channel chat view, so leaving the channel
  // has to hand it back. Skipping this would leave sendChannelMessage
  // addressing the old thread from inside the next text channel.
  openForumPostId = null;
  openForumPostTitle = null;
  openForumPostBody = null;
  openForumPostAttachment = null;
  openForumPostEdited = false;
  openForumPostMentionUsers = {};
  openForumPostMentionRoles = {};
  document.getElementById("forum-back-btn").style.display = "none";
  hideDocsChrome();

  currentChannelId = channel.id;
  currentChannelType = channel.channel_type;
  currentChannelName = channel.name;
  if (typeof markChannelReadLocal === "function") markChannelReadLocal(channel.id);

  document.querySelectorAll(".channel-row").forEach(r => r.classList.remove("active"));
  const activeRow = document.querySelector(`.channel-row[data-channel-id="${channel.id}"]`);
  if (activeRow) activeRow.classList.add("active");

  switchMainView("channel");
  const isVoice = channel.channel_type === "voice";
  const isAnnouncement = channel.channel_type === "announcements";
  // "forums" plural - must match /create_forum and /get_forum_post's own
  // channel_type comparison, and the radio value in app.html that gets
  // stored verbatim at creation time.
  const isForums = channel.channel_type === "forums";
  const isDoc = channel.channel_type === "doc";
  const label = (isVoice || isDoc) ? channel.name : `#${channel.name}`;
  document.getElementById("channel-header-title").textContent = label;

  const channelEmpty = document.getElementById("channel-empty");
  const channelMessages = document.getElementById("channel-messages");
  const channelBody = document.getElementById("channel-body");
  const channelComposer = document.getElementById("channel-composer");
  const announcementsView = document.getElementById("announcements-view");
  const forumsView = document.getElementById("forums-view");
  const docsView = document.getElementById("docs-view");

  // Special panels go down up front so each branch below only has to
  // turn its own on.
  announcementsView.style.display = "none";
  forumsView.style.display = "none";
  docsView.style.display = "none";

  if (isAnnouncement) {
    channelBody.style.display = "none";
    channelComposer.style.display = "none";
    announcementsView.style.display = "flex";
    hideAnnounceComposerEditing();
    // Only owner can post right now (server-enforced) - hidden entirely
    // for everyone else rather than greyed out.
    document.getElementById("announce-new-post-btn").style.display =
      (myUserId === currentServerOwnerId) ? "inline-flex" : "none";
    loadAnnouncementPosts(channel.id);
    return;
  }

  // No owner gate on New Post here, unlike Announcements above:
  // /create_forum only checks server membership, so any member can start
  // a post. Re-running this is also the only thing that re-sorts the
  // card list, which is why leaving and returning acts as a refresh.
  if (isForums) {
    channelBody.style.display = "none";
    channelComposer.style.display = "none";
    forumsView.style.display = "flex";
    hideForumComposerEditing();
    if (typeof paintServerTimeoutLock === "function") paintServerTimeoutLock();
    loadForumPosts(channel.id);
    return;
  }

  if (isDoc) {
    channelBody.style.display = "none";
    channelComposer.style.display = "none";
    docsView.style.display = "flex";
    loadDoc(channel.id);
    return;
  }

  channelBody.style.display = "flex";
  channelComposer.style.display = "block";

  if (isVoice) {
    channelMessages.style.display = "none";
    channelEmpty.style.display = "flex";
    document.getElementById("channel-empty-badge").textContent = "\u{1F50A}";
    document.getElementById("channel-welcome-title").textContent = `Welcome to ${label}!`;
    document.getElementById("channel-welcome-sub").textContent = "Voice channels aren't supported yet \u2014 text channels are today's focus.";
    disableChannelComposer("Voice channels can't receive text messages yet.");
    return;
  }

  enableChannelComposer(label);
  channelEmpty.style.display = "none";
  channelMessages.style.display = "block";
  currentChannelMessages = [];
  channelHasMoreHistory = true;
  channelIsLoadingMore = false;

  try {
    const response = await fetch(`https://${serverAddress}/get_channel_history/${channel.id}`, { credentials: "include" });
    if (!response.ok) { renderChannelMessages(); return; }
    const data = await response.json();
    currentChannelMessages = data.messages.map(msg => {
      const mapped = {
        id: msg.id,
        chatKind: "channel",
        isMine: msg.sender_id === myUserId,
        senderId: msg.sender_id,
        username: msg.username,
        content: msg.content,
        attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment,
        time: new Date(msg.timestamp),
        edited: !!msg.edited,
        reactions: applyReactionMe(msg.reactions || []),
        avatar: msg.avatar || null,
        nameRole: msg.name_role || null
      };
      if (typeof takeMessageAvatar === "function") takeMessageAvatar(mapped, msg);
      return typeof applyMentionFields === "function" ? applyMentionFields(mapped, msg) : mapped;
    });
    if (currentChannelMessages.length < 25) channelHasMoreHistory = false;
    renderChannelMessages();
  } catch (e) { renderChannelMessages(); }
}

function showNoChannelSelected() {
  if (typeof abandonMessageEdit === "function") abandonMessageEdit();
  if (typeof abandonAnnouncementEdit === "function") abandonAnnouncementEdit();
  if (typeof abandonForumEdit === "function") abandonForumEdit();
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  openForumPostId = null;
  openForumPostTitle = null;
  openForumPostBody = null;
  openForumPostAttachment = null;
  openForumPostEdited = false;
  openForumPostMentionUsers = {};
  openForumPostMentionRoles = {};
  const back = document.getElementById("forum-back-btn");
  if (back) back.style.display = "none";

  currentChannelId = null;
  currentChannelType = null;
  currentChannelName = null;
  currentChannelMessages = [];

  switchMainView("channel");
  document.getElementById("announcements-view").style.display = "none";
  document.getElementById("forums-view").style.display = "none";
  document.getElementById("docs-view").style.display = "none";
  document.getElementById("channel-body").style.display = "flex";
  document.getElementById("channel-composer").style.display = "block";
  document.getElementById("channel-header-title").textContent = "No channels yet";
  document.getElementById("channel-messages").style.display = "none";
  document.getElementById("channel-empty").style.display = "flex";
  document.getElementById("channel-empty-badge").textContent = "#";
  document.getElementById("channel-welcome-title").textContent = "";
  document.getElementById("channel-welcome-sub").textContent = "";
  disableChannelComposer("No channel selected.");
}

function channelStillInSidebar(channelId) {
  if (!currentServerData) return false;
  return currentServerData.categories.some(category =>
    category.channels.some(channel => channel.id === channelId)
  );
}

function afterServerStructureChange() {
  if (!currentServerData) return;
  const stillOpen = currentChannelId && channelStillInSidebar(currentChannelId);
  renderServerSidebar(currentServerData);
  if (stillOpen) return;
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  const firstChannel = currentServerData.categories.flatMap(c => c.channels)[0];
  if (firstChannel) {
    selectChannel(firstChannel);
  } else {
    showNoChannelSelected();
  }
}

function applyChannelDeleted(categoryId, channelId) {
  if (!currentServerData) return;
  const category = currentServerData.categories.find(c => c.id === categoryId);
  if (category) {
    category.channels = category.channels.filter(channel => channel.id !== channelId);
  }
  afterServerStructureChange();
}

function applyCategoryDeleted(categoryId) {
  if (!currentServerData) return;
  currentServerData.categories = currentServerData.categories.filter(c => c.id !== categoryId);
  afterServerStructureChange();
}
