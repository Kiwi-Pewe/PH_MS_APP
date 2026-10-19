// ==================================================================
// parties.js - Party creation modal.
// ==================================================================

// Max 9 selectable since the creator is the 10th member (cap is 10
// total). Re-fetches friends fresh each open, never cached.
let selectedPartyMembers = new Set();
const MAX_PARTY_INVITES = 9;

document.getElementById("create-party-btn").addEventListener("click", openPartyModal);
document.getElementById("party-modal-close").addEventListener("click", closePartyModal);
document.getElementById("party-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "party-modal-overlay") closePartyModal();
});
document.getElementById("party-modal-create-btn").addEventListener("click", submitCreateParty);

async function openPartyModal() {
  selectedPartyMembers = new Set();
  updatePartyModalCount();
  document.getElementById("party-modal-overlay").style.display = "flex";

  const rows = document.getElementById("party-modal-friend-rows");
  rows.innerHTML = "";

  try {
    const response = await fetch(`https://${serverAddress}/get_friends`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const allFriends = [...(data.online_friends || []), ...(data.offline_friends || [])];

    document.getElementById("party-modal-empty-note").style.display = allFriends.length === 0 ? "block" : "none";

    allFriends.forEach(friend => {
      const row = document.createElement("div");
      row.className = "friend-row";
      row.innerHTML = `<div class="avatar-dot"></div><div class="who"></div><input type="checkbox">`;
      if (typeof paintUserFace === "function") paintUserFace(row.querySelector(".avatar-dot"), friend, { name: friend.username, userId: friend.id });
      else row.querySelector(".avatar-dot").textContent = avatarLetter(friend.username);
      row.querySelector(".who").textContent = friend.username;
      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", () => togglePartyMember(friend.id, checkbox));
      rows.appendChild(row);
    });
  } catch (e) {
    console.error("Failed to load friends for party creation:", e);
  }
}

function togglePartyMember(id, checkbox) {
  if (checkbox.checked) {
    if (selectedPartyMembers.size >= MAX_PARTY_INVITES) {
      checkbox.checked = false;
      return;
    }
    selectedPartyMembers.add(id);
  } else {
    selectedPartyMembers.delete(id);
  }
  updatePartyModalCount();
}

function updatePartyModalCount() {
  document.getElementById("party-modal-count").textContent = `${selectedPartyMembers.size} / ${MAX_PARTY_INVITES} selected`;
  const atCap = selectedPartyMembers.size >= MAX_PARTY_INVITES;
  document.querySelectorAll("#party-modal-friend-rows input[type=checkbox]").forEach(box => {
    if (!box.checked) box.disabled = atCap;
  });
}

function closePartyModal() {
  document.getElementById("party-modal-overlay").style.display = "none";
}

async function submitCreateParty() {
  try {
    const response = await fetch(`https://${serverAddress}/create_party`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        party_name: `${myUsername}'s Party`,
        member_ids: Array.from(selectedPartyMembers)
      })
    });
    if (!response.ok) {
      console.error(`Failed to create party: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to create party, network error:", e);
    return;
  }
  closePartyModal();
  loadConversations();
}

let editPartyId = null;
let editPartyFile = null;
let editPartyClear = false;
let editPartyPreviewUrl = "";

function setEditPartyError(text) {
  const err = document.getElementById("edit-party-error");
  if (!err) return;
  err.hidden = !text;
  err.textContent = text || "";
}

function setEditPartyBusy(busy) {
  const save = document.getElementById("edit-party-save");
  const cancel = document.getElementById("edit-party-cancel");
  const upload = document.getElementById("edit-party-upload");
  const remove = document.getElementById("edit-party-remove");
  if (save) save.disabled = !!busy;
  if (cancel) cancel.disabled = !!busy;
  if (upload) upload.disabled = !!busy;
  if (remove) remove.disabled = !!busy;
}

function paintEditPartyFace(name, iconUrl) {
  const face = document.getElementById("edit-party-face");
  if (!face) return;
  if (typeof paintPartyFace === "function") paintPartyFace(face, name, iconUrl);
  else face.textContent = typeof avatarLetter === "function" ? avatarLetter(name) : "?";
  const remove = document.getElementById("edit-party-remove");
  if (remove) remove.hidden = !iconUrl;
}

function closeEditParty() {
  editPartyId = null;
  editPartyFile = null;
  editPartyClear = false;
  if (editPartyPreviewUrl) {
    URL.revokeObjectURL(editPartyPreviewUrl);
    editPartyPreviewUrl = "";
  }
  const overlay = document.getElementById("edit-party-overlay");
  if (overlay) overlay.hidden = true;
  const input = document.getElementById("edit-party-file");
  if (input) input.value = "";
  setEditPartyError("");
  setEditPartyBusy(false);
}

function openEditParty(id) {
  const entry = (typeof conversationList !== "undefined" ? conversationList : []).find(
    (c) => c.type === "party" && Number(c.id) === Number(id)
  );
  if (!entry || Number(entry.ownerId) !== Number(myUserId)) return;
  if (editPartyPreviewUrl) {
    URL.revokeObjectURL(editPartyPreviewUrl);
    editPartyPreviewUrl = "";
  }
  editPartyId = id;
  editPartyFile = null;
  editPartyClear = false;
  const nameInput = document.getElementById("edit-party-name");
  if (nameInput) nameInput.value = entry.name || "";
  paintEditPartyFace(entry.name, entry.iconUrl);
  setEditPartyError("");
  const overlay = document.getElementById("edit-party-overlay");
  if (overlay) overlay.hidden = false;
  if (nameInput) nameInput.focus();
}

function pickEditPartyFile(file) {
  if (!file) return;
  if (typeof rejectProfileImage === "function") {
    const reason = rejectProfileImage(file);
    if (reason) {
      setEditPartyError(reason);
      return;
    }
  }
  if (editPartyPreviewUrl) URL.revokeObjectURL(editPartyPreviewUrl);
  editPartyFile = file;
  editPartyClear = false;
  editPartyPreviewUrl = URL.createObjectURL(file);
  const nameInput = document.getElementById("edit-party-name");
  paintEditPartyFace(nameInput ? nameInput.value : "", editPartyPreviewUrl);
  setEditPartyError("");
}

function clearEditPartyPicture() {
  if (editPartyPreviewUrl) {
    URL.revokeObjectURL(editPartyPreviewUrl);
    editPartyPreviewUrl = "";
  }
  editPartyFile = null;
  editPartyClear = true;
  const nameInput = document.getElementById("edit-party-name");
  paintEditPartyFace(nameInput ? nameInput.value : "", "");
  const input = document.getElementById("edit-party-file");
  if (input) input.value = "";
}

async function saveEditParty() {
  if (!editPartyId) return;
  const nameInput = document.getElementById("edit-party-name");
  const name = nameInput ? String(nameInput.value || "").trim() : "";
  if (!name) {
    setEditPartyError("Enter a party name.");
    if (nameInput) nameInput.focus();
    return;
  }
  setEditPartyBusy(true);
  setEditPartyError("");
  try {
    const payload = { party_id: editPartyId, party_name: name, clear_icon: !!editPartyClear };
    if (editPartyFile) {
      if (typeof uploadServerIconFile !== "function") throw new Error("Upload is not available.");
      const att = await uploadServerIconFile(editPartyFile);
      payload.clear_icon = false;
      payload.key = att.key;
      payload.mime = att.mime;
      payload.size = att.size;
      payload.name = att.name;
    }
    const response = await fetch(`https://${serverAddress}/update_party`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the party.");
    if (typeof applyPartyUpdated === "function") {
      applyPartyUpdated(data.id || editPartyId, data.party_name || name, data.icon_url, data.owner_id);
    }
    closeEditParty();
  } catch (err) {
    setEditPartyError(err.message || "Could not save the party.");
    setEditPartyBusy(false);
  }
}

(function bindEditParty() {
  const overlay = document.getElementById("edit-party-overlay");
  const closeBtn = document.getElementById("edit-party-close");
  const cancelBtn = document.getElementById("edit-party-cancel");
  const saveBtn = document.getElementById("edit-party-save");
  const uploadBtn = document.getElementById("edit-party-upload");
  const removeBtn = document.getElementById("edit-party-remove");
  const fileInput = document.getElementById("edit-party-file");
  if (closeBtn) closeBtn.addEventListener("click", closeEditParty);
  if (cancelBtn) cancelBtn.addEventListener("click", closeEditParty);
  if (saveBtn) saveBtn.addEventListener("click", saveEditParty);
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
  }
  if (removeBtn) removeBtn.addEventListener("click", clearEditPartyPicture);
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      pickEditPartyFile(fileInput.files && fileInput.files[0]);
      fileInput.value = "";
    });
  }
  if (overlay) {
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeEditParty();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const card = document.getElementById("edit-party-overlay");
    if (card && !card.hidden) closeEditParty();
  });
})();
