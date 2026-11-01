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

function paintServerSectionMembersList() {
  const body = document.getElementById("server-members-section-list");
  if (!body || !serverMembersSectionOpen()) return;
  const rows = serverSectionMembersSource();
  const online = typeof memberAppearsOnline === "function"
    ? (member) => memberAppearsOnline(member.status)
    : (member) => member.status === "online" || member.status === "away" || member.status === "dnd";
  rows.sort((a, b) => {
    const ao = online(a) ? 0 : 1;
    const bo = online(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return serverSectionMembersDisplayName(a).localeCompare(
      serverSectionMembersDisplayName(b),
      undefined,
      { sensitivity: "base" }
    ) || String(a.username || "").localeCompare(String(b.username || ""), undefined, { sensitivity: "base" });
  });
  body.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "server-settings-help";
    empty.textContent = "No members.";
    body.appendChild(empty);
    return;
  }
  rows.forEach((member) => {
    const row = document.createElement("div");
    const isOnline = online(member);
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
    body.appendChild(row);
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
