// ==================================================================
// chat-compose.js - Both message composers: enable/disable, send, auto-grow.
// ==================================================================

// Used after Remove Friend/Block, since the backend would reject a send
// anyway - this just makes that plain up front.
function disableComposer(message) {
  document.getElementById("composer-input").disabled = true;
  document.getElementById("composer-input").placeholder = message;
  document.getElementById("composer-send-btn").disabled = true;
  document.getElementById("composer-plus-btn").disabled = true;
  document.getElementById("composer-emoji-btn").disabled = true;
}

function enableComposer() {
  document.getElementById("composer-input").disabled = false;
  document.getElementById("composer-input").placeholder = "Type a message";
  document.getElementById("composer-send-btn").disabled = false;
  document.getElementById("composer-plus-btn").disabled = false;
  document.getElementById("composer-emoji-btn").disabled = false;
}

function disableChannelComposer(message) {
  document.getElementById("channel-composer-input").disabled = true;
  document.getElementById("channel-composer-input").placeholder = message;
  document.getElementById("channel-composer-send-btn").disabled = true;
  document.getElementById("channel-composer-plus-btn").disabled = true;
  document.getElementById("channel-composer-emoji-btn").disabled = true;
}

function enableChannelComposer(label) {
  document.getElementById("channel-composer-input").disabled = false;
  document.getElementById("channel-composer-input").placeholder = `Message ${label}`;
  document.getElementById("channel-composer-send-btn").disabled = false;
  document.getElementById("channel-composer-plus-btn").disabled = false;
  document.getElementById("channel-composer-emoji-btn").disabled = false;
}

function sendChatMessage() {
  const input = document.getElementById("composer-input");
  const content = input.value.trim();
  if (!content || openChatId === null || !ws) return;

  const payload = openChatType === "party"
    ? { type: "party_message", party_id: openChatId, content }
    : { type: "message", receiver_id: openChatId, content };
  ws.send(JSON.stringify(payload));

  currentMessages.push({
    isMine: true,
    username: myUsername || "You",
    content,
    time: new Date()
  });
  renderMessages();
  bumpConversation(openChatType, openChatId, openChatName, false);
  input.value = "";
  autoGrowComposer();
}

function autoGrowComposer() {
  const el = document.getElementById("composer-input");
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.getElementById("composer-input").addEventListener("input", autoGrowComposer);

document.getElementById("composer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// sender_id isn't in the payload - backend fills it from the verified
// session (never trust the client for identity).
function sendChannelMessage() {
  const input = document.getElementById("channel-composer-input");
  const content = input.value.trim();
  if (!content || currentChannelId === null || !ws) return;

  ws.send(JSON.stringify({ type: "channel_message", channel_id: currentChannelId, content }));

  currentChannelMessages.push({
    senderId: myUserId,
    isMine: true,
    username: myUsername || "You",
    content,
    time: new Date()
  });
  renderChannelMessages();
  input.value = "";
  autoGrowChannelComposer();
}

function autoGrowChannelComposer() {
  const el = document.getElementById("channel-composer-input");
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.getElementById("channel-composer-input").addEventListener("input", autoGrowChannelComposer);

document.getElementById("channel-composer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChannelMessage();
  }
});
