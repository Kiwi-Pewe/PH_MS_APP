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

async function sendChatMessage() {
  const input = document.getElementById("composer-input");
  const content = input.value.trim();
  if ((!content && !pendingAttach) || openChatId === null || !ws) return;
  if (pendingAttach && pendingAttach.busy) return;

  let attachment = null;
  if (pendingAttach) {
    try {
      attachment = await uploadPendingIfNeeded();
    } catch (err) {
      window.alert(err.message || "Upload failed.");
      return;
    }
  }

  const payload = openChatType === "party"
    ? { type: "party_message", party_id: openChatId, content, attachment }
    : { type: "message", receiver_id: openChatId, content, attachment };
  ws.send(JSON.stringify(payload));

  currentMessages.push({
    isMine: true,
    username: myUsername || "You",
    content,
    attachment,
    time: new Date()
  });
  renderMessages();
  bumpConversation(openChatType, openChatId, openChatName, false);
  input.value = "";
  clearPendingAttach();
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
async function sendChannelMessage() {
  const input = document.getElementById("channel-composer-input");
  const content = input.value.trim();
  if ((!content && !pendingAttach) || !ws) return;
  if (pendingAttach && pendingAttach.busy) return;

  let attachment = null;
  if (pendingAttach) {
    try {
      attachment = await uploadPendingIfNeeded();
    } catch (err) {
      window.alert(err.message || "Upload failed.");
      return;
    }
  }

  // One composer, two possible destinations: a forum thread borrows this
  // view, so openForumPostId decides where this send is addressed.
  if (openForumPostId !== null) {
    ws.send(JSON.stringify({ type: "forum_message", post_id: openForumPostId, content, attachment }));
  } else if (currentChannelId !== null) {
    ws.send(JSON.stringify({ type: "channel_message", channel_id: currentChannelId, content, attachment }));
  } else {
    return;
  }

  currentChannelMessages.push({
    senderId: myUserId,
    isMine: true,
    username: myUsername || "You",
    content,
    attachment,
    time: new Date()
  });
  renderChannelMessages();
  input.value = "";
  clearPendingAttach();
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
