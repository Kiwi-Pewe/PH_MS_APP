// ==================================================================
// invites.js - Invite panel, in-chat invite cards, and accepting an invite.
// ==================================================================

// Shared by servers and parties - openInviteModal takes the type so one
// panel handles both. No cap on recipients (accept_invite is idempotent
// per-recipient).
let inviteModalTarget = { type: null, id: null, name: null };
let inviteModalCode = null;
let selectedInviteRecipients = new Set();

document.getElementById("invite-modal-close").addEventListener("click", closeInviteModal);
document.getElementById("invite-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "invite-modal-overlay") closeInviteModal();
});
document.getElementById("invite-copy-btn").addEventListener("click", copyInviteLink);
document.getElementById("invite-modal-send-btn").addEventListener("click", sendInvitesFromModal);

async function openInviteModal(type, id, name) {
  inviteModalTarget = { type, id, name };
  selectedInviteRecipients = new Set();
  updateInviteModalCount();
  document.getElementById("invite-modal-title").textContent = `Invite to ${name}`;
  document.getElementById("invite-copy-status").textContent = "";
  document.getElementById("invite-link-display").value = "Generating...";
  document.getElementById("invite-modal-overlay").style.display = "flex";

  const rows = document.getElementById("invite-modal-friend-rows");
  rows.innerHTML = "";

  // Two independent fetches, separate try/catches - a failure in one
  // shouldn't block the other from still showing something useful.
  try {
    const response = await fetch(`https://${serverAddress}/create_invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type,
        server_id: type === "server" ? id : null,
        party_id: type === "party" ? id : null
      })
    });
    if (!response.ok) {
      document.getElementById("invite-link-display").value = "Failed to generate invite.";
      return;
    }
    const data = await response.json();
    inviteModalCode = data.invite_code;
    document.getElementById("invite-link-display").value = `https://oneira.cc/invite/${inviteModalCode}`;
  } catch (e) {
    document.getElementById("invite-link-display").value = "Failed to generate invite.";
    return;
  }

  try {
    const response = await fetch(`https://${serverAddress}/get_friends`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const allFriends = [...(data.online_friends || []), ...(data.offline_friends || [])];

    document.getElementById("invite-modal-empty-note").style.display = allFriends.length === 0 ? "block" : "none";

    allFriends.forEach(friend => {
      const row = document.createElement("div");
      row.className = "friend-row";
      row.innerHTML = `<div class="avatar-dot"></div><div class="who"></div><input type="checkbox">`;
      row.querySelector(".avatar-dot").textContent = avatarLetter(friend.username);
      row.querySelector(".who").textContent = friend.username;
      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", () => toggleInviteRecipient(friend.id, friend.username, checkbox));
      rows.appendChild(row);
    });
  } catch (e) { /* link still works even if the friend list fails */ }
}

function toggleInviteRecipient(id, username, checkbox) {
  if (checkbox.checked) {
    selectedInviteRecipients.add(JSON.stringify({ id, username }));
  } else {
    selectedInviteRecipients.delete(JSON.stringify({ id, username }));
  }
  updateInviteModalCount();
}

function updateInviteModalCount() {
  document.getElementById("invite-modal-count").textContent = `${selectedInviteRecipients.size} selected`;
}

function closeInviteModal() {
  document.getElementById("invite-modal-overlay").style.display = "none";
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

// Sends the invite as a normal DM, reusing send_message unchanged - so
// block/friend checks apply for free. Each send is independent.
function sendInvitesFromModal() {
  if (!inviteModalCode || !ws) return;
  const link = `https://oneira.cc/invite/${inviteModalCode}`;

  selectedInviteRecipients.forEach(entryJson => {
    const { id, username } = JSON.parse(entryJson);
    ws.send(JSON.stringify({ type: "message", receiver_id: id, content: link }));
    bumpConversation("dm", id, username, false);
  });

  closeInviteModal();
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
    openServer(data.id, iconEl);
  }
}
