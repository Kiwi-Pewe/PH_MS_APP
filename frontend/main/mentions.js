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
  if (raw && raw.reply_to) target.replyTo = raw.reply_to;
  return target;
}

function fillMentionText(el, text, mentionUsers) {
  if (!el) return;
  el.replaceChildren();
  appendMentionAwareText(el, text || "", { mentionUsers: mentionUsers || {} });
}

function mentionedFromPayload(text, mentionUsers, mentionedFlag) {
  if (mentionedFlag) return true;
  const source = text || "";
  if (/<@(everyone|here)>/.test(source)) return true;
  if (typeof myUserId === "undefined" || myUserId == null) return false;
  const lookup = mentionUsers || {};
  return !!(lookup[myUserId] || lookup[String(myUserId)]);
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

const MENTION_SPECIALS = [
  { key: "everyone", label: "everyone", hint: "Notify everyone in this channel", enabled: true },
  { key: "here", label: "here", hint: "Notify everyone online in this channel", enabled: true },
  { key: "game", label: "game", hint: "Not implemented yet", enabled: false },
  { key: "time", label: "time", hint: "Not implemented yet", enabled: false }
];

let mentionPickerState = { input: null, range: null, items: [], index: 0 };

function composerAllowsMentions(input) {
  if (!input || input.disabled) return false;
  if (input.id === "edit-composer-input") {
    const pool = (typeof currentChannelMessages !== "undefined" ? currentChannelMessages : [])
      .concat(typeof currentMessages !== "undefined" ? currentMessages : []);
    const msg = pool.find(row => row.id === editingMessageId);
    return !!(msg && (msg.chatKind === "party" || msg.chatKind === "channel" || msg.chatKind === "forum"));
  }
  if (input.id === "channel-composer-input") {
    return currentChannelType !== "voice" && currentChannelType !== "doc";
  }
  if (input.id === "composer-input") return openChatType === "party";
  if (input.id === "announcement-body-input" || input.id === "forum-body-input") return true;
  if (input.id === "announce-edit-body-input" || input.id === "forum-edit-body-input") return true;
  if (input.classList && input.classList.contains("announce-comment-input")) return true;
  return false;
}

function mentionQueryAtCursor(value, cursor) {
  const before = value.slice(0, cursor);
  const match = before.match(/(^|[\s])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2];
  const start = cursor - query.length - 1;
  return { start, end: cursor, query };
}

function mentionStartsWith(name, query) {
  return name.toLowerCase().startsWith((query || "").toLowerCase());
}

function mentionPickerItems(query) {
  const items = [];
  const q = query || "";
  MENTION_SPECIALS.forEach(special => {
    if (q && !mentionStartsWith(special.label, q)) return;
    items.push({
      type: "special",
      key: special.key,
      label: special.label,
      hint: special.hint,
      enabled: special.enabled,
      insert: special.enabled ? "@" + special.label + " " : null
    });
  });
  if (q) {
    mentionMembers()
      .filter(member => mentionStartsWith(member.username || "", q))
      .sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }))
      .forEach(member => {
        items.push({
          type: "user",
          key: "user-" + member.id,
          label: member.username,
          hint: member.username,
          enabled: true,
          insert: "@" + member.username + " ",
          member
        });
      });
  }
  return items;
}

function validComposerMentionNames() {
  const names = ["everyone", "here"];
  mentionMembers().forEach(member => {
    if (member.username) names.push(member.username);
  });
  names.sort((a, b) => b.length - a.length);
  return names;
}

function renderComposerHighlight(el, text) {
  if (!el) return;
  el.innerHTML = "";
  if (!text) return;
  const names = validComposerMentionNames();
  if (!names.length) {
    el.appendChild(document.createTextNode(text));
    return;
  }
  const pattern = new RegExp("@(?:" + names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "gi");
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) el.appendChild(document.createTextNode(text.slice(last, match.index)));
    const chip = document.createElement("span");
    chip.className = "composer-mention";
    chip.textContent = match[0];
    el.appendChild(chip);
    last = match.index + match[0].length;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
}

function composerHighlightFor(input) {
  if (!input) return null;
  if (input.id === "composer-input") return document.getElementById("composer-highlight");
  if (input.id === "channel-composer-input") return document.getElementById("channel-composer-highlight");
  const field = input.closest(".composer-field");
  return field ? field.querySelector(".composer-highlight") : null;
}

function ensureComposerHighlight(input) {
  if (!input) return null;
  let field = input.closest(".composer-field");
  if (!field) {
    field = document.createElement("div");
    field.className = "composer-field";
    input.parentNode.insertBefore(field, input);
    const highlight = document.createElement("div");
    highlight.className = "composer-highlight";
    highlight.setAttribute("aria-hidden", "true");
    field.appendChild(highlight);
    field.appendChild(input);
  }
  return field.querySelector(".composer-highlight");
}

function refreshComposerMentions(input) {
  if (!input) return;
  const highlight = composerHighlightFor(input);
  if (highlight) {
    if (composerAllowsMentions(input)) renderComposerHighlight(highlight, input.value);
    else {
      highlight.innerHTML = "";
      highlight.appendChild(document.createTextNode(input.value || ""));
    }
    highlight.scrollTop = input.scrollTop;
    highlight.scrollLeft = input.scrollLeft;
  }
  updateMentionPicker(input);
}

function hideMentionPicker() {
  const picker = document.getElementById("mention-picker");
  if (picker) {
    picker.hidden = true;
    picker.classList.remove("visible", "mention-picker-below");
  }
  mentionPickerState = { input: null, range: null, items: [], index: 0 };
}

function mentionPickerHost(input) {
  return input.closest(".announce-composer-editing-body")
    || input.closest(".announce-comment-composer")
    || input.closest(".announce-composer-editing")
    || input.closest("#composer, #channel-composer, .edit-composer");
}

function mentionPickerOpensBelow(input) {
  return !!(input.closest(".announce-composer-editing") || input.closest(".announce-comment-composer"));
}

function firstEnabledMentionIndex(items, preferred) {
  if (preferred >= 0 && items[preferred] && items[preferred].enabled) return preferred;
  return items.findIndex(item => item.enabled);
}

function paintMentionPickerSelection() {
  const picker = document.getElementById("mention-picker");
  if (!picker) return;
  picker.querySelectorAll(".mention-picker-row").forEach(row => {
    const index = parseInt(row.dataset.index, 10);
    row.classList.toggle("selected", index === mentionPickerState.index);
  });
  const selected = picker.querySelector(".mention-picker-row.selected");
  if (selected) selected.scrollIntoView({ block: "nearest" });
}

function renderMentionPicker(items) {
  const picker = document.getElementById("mention-picker");
  const list = document.getElementById("mention-picker-list");
  if (!picker || !list) return;
  list.innerHTML = "";
  let specialHeader = false;
  let memberHeader = false;
  items.forEach((item, index) => {
    if (item.type === "special" && !specialHeader) {
      specialHeader = true;
      const heading = document.createElement("div");
      heading.className = "mention-picker-heading";
      heading.textContent = "Mentions";
      list.appendChild(heading);
    }
    if (item.type === "user" && !memberHeader) {
      memberHeader = true;
      const heading = document.createElement("div");
      heading.className = "mention-picker-heading";
      heading.textContent = "Members";
      list.appendChild(heading);
    }
    const row = document.createElement("div");
    row.className = "mention-picker-row" + (index === mentionPickerState.index ? " selected" : "");
    row.dataset.index = String(index);
    if (!item.enabled) row.setAttribute("aria-disabled", "true");

    const avatar = document.createElement("div");
    avatar.className = "mention-picker-avatar" + (item.type === "special" ? " mention-picker-at" : "");
    avatar.textContent = item.type === "special" ? "@" : avatarLetter(item.label);
    row.appendChild(avatar);

    const name = document.createElement("div");
    name.className = "mention-picker-name";
    name.textContent = item.type === "special" ? "@" + item.label : item.label;
    row.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "mention-picker-meta";
    meta.textContent = item.hint || "";
    row.appendChild(meta);

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (!item.enabled) return;
      pickMention(item);
    });
    row.addEventListener("mouseenter", () => {
      if (!item.enabled) return;
      mentionPickerState.index = index;
      paintMentionPickerSelection();
    });
    list.appendChild(row);
  });
}

function showMentionPicker(input, range, items) {
  const picker = document.getElementById("mention-picker");
  const host = mentionPickerHost(input);
  if (!picker || !host || !items.length) {
    hideMentionPicker();
    return;
  }
  host.appendChild(picker);
  picker.classList.toggle("mention-picker-below", mentionPickerOpensBelow(input));
  mentionPickerState = {
    input,
    range,
    items,
    index: firstEnabledMentionIndex(items, mentionPickerState.input === input ? mentionPickerState.index : 0)
  };
  if (mentionPickerState.index < 0) mentionPickerState.index = 0;
  renderMentionPicker(items);
  picker.hidden = false;
  picker.classList.add("visible");
}

function updateMentionPicker(input) {
  if (!composerAllowsMentions(input)) {
    hideMentionPicker();
    return;
  }
  const cursor = input.selectionStart;
  const range = mentionQueryAtCursor(input.value, cursor);
  if (!range) {
    hideMentionPicker();
    return;
  }
  const items = mentionPickerItems(range.query);
  if (!items.length) {
    hideMentionPicker();
    return;
  }
  showMentionPicker(input, range, items);
}

function insertAtCursor(input, start, end, text) {
  const value = input.value;
  input.value = value.slice(0, start) + text + value.slice(end);
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
  input.focus();
  input.dispatchEvent(new Event("input"));
}

function pickMention(item) {
  if (!item || !item.enabled || !item.insert || !mentionPickerState.input || !mentionPickerState.range) return;
  const input = mentionPickerState.input;
  const range = mentionPickerState.range;
  hideMentionPicker();
  insertAtCursor(input, range.start, range.end, item.insert);
}

function mentionPickerMove(dir) {
  const enabled = mentionPickerState.items
    .map((item, index) => item.enabled ? index : -1)
    .filter(index => index >= 0);
  if (!enabled.length) return;
  const pos = enabled.indexOf(mentionPickerState.index);
  const from = pos < 0 ? 0 : pos;
  mentionPickerState.index = enabled[(from + dir + enabled.length) % enabled.length];
  paintMentionPickerSelection();
}

function mentionPickerHandleKey(e) {
  const picker = document.getElementById("mention-picker");
  if (!picker || picker.hidden || !picker.classList.contains("visible")) return false;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    mentionPickerMove(1);
    return true;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    mentionPickerMove(-1);
    return true;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    hideMentionPicker();
    return true;
  }
  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
    const item = mentionPickerState.items[mentionPickerState.index];
    if (item && item.enabled) {
      e.preventDefault();
      pickMention(item);
      return true;
    }
    hideMentionPicker();
    return e.key === "Tab";
  }
  return false;
}

function activeMentionComposer() {
  const focused = document.activeElement;
  if (focused && composerAllowsMentions(focused)) return focused;
  const edit = document.getElementById("edit-composer-input");
  if (edit) return edit;
  const announceEdit = document.getElementById("announce-edit-body-input");
  if (announceEdit) return announceEdit;
  const forumEdit = document.getElementById("forum-edit-body-input");
  if (forumEdit) return forumEdit;
  const announceBody = document.getElementById("announcement-body-input");
  if (announceBody && announceBody.offsetParent) return announceBody;
  const forumBody = document.getElementById("forum-body-input");
  if (forumBody && forumBody.offsetParent) return forumBody;
  const channelView = document.getElementById("view-channel");
  if (channelView && channelView.classList.contains("active")) return document.getElementById("channel-composer-input");
  return document.getElementById("composer-input");
}

function insertMentionToken(name) {
  const input = activeMentionComposer();
  if (!input || input.disabled) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const before = input.value.slice(0, start);
  const pad = before.length === 0 || /\s$/.test(before) ? "" : " ";
  insertAtCursor(input, start, end, pad + "@" + name + " ");
}

function bindMentionComposer(input) {
  if (!input || input.dataset.mentionBound) return;
  input.dataset.mentionBound = "1";
  ensureComposerHighlight(input);
  input.addEventListener("input", () => refreshComposerMentions(input));
  input.addEventListener("click", () => refreshComposerMentions(input));
  input.addEventListener("keyup", () => refreshComposerMentions(input));
  input.addEventListener("scroll", () => {
    const highlight = composerHighlightFor(input);
    if (highlight) {
      highlight.scrollTop = input.scrollTop;
      highlight.scrollLeft = input.scrollLeft;
    }
  });
  input.addEventListener("keydown", (e) => {
    if (mentionPickerHandleKey(e)) {
      e.stopImmediatePropagation();
    }
  }, true);
  refreshComposerMentions(input);
}

bindMentionComposer(document.getElementById("composer-input"));
bindMentionComposer(document.getElementById("channel-composer-input"));
bindMentionComposer(document.getElementById("announcement-body-input"));
bindMentionComposer(document.getElementById("forum-body-input"));
document.addEventListener("click", (e) => {
  const picker = document.getElementById("mention-picker");
  if (!picker || picker.hidden) return;
  if (picker.contains(e.target)) return;
  if (e.target && e.target.closest && e.target.closest("textarea, .announce-comment-input, .composer-field")) return;
  hideMentionPicker();
});

