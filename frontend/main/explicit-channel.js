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

function explicitSectionKey() {
  return "oneira-explicit-sections-" + (typeof myUserId !== "undefined" && myUserId ? myUserId : "0");
}

function explicitSectionSeenIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(explicitSectionKey()) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (err) {
    return [];
  }
}

function explicitSectionSeen(sectionId) {
  return explicitSectionSeenIds().indexOf(String(sectionId)) >= 0;
}

function rememberExplicitSection(sectionId) {
  const ids = explicitSectionSeenIds();
  const id = String(sectionId);
  if (ids.indexOf(id) < 0) ids.push(id);
  localStorage.setItem(explicitSectionKey(), JSON.stringify(ids));
}

function explicitSectionNeedsGate(row) {
  return !!(row && row.explicit && row.id && !explicitSectionSeen(row.id));
}

function hideExplicitSectionGate() {
  const gate = document.getElementById("explicit-section-gate");
  const scroll = document.getElementById("server-custom-view-scroll");
  if (gate) gate.hidden = true;
  if (scroll) scroll.hidden = false;
}

function showExplicitSectionGate(row) {
  const gate = document.getElementById("explicit-section-gate");
  const scroll = document.getElementById("server-custom-view-scroll");
  const mark = document.getElementById("explicit-section-mark");
  const name = document.getElementById("explicit-section-name");
  const topic = document.getElementById("explicit-section-topic");
  if (mark) mark.textContent = ((row && row.title) || "S").slice(0, 1).toUpperCase();
  if (name) name.textContent = (row && row.title) || "Section";
  if (topic) {
    const text = ((row && row.about) || "").trim();
    topic.hidden = !text;
    topic.textContent = text;
  }
  if (scroll) scroll.hidden = true;
  if (gate) gate.hidden = false;
}

function leaveExplicitSection() {
  hideExplicitSectionGate();
  if (typeof openServerOverview === "function") openServerOverview();
}

function continueExplicitSection() {
  const id = typeof serverCustomViewId !== "undefined" ? serverCustomViewId : "";
  if (!id) return;
  rememberExplicitSection(id);
  if (typeof openServerCustomSection === "function") openServerCustomSection(id);
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
const explicitSectionBack = document.getElementById("explicit-section-back");
const explicitSectionContinue = document.getElementById("explicit-section-continue");
if (explicitSectionBack) explicitSectionBack.addEventListener("click", leaveExplicitSection);
if (explicitSectionContinue) explicitSectionContinue.addEventListener("click", continueExplicitSection);
