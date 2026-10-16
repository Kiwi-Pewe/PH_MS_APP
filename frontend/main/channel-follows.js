let announceFollowInfo = null;
let announceNoticeTimer = null;

function showAnnounceNotice(text) {
  const note = document.getElementById("announce-notice");
  if (!note) return;
  if (announceNoticeTimer) clearTimeout(announceNoticeTimer);
  note.textContent = text || "";
  note.hidden = !text;
  if (text) announceNoticeTimer = setTimeout(() => { note.hidden = true; }, 5000);
}

function paintAnnounceFollowChrome() {
  const btn = document.getElementById("announce-follow-btn");
  const count = document.getElementById("announce-follower-count");
  const publishRow = document.getElementById("announce-publish");
  const publishInput = document.getElementById("announce-publish-input");
  const info = announceFollowInfo && Number(announceFollowInfo.channel_id) === Number(currentChannelId) ? announceFollowInfo : null;
  const servers = info ? (info.servers || []) : [];
  if (btn) {
    btn.hidden = !(info && info.followable);
    btn.disabled = !servers.length;
  }
  if (count) {
    const n = info ? Number(info.follower_count || 0) : 0;
    count.hidden = !n;
    count.textContent = n === 1 ? "1 follower" : n + " followers";
  }
  if (publishRow) publishRow.hidden = !(info && info.followable);
  if (publishInput && !(info && info.followable)) publishInput.checked = false;
}

async function loadAnnounceFollowInfo(channelId) {
  announceFollowInfo = null;
  paintAnnounceFollowChrome();
  if (!channelId) return;
  try {
    const response = await fetch(`https://${serverAddress}/follow_targets/${channelId}`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || Number(currentChannelId) !== Number(channelId)) return;
    announceFollowInfo = data;
  } catch (err) {
    announceFollowInfo = null;
  }
  paintAnnounceFollowChrome();
}

function announceCanPublish(post) {
  if (!post || post.followed || post.published_at) return false;
  if (!announceFollowInfo || !announceFollowInfo.followable) return false;
  if (typeof canManageAnnouncements === "function" && canManageAnnouncements()) return true;
  return post.sender_id === myUserId && typeof canCreateAnnouncements === "function" && canCreateAnnouncements();
}

function markAnnouncementPublished(postId, publishedAt) {
  const post = (typeof currentAnnouncementPosts !== "undefined" ? currentAnnouncementPosts : []).find((row) => row.id === postId);
  if (post) post.published_at = publishedAt || new Date().toISOString();
  const card = document.querySelector(`.announce-post[data-post-id="${postId}"]`);
  const row = card && card.querySelector(".announce-post-title-row");
  if (row && !row.querySelector(".announce-published-tag")) row.appendChild(buildPublishedTag());
}

function buildPublishedTag() {
  const tag = document.createElement("span");
  tag.className = "edited-tag announce-published-tag";
  tag.textContent = "published";
  return tag;
}

async function publishAnnouncementPost(post) {
  if (!post) return;
  const response = await fetch(`https://${serverAddress}/publish_announcement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ post_id: post.id })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showAnnounceNotice((typeof data.detail === "string" && data.detail) || "Could not publish that post.");
    return;
  }
  markAnnouncementPublished(post.id, data.published_at);
  const n = Number(data.delivered || 0);
  showAnnounceNotice(n ? ("Published to " + n + (n === 1 ? " channel." : " channels.")) : "Published. No channels follow this one yet.");
}

function followSourceLabel(info) {
  return (info && info.source_server_name) || "Server";
}

function paintFollowedByline(post, avatar, name, role) {
  const info = post.followed_from || {};
  if (avatar) {
    avatar.replaceChildren();
    avatar.classList.add("announce-followed-face");
    if (info.source_server_icon) {
      const img = document.createElement("img");
      img.src = info.source_server_icon;
      img.alt = "";
      avatar.appendChild(img);
    } else {
      avatar.textContent = followSourceLabel(info).charAt(0).toUpperCase();
    }
  }
  if (name) {
    name.textContent = followSourceLabel(info);
    name.style.color = "";
  }
  if (role) {
    role.textContent = "via #" + (info.source_channel_name || "announcements");
    if (info.source_deleted) role.textContent = "Original post deleted";
  }
}

function followedPostCanJump(post) {
  const info = post && post.followed_from;
  if (!info || info.source_deleted || !info.source_server_id) return false;
  if (typeof serverList === "undefined" || !Array.isArray(serverList)) return false;
  return serverList.some((row) => row && String(row.id) === String(info.source_server_id));
}

async function jumpToFollowedSource(post) {
  const info = post && post.followed_from;
  if (!info || typeof openServer !== "function") return;
  const icon = document.querySelector(`.rail-icon.server-icon[data-server-id="${info.source_server_id}"]`);
  if (!icon) return;
  await openServer(info.source_server_id, icon, info.source_channel_id);
  if (typeof jumpLoadAroundAnnouncement === "function" && info.source_post_id) jumpLoadAroundAnnouncement(info.source_post_id);
}

function fillFollowServerOptions() {
  const serverSelect = document.getElementById("follow-channel-server");
  if (!serverSelect) return;
  serverSelect.replaceChildren();
  const servers = (announceFollowInfo && announceFollowInfo.servers) || [];
  servers.forEach((entry) => {
    const option = document.createElement("option");
    option.value = String(entry.server_id);
    option.textContent = entry.server_name || "Server";
    serverSelect.appendChild(option);
  });
  fillFollowChannelOptions();
}

function fillFollowChannelOptions() {
  const serverSelect = document.getElementById("follow-channel-server");
  const destSelect = document.getElementById("follow-channel-dest");
  if (!serverSelect || !destSelect) return;
  destSelect.replaceChildren();
  const servers = (announceFollowInfo && announceFollowInfo.servers) || [];
  const entry = servers.find((row) => String(row.server_id) === serverSelect.value);
  ((entry && entry.channels) || []).forEach((channel) => {
    const option = document.createElement("option");
    option.value = String(channel.channel_id);
    option.textContent = "#" + (channel.channel_name || "announcements");
    destSelect.appendChild(option);
  });
}

function openFollowChannelSubmenu() {
  const overlay = document.getElementById("follow-channel-overlay");
  const err = document.getElementById("follow-channel-error");
  if (!overlay || !announceFollowInfo) return;
  if (!(announceFollowInfo.servers || []).length) {
    showAnnounceNotice("You need an announcement channel you can manage.");
    return;
  }
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  fillFollowServerOptions();
  overlay.hidden = false;
}

function closeFollowChannelSubmenu() {
  const overlay = document.getElementById("follow-channel-overlay");
  if (overlay) overlay.hidden = true;
}

async function confirmFollowChannel() {
  const destSelect = document.getElementById("follow-channel-dest");
  const err = document.getElementById("follow-channel-error");
  const confirm = document.getElementById("follow-channel-confirm");
  const destId = destSelect ? Number(destSelect.value) : 0;
  if (!destId || !currentChannelId) {
    if (err) {
      err.hidden = false;
      err.textContent = "Pick a channel to follow into.";
    }
    return;
  }
  if (confirm) confirm.disabled = true;
  try {
    const response = await fetch(`https://${serverAddress}/follow_channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ source_channel_id: currentChannelId, dest_channel_id: destId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not follow this channel.");
    closeFollowChannelSubmenu();
    showAnnounceNotice("Following into #" + (data.dest_channel_name || "announcements") + ".");
    loadAnnounceFollowInfo(currentChannelId);
  } catch (error) {
    if (err) {
      err.hidden = false;
      err.textContent = error.message || "Could not follow this channel.";
    }
  } finally {
    if (confirm) confirm.disabled = false;
  }
}

function bindFollowChannelChrome() {
  const btn = document.getElementById("announce-follow-btn");
  if (btn) btn.addEventListener("click", openFollowChannelSubmenu);
  const serverSelect = document.getElementById("follow-channel-server");
  if (serverSelect) serverSelect.addEventListener("change", fillFollowChannelOptions);
  ["follow-channel-close", "follow-channel-cancel"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", closeFollowChannelSubmenu);
  });
  const confirm = document.getElementById("follow-channel-confirm");
  if (confirm) confirm.addEventListener("click", confirmFollowChannel);
  const overlay = document.getElementById("follow-channel-overlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target.id === "follow-channel-overlay") closeFollowChannelSubmenu();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && !overlay.hidden) closeFollowChannelSubmenu();
  });
}

bindFollowChannelChrome();

function buildFollowRow(row, channels, onChange) {
  const line = document.createElement("div");
  line.className = "channel-follow-row";
  const label = document.createElement("div");
  label.className = "channel-follow-label";
  const source = document.createElement("div");
  source.textContent = (row.server_name || "Server") + " / #" + (row.channel_name || "announcements");
  label.appendChild(source);
  if (channels) {
    const dest = document.createElement("div");
    dest.className = "channel-follow-dest";
    dest.textContent = "into #" + (row.dest_channel_name || "announcements");
    label.appendChild(dest);
  }
  const actions = document.createElement("div");
  actions.className = "channel-follow-actions";
  if (channels && channels.length > 1) {
    const select = document.createElement("select");
    select.className = "settings-select server-settings-select";
    channels.forEach((channel) => {
      const option = document.createElement("option");
      option.value = String(channel.channel_id);
      option.textContent = "#" + (channel.channel_name || "announcements");
      option.selected = Number(channel.channel_id) === Number(row.dest_channel_id);
      select.appendChild(option);
    });
    select.addEventListener("change", async () => {
      const response = await fetch(`https://${serverAddress}/move_channel_follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ follow_id: row.follow_id, dest_channel_id: Number(select.value) })
      });
      if (!response.ok) select.value = String(row.dest_channel_id);
      onChange();
    });
    actions.appendChild(select);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ghost-btn";
  remove.textContent = "Unfollow";
  remove.addEventListener("click", async () => {
    await fetch(`https://${serverAddress}/unfollow_channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ follow_id: row.follow_id })
    });
    onChange();
  });
  actions.appendChild(remove);
  line.appendChild(label);
  line.appendChild(actions);
  return line;
}

async function paintServerFollows() {
  const list = document.getElementById("server-integrations-follows-list");
  const empty = document.getElementById("server-integrations-follows-empty");
  if (!list || !currentServerId) return;
  list.replaceChildren();
  try {
    const response = await fetch(`https://${serverAddress}/server_follows/${encodeURIComponent(currentServerId)}`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = (typeof data.detail === "string" && data.detail) || "Could not load followed channels.";
      }
      return;
    }
    const follows = data.follows || [];
    if (empty) {
      empty.hidden = follows.length > 0;
      empty.textContent = "No announcement channels are being followed into this server.";
    }
    follows.forEach((row) => list.appendChild(buildFollowRow(row, data.channels || [], paintServerFollows)));
  } catch (err) {
    if (empty) empty.hidden = false;
  }
}
