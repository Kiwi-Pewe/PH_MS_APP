// ==================================================================
// servers.js - Server rail, opening a server, its sidebar, channel selection.
// ==================================================================

function channelTypeIcon(channelType) {
  const kind = String(channelType || "").toLowerCase();
  if (kind === "voice") return "\u{1F50A}";
  if (kind === "forums") return "\u{1F5C2}";
  if (kind === "announcements") return "\u{1F4E2}";
  if (kind === "doc") return "\u{1F4C4}";
  if (kind === "lists") return "\u2611";
  if (kind === "media") return "\u{1F5BC}";
  if (kind === "events") return "\u{1F4C5}";
  if (kind === "tournaments") return "\u{1F3C6}";
  if (kind === "watchparty") return "\u{1F3A6}";
  return "#";
}

function channelTypeSidebarLabel(channelType) {
  const kind = String(channelType || "").toLowerCase();
  if (kind === "voice") return "Voice Channel";
  if (kind === "forums") return "Forums Channel";
  if (kind === "announcements") return "Announcements Channel";
  if (kind === "doc") return "Doc Channel";
  if (kind === "lists") return "Lists Channel";
  if (kind === "media") return "Media Channel";
  if (kind === "events") return "Events Channel";
  if (kind === "tournaments") return "Tournaments Channel";
  if (kind === "watchparty") return "Watch Party Channel";
  return "Text Channel";
}

async function loadServers() {
  try {
    const response = await fetch(`https://${serverAddress}/get_servers`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    serverList = data.servers || [];
    renderServerList();
    // Prefetch personal mute/level so unread honors mute without opening the menu first.
    if (typeof loadServerNotifyPrefs === "function") {
      serverList.forEach((server) => {
        if (server && server.id) loadServerNotifyPrefs(server.id).catch(() => {});
      });
    }
  } catch (e) { /* leave last render in place */ }
}

function renderServerList() {
  const container = document.getElementById("server-list");
  container.innerHTML = "";
  serverList.forEach(server => {
    const wrap = document.createElement("div");
    wrap.className = "server-icon-wrap";
    wrap.dataset.serverId = server.id;
    wrap.dataset.dndKind = "server";

    const pill = document.createElement("span");
    pill.className = "rail-unread-pill";
    wrap.appendChild(pill);

    const icon = document.createElement("div");
    icon.className = "rail-icon server-icon" + (selectedRailIcon === server.id ? " active" : "");
    icon.title = server.name;
    icon.dataset.serverId = server.id;
    paintRailServerIcon(icon, server);
    icon.addEventListener("click", (e) => {
      if (typeof serverDndConsumeClick === "function" && serverDndConsumeClick()) return;
      openServer(server.id, icon);
    });
    icon.addEventListener("contextmenu", (e) => showServerContextMenu(e, server.id, server.name, server.owner_id));

    const badge = document.createElement("span");
    badge.className = "icon-badge";
    icon.appendChild(badge);
    wrap.appendChild(icon);
    if (typeof decorateRailIcon === "function") decorateRailIcon(wrap, server);
    if (typeof bindServerRailDrag === "function") bindServerRailDrag(wrap, server);
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
  if (typeof closeChannelSettingsChrome === "function") closeChannelSettingsChrome();
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
  const firstChannel = firstVisibleSidebarChannel();
  if (firstChannel) {
    selectChannel(firstChannel);
  } else {
    showNoChannelSelected();
  }
}

async function refreshServerContentsSoft() {
  if (!currentServerId) return null;
  try {
    const response = await fetch(`https://${serverAddress}/get_server_contents/${currentServerId}`, { credentials: "include" });
    if (!response.ok) return null;
    const data = await response.json();
    currentServerOwnerId = data.owner;
    currentServerPerms = data.permissions || {};
    currentServerHighestRole = data.highest_role || null;
    currentServerTimeoutUntil = data.timeout_until || null;
    currentServerData = data;
    if (typeof paintServerSettingsAccess === "function") paintServerSettingsAccess();
    if (typeof paintServerTimeoutLock === "function") paintServerTimeoutLock();
    if (typeof afterServerStructureChange === "function") afterServerStructureChange();
    else renderServerSidebar(data);
    if (typeof paintChatAccess === "function") paintChatAccess();
    return data;
  } catch (e) {
    return null;
  }
}

function renderServerSidebar(data) {
  const list = document.getElementById("category-list");
  list.innerHTML = "";
  const canLayout = typeof canManageChannels === "function" ? canManageChannels() : data.owner === myUserId;

  data.categories.forEach(category => {
    const block = document.createElement("div");
    block.className = "category-block";
    block.dataset.categoryId = category.id;
    block.dataset.dndKind = "category";

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

      const cog = document.createElement("button");
      cog.type = "button";
      cog.className = "channel-settings-btn";
      cog.title = "Edit Category";
      cog.textContent = "\u2699";
      cog.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof openCategorySettings === "function") openCategorySettings(category);
      });
      header.appendChild(cog);
    }

    const channelsEl = document.createElement("div");
    channelsEl.className = "category-channels";
    channelsEl.dataset.categoryId = category.id;
    category.channels.forEach(channel => {
      if (!channelVisibleInSidebar(channel)) return;
      const row = document.createElement("div");
      row.className = "channel-row";
      row.dataset.channelId = channel.id;
      row.dataset.categoryId = category.id;
      row.dataset.dndKind = "channel";

      const icon = document.createElement("span");
      icon.className = "channel-icon";
      icon.textContent = channelTypeIcon(channel.channel_type);
      row.appendChild(icon);

      const label = document.createElement("span");
      label.className = "channel-label";
      label.textContent = channel.name;
      row.appendChild(label);

      if (typeof decorateChannelRow === "function") decorateChannelRow(row, channel);

      if (canLayout) {
        const cog = document.createElement("button");
        cog.type = "button";
        cog.className = "channel-settings-btn";
        cog.title = "Edit Channel";
        cog.textContent = "\u2699";
        cog.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof openChannelSettingsForChannel === "function") openChannelSettingsForChannel(channel);
        });
        row.appendChild(cog);
      }

      row.addEventListener("click", (e) => {
        if (typeof serverDndConsumeClick === "function" && serverDndConsumeClick()) return;
        selectChannel(channel, row);
      });
      row.addEventListener("contextmenu", (e) => showChannelContextMenu(e, channel));
      if (canLayout && typeof bindChannelDrag === "function") bindChannelDrag(row, channel);
      channelsEl.appendChild(row);
    });

    header.addEventListener("click", (e) => {
      if (e.target.closest(".category-add-btn")) return;
      if (typeof serverDndConsumeClick === "function" && serverDndConsumeClick()) return;
      block.classList.toggle("collapsed");
    });

    block.appendChild(header);
    block.appendChild(channelsEl);
    if (canLayout && typeof bindCategoryDrag === "function") bindCategoryDrag(block, category);
    if (canLayout && typeof bindCategoryChannelDropZone === "function") {
      bindCategoryChannelDropZone(header, category);
      bindCategoryChannelDropZone(channelsEl, category);
    }
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
  openForumPostLocked = false;
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
  if (typeof setHeaderDescription === "function") {
    setHeaderDescription("channel-header-desc", channel.topic || "");
  }
  if (typeof syncPinsForOpenChat === "function") syncPinsForOpenChat();
  if (typeof closePinsPanel === "function") closePinsPanel();

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
      (typeof canCreateAnnouncements === "function" && canCreateAnnouncements()) ? "inline-flex" : "none";
    loadAnnouncementPosts(channel.id);
    return;
  }

  if (isForums) {
    channelBody.style.display = "none";
    channelComposer.style.display = "none";
    forumsView.style.display = "flex";
    hideForumComposerEditing();
    document.getElementById("forum-new-post-btn").style.display =
      (typeof canCreateTopics === "function" && canCreateTopics()) ? "inline-flex" : "none";
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
        nameRole: msg.name_role || null,
        permaban: !!msg.permaban
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
  openForumPostLocked = false;
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
  if (typeof setHeaderDescription === "function") setHeaderDescription("channel-header-desc", "");
  document.getElementById("channel-messages").style.display = "none";
  document.getElementById("channel-empty").style.display = "flex";
  document.getElementById("channel-empty-badge").textContent = "#";
  document.getElementById("channel-welcome-title").textContent = "";
  document.getElementById("channel-welcome-sub").textContent = "";
  disableChannelComposer("No channel selected.");
}

function channelVisibleInSidebar(channel) {
  if (!channel) return false;
  if (currentServerOwnerId === myUserId) return true;
  const perms = channel.permissions || {};
  if (channel.channel_type === "announcements") {
    if (Object.prototype.hasOwnProperty.call(perms, "view_announcements")) return !!perms.view_announcements;
    return typeof canServerPerm !== "function" || canServerPerm("view_announcements");
  }
  if (channel.channel_type === "forums") {
    if (Object.prototype.hasOwnProperty.call(perms, "read_forums")) return !!perms.read_forums;
    return typeof canServerPerm !== "function" || canServerPerm("read_forums");
  }
  if (channel.channel_type === "text") {
    if (Object.prototype.hasOwnProperty.call(perms, "read_messages")) return !!perms.read_messages;
    if (channel.can_read != null) return !!channel.can_read;
    return typeof canServerPerm !== "function" || canServerPerm("read_messages");
  }
  if (channel.channel_type === "doc") {
    if (Object.prototype.hasOwnProperty.call(perms, "view_docs")) return !!perms.view_docs;
    return typeof canServerPerm !== "function" || canServerPerm("view_docs");
  }
  return true;
}

function firstVisibleSidebarChannel() {
  if (!currentServerData) return null;
  return currentServerData.categories.flatMap(c => c.channels).find(channelVisibleInSidebar) || null;
}

function channelStillInSidebar(channelId) {
  if (!currentServerData) return false;
  return currentServerData.categories.some(category =>
    category.channels.some(channel => channel.id === channelId && channelVisibleInSidebar(channel))
  );
}

function afterServerStructureChange() {
  if (!currentServerData) return;
  const stillOpen = currentChannelId && channelStillInSidebar(currentChannelId);
  renderServerSidebar(currentServerData);
  if (stillOpen) return;
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  const firstChannel = firstVisibleSidebarChannel();
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

function applyServerRailOrder(servers) {
  if (!Array.isArray(servers) || !servers.length) return;
  const byId = new Map(servers.map((row) => [row.id, row.position]));
  serverList.forEach((server) => {
    if (byId.has(server.id)) server.position = byId.get(server.id);
  });
  serverList.sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.id).localeCompare(String(b.id)));
  renderServerList();
}

function applyCategoriesReordered(categories) {
  if (!currentServerData || !Array.isArray(categories)) return;
  const byId = new Map(categories.map((row) => [row.id, row.position]));
  currentServerData.categories.forEach((category) => {
    if (byId.has(category.id)) category.position = byId.get(category.id);
  });
  currentServerData.categories.sort((a, b) => (a.position || 0) - (b.position || 0) || (a.id - b.id));
  renderServerSidebar(currentServerData);
}

function applyChannelsReordered(channels) {
  if (!currentServerData || !Array.isArray(channels)) return;
  const byId = new Map();
  (currentServerData.categories || []).forEach((category) => {
    (category.channels || []).forEach((channel) => byId.set(channel.id, channel));
  });
  const touched = new Set();
  channels.forEach((row) => {
    const channel = byId.get(row.id);
    if (!channel) return;
    touched.add(channel.category_id);
    touched.add(row.category_id);
    channel.category_id = row.category_id;
    channel.position = row.position;
  });
  currentServerData.categories.forEach((category) => {
    category.channels = (category.channels || []).filter((channel) => channel.category_id === category.id);
  });
  channels.forEach((row) => {
    const channel = byId.get(row.id);
    if (!channel) return;
    const category = currentServerData.categories.find((entry) => entry.id === row.category_id);
    if (!category) return;
    if (!category.channels.some((entry) => entry.id === channel.id)) category.channels.push(channel);
  });
  currentServerData.categories.forEach((category) => {
    if (!touched.has(category.id)) return;
    category.channels.sort((a, b) => (a.position || 0) - (b.position || 0) || (a.id - b.id));
  });
  renderServerSidebar(currentServerData);
}

const serverSectionOverview = document.getElementById("server-section-overview");
if (serverSectionOverview) {
  serverSectionOverview.addEventListener("click", () => {
    if (typeof openServerSettings === "function") openServerSettings();
  });
}
