// ==================================================================
// server-modals.js - Server, category and channel creation modals.
// ==================================================================

// Server modal: name-only, no member checklist (invites are separate).
document.getElementById("create-server-btn").addEventListener("click", openServerModal);
document.getElementById("server-modal-close").addEventListener("click", closeServerModal);
document.getElementById("server-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "server-modal-overlay") closeServerModal();
});
document.getElementById("server-modal-create-btn").addEventListener("click", submitCreateServer);

function openServerModal() {
  const input = document.getElementById("server-name-input");
  input.value = `${myUsername}'s server`;
  document.getElementById("server-modal-overlay").style.display = "flex";
  input.focus();
  input.select();
}

function closeServerModal() {
  document.getElementById("server-modal-overlay").style.display = "none";
}

async function submitCreateServer() {
  const input = document.getElementById("server-name-input");
  const name = input.value.trim() || `${myUsername}'s server`;

  try {
    const response = await fetch(`https://${serverAddress}/create_server`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name })
    });
    if (!response.ok) {
      console.error(`Failed to create server: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to create server, network error:", e);
    return;
  }
  closeServerModal();
  loadServers();
}

// Category modal: same overlay/close/outside-click pattern as server,
// plus Cancel and a Private toggle.
document.getElementById("category-modal-close").addEventListener("click", closeCategoryModal);
document.getElementById("category-modal-cancel-btn").addEventListener("click", closeCategoryModal);
document.getElementById("category-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "category-modal-overlay") closeCategoryModal();
});
document.getElementById("category-modal-create-btn").addEventListener("click", submitCreateCategory);

function openCategoryModal() {
  const input = document.getElementById("category-name-input");
  input.value = "";
  document.getElementById("category-private-toggle").checked = false;
  document.getElementById("category-modal-overlay").style.display = "flex";
  input.focus();
}

function closeCategoryModal() {
  document.getElementById("category-modal-overlay").style.display = "none";
}

async function submitCreateCategory() {
  const input = document.getElementById("category-name-input");
  const name = input.value.trim() || "New Category";
  const isPrivate = document.getElementById("category-private-toggle").checked;

  try {
    const response = await fetch(`https://${serverAddress}/create_category`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ server_id: currentServerId, name, is_private: isPrivate })
    });
    if (!response.ok) {
      console.error(`Failed to create category: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to create category, network error:", e);
    return;
  }
  closeCategoryModal();
  refreshServerSidebar();
}

// Re-fetches current server's contents and re-renders sidebar in place -
// unlike openServer(), doesn't touch rail selection or auto-select a
// channel, so the open channel stays put. No-op if no server is open.
async function refreshServerSidebar() {
  if (!currentServerId) return;
  let data;
  try {
    const response = await fetch(`https://${serverAddress}/get_server_contents/${currentServerId}`, { credentials: "include" });
    if (!response.ok) return;
    data = await response.json();
  } catch (e) {
    return;
  }
  currentServerOwnerId = data.owner;
  renderServerSidebar(data);
}

// Channel modal: same pattern as category, plus accordion type-picker
// and a disabled-until-valid Create button (needs name AND type).
document.querySelectorAll("#channel-type-accordion .accordion-header").forEach(header => {
  header.addEventListener("click", () => {
    const group = header.closest(".accordion-group");
    const wasOpen = group.classList.contains("open");
    document.querySelectorAll("#channel-type-accordion .accordion-group").forEach(g => g.classList.remove("open"));
    if (!wasOpen) group.classList.add("open");
  });
});

function updateChannelModalCreateState() {
  const selected = document.querySelector('input[name="channel-type"]:checked');
  const name = document.getElementById("channel-name-input").value.trim();
  document.getElementById("channel-modal-create-btn").disabled = !selected || !name;
}
document.querySelectorAll('input[name="channel-type"]').forEach(radio => {
  radio.addEventListener("change", updateChannelModalCreateState);
});
document.getElementById("channel-name-input").addEventListener("input", updateChannelModalCreateState);

document.getElementById("channel-modal-close").addEventListener("click", closeChannelModal);
document.getElementById("channel-modal-cancel-btn").addEventListener("click", closeChannelModal);
document.getElementById("channel-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "channel-modal-overlay") closeChannelModal();
});
document.getElementById("channel-modal-create-btn").addEventListener("click", submitCreateChannel);

// Set by openChannelModal, read by submitCreateChannel.
let channelModalCategoryId = null;

function openChannelModal(categoryId) {
  channelModalCategoryId = categoryId;
  document.getElementById("channel-name-input").value = "";
  document.getElementById("channel-private-toggle").checked = false;
  document.querySelectorAll('input[name="channel-type"]').forEach(radio => { radio.checked = false; });
  document.querySelectorAll("#channel-type-accordion .accordion-group").forEach(g => g.classList.remove("open"));
  updateChannelModalCreateState();
  document.getElementById("channel-modal-overlay").style.display = "flex";
}

function closeChannelModal() {
  document.getElementById("channel-modal-overlay").style.display = "none";
}

async function submitCreateChannel() {
  const selected = document.querySelector('input[name="channel-type"]:checked');
  const name = document.getElementById("channel-name-input").value.trim();
  if (!selected || !name) return;
  const isPrivate = document.getElementById("channel-private-toggle").checked;

  try {
    const response = await fetch(`https://${serverAddress}/create_channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        category_id: channelModalCategoryId,
        name,
        channel_type: selected.value,
        is_private: isPrivate
      })
    });
    if (!response.ok) {
      console.error(`Failed to create channel: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to create channel, network error:", e);
    return;
  }
  closeChannelModal();
  refreshServerSidebar();
}
