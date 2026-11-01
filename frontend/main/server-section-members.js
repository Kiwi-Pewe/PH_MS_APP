let serverMembersChannelListSaving = false;

function serverShowsMembersSection() {
  return !!(currentServerData && currentServerData.show_members_in_channel_list);
}

function serverMembersSectionOpen() {
  const page = document.getElementById("server-members-section");
  return !!(page && page.style.display === "flex");
}

function markServerSectionActive(id) {
  document.querySelectorAll(".server-section-row").forEach((row) => {
    row.classList.toggle("active", !!id && row.id === id);
  });
}

function paintServerSectionMembersRow() {
  const row = document.getElementById("server-section-members");
  if (!row) return;
  const shown = serverShowsMembersSection();
  row.hidden = !shown;
  if (!shown && serverMembersSectionOpen()) {
    if (typeof openServerOverview === "function") openServerOverview();
    else {
      const page = document.getElementById("server-members-section");
      if (page) page.style.display = "none";
      markServerSectionActive("server-section-overview");
    }
  }
}

function paintServerMembersChannelListToggle() {
  const toggle = document.getElementById("server-members-channel-list-toggle");
  const wrap = document.getElementById("server-members-channel-list-switch");
  if (!toggle) return;
  const canEdit = typeof canUpdateServer === "function" && canUpdateServer();
  toggle.checked = serverShowsMembersSection();
  toggle.disabled = !canEdit || serverMembersChannelListSaving;
  if (wrap) {
    wrap.classList.toggle("is-disabled", !canEdit);
    wrap.title = canEdit ? "" : "You do not have permission to update this server.";
  }
}

function applyServerMembersChannelList(serverId, shown) {
  const on = !!shown;
  if (currentServerData && String(currentServerId) === String(serverId)) {
    currentServerData.show_members_in_channel_list = on;
  }
  paintServerSectionMembersRow();
  paintServerMembersChannelListToggle();
}

function serverSectionMembersSource() {
  if (
    typeof memberList !== "undefined"
    && memberListScope === "server"
    && String(memberListScopeId) === String(currentServerId)
  ) {
    return memberList.slice();
  }
  return [];
}

function serverSectionMembersDisplayName(member) {
  return String((member && (member.display_name || member.username)) || "").trim();
}

function serverSectionMembersAppearsOnline(member) {
  return typeof memberAppearsOnline === "function"
    ? memberAppearsOnline(member.status)
    : member.status === "online" || member.status === "away" || member.status === "dnd";
}

function serverSectionMembersByName(a, b) {
  return serverSectionMembersDisplayName(a).localeCompare(
    serverSectionMembersDisplayName(b),
    undefined,
    { sensitivity: "base" }
  ) || String(a.username || "").localeCompare(String(b.username || ""), undefined, { sensitivity: "base" });
}

function serverSectionMembersGroups(members) {
  const online = [];
  const offline = [];
  members.forEach((member) => {
    if (serverSectionMembersAppearsOnline(member)) online.push(member);
    else offline.push(member);
  });
  online.sort(serverSectionMembersByName);
  offline.sort(serverSectionMembersByName);
  const groups = new Map();
  const leftover = [];
  online.forEach((member) => {
    const hoist = member.hoist_role;
    if (hoist && hoist.id != null) {
      const key = String(hoist.id);
      if (!groups.has(key)) groups.set(key, { role: hoist, members: [] });
      groups.get(key).members.push(member);
    } else leftover.push(member);
  });
  const packed = Array.from(groups.values())
    .sort((a, b) => (a.role.position || 0) - (b.role.position || 0) || (a.role.id - b.role.id))
    .map((group) => ({
      key: "hoist-" + group.role.id,
      label: group.role.name || "Role",
      color: group.role.color,
      members: group.members
    }));
  if (leftover.length) packed.push({ key: "online", label: "Online", color: "", members: leftover });
  if (offline.length) packed.push({ key: "offline", label: "Offline", color: "", members: offline });
  return packed;
}

function buildServerSectionMemberCard(member) {
  const row = document.createElement("div");
  const isOnline = serverSectionMembersAppearsOnline(member);
  const status = isOnline ? (member.status || "online") : "offline";
  row.className = "server-section-members-row" + (isOnline ? "" : " is-offline");
  row.dataset.memberId = String(member.id);

  const face = document.createElement("div");
  face.className = "avatar-dot";
  const pip = document.createElement("div");
  pip.className = "status-dot status-" + status;
  face.appendChild(pip);
  row.appendChild(face);
  if (typeof paintUserFace === "function") {
    paintUserFace(face, member, { name: member.username, userId: member.id });
  }

  const text = document.createElement("div");
  text.className = "server-section-members-text";
  const display = document.createElement("div");
  display.className = "server-section-members-display";
  display.textContent = serverSectionMembersDisplayName(member) || member.username || "";
  if (isOnline && typeof applyServerNameColor === "function") {
    applyServerNameColor(display, member.id, member.name_role);
  }
  text.appendChild(display);
  const username = String(member.username || "").trim();
  if (username) {
    const account = document.createElement("div");
    account.className = "server-section-members-username";
    account.textContent = username;
    text.appendChild(account);
  }
  const typed = String(
    (member && member.status_line)
    || (typeof userStatusLine === "function" ? userStatusLine(member.id) : "")
    || ""
  ).trim();
  if (typed) {
    const line = document.createElement("div");
    line.className = "server-section-members-status";
    line.textContent = typed;
    text.appendChild(line);
  }
  row.appendChild(text);

  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(row, member.id);
  row.addEventListener("contextmenu", (e) => {
    if (typeof showMemberContextMenu === "function") showMemberContextMenu(e, member);
  });
  return row;
}

function paintServerSectionMembersList() {
  const body = document.getElementById("server-members-section-list");
  if (!body || !serverMembersSectionOpen()) return;
  const rows = serverSectionMembersSource();
  body.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "server-settings-help";
    empty.textContent = "No members.";
    body.appendChild(empty);
    return;
  }
  serverSectionMembersGroups(rows).forEach((group) => {
    const wrap = document.createElement("section");
    wrap.className = "server-section-members-group";
    const label = document.createElement("div");
    label.className = "server-section-members-group-label";
    label.textContent = group.label + " — " + group.members.length;
    if (group.color) label.style.color = group.color;
    wrap.appendChild(label);
    group.members.forEach((member) => wrap.appendChild(buildServerSectionMemberCard(member)));
    body.appendChild(wrap);
  });
}

async function openServerMembersSection() {
  if (!currentServerId || !serverShowsMembersSection()) return;
  if (typeof switchMainView === "function") switchMainView("channel");
  if (typeof abandonMessageEdit === "function") abandonMessageEdit();
  if (typeof abandonAnnouncementEdit === "function") abandonAnnouncementEdit();
  if (typeof abandonForumEdit === "function") abandonForumEdit();
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof closePinsPanel === "function") closePinsPanel();
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  if (typeof hideDocChannelChrome === "function") hideDocChannelChrome();
  if (typeof hideMediaChannelChrome === "function") hideMediaChannelChrome();
  if (typeof hideScheduleChrome === "function") hideScheduleChrome();
  if (typeof hideEventBack === "function") hideEventBack();
  if (typeof hideExplicitChannelGate === "function") hideExplicitChannelGate();
  if (typeof closeVoiceStage === "function") closeVoiceStage();
  if (typeof overviewStopTick === "function") overviewStopTick();
  openForumPostId = null;
  const forumBack = document.getElementById("forum-back-btn");
  if (forumBack) forumBack.style.display = "none";
  const eventPageBack = document.getElementById("event-page-back");
  if (eventPageBack) eventPageBack.style.display = "none";
  const forumOpener = document.getElementById("forum-thread-opener");
  if (forumOpener) {
    forumOpener.hidden = true;
    forumOpener.replaceChildren();
  }
  currentChannelId = null;
  currentChannelType = null;
  currentChannelName = null;
  document.querySelectorAll(".channel-row.active").forEach((row) => row.classList.remove("active"));
  if (typeof hideChannelSurfaces === "function") hideChannelSurfaces();
  const voiceView = document.getElementById("voice-view");
  if (voiceView) voiceView.style.display = "none";
  const page = document.getElementById("server-members-section");
  if (page) page.style.display = "flex";
  markServerSectionActive("server-section-members");
  const title = document.getElementById("channel-header-title");
  if (title) title.textContent = "Members";
  if (typeof setHeaderDescription === "function") setHeaderDescription("channel-header-desc", "");
  paintServerSectionMembersList();
  if (serverSectionMembersSource().length) return;
  try {
    const response = await fetch(
      `https://${serverAddress}/get_server_members/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !serverMembersSectionOpen()) return;
    if (typeof applyServerMembers === "function") applyServerMembers(currentServerId, data.members || []);
    paintServerSectionMembersList();
  } catch (e) {}
}

async function saveServerMembersChannelList(shown) {
  if (!currentServerId || serverMembersChannelListSaving) return;
  if (typeof canUpdateServer === "function" && !canUpdateServer()) {
    paintServerMembersChannelListToggle();
    return;
  }
  const next = !!shown;
  const previous = serverShowsMembersSection();
  if (next === previous) return;
  serverMembersChannelListSaving = true;
  paintServerMembersChannelListToggle();
  if (typeof setServerMembersStatus === "function") setServerMembersStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_members_channel_list`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        show_members_in_channel_list: next
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save that setting.");
    applyServerMembersChannelList(currentServerId, data.show_members_in_channel_list);
  } catch (e) {
    if (typeof setServerMembersStatus === "function") {
      setServerMembersStatus(e.message || "Could not save that setting.");
    }
    paintServerMembersChannelListToggle();
  } finally {
    serverMembersChannelListSaving = false;
    paintServerMembersChannelListToggle();
  }
}

(function bindServerSectionMembers() {
  const row = document.getElementById("server-section-members");
  if (row) {
    row.addEventListener("click", () => {
      if (typeof beginBody === "function") {
        beginBody({
          view: "channel",
          titleEl: "channel-header-title",
          title: "Members"
        });
      }
      openServerMembersSection();
    });
  }
  const toggle = document.getElementById("server-members-channel-list-toggle");
  if (toggle) {
    toggle.addEventListener("change", () => saveServerMembersChannelList(toggle.checked));
  }
})();
