// ==================================================================
// typing.js - "{Name} is typing..." above the DM/party/text/forum composers.
// Not announcements, forum cards, docs, or comments.
// ==================================================================

const TYPING_IDLE_MS = 8000;
const TYPING_RESEND_MS = 4000;

let typingSentActive = false;
let typingSentScope = null;
let typingLastSentAt = 0;
let typingIdleTimer = null;
let typingExpiryTimer = null;

function currentTypingScope() {
  const chatView = document.getElementById("view-chat");
  if (chatView && chatView.classList.contains("active") && openChatId !== null) {
    if (openChatType === "dm") return { kind: "dm", receiver_id: openChatId };
    if (openChatType === "party") return { kind: "party", party_id: openChatId };
  }
  const channelView = document.getElementById("view-channel");
  if (channelView && channelView.classList.contains("active")) {
    if (openForumPostId !== null) return { kind: "forum", post_id: openForumPostId };
    if (currentChannelType === "text" && currentChannelId !== null) {
      return { kind: "channel", channel_id: currentChannelId };
    }
  }
  return null;
}

function typingEventTargetsOpenChat(data) {
  if (!data || data.user_id === myUserId) return false;
  if (data.kind === "dm") {
    return openChatType === "dm" && openChatId === data.user_id;
  }
  if (data.kind === "party") {
    return openChatType === "party" && openChatId === data.party_id;
  }
  if (data.kind === "channel") {
    return openForumPostId === null && currentChannelType === "text" && currentChannelId === data.channel_id;
  }
  if (data.kind === "forum") {
    return openForumPostId === data.post_id;
  }
  return false;
}

function sendTypingPayload(scope, active) {
  if (!scope || !ws) return;
  const payload = { type: "typing", active: !!active, kind: scope.kind };
  if (scope.kind === "dm") payload.receiver_id = scope.receiver_id;
  if (scope.kind === "party") payload.party_id = scope.party_id;
  if (scope.kind === "channel") payload.channel_id = scope.channel_id;
  if (scope.kind === "forum") payload.post_id = scope.post_id;
  ws.send(JSON.stringify(payload));
}

function stopOutgoingTyping() {
  if (typingIdleTimer) {
    clearTimeout(typingIdleTimer);
    typingIdleTimer = null;
  }
  if (!typingSentActive || !typingSentScope) {
    typingSentActive = false;
    typingSentScope = null;
    typingLastSentAt = 0;
    return;
  }
  sendTypingPayload(typingSentScope, false);
  typingSentActive = false;
  typingSentScope = null;
  typingLastSentAt = 0;
}

function noteComposerTyping(input) {
  const scope = currentTypingScope();
  if (!scope || !input || input.disabled) {
    stopOutgoingTyping();
    return;
  }
  if (!(input.value || "").trim()) {
    stopOutgoingTyping();
    return;
  }
  if (typingIdleTimer) clearTimeout(typingIdleTimer);
  typingIdleTimer = setTimeout(stopOutgoingTyping, TYPING_IDLE_MS);
  const now = Date.now();
  if (!typingSentActive || now - typingLastSentAt >= TYPING_RESEND_MS) {
    sendTypingPayload(scope, true);
    typingSentActive = true;
    typingSentScope = scope;
    typingLastSentAt = now;
  }
}

function formatTypingLabel(names) {
  if (names.length >= 5) return "Multiple people are typing...";
  if (names.length === 1) return names[0] + " is typing...";
  if (names.length === 2) return names[0] + " and " + names[1] + " are typing...";
  return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1] + " are typing...";
}

function paintTypingIndicator() {
  const now = Date.now();
  const names = Object.keys(typingPeers)
    .filter(id => typingPeers[id] && typingPeers[id].until > now)
    .map(id => typingPeers[id].username)
    .filter(Boolean);
  const label = names.length ? formatTypingLabel(names) : "";
  const scope = currentTypingScope();
  const home = document.getElementById("composer-typing");
  const channel = document.getElementById("channel-composer-typing");
  const homeOn = !!(label && scope && (scope.kind === "dm" || scope.kind === "party"));
  const channelOn = !!(label && scope && (scope.kind === "channel" || scope.kind === "forum"));
  if (home) {
    home.hidden = !homeOn;
    home.textContent = homeOn ? label : "";
  }
  if (channel) {
    channel.hidden = !channelOn;
    channel.textContent = channelOn ? label : "";
  }
}

function scheduleTypingExpiry() {
  if (typingExpiryTimer) {
    clearTimeout(typingExpiryTimer);
    typingExpiryTimer = null;
  }
  const now = Date.now();
  let next = null;
  Object.keys(typingPeers).forEach(id => {
    if (!typingPeers[id] || typingPeers[id].until <= now) {
      delete typingPeers[id];
      return;
    }
    if (next === null || typingPeers[id].until < next) next = typingPeers[id].until;
  });
  paintTypingIndicator();
  if (next !== null) {
    typingExpiryTimer = setTimeout(scheduleTypingExpiry, Math.max(50, next - Date.now()));
  }
}

function clearIncomingTyping() {
  typingPeers = {};
  scheduleTypingExpiry();
}

function resetTypingOnLeave() {
  stopOutgoingTyping();
  clearIncomingTyping();
}

function noteRemoteTyping(data) {
  if (!typingEventTargetsOpenChat(data)) return;
  const userId = data.user_id;
  if (!userId) return;
  if (data.active === false) {
    delete typingPeers[userId];
  } else {
    typingPeers[userId] = {
      username: data.username || "Someone",
      until: Date.now() + TYPING_IDLE_MS
    };
  }
  scheduleTypingExpiry();
}

function clearRemoteTyper(userId) {
  if (!userId || !typingPeers[userId]) return;
  delete typingPeers[userId];
  scheduleTypingExpiry();
}

document.getElementById("composer-input").addEventListener("input", () => {
  noteComposerTyping(document.getElementById("composer-input"));
});
document.getElementById("channel-composer-input").addEventListener("input", () => {
  noteComposerTyping(document.getElementById("channel-composer-input"));
});
