// ==================================================================
// chat-history.js - Scroll-back pagination for DMs, parties and channels.
// ==================================================================

// Cursor-based on the oldest loaded message's real id (before_id).
// Scroll position is preserved so prepending doesn't jump the view.
async function loadOlderMessages() {
  if (isLoadingMore || !hasMoreHistory || currentMessages.length === 0) return;
  const oldest = currentMessages[0];
  if (!oldest.id) return;
  isLoadingMore = true;

  const chatBody = document.getElementById("chat-body");
  const prevScrollHeight = chatBody.scrollHeight;
  const prevScrollTop = chatBody.scrollTop;

  try {
    const url = openChatType === "party"
      ? `https://${serverAddress}/get_party_messages/${openChatId}?before_id=${oldest.id}`
      : `https://${serverAddress}/messages/${openChatId}?before_id=${oldest.id}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const older = data.messages.map(msg => {
      const isMine = openChatType === "party" ? msg.username === myUsername : msg.sender_id !== openChatId;
      return {
        id: msg.id,
        isMine,
        senderId: msg.sender_id,
        username: isMine ? myUsername : (openChatType === "party" ? msg.username : openChatName),
        content: msg.content,
        time: new Date(msg.timestamp)
      };
    });
    if (older.length < 25) hasMoreHistory = false;
    currentMessages = older.concat(currentMessages);
    renderMessages({ preserveScroll: true });
    chatBody.scrollTop = chatBody.scrollHeight - prevScrollHeight + prevScrollTop;
  } catch (e) { /* leave state as-is on failure */ }

  isLoadingMore = false;
}

// Threshold of 40px rather than 0 so it fires a moment before the edge.
document.getElementById("chat-body").addEventListener("scroll", () => {
  const chatBody = document.getElementById("chat-body");
  if (chatBody.scrollTop < 40) loadOlderMessages();
});

// Channel equivalent of loadOlderMessages, pointed at
// get_channel_history/#channel-body/currentChannelMessages.
async function loadOlderChannelMessages() {
  if (channelIsLoadingMore || !channelHasMoreHistory || currentChannelMessages.length === 0) return;
  const oldest = currentChannelMessages[0];
  if (!oldest.id) return;
  channelIsLoadingMore = true;

  const channelBody = document.getElementById("channel-body");
  const prevScrollHeight = channelBody.scrollHeight;
  const prevScrollTop = channelBody.scrollTop;

  try {
    const response = await fetch(`https://${serverAddress}/get_channel_history/${currentChannelId}?before_id=${oldest.id}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const older = data.messages.map(msg => ({
      id: msg.id,
      isMine: msg.sender_id === myUserId,
      senderId: msg.sender_id,
      username: msg.username,
      content: msg.content,
      time: new Date(msg.timestamp)
    }));
    if (older.length < 25) channelHasMoreHistory = false;
    currentChannelMessages = older.concat(currentChannelMessages);
    renderChannelMessages({ preserveScroll: true });
    channelBody.scrollTop = channelBody.scrollHeight - prevScrollHeight + prevScrollTop;
  } catch (e) { /* leave state as-is on failure */ }

  channelIsLoadingMore = false;
}

document.getElementById("channel-body").addEventListener("scroll", () => {
  const channelBody = document.getElementById("channel-body");
  if (channelBody.scrollTop < 40) loadOlderChannelMessages();
});
