const COMMUNITY_SEARCH_HAS = ["image", "video", "sound", "file", "link"];

function communitySearchFilters(kind) {
  const noun = kind === "room" ? "rooms" : "posts";
  return [
    { key: "author", label: "From", detail: "Only " + noun + " from a specific account" },
    { key: "has", label: "Has", detail: "Only " + noun + " containing specific content" },
    { key: "topic", label: "Topic", detail: "Only " + noun + " related to this topic." },
  ];
}

function communitySearchBlank() {
  return { pending: "", author: "", topic: "", has: [], submitted: null };
}

const communitySearchState = {
  post: communitySearchBlank(),
  room: communitySearchBlank(),
};

function communitySearchParams(kind) {
  const state = communitySearchState[kind];
  if (!state || !state.submitted) return null;
  return state.submitted;
}

function communitySearchRan(kind) {
  return !!(communitySearchState[kind] && communitySearchState[kind].submitted);
}

function communitySearchNodes(kind) {
  const prefix = kind === "room" ? "community-room-search" : "community-post-search";
  return {
    shell: document.getElementById(prefix + "-shell"),
    input: document.getElementById(prefix),
    chips: document.getElementById(prefix + "-chips"),
    menu: document.getElementById(prefix + "-menu"),
  };
}

function communitySearchLabel(item) {
  const name = String(item || "");
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
}

function communitySearchChipList(state) {
  const chips = [];
  if (state.author) chips.push({ id: "author", label: "From: " + state.author });
  (state.has || []).forEach((item) => chips.push({ id: "has:" + item, label: "Has: " + communitySearchLabel(item) }));
  if (state.topic) chips.push({ id: "topic", label: "Topic: " + state.topic });
  if (state.pending === "author") chips.push({ id: "pending", label: "From:" });
  else if (state.pending === "has") chips.push({ id: "pending", label: "Has:" });
  else if (state.pending === "topic") chips.push({ id: "pending", label: "Topic:" });
  return chips;
}

function communitySearchOption(title, detail, onPick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-dropdown-item";
  button.addEventListener("mousedown", (e) => e.preventDefault());
  const head = document.createElement("div");
  head.className = "search-dropdown-item-title";
  head.textContent = title;
  button.appendChild(head);
  if (detail) {
    const sub = document.createElement("div");
    sub.className = "search-dropdown-item-detail";
    sub.textContent = detail;
    button.appendChild(sub);
  }
  button.addEventListener("click", onPick);
  return button;
}

function communitySearchFillMenu(kind) {
  const state = communitySearchState[kind];
  const nodes = communitySearchNodes(kind);
  if (!state || !nodes.menu) return;
  nodes.menu.replaceChildren();
  const text = nodes.input ? String(nodes.input.value || "").trim() : "";
  if (text) return;
  if (state.pending === "has") {
    COMMUNITY_SEARCH_HAS.forEach((item) => {
      if ((state.has || []).indexOf(item) >= 0) return;
      nodes.menu.appendChild(communitySearchOption(communitySearchLabel(item), "", () => {
        if (state.has.indexOf(item) < 0) state.has.push(item);
        state.pending = "";
        if (nodes.input) nodes.input.value = "";
        communitySearchPaint(kind);
        communitySearchMenu(kind, true);
      }));
    });
    return;
  }
  if (state.pending) {
    const empty = document.createElement("div");
    empty.className = "search-dropdown-empty";
    empty.textContent = state.pending === "topic" ? "Type a topic" : "Type an account name";
    nodes.menu.appendChild(empty);
    return;
  }
  const head = document.createElement("div");
  head.className = "search-dropdown-heading";
  head.textContent = "Filters";
  nodes.menu.appendChild(head);
  communitySearchFilters(kind).forEach((filter) => {
    nodes.menu.appendChild(communitySearchOption(filter.label, filter.detail, () => communitySearchPick(kind, filter.key)));
  });
}

function communitySearchMenu(kind, open) {
  const nodes = communitySearchNodes(kind);
  if (!nodes.menu) return;
  const typing = nodes.input && String(nodes.input.value || "").length;
  if (!open || typing) {
    nodes.menu.hidden = true;
    nodes.menu.replaceChildren();
    return;
  }
  communitySearchFillMenu(kind);
  nodes.menu.hidden = false;
}

function communitySearchPaint(kind) {
  const state = communitySearchState[kind];
  const nodes = communitySearchNodes(kind);
  if (!state || !nodes.chips) return;
  nodes.chips.replaceChildren();
  communitySearchChipList(state).forEach((chip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-search-chip";
    button.textContent = chip.label;
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", () => communitySearchRemove(kind, chip.id));
    nodes.chips.appendChild(button);
  });
  if (nodes.input) {
    const hints = {
      author: "Account name",
      topic: "Topic",
      has: "Image, Video, Sound, File, or Link",
    };
    nodes.input.placeholder = state.pending ? (hints[state.pending] || "") : (kind === "room" ? "Search rooms" : "Search posts");
  }
  if (nodes.menu && !nodes.menu.hidden) communitySearchFillMenu(kind);
}

function communitySearchRemove(kind, id) {
  const state = communitySearchState[kind];
  if (!state) return;
  if (id === "pending") state.pending = "";
  else if (id === "author") state.author = "";
  else if (id === "topic") state.topic = "";
  else if (String(id).indexOf("has:") === 0) state.has = (state.has || []).filter((item) => item !== String(id).slice(4));
  communitySearchPaint(kind);
}

function communitySearchPick(kind, key) {
  const state = communitySearchState[kind];
  if (!state) return;
  state.pending = key;
  communitySearchPaint(kind);
  const nodes = communitySearchNodes(kind);
  if (nodes.input) nodes.input.focus();
  communitySearchMenu(kind, true);
}

function communitySearchCommitPending(kind) {
  const state = communitySearchState[kind];
  const nodes = communitySearchNodes(kind);
  if (!state || !state.pending) return false;
  const text = nodes.input ? String(nodes.input.value || "").trim() : "";
  if (!text) return true;
  if (state.pending === "has") {
    const item = text.toLowerCase();
    if (COMMUNITY_SEARCH_HAS.indexOf(item) < 0) return true;
    if (state.has.indexOf(item) < 0) state.has.push(item);
  } else if (state.pending === "author") state.author = text;
  else if (state.pending === "topic") state.topic = text;
  state.pending = "";
  if (nodes.input) nodes.input.value = "";
  communitySearchPaint(kind);
  communitySearchMenu(kind, true);
  return true;
}

function communitySearchRun(kind) {
  if (kind === "room") {
    if (typeof loadCommunityRooms === "function") loadCommunityRooms();
    return;
  }
  const lens = typeof communityRow !== "undefined" ? communityRow : "explore";
  if (typeof loadCommunityPosts === "function") loadCommunityPosts(lens, false);
}

function communitySearchEnter(kind) {
  const state = communitySearchState[kind];
  const nodes = communitySearchNodes(kind);
  if (!state) return;
  if (state.pending) {
    communitySearchCommitPending(kind);
    return;
  }
  const text = nodes.input ? String(nodes.input.value || "").trim() : "";
  if (!text && !state.author && !state.topic && !(state.has || []).length) state.submitted = null;
  else {
    state.submitted = {
      q: text,
      author: state.author,
      topic: state.topic,
      has: (state.has || []).slice(),
    };
  }
  communitySearchMenu(kind, false);
  communitySearchRun(kind);
}

function communitySearchKey(kind, e) {
  const state = communitySearchState[kind];
  const nodes = communitySearchNodes(kind);
  if (!state || !e) return;
  if (e.key === "Enter") {
    e.preventDefault();
    communitySearchEnter(kind);
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (nodes.menu && !nodes.menu.hidden) {
      communitySearchMenu(kind, false);
      return;
    }
    if (state.pending) {
      state.pending = "";
      communitySearchPaint(kind);
    }
    return;
  }
  if (e.key === "Backspace" && nodes.input && !nodes.input.value) {
    e.preventDefault();
    if (state.pending) state.pending = "";
    else if (state.topic) state.topic = "";
    else if ((state.has || []).length) state.has.pop();
    else if (state.author) state.author = "";
    communitySearchPaint(kind);
  }
}

function bindCommunitySearch(kind) {
  const nodes = communitySearchNodes(kind);
  if (!nodes.input) return;
  nodes.input.addEventListener("focus", () => communitySearchMenu(kind, true));
  nodes.input.addEventListener("input", () => communitySearchMenu(kind, !String(nodes.input.value || "").length));
  nodes.input.addEventListener("keydown", (e) => communitySearchKey(kind, e));
}

bindCommunitySearch("post");
bindCommunitySearch("room");
document.addEventListener("mousedown", (e) => {
  ["post", "room"].forEach((kind) => {
    const nodes = communitySearchNodes(kind);
    if (!nodes.shell || !nodes.menu || nodes.menu.hidden) return;
    if (nodes.shell.contains(e.target)) return;
    communitySearchMenu(kind, false);
  });
});
