let isCommunitiesOpen = false;
let communityListingRow = null;
let communityPage = 1;
let communityPages = 0;
let communityQuery = "";
let communityFetchGen = 0;
let communitySearchTimer = 0;
let communityJoinBusy = false;
let communityApplyRow = null;
let communityFacets = { tags: [], timezones: [] };
let communityFilter = { type: "", tags: [], timezone: "" };
let communityPickerKind = "";

const COMMUNITY_TYPE_PILLS = [
  ["community", "Community"],
  ["gaming", "Gaming"],
  ["social", "Social"],
  ["chill", "Chill"],
  ["roleplay", "Roleplay"],
  ["hangout", "Hangout"],
  ["friends", "Friends"],
  ["anime", "Anime"],
  ["art", "Art"],
  ["music", "Music"],
  ["other", "Other"]
];

function communityLetter(name) {
  if (typeof avatarLetter === "function") return avatarLetter(name);
  return String(name || "?").slice(0, 1).toUpperCase();
}

function applyCommunityBanner(el, row) {
  if (!el) return;
  const url = (row && row.banner_url) || "";
  const color = (row && row.banner_color) || "";
  el.classList.toggle("has-banner", !!(url || color));
  el.style.backgroundImage = url ? "url(" + JSON.stringify(url) + ")" : "";
  el.style.backgroundColor = (!url && color) ? color : "";
}

function paintCommunityFace(host, row) {
  if (!host) return;
  host.replaceChildren();
  if (row && row.icon_url) {
    const img = document.createElement("img");
    img.src = row.icon_url;
    img.alt = "";
    host.appendChild(img);
  } else {
    host.textContent = communityLetter(row && row.name);
  }
}

function communityJoinLink(row) {
  const origin = window.location.origin || "https://oneira.cc";
  if (row && row.url_slug) return origin + "/" + row.url_slug;
  if (row && row.id) return origin + "/server/" + encodeURIComponent(row.id);
  return origin + "/community";
}

function closeCommunityListingComments() {
  const thread = document.getElementById("community-listing-comments");
  if (thread) thread.hidden = true;
}

function closeCommunityListing() {
  closeCommunityListingComments();
  const overlay = document.getElementById("community-listing-overlay");
  if (overlay) overlay.hidden = true;
  communityListingRow = null;
}

function closeCommunitiesChrome() {
  closeCommunityApply();
  closeCommunityListing();
  closeCommunityFilterPicker();
  isCommunitiesOpen = false;
}

function paintCommunityTags(host, tags) {
  if (!host) return;
  host.replaceChildren();
  (tags || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "community-tag";
    chip.textContent = tag;
    host.appendChild(chip);
  });
}

function paintCommunityAbout(host, row) {
  if (!host) return;
  const text = String((row && row.about) || "").trim();
  host.classList.toggle("is-empty", !text);
  host.textContent = text || "no description given...";
}

function communityVoteTip(row) {
  const up = Number(row && row.vote_up) || 0;
  const down = Number(row && row.vote_down) || 0;
  return up + " up · " + down + " down";
}

function applyCommunityVote(row, data) {
  if (!row || !data) return;
  row.votes = data.votes;
  row.vote_up = data.vote_up;
  row.vote_down = data.vote_down;
  row.my_vote = data.my_vote;
  document.querySelectorAll('[data-community-votes="' + row.id + '"]').forEach((host) => {
    paintCommunityVotes(host, row);
  });
}

async function voteCommunityServer(row, next) {
  if (!row || !row.id) return;
  const current = Number(row.my_vote) || 0;
  const vote = current === next ? 0 : next;
  try {
    const response = await fetch(`https://${serverAddress}/community_vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ server_id: row.id, vote: vote })
    });
    if (!response.ok) return;
    const data = await response.json();
    applyCommunityVote(row, data);
  } catch (e) {}
}

function paintCommunityVotes(host, row) {
  if (!host) return;
  host.replaceChildren();
  host.setAttribute("data-community-votes", row && row.id ? String(row.id) : "");
  const up = document.createElement("button");
  up.type = "button";
  up.className = "community-vote community-vote-up" + ((row && row.my_vote) > 0 ? " is-on" : "");
  up.textContent = "\u25B2";
  up.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    voteCommunityServer(row, 1);
  });
  const count = document.createElement("span");
  count.className = "community-vote-count";
  count.textContent = String(row && row.votes != null ? row.votes : 0);
  const down = document.createElement("button");
  down.type = "button";
  down.className = "community-vote community-vote-down" + ((row && row.my_vote) < 0 ? " is-on" : "");
  down.textContent = "\u25BC";
  down.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    voteCommunityServer(row, -1);
  });
  const tip = document.createElement("div");
  tip.className = "community-vote-tip";
  tip.textContent = communityVoteTip(row);
  host.appendChild(up);
  host.appendChild(count);
  host.appendChild(down);
  host.appendChild(tip);
}

function fillCommunityJoinButton(btn, row) {
  if (!btn || !row) return;
  btn.disabled = false;
  if (row.joined) {
    btn.textContent = "Open";
    return;
  }
  btn.textContent = row.applications_enabled ? "Apply" : "Join";
}

function communityTypeLabel(type) {
  if (typeof serverTypeLabel === "function") return serverTypeLabel(type);
  const row = COMMUNITY_TYPE_PILLS.find((item) => item[0] === String(type || "").toLowerCase());
  return row ? row[1] : String(type || "").replace(/-/g, " ");
}

function communityTimezoneLabel(zone) {
  if (typeof serverTimezoneLabel === "function") return serverTimezoneLabel(zone);
  return String(zone || "").trim();
}

function paintCommunityType(host, row) {
  if (!host) return;
  const label = communityTypeLabel(row && row.server_type);
  host.hidden = !label;
  host.textContent = label;
}

function paintCommunityExplicit(host, row) {
  if (!host) return;
  const on = !!(row && row.explicit);
  host.hidden = !on;
  host.textContent = on ? "EXPLICIT" : "";
}

function paintCommunityZone(host, row) {
  if (!host) return;
  const label = communityTimezoneLabel(row && row.timezone);
  host.hidden = !label;
  host.textContent = label;
}

function communityHasMarks(row) {
  return !!(communityTypeLabel(row && row.server_type) || (row && row.explicit));
}

function communityApplyQuestions(row) {
  const form = row && row.application_form && typeof row.application_form === "object"
    ? row.application_form
    : {};
  return Array.isArray(form.questions) ? form.questions : [];
}

function setCommunityApplyStatus(text) {
  const status = document.getElementById("community-apply-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function closeCommunityApply() {
  const overlay = document.getElementById("community-apply-overlay");
  if (overlay) overlay.hidden = true;
  communityApplyRow = null;
  setCommunityApplyStatus("");
}

function paintCommunityApply(row) {
  const host = document.getElementById("community-apply-questions");
  const title = document.getElementById("community-apply-title");
  if (title) title.textContent = row && row.name ? ("Apply to " + row.name) : "Apply";
  if (!host) return;
  host.replaceChildren();
  const questions = communityApplyQuestions(row);
  if (!questions.length) {
    const empty = document.createElement("p");
    empty.className = "server-settings-help";
    empty.textContent = "Submit an application to join this server.";
    host.appendChild(empty);
    return;
  }
  questions.forEach((question) => {
    const card = document.createElement("div");
    card.className = "community-apply-question";
    card.setAttribute("data-question-id", question.id || "");
    card.setAttribute("data-question-type", question.type || "");
    const prompt = document.createElement("div");
    prompt.className = "community-apply-prompt";
    prompt.textContent = question.prompt || "";
    card.appendChild(prompt);
    if (question.type === "multi" || question.type === "choice") {
      const options = document.createElement("div");
      options.className = "community-apply-options";
      (question.options || []).forEach((option) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "community-tag" + (question.type === "choice" ? " community-apply-choice" : "");
        btn.setAttribute("data-apply-option", option);
        btn.textContent = option;
        btn.addEventListener("click", () => {
          if (question.type === "choice") {
            options.querySelectorAll("[data-apply-option]").forEach((item) => item.classList.toggle("is-on", item === btn));
          } else {
            btn.classList.toggle("is-on");
          }
        });
        options.appendChild(btn);
      });
      card.appendChild(options);
    } else if (question.type === "signature") {
      const input = document.createElement("input");
      input.className = "server-settings-input";
      input.type = "text";
      input.setAttribute("data-apply-value", "");
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = typeof myUsername === "string" ? myUsername : "Username";
      card.appendChild(input);
    } else {
      const area = document.createElement("textarea");
      area.className = "server-settings-input server-settings-textarea";
      area.rows = 5;
      area.setAttribute("data-apply-value", "");
      area.placeholder = "Write your answer";
      card.appendChild(area);
    }
    host.appendChild(card);
  });
}

function openCommunityApply(row) {
  if (!row || !row.id) return;
  communityApplyRow = row;
  setCommunityApplyStatus("");
  paintCommunityApply(row);
  const overlay = document.getElementById("community-apply-overlay");
  if (overlay) overlay.hidden = false;
}

function collectCommunityApplyAnswers() {
  const host = document.getElementById("community-apply-questions");
  const answers = [];
  if (!host) return answers;
  host.querySelectorAll(".community-apply-question").forEach((card) => {
    const id = card.getAttribute("data-question-id") || "";
    const type = card.getAttribute("data-question-type") || "";
    if (type === "multi") {
      const values = [];
      card.querySelectorAll("[data-apply-option].is-on").forEach((btn) => {
        values.push(btn.getAttribute("data-apply-option") || "");
      });
      answers.push({ id: id, values: values });
    } else if (type === "choice") {
      const on = card.querySelector("[data-apply-option].is-on");
      answers.push({ id: id, value: on ? (on.getAttribute("data-apply-option") || "") : "" });
    } else {
      const field = card.querySelector("[data-apply-value]");
      answers.push({ id: id, value: field ? String(field.value || "") : "" });
    }
  });
  return answers;
}

async function submitCommunityApply() {
  const row = communityApplyRow;
  if (!row || !row.id || communityJoinBusy) return;
  communityJoinBusy = true;
  setCommunityApplyStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/apply_community`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ server_id: row.id, answers: collectCommunityApplyAnswers() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not submit the application.");
    if (data.joined) {
      row.joined = true;
      closeCommunityApply();
      await enterCommunityServer(row);
      return;
    }
    closeCommunityApply();
    closeCommunityListing();
  } catch (e) {
    setCommunityApplyStatus(e.message || "Could not submit the application.");
  } finally {
    communityJoinBusy = false;
  }
}

function openCommunityListing(row) {
  communityListingRow = row || null;
  const overlay = document.getElementById("community-listing-overlay");
  const header = document.getElementById("community-listing-header");
  const title = document.getElementById("community-listing-title");
  const online = document.getElementById("community-listing-online");
  const icon = document.getElementById("community-listing-icon");
  const about = document.getElementById("community-listing-about");
  const join = document.getElementById("community-listing-join");
  if (!overlay || !row) return;
  if (title) title.textContent = row.name;
  if (online) online.textContent = String(row.online || 0) + " online";
  paintCommunityFace(icon, row);
  paintCommunityType(document.getElementById("community-listing-type"), row);
  paintCommunityExplicit(document.getElementById("community-listing-explicit"), row);
  paintCommunityZone(document.getElementById("community-listing-zone"), row);
  paintCommunityAbout(about, row);
  applyCommunityBanner(header, row);
  if (header) header.classList.toggle("has-marks", communityHasMarks(row));
  paintCommunityTags(document.getElementById("community-listing-tags"), row.tags);
  paintCommunityVotes(document.getElementById("community-listing-votes"), row);
  fillCommunityJoinButton(join, row);
  closeCommunityListingComments();
  overlay.hidden = false;
}

function openCommunityCardMenu(e, row) {
  if (typeof openContextMenu !== "function") return;
  openContextMenu(e.clientX, e.clientY, {
    image: row.icon_url || "",
    avatarText: communityLetter(row.name),
    title: row.name,
    subtitle: String(row.online || 0) + " online"
  }, [
    {
      label: "Copy join link",
      onSelect: () => {
        const text = communityJoinLink(row);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
      }
    },
    { label: "Report", disabled: true, danger: true }
  ]);
}

async function enterCommunityServer(row) {
  if (!row || !row.id) return;
  closeCommunityListing();
  if (typeof loadServers === "function") await loadServers();
  if (typeof openServer === "function") await openServer(row.id);
}

async function joinCommunityServer(row) {
  if (!row || !row.id || communityJoinBusy) return;
  if (row.joined) {
    await enterCommunityServer(row);
    return;
  }
  if (row.applications_enabled) {
    openCommunityApply(row);
    return;
  }
  communityJoinBusy = true;
  try {
    const response = await fetch(`https://${serverAddress}/join_community`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ server_id: row.id })
    });
    if (!response.ok) return;
    row.joined = true;
    await enterCommunityServer(row);
  } finally {
    communityJoinBusy = false;
  }
}

function paintCommunityCard(row) {
  const card = document.createElement("div");
  card.className = "community-card";
  const head = document.createElement("div");
  head.className = "community-card-head";
  applyCommunityBanner(head, row);
  head.classList.toggle("has-marks", communityHasMarks(row));
  const face = document.createElement("div");
  face.className = "community-card-face";
  const icon = document.createElement("div");
  icon.className = "avatar-dot";
  paintCommunityFace(icon, row);
  const names = document.createElement("div");
  names.className = "community-card-names";
  const name = document.createElement("div");
  name.className = "community-card-name";
  name.textContent = row.name;
  const online = document.createElement("div");
  online.className = "community-card-online";
  online.textContent = String(row.online || 0) + " online";
  names.appendChild(name);
  names.appendChild(online);
  face.appendChild(icon);
  face.appendChild(names);
  const marks = document.createElement("div");
  marks.className = "community-card-marks";
  const type = document.createElement("span");
  type.className = "community-type";
  paintCommunityType(type, row);
  marks.appendChild(type);
  const explicit = document.createElement("span");
  explicit.className = "community-explicit";
  paintCommunityExplicit(explicit, row);
  marks.appendChild(explicit);
  const zone = document.createElement("span");
  zone.className = "community-zone";
  paintCommunityZone(zone, row);
  const tools = document.createElement("div");
  tools.className = "community-card-tools";
  const votes = document.createElement("div");
  votes.className = "community-card-votes";
  paintCommunityVotes(votes, row);
  const more = document.createElement("button");
  more.type = "button";
  more.className = "community-card-more";
  more.textContent = "\u22EE";
  more.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCommunityCardMenu(e, row);
  });
  tools.appendChild(votes);
  tools.appendChild(more);
  tools.addEventListener("click", (e) => e.stopPropagation());
  head.appendChild(face);
  head.appendChild(tools);
  head.appendChild(marks);
  head.appendChild(zone);
  const body = document.createElement("div");
  body.className = "community-card-body";
  const tags = document.createElement("div");
  tags.className = "community-card-tags";
  paintCommunityTags(tags, row.tags);
  const about = document.createElement("div");
  about.className = "community-card-about";
  paintCommunityAbout(about, row);
  body.appendChild(tags);
  body.appendChild(about);
  const foot = document.createElement("div");
  foot.className = "community-card-foot";
  const join = document.createElement("button");
  join.type = "button";
  join.className = "pill-btn community-card-join";
  fillCommunityJoinButton(join, row);
  join.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    joinCommunityServer(row);
  });
  foot.appendChild(join);
  foot.addEventListener("click", (e) => e.stopPropagation());
  card.appendChild(head);
  card.appendChild(body);
  card.appendChild(foot);
  card.addEventListener("click", () => openCommunityListing(row));
  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openCommunityCardMenu(e, row);
  });
  return card;
}

function paintCommunityPager() {
  const host = document.getElementById("community-pager");
  if (!host) return;
  host.replaceChildren();
  if (communityPages <= 1) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "ghost-btn";
  prev.textContent = "Previous";
  prev.disabled = communityPage <= 1;
  prev.addEventListener("click", () => {
    if (communityPage <= 1) return;
    loadCommunityPage(communityPage - 1);
  });
  const page = document.createElement("span");
  page.className = "community-pager-page";
  page.textContent = String(communityPage);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "ghost-btn";
  next.textContent = "Next";
  next.disabled = communityPage >= communityPages;
  next.addEventListener("click", () => {
    if (communityPage >= communityPages) return;
    loadCommunityPage(communityPage + 1);
  });
  host.appendChild(prev);
  host.appendChild(page);
  host.appendChild(next);
}

function paintCommunityGrid(rows) {
  const grid = document.getElementById("community-grid");
  if (!grid) return;
  grid.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-note community-empty";
    empty.textContent = communityQuery ? "No servers match." : "No servers listed yet.";
    grid.appendChild(empty);
  } else {
    rows.forEach((row) => grid.appendChild(paintCommunityCard(row)));
  }
  const end = document.getElementById("community-list-end");
  if (end) end.hidden = communityPages > 1 && communityPage < communityPages;
  paintCommunityPager();
}

async function loadCommunityPage(page) {
  if (!isCommunitiesOpen) return;
  communityPage = Math.max(1, Number(page) || 1);
  const token = ++communityFetchGen;
  const qs = new URLSearchParams();
  qs.set("page", String(communityPage));
  if (communityQuery) qs.set("q", communityQuery);
  if (communityFilter.type) qs.set("type", communityFilter.type);
  if (communityFilter.tags.length) qs.set("tags", communityFilter.tags.join(","));
  if (communityFilter.timezone) qs.set("timezone", communityFilter.timezone);
  let data;
  try {
    const response = await fetch(`https://${serverAddress}/community_servers?${qs.toString()}`, { credentials: "include" });
    if (!response.ok) return;
    data = await response.json();
  } catch (e) {
    return;
  }
  if (token !== communityFetchGen || !isCommunitiesOpen) return;
  communityPage = Number(data.page) || 1;
  communityPages = Number(data.pages) || 0;
  communityFacets = data.facets && typeof data.facets === "object"
    ? { tags: data.facets.tags || [], timezones: data.facets.timezones || [] }
    : { tags: [], timezones: [] };
  paintCommunityGrid(Array.isArray(data.servers) ? data.servers : []);
  paintCommunityFilterPicks();
  paintCommunityFilterPicker();
}

async function openCommunities() {
  if (typeof leaveDocIfNeeded === "function" && !(await leaveDocIfNeeded())) return;
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof closeMiniProfile === "function") closeMiniProfile();
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  beginPlace({
    settings: true,
    serverSettings: true,
    channelSettings: true,
    sidebar: "community",
    view: "community",
    topbar: "communities",
    hideMembers: true
  });
  isCommunitiesOpen = true;
  currentServerId = null;
  currentServerOwnerId = null;
  currentChannelId = null;
  if (typeof setAppAddress === "function") setAppAddress("/community");
  const search = document.getElementById("community-search");
  if (search && search.value !== communityQuery) search.value = communityQuery;
  await loadCommunityPage(communityPage);
}

document.getElementById("community-listing-close").addEventListener("click", () => closeCommunityListing());
document.getElementById("community-listing-cancel").addEventListener("click", () => closeCommunityListing());
document.getElementById("community-listing-join").addEventListener("click", () => {
  if (communityListingRow) joinCommunityServer(communityListingRow);
});
document.getElementById("community-listing-comments-btn").addEventListener("click", (e) => {
  e.preventDefault();
  const thread = document.getElementById("community-listing-comments");
  if (thread) thread.hidden = !thread.hidden;
});
document.getElementById("community-listing-comment-send").addEventListener("click", (e) => {
  e.preventDefault();
});
document.getElementById("community-listing-comment-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.preventDefault();
});
document.getElementById("community-listing-overlay").addEventListener("click", (e) => {
  if (e.target && e.target.id === "community-listing-overlay") closeCommunityListing();
});
document.getElementById("community-apply-close").addEventListener("click", () => closeCommunityApply());
document.getElementById("community-apply-cancel").addEventListener("click", () => closeCommunityApply());
document.getElementById("community-apply-submit").addEventListener("click", () => submitCommunityApply());
document.getElementById("community-apply-overlay").addEventListener("click", (e) => {
  if (e.target && e.target.id === "community-apply-overlay") closeCommunityApply();
});
function communityFilterMax(kind) {
  if (kind === "tags") return 5;
  return 1;
}

function communityFilterCount(kind) {
  if (kind === "tags") return communityFilter.tags.length;
  if (kind === "type") return communityFilter.type ? 1 : 0;
  return communityFilter.timezone ? 1 : 0;
}

function communityFilterHas(kind, value) {
  if (kind === "tags") return communityFilter.tags.indexOf(value) >= 0;
  if (kind === "type") return communityFilter.type === value;
  return communityFilter.timezone === value;
}

function closeCommunityFilterPicker() {
  const picker = document.getElementById("community-filter-picker");
  if (picker) picker.hidden = true;
  communityPickerKind = "";
}

function toggleCommunityFilterValue(kind, value) {
  if (!value) return;
  if (kind === "tags") {
    const at = communityFilter.tags.indexOf(value);
    if (at >= 0) communityFilter.tags.splice(at, 1);
    else if (communityFilter.tags.length < 5) communityFilter.tags.push(value);
  } else if (kind === "type") {
    communityFilter.type = communityFilter.type === value ? "" : value;
  } else {
    communityFilter.timezone = communityFilter.timezone === value ? "" : value;
  }
  paintCommunityFilterPicks();
  paintCommunityFilterPicker();
  loadCommunityPage(1);
}

function communityFilterChoices(kind, needle) {
  const q = String(needle || "").trim().toLowerCase();
  let rows = [];
  if (kind === "type") {
    rows = COMMUNITY_TYPE_PILLS.map((item) => ({ id: item[0], label: item[1] }));
  } else if (kind === "tags") {
    rows = (communityFacets.tags || []).map((tag) => ({ id: tag, label: tag }));
  } else {
    const seen = {};
    (communityFacets.timezones || []).forEach((zone) => {
      seen[zone] = true;
      rows.push({ id: zone, label: communityTimezoneLabel(zone) || zone });
    });
    if (typeof SERVER_TIMEZONE_OPTIONS !== "undefined") {
      SERVER_TIMEZONE_OPTIONS.forEach((item) => {
        if (seen[item[1]]) return;
        rows.push({ id: item[1], label: item[2] });
      });
    }
  }
  if (!q) return rows.slice(0, 12);
  return rows.filter((row) => {
    return row.label.toLowerCase().indexOf(q) >= 0 || String(row.id).toLowerCase().indexOf(q) >= 0;
  }).slice(0, 12);
}

function paintCommunityFilterPicks() {
  const typeHost = document.getElementById("community-filter-type-picks");
  const tagHost = document.getElementById("community-filter-tag-picks");
  const zoneHost = document.getElementById("community-filter-zone-picks");
  const fill = (host, kind, items) => {
    if (!host) return;
    host.replaceChildren();
    items.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "community-tag is-on";
      chip.textContent = item.label;
      chip.addEventListener("click", () => toggleCommunityFilterValue(kind, item.id));
      host.appendChild(chip);
    });
  };
  fill(typeHost, "type", communityFilter.type
    ? [{ id: communityFilter.type, label: communityTypeLabel(communityFilter.type) || communityFilter.type }]
    : []);
  fill(tagHost, "tags", communityFilter.tags.map((tag) => ({ id: tag, label: tag })));
  fill(zoneHost, "timezone", communityFilter.timezone
    ? [{ id: communityFilter.timezone, label: communityTimezoneLabel(communityFilter.timezone) || communityFilter.timezone }]
    : []);
}

function paintCommunityFilterPicker() {
  const host = document.getElementById("community-filter-picker-pills");
  const count = document.getElementById("community-filter-picker-count");
  const search = document.getElementById("community-filter-picker-search");
  if (count) count.textContent = communityFilterCount(communityPickerKind) + "/" + communityFilterMax(communityPickerKind);
  if (!host || !communityPickerKind) return;
  host.replaceChildren();
  communityFilterChoices(communityPickerKind, search ? search.value : "").forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "community-tag" + (communityFilterHas(communityPickerKind, item.id) ? " is-on" : "");
    chip.textContent = item.label;
    chip.addEventListener("click", () => toggleCommunityFilterValue(communityPickerKind, item.id));
    host.appendChild(chip);
  });
}

function openCommunityFilterPicker(kind, anchor) {
  const picker = document.getElementById("community-filter-picker");
  const search = document.getElementById("community-filter-picker-search");
  if (!picker || !anchor) return;
  communityPickerKind = kind;
  if (search) search.value = "";
  paintCommunityFilterPicker();
  picker.hidden = false;
  const box = anchor.getBoundingClientRect();
  const width = picker.offsetWidth || 280;
  let left = box.left;
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
  picker.style.position = "fixed";
  picker.style.top = Math.round(box.bottom + 6) + "px";
  picker.style.left = Math.round(left) + "px";
  if (search) search.focus();
}

function paintCommunityFilterPanel() {
  const panel = document.getElementById("community-filter-panel");
  const btn = document.getElementById("community-filter-btn");
  if (!panel) return;
  const open = !panel.hidden;
  if (btn) btn.classList.toggle("is-active", open);
  if (!open) closeCommunityFilterPicker();
  paintCommunityFilterPicks();
}

document.getElementById("community-filter-btn").addEventListener("click", () => {
  const panel = document.getElementById("community-filter-panel");
  if (!panel) return;
  panel.hidden = !panel.hidden;
  paintCommunityFilterPanel();
});
document.querySelectorAll("[data-filter-add]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const kind = btn.getAttribute("data-filter-add");
    if (communityPickerKind === kind && !document.getElementById("community-filter-picker").hidden) {
      closeCommunityFilterPicker();
      return;
    }
    openCommunityFilterPicker(kind, btn);
  });
});
const communityPickerSearch = document.getElementById("community-filter-picker-search");
if (communityPickerSearch) {
  communityPickerSearch.addEventListener("input", () => paintCommunityFilterPicker());
}
document.addEventListener("mousedown", (e) => {
  const picker = document.getElementById("community-filter-picker");
  if (!picker || picker.hidden) return;
  if (picker.contains(e.target) || (e.target.closest && e.target.closest("[data-filter-add]"))) return;
  closeCommunityFilterPicker();
});
document.getElementById("community-search").addEventListener("input", () => {
  const search = document.getElementById("community-search");
  communityQuery = search ? String(search.value || "").trim() : "";
  window.clearTimeout(communitySearchTimer);
  communitySearchTimer = window.setTimeout(() => loadCommunityPage(1), 250);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const apply = document.getElementById("community-apply-overlay");
  if (apply && !apply.hidden) {
    closeCommunityApply();
    return;
  }
  const picker = document.getElementById("community-filter-picker");
  if (picker && !picker.hidden) {
    closeCommunityFilterPicker();
    return;
  }
  const overlay = document.getElementById("community-listing-overlay");
  if (overlay && !overlay.hidden) closeCommunityListing();
});
