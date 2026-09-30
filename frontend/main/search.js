let searchFilters = {
  author_id: null,
  author_name: "",
  channel_id: null,
  channel_name: "",
  mentions_user_id: null,
  mentions_name: "",
  has: [],
  pinned: null,
  before: null,
  after: null,
  during: null,
};
let searchResultsOpen = false;
let searchRailForced = false;
let searchPage = 1;
let searchPages = 1;
let searchDropdownEl = null;
let searchHistory = [];

const SEARCH_HISTORY_KEY = "oneira_search_history";
const SEARCH_LIVE_HAS = ["link", "image", "video", "file"];
const SEARCH_GREY_HAS = ["embed", "poll", "sticker", "sound", "snapshot"];

function memberListIsVisible() {
  const grid = document.getElementById("main-grid");
  return !!(grid && grid.classList.contains("has-member-list"));
}

function syncSearchInputValues(source) {
  const chatInput = document.getElementById("chat-search-input");
  const railInput = document.getElementById("rail-search-input");
  if (!chatInput || !railInput) return;
  const value = source && source.value != null ? source.value : (activeSearchInput()?.value || "");
  chatInput.value = value;
  railInput.value = value;
}

function syncChatSearchPlacement() {
  const hasMembers = memberListIsVisible();
  const headerSlot = document.getElementById("chat-search-slot");
  const railSlot = document.getElementById("user-list-search");
  syncSearchInputValues();
  if (headerSlot) headerSlot.hidden = hasMembers;
  if (railSlot) railSlot.hidden = !hasMembers;
  paintSearchChips();
}

function setChatSearchPlaceholder(text) {
  const value = (text || "Search").trim() || "Search";
  const chatInput = document.getElementById("chat-search-input");
  const railInput = document.getElementById("rail-search-input");
  if (chatInput) chatInput.placeholder = value;
  if (railInput) railInput.placeholder = value;
}

function activeSearchInput() {
  if (memberListIsVisible()) return document.getElementById("rail-search-input");
  return document.getElementById("chat-search-input");
}

function loadSearchHistory() {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    searchHistory = Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch (e) {
    searchHistory = [];
  }
}

function saveSearchHistory() {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory.slice(0, 12)));
  } catch (e) {}
}

function pushSearchHistory(entry) {
  const key = JSON.stringify(entry);
  searchHistory = searchHistory.filter((row) => JSON.stringify(row) !== key);
  searchHistory.unshift(entry);
  if (searchHistory.length > 12) searchHistory.length = 12;
  saveSearchHistory();
}

function clearSearchHistory() {
  searchHistory = [];
  saveSearchHistory();
  openSearchDropdown();
}

function resolveSearchScope() {
  const chat = document.getElementById("view-chat");
  const channel = document.getElementById("view-channel");
  if (chat && chat.classList.contains("active") && openChatType === "dm" && openChatId) {
    return { kind: "dm", id: openChatId };
  }
  if (chat && chat.classList.contains("active") && openChatType === "party" && openChatId) {
    return { kind: "party", id: openChatId };
  }
  if (channel && channel.classList.contains("active") && currentServerId) {
    return { kind: "server", id: currentServerId };
  }
  return null;
}

function resetSearchFilters() {
  searchFilters = {
    author_id: null,
    author_name: "",
    channel_id: null,
    channel_name: "",
    mentions_user_id: null,
    mentions_name: "",
    has: [],
    pinned: null,
    before: null,
    after: null,
    during: null,
  };
}

function paintSearchChips() {
  ["chat-search-chips", "rail-search-chips"].forEach((id) => {
    const host = document.getElementById(id);
    if (!host) return;
    host.replaceChildren();
    const chips = [];
    if (searchFilters.author_id != null) {
      chips.push({ key: "author", label: "from: " + (searchFilters.author_name || searchFilters.author_id) });
    }
    if (searchFilters.channel_id != null) {
      chips.push({ key: "channel", label: "in: #" + (searchFilters.channel_name || searchFilters.channel_id) });
    }
    if (searchFilters.mentions_user_id != null) {
      chips.push({ key: "mentions", label: "mentions: " + (searchFilters.mentions_name || searchFilters.mentions_user_id) });
    }
    (searchFilters.has || []).forEach((item) => {
      chips.push({ key: "has:" + item, label: "has: " + item });
    });
    if (searchFilters.pinned === true) chips.push({ key: "pinned", label: "pinned: true" });
    if (searchFilters.pinned === false) chips.push({ key: "pinned", label: "pinned: false" });
    if (searchFilters.before) chips.push({ key: "before", label: "before: " + searchFilters.before });
    if (searchFilters.after) chips.push({ key: "after", label: "after: " + searchFilters.after });
    if (searchFilters.during) chips.push({ key: "during", label: "during: " + searchFilters.during });
    chips.forEach((chip) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "chat-search-chip";
      el.textContent = chip.label;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeSearchChip(chip.key);
      });
      host.appendChild(el);
    });
  });
}

function removeSearchChip(key) {
  if (key === "author") {
    searchFilters.author_id = null;
    searchFilters.author_name = "";
  } else if (key === "channel") {
    searchFilters.channel_id = null;
    searchFilters.channel_name = "";
  } else if (key === "mentions") {
    searchFilters.mentions_user_id = null;
    searchFilters.mentions_name = "";
  } else if (key === "pinned") {
    searchFilters.pinned = null;
  } else if (key === "before") {
    searchFilters.before = null;
  } else if (key === "after") {
    searchFilters.after = null;
  } else if (key === "during") {
    searchFilters.during = null;
  } else if (String(key).startsWith("has:")) {
    const token = String(key).slice(4);
    searchFilters.has = (searchFilters.has || []).filter((item) => item !== token);
  }
  paintSearchChips();
}

function closeSearchDropdown() {
  if (searchDropdownEl) {
    searchDropdownEl.remove();
    searchDropdownEl = null;
  }
}

function openSearchDropdown() {
  closeSearchDropdown();
  const input = activeSearchInput();
  if (!input) return;
  const shell = input.closest(".chat-search-shell") || input.parentElement;
  if (!shell) return;
  loadSearchHistory();
  const menu = document.createElement("div");
  menu.className = "search-dropdown";
  menu.addEventListener("mousedown", (e) => e.preventDefault());

  const filtersTitle = document.createElement("div");
  filtersTitle.className = "search-dropdown-heading";
  filtersTitle.textContent = "Filters";
  menu.appendChild(filtersTitle);

  const filterRows = [
    { label: "From a specific user", detail: "from: user", action: () => pickSearchFromUser() },
    { label: "Includes a specific type of data", detail: "has: link, embed or file", action: () => pickSearchHas() },
    { label: "Mentions a specific user", detail: "mentions: user", action: () => pickSearchMentions() },
    { label: "More filters", detail: "dates, author type, and more", action: () => pickSearchMore() },
  ];
  if (resolveSearchScope() && resolveSearchScope().kind === "server") {
    filterRows.splice(1, 0, { label: "Sent in a specific channel", detail: "in: channel", action: () => pickSearchChannel() });
  }
  filterRows.forEach((row) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-dropdown-item";
    const title = document.createElement("div");
    title.className = "search-dropdown-item-title";
    title.textContent = row.label;
    const detail = document.createElement("div");
    detail.className = "search-dropdown-item-detail";
    detail.textContent = row.detail;
    btn.appendChild(title);
    btn.appendChild(detail);
    btn.addEventListener("click", () => {
      closeSearchDropdown();
      row.action();
    });
    menu.appendChild(btn);
  });

  const histHead = document.createElement("div");
  histHead.className = "search-dropdown-history-head";
  const histTitle = document.createElement("div");
  histTitle.className = "search-dropdown-heading";
  histTitle.textContent = "History";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "search-dropdown-clear";
  clearBtn.title = "Clear history";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("click", () => clearSearchHistory());
  histHead.appendChild(histTitle);
  histHead.appendChild(clearBtn);
  menu.appendChild(histHead);

  if (!searchHistory.length) {
    const empty = document.createElement("div");
    empty.className = "search-dropdown-empty";
    empty.textContent = "No recent searches.";
    menu.appendChild(empty);
  } else {
    searchHistory.forEach((entry) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-dropdown-history-item";
      btn.textContent = summarizeSearchHistory(entry);
      btn.addEventListener("click", () => {
        applySearchHistory(entry);
        closeSearchDropdown();
        runSearch(1);
      });
      menu.appendChild(btn);
    });
  }

  shell.appendChild(menu);
  searchDropdownEl = menu;
}

function summarizeSearchHistory(entry) {
  const bits = [];
  if (entry.content) bits.push(entry.content);
  if (entry.author_name) bits.push("from:" + entry.author_name);
  if (entry.channel_name) bits.push("in:#" + entry.channel_name);
  if (entry.mentions_name) bits.push("mentions:" + entry.mentions_name);
  (entry.has || []).forEach((item) => bits.push("has:" + item));
  if (entry.pinned === true) bits.push("pinned:true");
  if (entry.before) bits.push("before:" + entry.before);
  if (entry.after) bits.push("after:" + entry.after);
  if (entry.during) bits.push("during:" + entry.during);
  return bits.join(" ") || "Search";
}

function applySearchHistory(entry) {
  resetSearchFilters();
  searchFilters.author_id = entry.author_id != null ? entry.author_id : null;
  searchFilters.author_name = entry.author_name || "";
  searchFilters.channel_id = entry.channel_id != null ? entry.channel_id : null;
  searchFilters.channel_name = entry.channel_name || "";
  searchFilters.mentions_user_id = entry.mentions_user_id != null ? entry.mentions_user_id : null;
  searchFilters.mentions_name = entry.mentions_name || "";
  searchFilters.has = Array.isArray(entry.has) ? entry.has.slice() : [];
  searchFilters.pinned = entry.pinned == null ? null : !!entry.pinned;
  searchFilters.before = entry.before || null;
  searchFilters.after = entry.after || null;
  searchFilters.during = entry.during || null;
  const input = activeSearchInput();
  if (input) input.value = entry.content || "";
  paintSearchChips();
}

function pickSearchFromUser() {
  const scope = resolveSearchScope();
  const options = [];
  if (scope && scope.kind === "server" && Array.isArray(memberList) && memberList.length) {
    memberList.forEach((member) => {
      options.push({
        label: member.username || ("User " + member.id),
        onSelect: () => {
          searchFilters.author_id = member.id;
          searchFilters.author_name = member.username || "";
          paintSearchChips();
        },
      });
    });
  } else if (scope && scope.kind === "dm" && openChatId) {
    options.push({
      label: openChatName || ("User " + openChatId),
      onSelect: () => {
        searchFilters.author_id = openChatId;
        searchFilters.author_name = openChatName || "";
        paintSearchChips();
      },
    });
    options.push({
      label: myUsername || "You",
      onSelect: () => {
        searchFilters.author_id = myUserId;
        searchFilters.author_name = myUsername || "";
        paintSearchChips();
      },
    });
  } else if (scope && scope.kind === "party" && Array.isArray(memberList) && memberList.length) {
    memberList.forEach((member) => {
      options.push({
        label: member.username || ("User " + member.id),
        onSelect: () => {
          searchFilters.author_id = member.id;
          searchFilters.author_name = member.username || "";
          paintSearchChips();
        },
      });
    });
  }
  if (!options.length) {
    options.push({ label: "No users available", disabled: true });
  }
  const input = activeSearchInput();
  const rect = input ? input.getBoundingClientRect() : { left: 40, bottom: 80 };
  if (typeof openContextMenu === "function") {
    openContextMenu(rect.left, rect.bottom + 4, null, options);
  }
}

function pickSearchMentions() {
  pickSearchFromUserReplace((member) => {
    searchFilters.mentions_user_id = member.id;
    searchFilters.mentions_name = member.username || "";
    paintSearchChips();
  });
}

function pickSearchFromUserReplace(onPick) {
  const scope = resolveSearchScope();
  const options = [];
  const apply = (id, name) => {
    if (typeof onPick === "function") onPick({ id: id, username: name });
  };
  if (scope && scope.kind === "server" && Array.isArray(memberList) && memberList.length) {
    memberList.forEach((member) => {
      options.push({
        label: member.username || ("User " + member.id),
        onSelect: () => apply(member.id, member.username || ""),
      });
    });
  } else if (scope && scope.kind === "dm" && openChatId) {
    options.push({ label: openChatName || ("User " + openChatId), onSelect: () => apply(openChatId, openChatName || "") });
    options.push({ label: myUsername || "You", onSelect: () => apply(myUserId, myUsername || "") });
  } else if (scope && scope.kind === "party" && Array.isArray(memberList) && memberList.length) {
    memberList.forEach((member) => {
      options.push({
        label: member.username || ("User " + member.id),
        onSelect: () => apply(member.id, member.username || ""),
      });
    });
  }
  if (!options.length) options.push({ label: "No users available", disabled: true });
  const input = activeSearchInput();
  const rect = input ? input.getBoundingClientRect() : { left: 40, bottom: 80 };
  if (typeof openContextMenu === "function") openContextMenu(rect.left, rect.bottom + 4, null, options);
}

function pickSearchChannel() {
  const options = [];
  if (currentServerData && Array.isArray(currentServerData.categories)) {
    currentServerData.categories.forEach((category) => {
      (category.channels || []).forEach((channel) => {
        if (channel.channel_type !== "text" && channel.channel_type !== "announcements" && channel.channel_type !== "forums") return;
        options.push({
          label: "#" + (channel.name || channel.id),
          onSelect: () => {
            searchFilters.channel_id = channel.id;
            searchFilters.channel_name = channel.name || "";
            paintSearchChips();
          },
        });
      });
    });
  }
  if (!options.length) options.push({ label: "No channels available", disabled: true });
  const input = activeSearchInput();
  const rect = input ? input.getBoundingClientRect() : { left: 40, bottom: 80 };
  if (typeof openContextMenu === "function") openContextMenu(rect.left, rect.bottom + 4, null, options);
}

function pickSearchHas() {
  const options = [];
  SEARCH_LIVE_HAS.forEach((item) => {
    options.push({
      label: item,
      onSelect: () => {
        if (!searchFilters.has.includes(item)) searchFilters.has.push(item);
        paintSearchChips();
      },
    });
  });
  SEARCH_GREY_HAS.forEach((item) => {
    options.push({ label: item, disabled: true });
  });
  const input = activeSearchInput();
  const rect = input ? input.getBoundingClientRect() : { left: 40, bottom: 80 };
  if (typeof openContextMenu === "function") openContextMenu(rect.left, rect.bottom + 4, null, options);
}

function pickSearchMore() {
  const input = activeSearchInput();
  const rect = input ? input.getBoundingClientRect() : { left: 40, bottom: 80 };
  if (typeof openContextMenu !== "function") return;
  openContextMenu(rect.left, rect.bottom + 4, null, [
    {
      label: "Before a date",
      onSelect: () => {
        const value = window.prompt("Before date (YYYY-MM-DD)");
        if (!value) return;
        searchFilters.before = value.trim().slice(0, 10);
        searchFilters.during = null;
        paintSearchChips();
      },
    },
    {
      label: "After a date",
      onSelect: () => {
        const value = window.prompt("After date (YYYY-MM-DD)");
        if (!value) return;
        searchFilters.after = value.trim().slice(0, 10);
        searchFilters.during = null;
        paintSearchChips();
      },
    },
    {
      label: "During a date",
      onSelect: () => {
        const value = window.prompt("During date (YYYY-MM-DD)");
        if (!value) return;
        searchFilters.during = value.trim().slice(0, 10);
        searchFilters.before = null;
        searchFilters.after = null;
        paintSearchChips();
      },
    },
    {
      label: "Pinned messages",
      onSelect: () => {
        searchFilters.pinned = true;
        paintSearchChips();
      },
    },
    {
      label: "Not pinned",
      onSelect: () => {
        searchFilters.pinned = false;
        paintSearchChips();
      },
    },
    { label: "Author type", disabled: true },
  ]);
}

function ensureSearchRail() {
  if (memberListIsVisible()) return;
  searchRailForced = true;
  if (typeof showMemberListPanel === "function") showMemberListPanel();
  else {
    document.getElementById("main-grid").classList.add("has-member-list");
    document.getElementById("user-list").style.display = "flex";
    syncChatSearchPlacement();
  }
}

function showSearchResultsMode(on) {
  searchResultsOpen = !!on;
  const panel = document.getElementById("search-results-panel");
  const members = document.getElementById("member-list-body");
  const grid = document.getElementById("main-grid");
  if (panel) panel.hidden = !on;
  if (members) members.hidden = !!on;
  if (grid) grid.classList.toggle("has-search-results", !!on);
}

function closeSearchResults() {
  showSearchResultsMode(false);
  const body = document.getElementById("search-results-body");
  const footer = document.getElementById("search-results-footer");
  if (body) body.replaceChildren();
  if (footer) {
    footer.hidden = true;
    footer.replaceChildren();
  }
  if (searchRailForced) {
    searchRailForced = false;
    if (typeof hideMemberList === "function") hideMemberList();
  }
}

function clearSearchAndClose() {
  const chatInput = document.getElementById("chat-search-input");
  const railInput = document.getElementById("rail-search-input");
  if (chatInput) chatInput.value = "";
  if (railInput) railInput.value = "";
  resetSearchFilters();
  paintSearchChips();
  closeSearchDropdown();
  closeSearchResults();
}

async function runSearch(page) {
  const scope = resolveSearchScope();
  if (!scope) return;
  syncSearchInputValues(activeSearchInput());
  const content = ((activeSearchInput() && activeSearchInput().value) || "").trim();
  const hasFilters = searchFilters.author_id != null
    || searchFilters.channel_id != null
    || searchFilters.mentions_user_id != null
    || (searchFilters.has && searchFilters.has.length)
    || searchFilters.pinned != null
    || searchFilters.before
    || searchFilters.after
    || searchFilters.during;
  if (!content && !hasFilters) {
    closeSearchResults();
    return;
  }

  ensureSearchRail();
  syncSearchInputValues();
  showSearchResultsMode(true);
  searchPage = Math.max(1, page || 1);
  const body = document.getElementById("search-results-body");
  const footer = document.getElementById("search-results-footer");
  const title = document.getElementById("search-results-title");
  if (title) title.textContent = "Search Results";
  if (body) {
    body.replaceChildren();
    const loading = document.createElement("div");
    loading.className = "search-results-empty";
    loading.textContent = "Searching…";
    body.appendChild(loading);
  }
  if (footer) {
    footer.hidden = true;
    footer.replaceChildren();
  }

  const payload = {
    scope_kind: scope.kind,
    scope_id: scope.id,
    content: content,
    page: searchPage,
    author_id: searchFilters.author_id,
    channel_id: searchFilters.channel_id,
    mentions_user_id: searchFilters.mentions_user_id,
    has: searchFilters.has || [],
    pinned: searchFilters.pinned,
    before: searchFilters.before,
    after: searchFilters.after,
    during: searchFilters.during,
  };

  try {
    const response = await fetch(`https://${serverAddress}/search_messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (body) {
        body.replaceChildren();
        const err = document.createElement("div");
        err.className = "search-results-empty";
        err.textContent = (typeof data.detail === "string" && data.detail) || "Search failed.";
        body.appendChild(err);
      }
      return;
    }
    pushSearchHistory({
      content: content,
      author_id: searchFilters.author_id,
      author_name: searchFilters.author_name,
      channel_id: searchFilters.channel_id,
      channel_name: searchFilters.channel_name,
      mentions_user_id: searchFilters.mentions_user_id,
      mentions_name: searchFilters.mentions_name,
      has: (searchFilters.has || []).slice(),
      pinned: searchFilters.pinned,
      before: searchFilters.before,
      after: searchFilters.after,
      during: searchFilters.during,
    });
    paintSearchResults(data);
  } catch (e) {
    if (body) {
      body.replaceChildren();
      const err = document.createElement("div");
      err.className = "search-results-empty";
      err.textContent = "Search failed.";
      body.appendChild(err);
    }
  }
}

function paintSearchResults(data) {
  const body = document.getElementById("search-results-body");
  const footer = document.getElementById("search-results-footer");
  const title = document.getElementById("search-results-title");
  if (!body) return;
  body.replaceChildren();
  const total = data.total || 0;
  searchPages = data.pages || 1;
  searchPage = data.page || 1;
  if (title) title.textContent = total ? (total + " Result" + (total === 1 ? "" : "s")) : "Search Results";
  const messages = data.messages || [];
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "search-results-empty";
    empty.textContent = "No messages matched that search.";
    body.appendChild(empty);
  } else {
    messages.forEach((row) => body.appendChild(buildSearchResultRow(row)));
  }
  if (!footer) return;
  footer.replaceChildren();
  if (searchPages <= 1) {
    footer.hidden = true;
    return;
  }
  footer.hidden = false;
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "settings-row-btn";
  prev.textContent = "Previous";
  prev.disabled = searchPage <= 1;
  prev.addEventListener("click", () => runSearch(searchPage - 1));
  const label = document.createElement("span");
  label.className = "pins-page-label";
  label.textContent = "Page " + searchPage + " of " + searchPages;
  const next = document.createElement("button");
  next.type = "button";
  next.className = "settings-row-btn";
  next.textContent = "Next";
  next.disabled = searchPage >= searchPages;
  next.addEventListener("click", () => runSearch(searchPage + 1));
  footer.appendChild(prev);
  footer.appendChild(label);
  footer.appendChild(next);
}

function buildSearchResultRow(row) {
  const card = document.createElement("div");
  card.className = "search-result-row";
  const msg = {
    id: row.id,
    chatKind: row.message_kind || row.chat_kind || "channel",
    isMine: Number(row.sender_id) === Number(myUserId),
    senderId: row.sender_id,
    username: row.username || "",
    content: row.content || "",
    attachment: typeof parseAttachment === "function" ? parseAttachment(row.attachment) : row.attachment,
    time: row.timestamp ? new Date(row.timestamp) : new Date(),
    edited: !!row.edited,
    reactions: [],
    avatar: row.avatar || null,
  };
  if (row.channel_name) {
    const meta = document.createElement("div");
    meta.className = "search-result-meta";
    meta.textContent = "#" + row.channel_name;
    card.appendChild(meta);
  }
  const wrap = document.createElement("div");
  wrap.className = "search-result-message";
  if (typeof startNewCluster === "function") startNewCluster(wrap, msg);
  else {
    const fallback = document.createElement("div");
    fallback.textContent = (msg.username || "") + ": " + (msg.content || "");
    wrap.appendChild(fallback);
  }
  card.appendChild(wrap);
  card.addEventListener("click", () => jumpToSearchResult(row));
  return card;
}

function flashSearchTarget(el) {
  if (!el) return false;
  el.scrollIntoView({ block: "center" });
  el.classList.add("pin-jump-flash");
  setTimeout(() => el.classList.remove("pin-jump-flash"), 1600);
  return true;
}

async function openSearchChannel(row) {
  if (!row.channel_id || !currentServerData || Number(currentChannelId) === Number(row.channel_id)) return;
  let target = null;
  (currentServerData.categories || []).forEach((category) => {
    (category.channels || []).forEach((channel) => {
      if (Number(channel.id) === Number(row.channel_id)) target = channel;
    });
  });
  if (target && typeof selectChannel === "function") await selectChannel(target);
}

async function revealSearchComment(postId, commentId) {
  if (!postId || typeof toggleCommentThread !== "function") return;
  const state = typeof commentThreadState !== "undefined" ? commentThreadState[postId] : null;
  if (!state || !state.expanded) await toggleCommentThread(postId);
  const selector = `[data-comment-id="${CSS.escape(String(commentId))}"]`;
  for (let i = 0; i < 40; i++) {
    const el = document.querySelector(selector);
    if (el) {
      flashSearchTarget(el);
      return;
    }
    const current = typeof commentThreadState !== "undefined" ? commentThreadState[postId] : null;
    if (!current || !current.hasMore || typeof fetchComments !== "function") return;
    await fetchComments(postId, 25);
  }
}

async function jumpToSearchResult(row) {
  const kind = row.message_kind || row.chat_kind;
  const messageId = row.id;
  if (!kind || !messageId) return;
  if (kind === "dm" || kind === "party") {
    if (typeof highlightMessageInView === "function" && highlightMessageInView(messageId)) return;
    if (typeof jumpLoadAroundChat === "function") await jumpLoadAroundChat(kind, messageId);
    if (typeof highlightMessageInView === "function") highlightMessageInView(messageId);
    return;
  }
  await openSearchChannel(row);
  if (kind === "channel") {
    if (typeof highlightMessageInView === "function" && highlightMessageInView(messageId)) return;
    if (typeof jumpLoadAroundChannel === "function") await jumpLoadAroundChannel(messageId);
    if (typeof highlightMessageInView === "function") highlightMessageInView(messageId);
    return;
  }
  if (kind === "announcement") {
    const selector = `.announce-post[data-post-id="${CSS.escape(String(messageId))}"]`;
    if (flashSearchTarget(document.querySelector(selector))) return;
    if (typeof jumpLoadAroundAnnouncement === "function") await jumpLoadAroundAnnouncement(messageId);
    flashSearchTarget(document.querySelector(selector));
    return;
  }
  if (kind === "comment") {
    const postId = row.post_id;
    const selector = `.announce-post[data-post-id="${CSS.escape(String(postId))}"]`;
    if (!document.querySelector(selector) && typeof jumpLoadAroundAnnouncement === "function") {
      await jumpLoadAroundAnnouncement(postId);
    }
    await revealSearchComment(postId, messageId);
    return;
  }
  if (kind === "forum_post" || kind === "forum") {
    const postId = kind === "forum" ? row.post_id : messageId;
    if (typeof openForumPost === "function") {
      await openForumPost({
        id: postId,
        title: row.title || "Topic",
        body: row.body || "",
        attachment: row.attachment || null,
      });
    }
    if (kind === "forum_post") {
      const start = document.querySelector(".forum-thread-opener, .forum-start-card, .channel-start-card");
      if (start) start.scrollIntoView({ block: "center" });
      return;
    }
    if (typeof highlightMessageInView === "function" && highlightMessageInView(messageId)) return;
    if (typeof jumpLoadAroundForum === "function") await jumpLoadAroundForum(postId, messageId);
    if (typeof highlightMessageInView === "function") highlightMessageInView(messageId);
  }
}

function bindSearchInput(input) {
  if (!input) return;
  input.addEventListener("focus", () => openSearchDropdown());
  input.addEventListener("input", () => {
    syncSearchInputValues(input);
    if (!input.value.trim()) {
      closeSearchDropdown();
      closeSearchResults();
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      syncSearchInputValues(input);
      closeSearchDropdown();
      runSearch(1);
    } else if (e.key === "Escape") {
      closeSearchDropdown();
    }
  });
}

loadSearchHistory();
syncChatSearchPlacement();
bindSearchInput(document.getElementById("chat-search-input"));
bindSearchInput(document.getElementById("rail-search-input"));
const searchClose = document.getElementById("search-results-close");
if (searchClose) searchClose.addEventListener("click", () => clearSearchAndClose());
document.addEventListener("mousedown", (e) => {
  if (!searchDropdownEl) return;
  if (searchDropdownEl.contains(e.target)) return;
  if (e.target && e.target.closest && e.target.closest(".chat-search-shell")) return;
  closeSearchDropdown();
});
