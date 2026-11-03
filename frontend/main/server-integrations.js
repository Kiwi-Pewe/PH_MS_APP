let webhookEditRow = null;
let webhookDeleteRow = null;
let webhookBusy = false;

function canManageWebhooks() {
  return typeof canServerPerm === "function" && (canServerPerm("update_server") || canServerPerm("manage_webhooks"));
}

function webhookTextChannels() {
  const out = [];
  ((currentServerData && currentServerData.categories) || []).forEach((category) => {
    (category.channels || []).forEach((channel) => {
      if (String(channel.channel_type || "").toLowerCase() === "text") out.push(channel);
    });
  });
  return out;
}

function webhookExecuteUrl(row) {
  if (!row || !row.token) return "";
  return `https://${serverAddress}/webhooks/${row.id}/${row.token}`;
}

function webhookApiError(data, fallback) {
  return (data && typeof data.detail === "string" && data.detail) || fallback;
}

function setWebhookStatus(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const copy = String(text || "").trim();
  el.hidden = !copy;
  el.textContent = copy;
}

function closeWebhookEdit() {
  const overlay = document.getElementById("webhook-edit-overlay");
  if (overlay) overlay.hidden = true;
  webhookEditRow = null;
  webhookBusy = false;
  setWebhookStatus("webhook-edit-status", "");
}

function closeWebhookDelete() {
  const overlay = document.getElementById("webhook-delete-overlay");
  if (overlay) overlay.hidden = true;
  webhookDeleteRow = null;
  webhookBusy = false;
  setWebhookStatus("webhook-delete-status", "");
}

function fillWebhookChannelSelect(selectedId) {
  const select = document.getElementById("webhook-edit-channel");
  if (!select) return;
  select.replaceChildren();
  webhookTextChannels().forEach((channel) => {
    const option = document.createElement("option");
    option.value = String(channel.id);
    option.textContent = "#" + (channel.name || "channel");
    if (Number(channel.id) === Number(selectedId)) option.selected = true;
    select.appendChild(option);
  });
}

function openWebhookEdit(row) {
  if (!row) return;
  webhookEditRow = row;
  const title = document.getElementById("webhook-edit-title");
  if (title) title.textContent = "Edit Webhook";
  const name = document.getElementById("webhook-edit-name");
  if (name) name.value = row.name || "";
  fillWebhookChannelSelect(row.channel_id);
  const url = document.getElementById("webhook-edit-url");
  if (url) url.value = webhookExecuteUrl(row);
  setWebhookStatus("webhook-edit-status", "");
  const overlay = document.getElementById("webhook-edit-overlay");
  if (overlay) overlay.hidden = false;
}

function openWebhookDelete(row) {
  if (!row) return;
  webhookDeleteRow = row;
  const copy = document.getElementById("webhook-delete-copy");
  if (copy) {
    copy.textContent = "This webhook URL will stop working. Messages already posted stay in the channel.";
  }
  setWebhookStatus("webhook-delete-status", "");
  const overlay = document.getElementById("webhook-delete-overlay");
  if (overlay) overlay.hidden = false;
}

function buildWebhookRow(row) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "webhook-row";
  const copy = document.createElement("div");
  copy.className = "webhook-row-copy";
  const name = document.createElement("div");
  name.className = "webhook-row-name";
  name.textContent = row.name || "Webhook";
  const channel = document.createElement("div");
  channel.className = "webhook-row-channel";
  channel.textContent = "#" + (row.channel_name || "channel");
  copy.appendChild(name);
  copy.appendChild(channel);
  card.appendChild(copy);
  card.addEventListener("click", () => openWebhookEdit(row));
  return card;
}

async function loadServerWebhooks() {
  const list = document.getElementById("server-integrations-webhooks-list");
  const empty = document.getElementById("server-integrations-webhooks-empty");
  const create = document.getElementById("server-integrations-webhook-create");
  if (create) create.disabled = !canManageWebhooks();
  if (!list || !currentServerId) return;
  list.replaceChildren();
  if (empty) {
    empty.hidden = false;
    empty.textContent = "No webhooks.";
  }
  try {
    const response = await fetch(
      `https://${serverAddress}/server_webhooks/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (empty) empty.textContent = webhookApiError(data, "Could not load webhooks.");
      return;
    }
    const rows = data.webhooks || [];
    if (empty) empty.hidden = rows.length > 0;
    rows.forEach((row) => list.appendChild(buildWebhookRow(row)));
  } catch (err) {
    if (empty) empty.textContent = "Could not load webhooks.";
  }
}

async function paintChannelWebhooks() {
  const list = document.getElementById("channel-settings-webhooks-list");
  const empty = document.getElementById("channel-settings-webhooks-empty");
  const create = document.getElementById("channel-settings-webhook-create");
  const channel = typeof channelSettingsTarget !== "undefined" ? channelSettingsTarget : null;
  const isText = !!(channel && String(channel.channel_type || "").toLowerCase() === "text");
  if (create) create.disabled = !canManageWebhooks() || !isText;
  if (!list) return;
  list.replaceChildren();
  if (empty) {
    empty.hidden = false;
    empty.textContent = "No webhooks for this channel.";
  }
  if (!currentServerId || !channel || !isText) return;
  try {
    const response = await fetch(
      `https://${serverAddress}/server_webhooks/${encodeURIComponent(currentServerId)}?channel_id=${encodeURIComponent(channel.id)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (empty) empty.textContent = webhookApiError(data, "Could not load webhooks.");
      return;
    }
    const rows = data.webhooks || [];
    if (empty) empty.hidden = rows.length > 0;
    rows.forEach((row) => list.appendChild(buildWebhookRow(row)));
  } catch (err) {
    if (empty) empty.textContent = "Could not load webhooks.";
  }
}

function paintServerIntegrationsPage() {
  const page = document.getElementById("server-settings-integrations");
  if (!page || page.hidden) return;
  loadServerWebhooks();
  if (typeof paintServerFollows === "function") paintServerFollows();
}

async function loadServerIntegrationsPage() {
  paintServerIntegrationsPage();
}

function refreshWebhookLists() {
  const page = document.getElementById("server-settings-integrations");
  if (page && !page.hidden) loadServerWebhooks();
  const channelPage = document.getElementById("channel-settings-integrations");
  if (channelPage && !channelPage.hidden && typeof paintChannelWebhooks === "function") paintChannelWebhooks();
}

async function createServerWebhook(presetChannelId) {
  if (!currentServerId || !canManageWebhooks() || webhookBusy) return;
  const channels = webhookTextChannels();
  const channelId = presetChannelId || (channels[0] && channels[0].id);
  if (!channelId) {
    const empty = document.getElementById("server-integrations-webhooks-empty")
      || document.getElementById("channel-settings-webhooks-empty");
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Webhooks need a text channel.";
    }
    return;
  }
  webhookBusy = true;
  try {
    const response = await fetch(`https://${serverAddress}/create_server_webhook`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: currentServerId, channel_id: Number(channelId), name: "" })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(webhookApiError(data, "Could not create the webhook."));
    refreshWebhookLists();
    openWebhookEdit(data);
  } catch (err) {
    const empty = document.getElementById("server-integrations-webhooks-empty")
      || document.getElementById("channel-settings-webhooks-empty");
    if (empty) {
      empty.hidden = false;
      empty.textContent = err.message || "Could not create the webhook.";
    }
  } finally {
    webhookBusy = false;
  }
}

async function saveWebhookEdit() {
  if (!webhookEditRow || webhookBusy) return;
  const nameEl = document.getElementById("webhook-edit-name");
  const channelEl = document.getElementById("webhook-edit-channel");
  const name = nameEl ? nameEl.value : "";
  const channelId = channelEl ? Number(channelEl.value) : webhookEditRow.channel_id;
  webhookBusy = true;
  setWebhookStatus("webhook-edit-status", "");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_webhook`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhook_id: webhookEditRow.id,
        name: name,
        channel_id: channelId
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(webhookApiError(data, "Could not save the webhook."));
    webhookEditRow = data;
    const url = document.getElementById("webhook-edit-url");
    if (url) url.value = webhookExecuteUrl(data);
    refreshWebhookLists();
    closeWebhookEdit();
  } catch (err) {
    setWebhookStatus("webhook-edit-status", err.message || "Could not save the webhook.");
  } finally {
    webhookBusy = false;
  }
}

async function copyWebhookUrl() {
  const urlEl = document.getElementById("webhook-edit-url");
  const url = urlEl ? urlEl.value : webhookExecuteUrl(webhookEditRow);
  if (!url) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else if (urlEl) {
      urlEl.focus();
      urlEl.select();
      document.execCommand("copy");
    }
    setWebhookStatus("webhook-edit-status", "Copied webhook URL.");
  } catch (err) {
    if (urlEl) {
      urlEl.focus();
      urlEl.select();
    }
    setWebhookStatus("webhook-edit-status", "Select the URL and copy it.");
  }
}

async function sendWebhookTest() {
  if (!webhookEditRow || webhookBusy) return;
  webhookBusy = true;
  setWebhookStatus("webhook-edit-status", "");
  try {
    const response = await fetch(`https://${serverAddress}/server_webhook_test`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_id: webhookEditRow.id })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(webhookApiError(data, "Could not send a test message."));
    const channelName = webhookEditRow.channel_name || "channel";
    setWebhookStatus("webhook-edit-status", "Sent a test message to #" + channelName + ".");
  } catch (err) {
    setWebhookStatus("webhook-edit-status", err.message || "Could not send a test message.");
  } finally {
    webhookBusy = false;
  }
}

async function confirmWebhookDelete() {
  if (!webhookDeleteRow || webhookBusy) return;
  webhookBusy = true;
  setWebhookStatus("webhook-delete-status", "");
  try {
    const response = await fetch(`https://${serverAddress}/delete_server_webhook`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_id: webhookDeleteRow.id })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(webhookApiError(data, "Could not delete the webhook."));
    closeWebhookDelete();
    closeWebhookEdit();
    refreshWebhookLists();
  } catch (err) {
    setWebhookStatus("webhook-delete-status", err.message || "Could not delete the webhook.");
  } finally {
    webhookBusy = false;
  }
}

(function bindWebhookChrome() {
  const create = document.getElementById("server-integrations-webhook-create");
  if (create) create.addEventListener("click", () => createServerWebhook());
  const channelCreate = document.getElementById("channel-settings-webhook-create");
  if (channelCreate) {
    channelCreate.addEventListener("click", () => {
      const channel = typeof channelSettingsTarget !== "undefined" ? channelSettingsTarget : null;
      createServerWebhook(channel && channel.id);
    });
  }
  ["webhook-edit-close", "webhook-edit-cancel"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", closeWebhookEdit);
  });
  const save = document.getElementById("webhook-edit-save");
  if (save) save.addEventListener("click", saveWebhookEdit);
  const copy = document.getElementById("webhook-edit-copy");
  if (copy) copy.addEventListener("click", copyWebhookUrl);
  const test = document.getElementById("webhook-edit-test");
  if (test) test.addEventListener("click", sendWebhookTest);
  const remove = document.getElementById("webhook-edit-delete");
  if (remove) remove.addEventListener("click", () => openWebhookDelete(webhookEditRow));
  const editOverlay = document.getElementById("webhook-edit-overlay");
  if (editOverlay) {
    editOverlay.addEventListener("click", (e) => {
      if (e.target && e.target.id === "webhook-edit-overlay") closeWebhookEdit();
    });
  }
  ["webhook-delete-close", "webhook-delete-cancel"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", closeWebhookDelete);
  });
  const confirm = document.getElementById("webhook-delete-confirm");
  if (confirm) confirm.addEventListener("click", confirmWebhookDelete);
  const deleteOverlay = document.getElementById("webhook-delete-overlay");
  if (deleteOverlay) {
    deleteOverlay.addEventListener("click", (e) => {
      if (e.target && e.target.id === "webhook-delete-overlay") closeWebhookDelete();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const del = document.getElementById("webhook-delete-overlay");
    if (del && !del.hidden) {
      closeWebhookDelete();
      e.stopPropagation();
      return;
    }
    const edit = document.getElementById("webhook-edit-overlay");
    if (edit && !edit.hidden) {
      closeWebhookEdit();
      e.stopPropagation();
    }
  });
})();
