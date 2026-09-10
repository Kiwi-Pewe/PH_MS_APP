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
    const icon = document.createElement("div");
    icon.className = "rail-icon server-icon" + (selectedRailIcon === server.id ? " active" : "");
    icon.title = server.name;
    icon.textContent = serverAvatarLetters(server.name);
    icon.dataset.serverId = server.id;
    icon.addEventListener("click", () => openServer(server.id, icon));
    icon.addEventListener("contextmenu", (e) => showServerContextMenu(e, server.id, server.name));
    container.appendChild(icon);
  });
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

  currentServerId = serverId;
  currentServerOwnerId = data.owner;
  currentServerData = data;

  document.getElementById("dm-sidebar-view").style.display = "none";
  document.getElementById("server-sidebar-view").style.display = "flex";

  const serverMeta = serverList.find(s => s.id === serverId);
  document.getElementById("server-sidebar-name").textContent = serverMeta ? serverMeta.name : "";

  renderServerSidebar(data);

  // Auto-selects first channel. Remembering last-viewed channel is
  // deferred (see Handoff).
  const firstChannel = data.categories.flatMap(c => c.channels)[0];
  if (firstChannel) {
    selectChannel(firstChannel);
  } else {
    currentChannelId = null;
    switchMainView("channel");
    document.getElementById("channel-header-title").textContent = "No channels yet";
    document.getElementById("channel-messages").style.display = "none";
    document.getElementById("channel-empty").style.display = "flex";
    document.getElementById("channel-empty-badge").textContent = "#";
    document.getElementById("channel-welcome-title").textContent = "";
    document.getElementById("channel-welcome-sub").textContent = "";
    disableChannelComposer("No channel selected.");
  }
}

function renderServerSidebar(data) {
  const list = document.getElementById("category-list");
  list.innerHTML = "";
  const isOwner = data.owner === myUserId;

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
    nameEl.addEventListener("contextmenu", (e) => showCategoryContextMenu(e, category, isOwner));
    header.appendChild(nameEl);

    if (isOwner) {
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

      row.addEventListener("click", () => selectChannel(channel, row));
      row.addEventListener("contextmenu", (e) => showChannelContextMenu(e, channel, isOwner));
      channelsEl.appendChild(row);
    });

    // Collapse/expand is purely visual, doesn't persist across refresh.
    header.addEventListener("click", () => block.classList.toggle("collapsed"));

    block.appendChild(header);
    block.appendChild(channelsEl);
    list.appendChild(block);
  });
}

async function selectChannel(channel, rowEl) {
  // A forum thread borrows the channel chat view, so leaving the channel
  // has to hand it back. Skipping this would leave sendChannelMessage
  // addressing the old thread from inside the next text channel.
  openForumPostId = null;
  openForumPostTitle = null;
  document.getElementById("forum-back-btn").style.display = "none";

  currentChannelId = channel.id;
  currentChannelType = channel.channel_type;
  currentChannelName = channel.name;

  document.querySelectorAll(".channel-row").forEach(r => r.classList.remove("active"));
  const activeRow = rowEl || document.querySelector(`.channel-row[data-channel-id="${channel.id}"]`);
  if (activeRow) activeRow.classList.add("active");

  switchMainView("channel");
  const isVoice = channel.channel_type === "voice";
  const isAnnouncement = channel.channel_type === "announcements";
  // "forums" plural - must match /create_forum and /get_forum_post's own
  // channel_type comparison, and the radio value in app.html that gets
  // stored verbatim at creation time.
  const isForums = channel.channel_type === "forums";
  const label = isVoice ? channel.name : `#${channel.name}`;
  document.getElementById("channel-header-title").textContent = label;

  const channelEmpty = document.getElementById("channel-empty");
  const channelMessages = document.getElementById("channel-messages");
  const channelBody = document.getElementById("channel-body");
  const channelComposer = document.getElementById("channel-composer");
  const announcementsView = document.getElementById("announcements-view");
  const forumsView = document.getElementById("forums-view");

  // Both special panels go down up front so each branch below only has
  // to turn its own on - otherwise switching straight from an
  // Announcements channel to a Forums one would leave the first visible
  // underneath the second.
  announcementsView.style.display = "none";
  forumsView.style.display = "none";

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
    loadForumPosts(channel.id);
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
    currentChannelMessages = data.messages.map(msg => ({
      id: msg.id,
      isMine: msg.sender_id === myUserId,
      senderId: msg.sender_id,
      username: msg.username,
      content: msg.content,
      time: new Date(msg.timestamp)
    }));
    if (currentChannelMessages.length < 25) channelHasMoreHistory = false;
    renderChannelMessages();
  } catch (e) { renderChannelMessages(); }
}
