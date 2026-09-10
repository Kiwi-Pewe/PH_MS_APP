// ==================================================================
// chat-render.js - Turning a message array into DOM: clusters, dividers, start cards.
// ==================================================================

// Shared by renderMessages (DMs/parties) and renderChannelMessages
// (server channels) so both get identical clustering/divider behavior.
function renderClusteredMessages(wrap, messages) {
  let openCluster = null; // { isMine, lastTime, bubbleEl }

  messages.forEach(msg => {
    // No sender = system notice (leave-party, etc.) - always a full-width
    // divider, never merged into a cluster. Resets openCluster so the
    // next real message starts fresh rather than silently merging across
    // the divider.
    if (msg.senderId === null) {
      wrap.appendChild(buildSystemDivider(msg));
      openCluster = null;
      return;
    }

    // username (not just isMine) is the real clustering key - a party
    // can have multiple "not me" senders, and isMine alone would wrongly
    // merge two different people's back-to-back messages.
    const sameSenderAsLast = openCluster && openCluster.isMine === msg.isMine && openCluster.username === msg.username;
    const withinGap = openCluster &&
      (msg.time - openCluster.lastTime) <= CLUSTER_GAP_MINUTES * 60 * 1000;

    if (!(sameSenderAsLast && withinGap)) {
      openCluster = startNewCluster(wrap, msg);
    } else {
      const line = document.createElement("div");
      line.className = "bubble-line";
      line.textContent = msg.content;
      line.addEventListener("contextmenu", (e) => showMessageContextMenu(e, msg));
      openCluster.bubbleEl.appendChild(line);
      attachInviteCardIfNeeded(openCluster.bubbleEl, msg.content);
    }

    openCluster.lastTime = msg.time;
  });
}

function renderMessages(opts = {}) {
  const wrap = document.getElementById("chat-messages");
  wrap.innerHTML = "";

  if (openChatId !== null) {
    wrap.appendChild(
      openChatType === "party"
        ? buildPartyStartCard(openChatName)
        : buildConversationStartCard(openChatId, openChatName)
    );
  }

  renderClusteredMessages(wrap, currentMessages);

  // #chat-body is the actual scrolling element, not #chat-messages.
  // loadOlderMessages manages scroll itself, so skip when preserving.
  if (!opts.preserveScroll) {
    const chatBody = document.getElementById("chat-body");
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

function renderChannelMessages(opts = {}) {
  const wrap = document.getElementById("channel-messages");
  wrap.innerHTML = "";

  // Same view, two occupants — a forum thread borrows this whole feed,
  // so the only thing that differs is which start card tops it.
  if (openForumPostId !== null) {
    wrap.appendChild(buildForumStartCard(openForumPostTitle));
  } else if (currentChannelId !== null) {
    wrap.appendChild(buildChannelStartCard(currentChannelName));
  }

  renderClusteredMessages(wrap, currentChannelMessages);

  if (!opts.preserveScroll) {
    const channelBody = document.getElementById("channel-body");
    channelBody.scrollTop = channelBody.scrollHeight;
  }
}

function buildSystemDivider(msg) {
  const divider = document.createElement("div");
  divider.className = "system-divider";
  divider.textContent = msg.content;
  return divider;
}

function startNewCluster(wrap, msg) {
  const cluster = document.createElement("div");
  cluster.className = "msg-cluster " + (msg.isMine ? "self" : "other");

  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  avatar.textContent = avatarLetter(msg.username);
  avatar.addEventListener("contextmenu", (e) => showProfileContextMenu(e, msg.senderId, msg.username, msg.isMine));

  const body = document.createElement("div");
  body.className = "cluster-body";

  const header = document.createElement("div");
  header.className = "cluster-header";
  const name = document.createElement("span");
  name.className = "cluster-name";
  name.textContent = msg.username;
  name.addEventListener("contextmenu", (e) => showProfileContextMenu(e, msg.senderId, msg.username, msg.isMine));
  const time = document.createElement("span");
  time.className = "cluster-time";
  time.textContent = formatClusterTime(msg.time);
  header.appendChild(name);
  header.appendChild(time);

  const bubble = document.createElement("div");
  bubble.className = "cluster-bubble";
  const firstLine = document.createElement("div");
  firstLine.className = "bubble-line";
  firstLine.textContent = msg.content;
  firstLine.addEventListener("contextmenu", (e) => showMessageContextMenu(e, msg));
  bubble.appendChild(firstLine);
  attachInviteCardIfNeeded(bubble, msg.content);

  body.appendChild(header);
  body.appendChild(bubble);
  cluster.appendChild(avatar);
  cluster.appendChild(body);
  wrap.appendChild(cluster);

  return { isMine: msg.isMine, username: msg.username, lastTime: msg.time, bubbleEl: bubble };
}

function buildConversationStartCard(id, username) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = avatarLetter(username);

  const name = document.createElement("div");
  name.className = "convo-start-name";
  name.textContent = username;

  const meta = document.createElement("div");
  meta.className = "convo-start-meta";

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the beginning of your direct message history with ${username}.`;

  const actions = document.createElement("div");
  actions.className = "convo-start-actions";

  const removeBtn = document.createElement("button");
  removeBtn.className = "icon-btn";
  removeBtn.textContent = "Remove Friend";
  removeBtn.onclick = () => handleRemoveFriend(id, username, actions);

  const blockBtn = document.createElement("button");
  blockBtn.className = "danger-btn";
  blockBtn.textContent = "Block";
  blockBtn.onclick = () => handleBlockUser(id, username, actions);

  actions.appendChild(removeBtn);
  actions.appendChild(blockBtn);

  card.appendChild(avatar);
  card.appendChild(name);
  card.appendChild(meta);
  card.appendChild(desc);
  card.appendChild(actions);
  return card;
}

function buildPartyStartCard(name) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = avatarLetter(name);

  const nameEl = document.createElement("div");
  nameEl.className = "convo-start-name";
  nameEl.textContent = name;

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the beginning of ${name}.`;

  card.appendChild(avatar);
  card.appendChild(nameEl);
  card.appendChild(desc);
  return card;
}

function buildForumStartCard(title) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = "\u{1F4AC}";

  const nameEl = document.createElement("div");
  nameEl.className = "convo-start-name";
  nameEl.textContent = title || "";

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the start of ${title || "this post"}.`;

  card.appendChild(avatar);
  card.appendChild(nameEl);
  card.appendChild(desc);
  return card;
}

function buildChannelStartCard(name) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = "#";

  const nameEl = document.createElement("div");
  nameEl.className = "convo-start-name";
  nameEl.textContent = `#${name}`;

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the start of #${name}. Welcome!`;

  card.appendChild(avatar);
  card.appendChild(nameEl);
  card.appendChild(desc);
  return card;
}
