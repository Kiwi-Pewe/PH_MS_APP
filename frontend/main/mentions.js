// Mentions and unread indicators. Stored tokens are <@id> / <@everyone> /
// <@here>; this file turns them into chips and keeps rail/channel/party
// unread vs ping badges in sync with live traffic.

const MENTION_TOKEN_RE = /<@(everyone|here|\d+)>/g;

function mentionMembers() {
  return Array.isArray(memberList) ? memberList : [];
}

function encodeMentions(text) {
  if (!text) return text;
  let out = text;
  out = out.replace(/@everyone\b/gi, "<@everyone>");
  out = out.replace(/@here\b/gi, "<@here>");
  const accounts = mentionMembers().slice().sort((a, b) => (b.username || "").length - (a.username || "").length);
  accounts.forEach(account => {
    if (!account.username) return;
    const pattern = new RegExp("@" + account.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
    out = out.replace(pattern, "<@" + account.id + ">");
  });
  return out;
}

function mentionDisplayText(text, mentionUsers) {
  const lookup = mentionUsers || {};
  return (text || "").replace(MENTION_TOKEN_RE, (full, token) => {
    if (token === "everyone") return "@everyone";
    if (token === "here") return "@here";
    const name = lookup[token] || mentionNameForId(token);
    return "@" + name;
  });
}

function mentionNameForId(id) {
  const member = mentionMembers().find(m => String(m.id) === String(id));
  if (member) return member.username;
  return "user";
}

function mentionUsersFromText(text) {
  const lookup = {};
  MENTION_TOKEN_RE.lastIndex = 0;
  let match;
  const source = text || "";
  while ((match = MENTION_TOKEN_RE.exec(source))) {
    if (match[1] !== "everyone" && match[1] !== "here") {
      lookup[match[1]] = mentionNameForId(match[1]);
    }
  }
  return lookup;
}

function applyMentionFields(target, raw) {
  target.mentioned = !!(raw && raw.mentioned);
  target.mentionUsers = (raw && raw.mention_users) || target.mentionUsers || {};
  return target;
}

function appendMentionAwareText(el, text, msg) {
  const source = text || "";
  const lookup = (msg && msg.mentionUsers) || {};
  let last = 0;
  MENTION_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = MENTION_TOKEN_RE.exec(source))) {
    if (match.index > last) appendPlainOrLinks(el, source.slice(last, match.index));
    el.appendChild(buildMentionChip(match[1], lookup, msg));
    last = match.index + match[0].length;
  }
  if (last < source.length) appendPlainOrLinks(el, source.slice(last));
}

function appendPlainOrLinks(el, text) {
  if (typeof renderMessageText === "function") renderMessageText(el, text);
  else el.appendChild(document.createTextNode(text));
}

function buildMentionChip(token, lookup, msg) {
  const chip = document.createElement("span");
  chip.className = "mention-chip";
  if (token === "everyone" || token === "here") {
    chip.textContent = "@" + token;
    chip.classList.add("mention-special");
    return chip;
  }
  const userId = parseInt(token, 10);
  const username = lookup[token] || mentionNameForId(token);
  chip.textContent = "@" + username;
  chip.dataset.userId = String(userId);
  chip.dataset.username = username;
  if (userId === myUserId) chip.classList.add("mention-self");
  chip.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("View profile — not implemented yet", userId, username);
  });
  chip.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const member = mentionMembers().find(m => m.id === userId) || {
      id: userId,
      username,
      status: "offline",
      is_owner: false
    };
    if (typeof showMemberContextMenu === "function") showMemberContextMenu(e, member);
  });
  return chip;
}

function formatMentionCount(count) {
  if (count > 99) return "99+";
  return String(count);
}

function findServerChannel(channelId) {
  if (!currentServerData) return null;
  for (const category of currentServerData.categories || []) {
    const channel = (category.channels || []).find(c => c.id === channelId);
    if (channel) return channel;
  }
  return null;
}

function serverEntry(serverId) {
  return serverList.find(s => s.id === serverId) || null;
}

function recountServerNotices(serverId) {
  const server = serverEntry(serverId);
  if (!server) return;
  if (!currentServerData || currentServerId !== serverId) return;
  let unread = false;
  let mentions = 0;
  (currentServerData.categories || []).forEach(category => {
    (category.channels || []).forEach(channel => {
      if (channel.unread) unread = true;
      mentions += channel.mention_count || 0;
    });
  });
  server.unread = unread;
  server.mention_count = mentions;
}

function paintServerNotices() {
  if (typeof renderServerList === "function") renderServerList();
  if (currentServerId && currentServerData && typeof renderServerSidebar === "function") renderServerSidebar(currentServerData);
}

function markChannelReadLocal(channelId) {
  const channel = findServerChannel(channelId);
  if (channel) {
    channel.unread = false;
    channel.mention_count = 0;
  }
  if (currentServerId) recountServerNotices(currentServerId);
  paintServerNotices();
}

function noteIncomingChannelMessage(channelId, serverId, mentioned, isOpen) {
  const sid = serverId || currentServerId;
  if (isOpen) {
    markChannelReadLocal(channelId);
    stampChannelView(channelId);
    return;
  }
  const channel = (sid === currentServerId) ? findServerChannel(channelId) : null;
  if (channel) {
    channel.unread = true;
    if (mentioned) channel.mention_count = (channel.mention_count || 0) + 1;
  }
  const server = serverEntry(sid);
  if (server) {
    server.unread = true;
    if (mentioned) server.mention_count = (server.mention_count || 0) + 1;
  }
  paintServerNotices();
}

function stampChannelView(channelId) {
  if (!channelId || !serverAddress) return;
  fetch(`https://${serverAddress}/view_channel/${channelId}`, {
    method: "POST",
    credentials: "include"
  }).catch(() => {});
}

function stampPartyView(partyId) {
  if (!partyId || !serverAddress) return;
  fetch(`https://${serverAddress}/mark_party_read/${partyId}`, {
    method: "POST",
    credentials: "include"
  }).catch(() => {});
}

async function markServerRead(serverId) {
  try {
    const response = await fetch(`https://${serverAddress}/mark_server_read/${serverId}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) return;
  } catch (e) {
    return;
  }
  const server = serverEntry(serverId);
  if (server) {
    server.unread = false;
    server.mention_count = 0;
  }
  if (currentServerId === serverId && currentServerData) {
    (currentServerData.categories || []).forEach(category => {
      (category.channels || []).forEach(channel => {
        channel.unread = false;
        channel.mention_count = 0;
      });
    });
  }
  paintServerNotices();
}

async function markPartyRead(partyId) {
  try {
    const response = await fetch(`https://${serverAddress}/mark_party_read/${partyId}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) return;
  } catch (e) {
    return;
  }
  if (typeof clearUnread === "function") clearUnread("party", partyId);
}

function decorateRailIcon(wrap, server) {
  wrap.classList.remove("has-unread");
  const pill = wrap.querySelector(".rail-unread-pill");
  const badge = wrap.querySelector(".icon-badge");
  const mentions = server.mention_count || 0;
  const selected = selectedRailIcon === server.id;
  if (mentions > 0) {
    if (pill) pill.style.display = "none";
    if (badge) {
      badge.textContent = formatMentionCount(mentions);
      badge.style.display = "flex";
    }
    return;
  }
  if (badge) badge.style.display = "none";
  if (!selected && server.unread) {
    wrap.classList.add("has-unread");
    if (pill) pill.style.display = "block";
  } else if (pill) {
    pill.style.display = "none";
  }
}

function decorateChannelRow(row, channel) {
  row.classList.remove("has-unread", "has-mention");
  const existing = row.querySelector(".channel-mention-badge");
  if (existing) existing.remove();
  if (channel.id === currentChannelId) return;
  const mentions = channel.mention_count || 0;
  if (mentions > 0) {
    row.classList.add("has-unread", "has-mention");
    const badge = document.createElement("span");
    badge.className = "channel-mention-badge";
    badge.textContent = formatMentionCount(mentions);
    row.appendChild(badge);
  } else if (channel.unread) {
    row.classList.add("has-unread");
  }
}
