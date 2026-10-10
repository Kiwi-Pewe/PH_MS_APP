// ==================================================================
// invites.js - Invite panel, in-chat invite cards, and accepting an invite.
// ==================================================================

const INVITE_AGE_OPTIONS = [
  [1800, "30 minutes"],
  [3600, "1 hour"],
  [21600, "6 hours"],
  [43200, "12 hours"],
  [86400, "1 day"],
  [604800, "7 days"],
  [2592000, "30 days"],
  [0, "Never"]
];
const INVITE_USE_OPTIONS = [
  [1, "1 use"],
  [5, "5 uses"],
  [10, "10 uses"],
  [25, "25 uses"],
  [50, "50 uses"],
  [100, "100 uses"],
  [0, "No limit"]
];

let inviteModalTarget = { type: null, id: null, name: null, channelId: null, landingName: "" };
let inviteModalCode = null;
let inviteModalSettings = { max_age: 2592000, max_uses: 0, role_ids: [], temporary: false };
let inviteModalPeople = [];
let inviteModalQuery = "";
let inviteModalSent = new Set();
let inviteSettingsRoles = [];
let inviteSettingsPicked = [];

document.getElementById("invite-modal-close").addEventListener("click", closeInviteModal);
document.getElementById("invite-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "invite-modal-overlay") closeInviteModal();
});
document.getElementById("invite-copy-btn").addEventListener("click", copyInviteLink);
document.getElementById("invite-modal-search").addEventListener("input", (e) => {
  inviteModalQuery = e.target.value || "";
  paintInviteRecipients();
});
document.getElementById("invite-settings-close").addEventListener("click", closeInviteSettings);
document.getElementById("invite-settings-cancel").addEventListener("click", closeInviteSettings);
document.getElementById("invite-settings-overlay").addEventListener("click", (e) => {
  if (e.target.id === "invite-settings-overlay") closeInviteSettings();
});
document.getElementById("invite-settings-generate").addEventListener("click", generateInviteLink);
document.getElementById("invite-settings-roles").addEventListener("change", (e) => {
  const id = e.target.value;
  e.target.value = "";
  if (!id || inviteSettingsPicked.some((role) => String(role.id) === String(id))) return;
  const role = inviteSettingsRoles.find((row) => String(row.id) === String(id));
  if (!role) return;
  inviteSettingsPicked.push(role);
  paintInviteSettingsRoles();
});

function inviteAgeLabel(maxAge) {
  const match = INVITE_AGE_OPTIONS.find((row) => row[0] === Number(maxAge));
  return match ? match[1] : "30 days";
}

function inviteExpirySentence(maxAge) {
  if (Number(maxAge) === 0) return "Your invite link never expires. ";
  return "Your invite link expires in " + inviteAgeLabel(maxAge) + ". ";
}

function fillInviteSelect(select, options, selected) {
  if (!select) return;
  select.innerHTML = "";
  options.forEach((row) => {
    const opt = document.createElement("option");
    opt.value = String(row[0]);
    opt.textContent = row[1];
    opt.selected = Number(row[0]) === Number(selected);
    select.appendChild(opt);
  });
}

function paintInviteExpiry() {
  const line = document.getElementById("invite-modal-expiry");
  if (!line) return;
  line.innerHTML = "";
  if (inviteModalTarget.type !== "server") {
    line.textContent = "Your invite link expires in 24 hours.";
    return;
  }
  line.appendChild(document.createTextNode(inviteExpirySentence(inviteModalSettings.max_age)));
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "invite-modal-edit";
  edit.id = "invite-edit-link";
  edit.textContent = "Edit invite link.";
  edit.addEventListener("click", openInviteSettings);
  line.appendChild(edit);
}

function paintInviteRecipients() {
  const rows = document.getElementById("invite-modal-friend-rows");
  const empty = document.getElementById("invite-modal-empty-note");
  if (!rows) return;
  const needle = inviteModalQuery.trim().toLowerCase();
  const people = inviteModalPeople.filter((person) => {
    if (!needle) return true;
    return (person.name || "").toLowerCase().includes(needle)
      || (person.username || "").toLowerCase().includes(needle);
  });
  rows.innerHTML = "";
  if (empty) empty.hidden = people.length > 0 || !!needle;
  if (!people.length && needle) {
    const note = document.createElement("p");
    note.className = "invite-modal-empty";
    note.textContent = "No one matches.";
    rows.appendChild(note);
    return;
  }
  people.forEach((person) => {
    const row = document.createElement("div");
    row.className = "invite-recipient";
    const face = document.createElement("div");
    face.className = "avatar-dot invite-recipient-face";
    const text = document.createElement("div");
    text.className = "invite-recipient-text";
    const name = document.createElement("div");
    name.className = "invite-recipient-name";
    name.textContent = person.name || person.username || "Unknown";
    const sub = document.createElement("div");
    sub.className = "invite-recipient-sub";
    sub.textContent = person.kind === "party"
      ? ((person.memberCount || 0) + " Members")
      : (person.username || "");
    text.appendChild(name);
    if (sub.textContent) text.appendChild(sub);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost-btn invite-recipient-btn";
    const sent = inviteModalSent.has(person.kind + ":" + person.id);
    btn.textContent = sent ? "Invited" : "Invite";
    btn.disabled = sent || !inviteModalCode;
    btn.addEventListener("click", () => sendInviteToPerson(person, btn));
    row.appendChild(face);
    row.appendChild(text);
    row.appendChild(btn);
    rows.appendChild(row);
    if (person.kind === "dm" && typeof paintUserFace === "function") {
      paintUserFace(face, person, { name: person.username || person.name, userId: person.id });
    } else {
      face.textContent = avatarLetter(person.name || person.username || "?");
    }
  });
}

function rememberInvitePeople(friends) {
  const byKey = new Map();
  (friends || []).forEach((friend) => {
    byKey.set("dm:" + friend.id, {
      kind: "dm",
      id: friend.id,
      name: friend.display_name || friend.username || "Unknown",
      username: friend.username || "",
      avatar: friend.avatar || null
    });
  });
  (typeof conversationList !== "undefined" ? conversationList : []).forEach((convo) => {
    if (!convo) return;
    if (convo.type === "party") {
      byKey.set("party:" + convo.id, {
        kind: "party",
        id: convo.id,
        name: convo.name || "Party",
        username: "",
        memberCount: convo.memberCount || 0
      });
      return;
    }
    const key = "dm:" + convo.id;
    const current = byKey.get(key);
    byKey.set(key, {
      kind: "dm",
      id: convo.id,
      name: (current && current.name) || convo.displayName || convo.username || "Unknown",
      username: convo.username || (current && current.username) || "",
      avatar: convo.avatar || (current && current.avatar) || null
    });
  });
  inviteModalPeople = Array.from(byKey.values());
  paintInviteRecipients();
}

function applyInviteLink(data) {
  inviteModalCode = data.invite_code;
  inviteModalSettings = {
    max_age: data.max_age === undefined || data.max_age === null ? 2592000 : Number(data.max_age),
    max_uses: data.max_uses === undefined || data.max_uses === null ? 0 : Number(data.max_uses),
    role_ids: data.role_ids || [],
    temporary: !!data.temporary
  };
  const display = document.getElementById("invite-link-display");
  if (display) display.value = "https://oneira.cc/invite/" + inviteModalCode;
  paintInviteExpiry();
  paintInviteRecipients();
  if (typeof refreshServerInvitesPage === "function") refreshServerInvitesPage();
  if (typeof loadChannelInvitesPage === "function") loadChannelInvitesPage();
}

async function requestInviteLink(replace) {
  const target = inviteModalTarget;
  const body = {
    type: target.type,
    server_id: target.type === "server" ? target.id : null,
    party_id: target.type === "party" ? target.id : null,
    channel_id: target.type === "server" ? (target.channelId || null) : null,
    replace: !!replace
  };
  if (replace && target.type === "server") {
    const age = document.getElementById("invite-settings-age");
    const uses = document.getElementById("invite-settings-uses");
    const temporary = document.getElementById("invite-settings-temporary");
    body.max_age = age ? Number(age.value) : inviteModalSettings.max_age;
    body.max_uses = uses ? Number(uses.value) : inviteModalSettings.max_uses;
    body.role_ids = inviteSettingsPicked.map((role) => role.id);
    body.temporary = !!(temporary && temporary.checked);
  }
  const response = await fetch(`https://${serverAddress}/create_invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Failed to generate invite.");
  applyInviteLink(data);
}

async function openInviteModal(type, id, name, channelId, landingName) {
  if (type === "server" && typeof canInviteMembers === "function" && !canInviteMembers() && id === currentServerId) return;
  inviteModalTarget = { type, id, name, channelId: channelId || null, landingName: landingName || "" };
  inviteModalCode = null;
  inviteModalPeople = [];
  inviteModalQuery = "";
  inviteModalSent = new Set();
  const search = document.getElementById("invite-modal-search");
  if (search) search.value = "";
  document.getElementById("invite-modal-title").textContent = "Invite friends to " + (name || "Server");
  const landing = document.getElementById("invite-modal-landing");
  if (landing) {
    if (type === "party") landing.textContent = "Recipients will join this party.";
    else if (landingName) landing.textContent = "Recipients will land in #" + landingName;
    else landing.textContent = "Recipients will land in this server.";
  }
  const linkLabel = document.getElementById("invite-modal-link-label");
  if (linkLabel) {
    linkLabel.textContent = type === "party"
      ? "Or, send a party invite link to a friend"
      : "Or, send a server invite link to a friend";
  }
  document.getElementById("invite-copy-status").textContent = "";
  document.getElementById("invite-link-display").value = "Generating...";
  paintInviteExpiry();
  document.getElementById("invite-modal-overlay").style.display = "flex";
  try {
    await requestInviteLink(false);
  } catch (e) {
    document.getElementById("invite-link-display").value = "Failed to generate invite.";
  }
  try {
    const response = await fetch(`https://${serverAddress}/get_friends`, { credentials: "include" });
    const data = response.ok ? await response.json() : {};
    const allFriends = [...(data.online_friends || []), ...(data.offline_friends || [])];
    rememberInvitePeople(allFriends);
  } catch (e) {
    rememberInvitePeople([]);
  }
}

function closeInviteModal() {
  document.getElementById("invite-modal-overlay").style.display = "none";
  closeInviteSettings();
}

async function copyInviteLink() {
  const status = document.getElementById("invite-copy-status");
  try {
    await navigator.clipboard.writeText(document.getElementById("invite-link-display").value);
    status.textContent = "Copied to clipboard.";
  } catch (e) {
    status.textContent = "Couldn't copy automatically — select and copy the link above.";
  }
}

function sendInviteToPerson(person, btn) {
  if (!inviteModalCode || !ws || !person) return;
  const link = "https://oneira.cc/invite/" + inviteModalCode;
  if (person.kind === "party") {
    ws.send(JSON.stringify({ type: "party_message", party_id: person.id, content: link }));
  } else {
    ws.send(JSON.stringify({ type: "message", receiver_id: person.id, content: link }));
    if (typeof bumpConversation === "function") bumpConversation("dm", person.id, person.username || person.name, false);
  }
  inviteModalSent.add(person.kind + ":" + person.id);
  if (btn) {
    btn.textContent = "Invited";
    btn.disabled = true;
  }
}

function paintInviteSettingsRoles() {
  const host = document.getElementById("invite-settings-role-picks");
  const select = document.getElementById("invite-settings-roles");
  if (select) {
    const current = select.value;
    select.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select Roles";
    select.appendChild(blank);
    inviteSettingsRoles.forEach((role) => {
      if (role.is_members) return;
      if (inviteSettingsPicked.some((picked) => String(picked.id) === String(role.id))) return;
      const opt = document.createElement("option");
      opt.value = String(role.id);
      opt.textContent = role.name || "Role";
      select.appendChild(opt);
    });
    select.value = current && select.querySelector('option[value="' + current + '"]') ? current : "";
  }
  if (!host) return;
  host.innerHTML = "";
  inviteSettingsPicked.forEach((role) => {
    const pill = document.createElement("span");
    pill.className = "server-members-role-pill";
    if (role.color) pill.style.setProperty("--role-color", role.color);
    const name = document.createElement("span");
    name.textContent = role.name || "Role";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "member-prune-remove";
    remove.textContent = "\u00d7";
    remove.title = "Remove";
    remove.addEventListener("click", () => {
      inviteSettingsPicked = inviteSettingsPicked.filter((row) => String(row.id) !== String(role.id));
      paintInviteSettingsRoles();
    });
    pill.appendChild(name);
    pill.appendChild(remove);
    host.appendChild(pill);
  });
}

async function openInviteSettings() {
  if (inviteModalTarget.type !== "server" || !inviteModalTarget.id) return;
  fillInviteSelect(document.getElementById("invite-settings-age"), INVITE_AGE_OPTIONS, inviteModalSettings.max_age);
  fillInviteSelect(document.getElementById("invite-settings-uses"), INVITE_USE_OPTIONS, inviteModalSettings.max_uses);
  const temporary = document.getElementById("invite-settings-temporary");
  if (temporary) temporary.checked = !!inviteModalSettings.temporary;
  inviteSettingsRoles = [];
  inviteSettingsPicked = [];
  paintInviteSettingsRoles();
  document.getElementById("invite-settings-overlay").style.display = "flex";
  try {
    const response = await fetch(`https://${serverAddress}/get_server_roles/${encodeURIComponent(inviteModalTarget.id)}`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    inviteSettingsRoles = data.roles || [];
    const picked = new Set((inviteModalSettings.role_ids || []).map((id) => String(id)));
    inviteSettingsPicked = inviteSettingsRoles.filter((role) => picked.has(String(role.id)) && !role.is_members);
    paintInviteSettingsRoles();
  } catch (e) {
    inviteSettingsRoles = [];
  }
}

function closeInviteSettings() {
  const overlay = document.getElementById("invite-settings-overlay");
  if (overlay) overlay.style.display = "none";
}

async function generateInviteLink() {
  const btn = document.getElementById("invite-settings-generate");
  if (btn) btn.disabled = true;
  try {
    await requestInviteLink(true);
    closeInviteSettings();
  } catch (e) {
    const status = document.getElementById("invite-copy-status");
    if (status) status.textContent = e.message || "Failed to generate invite.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Unfurls a pasted invite link into a card under the message, link text
// left untouched above it.
function attachInviteCardIfNeeded(bubbleEl, content) {
  const match = content.match(INVITE_LINK_REGEX);
  if (!match) return;
  const code = match[1];

  const card = document.createElement("div");
  card.className = "invite-card";
  card.innerHTML = `<div class="invite-card-subtitle">Loading invite...</div>`;
  bubbleEl.appendChild(card);

  fetch(`https://${serverAddress}/invite/${code}`, { credentials: "include" })
    .then(response => response.ok ? response.json() : { valid: false })
    .then(data => renderInviteCard(card, code, data))
    .catch(() => renderInviteCard(card, code, { valid: false }));
}

function renderInviteCard(card, code, data) {
  if (data.valid === false) {
    card.classList.add("invalid");
    card.innerHTML = `
      <div class="invite-card-header">
        <div class="invite-card-badge">!</div>
        <div>
          <div class="invite-card-invalid-text">Invalid Invite</div>
          <div class="invite-card-subtitle">Ask for a new invite.</div>
        </div>
      </div>`;
    return;
  }

  const isParty = data.type === "party";
  const name = isParty ? data.party_name : data.server_name;
  // Party lookup only tells full-or-not, no exact count (get_invite_info
  // response is deliberately lean) - unlike server, no member tally here.
  const subtitle = isParty
    ? (data.full ? "This party is currently full." : "Click below to join.")
    : `${data.active_users} Online \u00b7 ${data.total_users} Members`;
  if (!isParty && data.channel_name) subtitle += " \u00b7 " + data.channel_name;

  card.innerHTML = `
    <div class="invite-card-header">
      <div class="invite-card-badge"></div>
      <div>
        <div class="invite-card-name"></div>
        <div class="invite-card-subtitle"></div>
      </div>
    </div>
    <button class="invite-card-btn">${isParty && data.full ? "Party is Full" : "Join " + (isParty ? "Party" : "Server")}</button>`;
  card.querySelector(".invite-card-badge").textContent = isParty ? avatarLetter(name) : serverAvatarLetters(name);
  card.querySelector(".invite-card-name").textContent = name;
  card.querySelector(".invite-card-subtitle").textContent = subtitle;

  const btn = card.querySelector(".invite-card-btn");
  if (isParty && data.full) {
    btn.disabled = true;
  } else {
    btn.addEventListener("click", () => joinInviteFromCard(code, btn));
  }
}

// Deep-links into the joined server/party rather than adding the
// membership silently. Reloads the relevant list first since a
// brand-new server/party won't exist in serverList/conversationList yet.
async function joinInviteFromCard(code, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = "Joining...";

  let data;
  try {
    const response = await fetch(`https://${serverAddress}/accept_invite?code=${code}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      btnEl.textContent = "Failed \u2014 try again";
      btnEl.disabled = false;
      return;
    }
    data = await response.json();
  } catch (e) {
    btnEl.textContent = "Failed \u2014 try again";
    btnEl.disabled = false;
    return;
  }

  if (data.full) {
    btnEl.textContent = "Party is Full";
    return;
  }

  if (data.type === "party") {
    await loadConversations();
    openParty(data.id, data.party_name);
  } else if (data.type === "server") {
    await loadServers();
    const iconEl = document.querySelector(`.server-icon[data-server-id="${data.id}"]`);
    openServer(data.id, iconEl, data.channel_id);
  }
}
