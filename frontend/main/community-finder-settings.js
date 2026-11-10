const COMMUNITY_FINDER_SORTS = [
  { value: "active", label: "Recently active" },
  { value: "newest", label: "Newest" },
  { value: "score", label: "Highest score" },
  { value: "online", label: "Most people online" }
];
const COMMUNITY_FINDER_EXPLICIT = [
  { value: "nothing", label: "Do nothing" },
  { value: "cover", label: "Cover" },
  { value: "hide", label: "Hide" }
];

let communityFinderPrefs = communityFinderPrefsDefault();
let communityFinderPrefsLoaded = false;
let communityFinderPrefsLoading = null;
let communityFinderPrefsStatus = "";
let communityFinderRevealed = new Set();

function communityFinderPrefsDefault() {
  return {
    words: [],
    tags: [],
    blacklist_hide: false,
    explicit: "nothing",
    hide_joined: false,
    hide_apply: false,
    sort: "active",
    confirm_join: true,
    hidden: []
  };
}

function applyCommunityFinderPrefs(data) {
  if (!data || typeof data !== "object") return;
  const base = communityFinderPrefsDefault();
  const next = {};
  Object.keys(base).forEach((key) => {
    next[key] = data[key] === undefined ? base[key] : data[key];
  });
  next.words = Array.isArray(next.words) ? next.words : [];
  next.tags = Array.isArray(next.tags) ? next.tags : [];
  next.hidden = Array.isArray(next.hidden) ? next.hidden : [];
  next.explicit = COMMUNITY_FINDER_EXPLICIT.some((item) => item.value === next.explicit) ? next.explicit : "nothing";
  next.sort = COMMUNITY_FINDER_SORTS.some((item) => item.value === next.sort) ? next.sort : "active";
  next.confirm_join = next.confirm_join !== false;
  communityFinderPrefs = next;
  communityFinderPrefsLoaded = true;
}

async function communityFinderPrefsRequest(method, path, payload) {
  const options = { method, credentials: "include" };
  if (payload) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(payload);
  }
  const response = await fetch(`https://${serverAddress}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof communityErrorText === "function" ? communityErrorText(data, "Could not save.") : "Could not save.");
  return data;
}

function loadCommunityFinderPrefs() {
  if (communityFinderPrefsLoading) return communityFinderPrefsLoading;
  communityFinderPrefsLoading = (async () => {
    try {
      applyCommunityFinderPrefs(await communityFinderPrefsRequest("GET", "/community_finder_settings"));
    } catch (e) {
      return;
    } finally {
      communityFinderPrefsLoading = null;
    }
    if (typeof paintOpenCommunitySettings === "function") paintOpenCommunitySettings();
  })();
  return communityFinderPrefsLoading;
}

async function ensureCommunityFinderPrefs() {
  if (!communityFinderPrefsLoaded) await loadCommunityFinderPrefs();
}

function refreshCommunityFinderAfterPrefs() {
  if (typeof communityRow === "undefined" || communityRow !== "servers") return;
  if (typeof loadCommunityPage === "function") loadCommunityPage(communityPage || 1);
}

async function saveCommunityFinderPrefs(method, path, payload) {
  communityFinderPrefsStatus = "";
  try {
    applyCommunityFinderPrefs(await communityFinderPrefsRequest(method, path, payload));
  } catch (e) {
    communityFinderPrefsStatus = e.message || "Could not save.";
  }
  if (typeof paintOpenCommunitySettings === "function") paintOpenCommunitySettings();
  refreshCommunityFinderAfterPrefs();
}

function hideCommunityFinderRow(row, hidden) {
  if (!row || !row.id) return;
  saveCommunityFinderPrefs("POST", `/community_servers/${encodeURIComponent(row.id)}/hide`, { hidden: !!hidden });
}

function communityFinderCovered(row) {
  return !!(row && row.covered && !communityFinderRevealed.has(String(row.id)));
}

function revealCommunityFinder(row) {
  if (!row) return;
  communityFinderRevealed.add(String(row.id));
  if (typeof paintCommunityGrid === "function" && typeof communityFinderRows !== "undefined") paintCommunityGrid(communityFinderRows);
}

function confirmCommunityFinderJoin(row, run) {
  if (!communityFinderPrefs.confirm_join || typeof showPartyConfirmCard !== "function") {
    run();
    return;
  }
  pendingLeaveParty = { kind: "room", run };
  showPartyConfirmCard("Join Server", "Are you sure you want to join " + ((row && row.name) || "this server") + "?", "Join Server");
}

function paintCommunityHiddenServers() {
  const wrap = document.createElement("div");
  wrap.className = "settings-opt community-filter-list";
  const text = document.createElement("div");
  text.className = "settings-opt-text";
  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = "Hidden servers";
  const body = document.createElement("div");
  body.className = "settings-opt-desc";
  body.textContent = "Servers you hid stay out of Server Finder. Click one to show it again.";
  text.appendChild(heading);
  text.appendChild(body);
  const pills = document.createElement("div");
  pills.className = "community-filter-pills";
  if (!communityFinderPrefs.hidden.length) {
    const empty = document.createElement("div");
    empty.className = "settings-opt-desc";
    empty.textContent = "No hidden servers.";
    pills.appendChild(empty);
  }
  communityFinderPrefs.hidden.forEach((item) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "community-tag is-on community-filter-pill";
    pill.title = "Unhide";
    pill.textContent = (item.name || "Server") + " ×";
    pill.addEventListener("click", () => hideCommunityFinderRow(item, false));
    pills.appendChild(pill);
  });
  text.appendChild(pills);
  wrap.appendChild(text);
  return wrap;
}

function communityFinderSubblock(title) {
  const block = document.createElement("div");
  block.className = "settings-subblock";
  const head = document.createElement("div");
  head.className = "settings-subblock-title";
  head.textContent = title;
  block.appendChild(head);
  return block;
}

function communityFinderPrefToggle(key, title, desc) {
  return settingsOpt(title, desc, settingsToggle(communityFinderPrefs[key], false, (on) => {
    const payload = {};
    payload[key] = on;
    saveCommunityFinderPrefs("PATCH", "/community_finder_settings", payload);
  }));
}

function communityFinderPrefSelect(key, options, title, desc) {
  const select = settingsSelect(options, communityFinderPrefs[key], false);
  select.addEventListener("change", () => {
    const payload = {};
    payload[key] = select.value;
    saveCommunityFinderPrefs("PATCH", "/community_finder_settings", payload);
  });
  return settingsOpt(title, desc, select);
}

function appendCommunityFinderBlacklist(section) {
  if (!section) return;
  const save = (method, path, payload) => saveCommunityFinderPrefs(method, "/community_finder_settings" + path, payload);
  const black = communityFinderSubblock("Server Finder");
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Servers from other people that match your blacklist are covered on your screen until you click them. Your own servers are never covered.";
  black.appendChild(blurb);
  black.appendChild(paintCommunityFilterList("word", "Words", "Covers any listing whose name or description contains one of these words.", "Add a word", communityFinderPrefs.words, save));
  black.appendChild(paintCommunityFilterList("tag", "Tags", "Covers any listing that has one of these tags.", "Add a tag", communityFinderPrefs.tags, save));
  black.appendChild(communityFinderPrefToggle("blacklist_hide", "Hide blacklisted listings", "Listings that match your blacklist are removed from Server Finder instead of being covered."));
  if (communityFinderPrefsStatus) {
    const status = document.createElement("div");
    status.className = "settings-form-status";
    status.textContent = communityFinderPrefsStatus;
    black.appendChild(status);
  }
  section.appendChild(black);
}

function appendCommunityFinderGeneral(section) {
  if (!section) return;
  const list = communityFinderSubblock("Server list");
  list.appendChild(communityFinderPrefSelect("explicit", COMMUNITY_FINDER_EXPLICIT, "Explicit servers", "What to do with listings marked Explicit. Cover and Hide only apply to the cards on the page."));
  list.appendChild(communityFinderPrefSelect("sort", COMMUNITY_FINDER_SORTS, "Sort servers", "The order listings appear in on Server Finder."));
  list.appendChild(communityFinderPrefToggle("hide_joined", "Hide servers you've joined", "Servers you already belong to are removed from Server Finder."));
  list.appendChild(communityFinderPrefToggle("hide_apply", "Hide servers that require an application", "Listings that use Apply instead of Join are removed from Server Finder."));
  list.appendChild(paintCommunityHiddenServers());
  section.appendChild(list);
  const join = communityFinderSubblock("Join");
  join.appendChild(communityFinderPrefToggle("confirm_join", "Confirm before joining", "Asks you to confirm before Join adds you to a server."));
  section.appendChild(join);
}

function paintCommunityFinderSettings() {
  if (typeof paintOpenCommunitySettings === "function") paintOpenCommunitySettings();
}
