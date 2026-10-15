let explicitGateReturnId = null;

function explicitSeenKey() {
  return "oneira-explicit-channels-" + (typeof myUserId !== "undefined" && myUserId ? myUserId : "0");
}

function explicitSeenIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(explicitSeenKey()) || "[]");
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch (err) {
    return [];
  }
}

function explicitChannelSeen(channelId) {
  return explicitSeenIds().includes(Number(channelId));
}

function rememberExplicitChannel(channelId) {
  const ids = explicitSeenIds();
  const id = Number(channelId);
  if (!ids.includes(id)) ids.push(id);
  localStorage.setItem(explicitSeenKey(), JSON.stringify(ids));
}

function explicitChannelNeedsGate(channel) {
  return !!(channel && channel.explicit && !explicitChannelSeen(channel.id));
}

function explicitChannelUsesHash(channel) {
  const type = channel && channel.channel_type;
  return type !== "voice" && type !== "doc" && type !== "docs" && type !== "media" && type !== "scheduling";
}

function explicitChannelById(channelId) {
  if (!channelId || typeof currentServerData === "undefined" || !currentServerData) return null;
  const categories = currentServerData.categories || [];
  for (let i = 0; i < categories.length; i += 1) {
    const channels = categories[i].channels || [];
    const found = channels.find((row) => Number(row.id) === Number(channelId));
    if (found) return found;
  }
  return null;
}

function hideExplicitChannelGate() {
  const gate = document.getElementById("explicit-channel-gate");
  if (gate) gate.hidden = true;
}

function showExplicitChannelGate(channel, returnId) {
  if (returnId && Number(returnId) !== Number(channel.id)) explicitGateReturnId = returnId;
  const gate = document.getElementById("explicit-channel-gate");
  const mark = document.getElementById("explicit-channel-mark");
  const name = document.getElementById("explicit-channel-name");
  const topic = document.getElementById("explicit-channel-topic");
  const hashed = explicitChannelUsesHash(channel);
  if (mark) mark.textContent = hashed ? "#" : (channel.name || "?").slice(0, 1).toUpperCase();
  if (name) name.textContent = (hashed ? "#" : "") + (channel.name || "channel");
  if (topic) {
    const text = (channel.topic || "").trim();
    topic.hidden = !text;
    topic.textContent = text;
  }
  const body = document.getElementById("channel-body");
  const composer = document.getElementById("channel-composer");
  if (body) body.style.display = "none";
  if (composer) composer.style.display = "none";
  if (gate) gate.hidden = false;
}

function leaveExplicitChannel() {
  const currentId = typeof currentChannelId !== "undefined" ? currentChannelId : null;
  const back = explicitChannelById(explicitGateReturnId);
  if (back && Number(back.id) !== Number(currentId)) {
    selectChannel(back);
    return;
  }
  const categories = (typeof currentServerData !== "undefined" && currentServerData && currentServerData.categories) || [];
  const next = categories.flatMap((category) => category.channels || []).find((row) => {
    return Number(row.id) !== Number(currentId) && (typeof channelVisibleInSidebar !== "function" || channelVisibleInSidebar(row));
  });
  if (next) selectChannel(next);
  else if (typeof showNoChannelSelected === "function") showNoChannelSelected();
}

function continueExplicitChannel() {
  const channel = explicitChannelById(typeof currentChannelId !== "undefined" ? currentChannelId : null);
  if (!channel) return;
  rememberExplicitChannel(channel.id);
  selectChannel(channel);
}

const explicitChannelBack = document.getElementById("explicit-channel-back");
const explicitChannelContinue = document.getElementById("explicit-channel-continue");
if (explicitChannelBack) explicitChannelBack.addEventListener("click", leaveExplicitChannel);
if (explicitChannelContinue) explicitChannelContinue.addEventListener("click", continueExplicitChannel);
