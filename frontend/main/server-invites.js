// ==================================================================
// server-invites.js - Server Settings → Invites table (Discord-like).
// Create invite link reuses Invite People submenu. Pause is placeholder.
// ==================================================================

let serverInvitesList = [];
let serverInvitesLoadedFor = null;
let serverInvitesBusy = false;

function serverInvitesPageOpen() {
  const page = document.getElementById("server-settings-invites");
  return !!(typeof isServerSettingsOpen !== "undefined" && isServerSettingsOpen && page && !page.hidden);
}

function setServerInvitesStatus(text) {
  const status = document.getElementById("server-invites-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function formatInviteExpires(expiresAt) {
  if (!expiresAt) return "∞";
  const date = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(expiresAt) : new Date(expiresAt);
  if (!date || Number.isNaN(date.getTime())) return "∞";
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "in " + sec + "s";
  if (sec < 3600) return "in " + Math.round(sec / 60) + "m";
  if (sec < 86400) return "in " + Math.round(sec / 3600) + "h";
  return "in " + Math.round(sec / 86400) + "d";
}

function paintServerInvitesTable() {
  const body = document.getElementById("server-invites-body");
  const empty = document.getElementById("server-invites-empty");
  if (!body) return;
  body.innerHTML = "";
  if (empty) empty.hidden = serverInvitesList.length > 0;

  serverInvitesList.forEach((invite) => {
    const tr = document.createElement("tr");
    tr.className = "server-invites-row";

    const inviterTd = document.createElement("td");
    inviterTd.className = "server-invites-col-inviter";
    const inviter = document.createElement("div");
    inviter.className = "server-invites-inviter";
    const face = document.createElement("div");
    face.className = "avatar-dot server-invites-avatar";
    inviter.appendChild(face);
    const labels = document.createElement("div");
    labels.className = "server-invites-inviter-labels";
    const name = document.createElement("div");
    name.className = "server-invites-inviter-name";
    const creator = invite.creator || {};
    name.textContent = creator.display_name || creator.username || "Unknown";
    const channel = document.createElement("div");
    channel.className = "server-invites-inviter-channel";
    channel.textContent = invite.channel_name || "Unknown";
    labels.appendChild(name);
    labels.appendChild(channel);
    inviter.appendChild(labels);
    inviterTd.appendChild(inviter);
    tr.appendChild(inviterTd);

    const codeTd = document.createElement("td");
    codeTd.className = "server-invites-col-code";
    codeTd.textContent = invite.code || "—";
    tr.appendChild(codeTd);

    const usesTd = document.createElement("td");
    usesTd.className = "server-invites-col-uses";
    usesTd.textContent = String(invite.uses != null ? invite.uses : 0);
    tr.appendChild(usesTd);

    const expiresTd = document.createElement("td");
    expiresTd.className = "server-invites-col-expires";
    expiresTd.textContent = formatInviteExpires(invite.expires_at);
    tr.appendChild(expiresTd);

    const rolesTd = document.createElement("td");
    rolesTd.className = "server-invites-col-roles";
    rolesTd.textContent = "";
    tr.appendChild(rolesTd);

    body.appendChild(tr);
    if (typeof paintUserFace === "function" && creator.id) {
      paintUserFace(face, creator, { name: creator.username, userId: creator.id });
    } else if (typeof rememberIdentityFace === "function" && creator.id) {
      rememberIdentityFace(creator.id, creator.avatar);
      if (typeof paintUserFace === "function") {
        paintUserFace(face, creator, { name: creator.username, userId: creator.id });
      }
    }
  });
}

async function loadServerInvitesPage(force) {
  if (!currentServerId || typeof canOpenServerInvites === "function" && !canOpenServerInvites()) return;
  const create = document.getElementById("server-invites-create");
  if (create) {
    const canCreate = typeof canInviteMembers !== "function" || canInviteMembers();
    create.disabled = !canCreate;
    create.title = canCreate ? "" : "You do not have permission to invite members.";
  }
  if (!force && serverInvitesLoadedFor === currentServerId) {
    paintServerInvitesTable();
    return;
  }
  setServerInvitesStatus("");
  serverInvitesBusy = true;
  try {
    const response = await fetch(
      `https://${serverAddress}/server_settings_invites/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load invites.");
    serverInvitesList = data.invites || [];
    serverInvitesLoadedFor = currentServerId;
    serverInvitesList.forEach((invite) => {
      const creator = invite.creator;
      if (creator && typeof rememberIdentityFace === "function") {
        rememberIdentityFace(creator.id, creator.avatar);
      }
    });
    paintServerInvitesTable();
  } catch (e) {
    setServerInvitesStatus(e.message || "Could not load invites.");
    serverInvitesList = [];
    paintServerInvitesTable();
  } finally {
    serverInvitesBusy = false;
  }
}

function refreshServerInvitesPage() {
  if (!serverInvitesPageOpen()) {
    serverInvitesLoadedFor = null;
    return;
  }
  loadServerInvitesPage(true);
}

function openServerInvitesCreate() {
  if (!currentServerId || typeof canInviteMembers === "function" && !canInviteMembers()) return;
  const name = typeof currentServerSettingsName === "function"
    ? currentServerSettingsName()
    : ((typeof serverList !== "undefined" && serverList.find((s) => s.id === currentServerId)) || {}).name || "Server";
  if (typeof openInviteModal === "function") openInviteModal("server", currentServerId, name);
}

(function bindServerInvitesChrome() {
  const create = document.getElementById("server-invites-create");
  if (create) create.addEventListener("click", openServerInvitesCreate);
})();
