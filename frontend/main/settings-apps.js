// ==================================================================
// settings-apps.js - Connected Apps. Steam linking is live. The other
// provider icons wait until each one has its own part list. Authorized
// Apps stay empty until a developer platform exists.
// Nitro Rewards are Billing; they are not on this page.
// ==================================================================

function appsLaterNote(subject) {
  return settingsLaterNote(subject || "developer platform");
}

const CONNECTION_PROVIDERS = [
  { name: "YouTube", slug: "youtube", color: "#ff0033" },
  { name: "Battle.net", slug: "battledotnet", color: "#148eff" },
  { name: "Bluesky", slug: "bluesky", color: "#1185fe" },
  { name: "Patreon", slug: "patreon", color: "#ff424d" },
  { name: "Reddit", slug: "reddit", color: "#ff4500" },
  { name: "Steam", slug: "steam", color: "#1b2838" },
  { name: "X", slug: "x", color: "#0f0f0f" },
  { name: "eBay", slug: "ebay", color: "#e53238" },
  { name: "Crunchyroll", slug: "crunchyroll", color: "#f47521" },
  { name: "PlayStation", slug: "playstation", color: "#003791" }
];

const STEAM_CONNECTION_PARTS = [
  { key: "identity", label: "Identity" },
  { key: "playing_now", label: "Playing now" },
  { key: "recently_played", label: "Recently played" },
  { key: "library", label: "Library" },
  { key: "achievements", label: "Achievements" },
  { key: "level_badges", label: "Level and badges" }
];

const YOUTUBE_CONNECTION_PARTS = [
  { key: "identity", label: "Identity" },
  { key: "stats", label: "Stats" },
  { key: "uploads", label: "Uploads" },
  { key: "playlists", label: "Playlists" },
  { key: "likes", label: "Likes" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "live", label: "Live" },
  { key: "activity", label: "Activity" },
  { key: "channel_shelves", label: "Channel shelves" },
  { key: "comments", label: "Comments" },
  { key: "live_chat", label: "Live chat" },
  { key: "super_chat", label: "Super Chat" },
  { key: "memberships", label: "Memberships" }
];

const LIVE_CONNECTION_SLUGS = ["steam", "youtube"];

function connectionLinkError(provider, code) {
  const name = provider === "youtube" ? "YouTube" : "Steam";
  if (code === "cancel") return name + " sign-in was canceled.";
  if (code === "failed") return name + " did not confirm that sign-in.";
  if (code === "taken") return "That " + name + " account is already linked to another Oneira account.";
  if (code === "no_channel") return "That Google account has no YouTube channel.";
  return "Could not finish that connection.";
}

function connectionPartsFor(provider) {
  if (provider === "youtube") return YOUTUBE_CONNECTION_PARTS;
  if (provider === "steam") return STEAM_CONNECTION_PARTS;
  return [];
}

let connectionDisconnectService = "";
let youtubePickChannelId = "";

function connectionSlug(service) {
  const item = CONNECTION_PROVIDERS.find(row => row.name === service);
  return item ? item.slug : "";
}

function paintConnectionIcon(item) {
  const face = document.createElement("span");
  face.className = "connection-face";
  face.style.background = item.color;
  face.title = item.name;
  const logo = document.createElement("img");
  logo.className = "connection-logo";
  logo.src = "icons/connections/" + item.slug + ".svg";
  logo.alt = "";
  face.appendChild(logo);
  return face;
}

function setConnectionOpen(card, open) {
  card.classList.toggle("is-open", open);
  const body = card.querySelector(".connection-card-parts");
  const toggle = card.querySelector(".connection-card-toggle");
  const service = card.dataset.service || "connection";
  body.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.setAttribute("aria-label", (open ? "Hide " : "Show ") + service + " settings");
}

function paintConnectionCard(service, parts, flags, accountName) {
  const card = document.createElement("div");
  card.className = "connection-card is-open";
  card.dataset.service = service;
  const head = document.createElement("div");
  head.className = "connection-card-head";
  const provider = CONNECTION_PROVIDERS.find(item => item.name === service);
  head.appendChild(paintConnectionIcon(provider || { name: service, slug: "steam", color: "#1b2838" }));
  const who = document.createElement("div");
  who.className = "connection-card-who";
  const account = document.createElement("div");
  account.className = "connection-card-name";
  account.textContent = accountName || service;
  const label = document.createElement("div");
  label.className = "connection-card-service";
  label.textContent = service;
  who.appendChild(account);
  who.appendChild(label);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "connection-card-toggle";
  const chevron = document.createElement("span");
  chevron.className = "connection-chevron";
  toggle.appendChild(chevron);
  toggle.addEventListener("click", () => setConnectionOpen(card, !card.classList.contains("is-open")));
  head.appendChild(who);
  head.appendChild(toggle);
  card.appendChild(head);
  const body = document.createElement("div");
  body.className = "connection-card-parts";
  parts.forEach(part => {
    const row = document.createElement("div");
    row.className = "connection-part";
    const title = document.createElement("div");
    title.className = "connection-part-title";
    title.textContent = part.label;
    row.appendChild(title);
    const on = !flags || flags[part.key] !== false;
    row.appendChild(settingsToggle(on, false, (checked) => saveConnectionPart(service, part.key, checked, row)));
    body.appendChild(row);
  });
  card.appendChild(body);
  const foot = document.createElement("div");
  foot.className = "connection-card-foot";
  const disconnect = document.createElement("button");
  disconnect.type = "button";
  disconnect.className = "connection-disconnect";
  disconnect.textContent = "Disconnect";
  disconnect.addEventListener("click", () => openConnectionDisconnect(service));
  foot.appendChild(disconnect);
  card.appendChild(foot);
  setConnectionOpen(card, true);
  return card;
}

function closeConnectionDisconnect() {
  const overlay = document.getElementById("connection-disconnect-overlay");
  if (overlay) overlay.hidden = true;
}

function openConnectionDisconnect(service) {
  const overlay = document.getElementById("connection-disconnect-overlay");
  if (!overlay) return;
  connectionDisconnectService = service;
  overlay.querySelector(".connection-disconnect-title").textContent = "Disconnect " + service;
  overlay.querySelector(".connection-disconnect-body").textContent = "Disconnecting " + service + " stops future access and deletes the data Oneira stored from that account.";
  const confirm = overlay.querySelector(".connection-disconnect-confirm");
  if (confirm) confirm.disabled = false;
  overlay.hidden = false;
  overlay.querySelector(".connection-disconnect-cancel").focus();
}

async function saveConnectionPart(service, key, enabled, row) {
  const slug = connectionSlug(service);
  try {
    const response = await fetch(`https://${serverAddress}/connections/part`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: slug, part: key, enabled: enabled })
    });
    if (!response.ok) throw new Error("fail");
  } catch (e) {
    const input = row.querySelector("input");
    if (input) input.checked = !enabled;
  }
}

async function submitConnectionDisconnect() {
  const overlay = document.getElementById("connection-disconnect-overlay");
  const service = connectionDisconnectService;
  const slug = connectionSlug(service);
  const confirm = overlay ? overlay.querySelector(".connection-disconnect-confirm") : null;
  if (!overlay || !slug || !confirm) return;
  confirm.disabled = true;
  try {
    const response = await fetch(`https://${serverAddress}/connections/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!response.ok) throw new Error("fail");
    closeConnectionDisconnect();
    if (typeof jumpToSettings === "function") jumpToSettings("connections");
  } catch (e) {
    confirm.disabled = false;
    overlay.querySelector(".connection-disconnect-body").textContent = "Could not disconnect " + service + ".";
  }
}

async function loadConnectionList(list) {
  list.replaceChildren();
  let rows = [];
  try {
    const response = await fetch(`https://${serverAddress}/connections`, { credentials: "include" });
    if (!response.ok) throw new Error("fail");
    const data = await response.json();
    rows = data.connections || [];
  } catch (e) {
    list.appendChild(settingsNote("Could not load connections."));
    return;
  }
  const notice = window.connectionLinkNotice;
  window.connectionLinkNotice = null;
  if (notice && notice.error) {
    list.appendChild(settingsNote(connectionLinkError(notice.provider, notice.error)));
  }
  if (notice && notice.pick === "1" && notice.provider === "youtube") {
    openYoutubePick();
  }
  if (!rows.length) return;
  const count = document.createElement("div");
  count.className = "settings-opt-title connection-count";
  count.textContent = rows.length === 1 ? "1 connection" : rows.length + " connections";
  list.appendChild(count);
  rows.forEach(item => {
    const provider = CONNECTION_PROVIDERS.find(row => row.slug === item.provider);
    if (!provider) return;
    const parts = connectionPartsFor(item.provider);
    list.appendChild(paintConnectionCard(provider.name, parts, item.parts || {}, item.name || provider.name));
  });
}

function ensureConnectionDisconnect() {
  if (document.getElementById("connection-disconnect-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "connection-disconnect-overlay";
  overlay.hidden = true;
  const modal = document.createElement("div");
  modal.className = "connection-disconnect-modal";
  const header = document.createElement("div");
  header.className = "view-header";
  const title = document.createElement("span");
  title.className = "connection-disconnect-title";
  title.textContent = "Disconnect";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn";
  close.title = "Close";
  close.textContent = "\u00d7";
  close.addEventListener("click", closeConnectionDisconnect);
  header.appendChild(title);
  header.appendChild(close);
  const viewBody = document.createElement("div");
  viewBody.className = "view-body";
  const copy = document.createElement("p");
  copy.className = "connection-disconnect-body";
  viewBody.appendChild(copy);
  const footer = document.createElement("div");
  footer.className = "connection-disconnect-footer";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost-btn connection-disconnect-cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", closeConnectionDisconnect);
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "deny-btn connection-disconnect-confirm";
  confirm.textContent = "Disconnect";
  confirm.addEventListener("click", () => submitConnectionDisconnect());
  footer.appendChild(cancel);
  footer.appendChild(confirm);
  modal.appendChild(header);
  modal.appendChild(viewBody);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeConnectionDisconnect();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) closeConnectionDisconnect();
  });
  document.body.appendChild(overlay);
}

function closeYoutubePick() {
  const overlay = document.getElementById("youtube-pick-overlay");
  if (overlay) overlay.hidden = true;
  youtubePickChannelId = "";
}

function paintYoutubePickRows(channels) {
  const list = document.getElementById("youtube-pick-list");
  const confirm = document.getElementById("youtube-pick-confirm");
  if (!list) return;
  list.replaceChildren();
  youtubePickChannelId = "";
  if (confirm) confirm.disabled = true;
  channels.forEach(item => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "youtube-pick-row";
    row.dataset.channelId = item.id || "";
    if (item.thumb) {
      const img = document.createElement("img");
      img.className = "youtube-pick-face";
      img.src = item.thumb;
      img.alt = "";
      row.appendChild(img);
    } else {
      const face = document.createElement("span");
      face.className = "youtube-pick-face is-empty";
      row.appendChild(face);
    }
    const name = document.createElement("span");
    name.className = "youtube-pick-name";
    name.textContent = item.title || "YouTube channel";
    row.appendChild(name);
    row.addEventListener("click", () => {
      youtubePickChannelId = row.dataset.channelId;
      list.querySelectorAll(".youtube-pick-row").forEach(el => el.classList.toggle("is-on", el === row));
      if (confirm) confirm.disabled = !youtubePickChannelId;
    });
    list.appendChild(row);
  });
}

async function openYoutubePick() {
  ensureYoutubePick();
  const overlay = document.getElementById("youtube-pick-overlay");
  const body = document.getElementById("youtube-pick-body");
  const confirm = document.getElementById("youtube-pick-confirm");
  if (!overlay) return;
  if (body) body.textContent = "Pick which YouTube channel to link.";
  if (confirm) confirm.disabled = true;
  overlay.hidden = false;
  try {
    const response = await fetch(`https://${serverAddress}/connections/youtube/pending`, { credentials: "include" });
    if (!response.ok) throw new Error("fail");
    const data = await response.json();
    const channels = data.channels || [];
    if (!channels.length) {
      closeYoutubePick();
      return;
    }
    paintYoutubePickRows(channels);
  } catch (e) {
    if (body) body.textContent = "Could not load your YouTube channels.";
  }
}

async function submitYoutubePick() {
  const overlay = document.getElementById("youtube-pick-overlay");
  const body = document.getElementById("youtube-pick-body");
  const confirm = document.getElementById("youtube-pick-confirm");
  if (!overlay || !youtubePickChannelId || !confirm) return;
  confirm.disabled = true;
  try {
    const response = await fetch(`https://${serverAddress}/connections/youtube/choose`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: youtubePickChannelId })
    });
    if (response.status === 409) {
      if (body) body.textContent = connectionLinkError("youtube", "taken");
      confirm.disabled = false;
      return;
    }
    if (!response.ok) throw new Error("fail");
    closeYoutubePick();
    if (typeof jumpToSettings === "function") jumpToSettings("connections");
  } catch (e) {
    if (body) body.textContent = "Could not finish that connection.";
    confirm.disabled = false;
  }
}

async function cancelYoutubePick() {
  try {
    await fetch(`https://${serverAddress}/connections/youtube/cancel`, {
      method: "POST",
      credentials: "include"
    });
  } catch (e) {}
  closeYoutubePick();
}

function ensureYoutubePick() {
  if (document.getElementById("youtube-pick-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "youtube-pick-overlay";
  overlay.hidden = true;
  const modal = document.createElement("div");
  modal.className = "leave-party-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "youtube-pick-title");
  const header = document.createElement("div");
  header.className = "leave-party-header";
  const title = document.createElement("span");
  title.id = "youtube-pick-title";
  title.className = "leave-party-title";
  title.textContent = "Choose a YouTube channel";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn";
  close.title = "Close";
  close.textContent = "\u00d7";
  close.addEventListener("click", () => cancelYoutubePick());
  header.appendChild(title);
  header.appendChild(close);
  const main = document.createElement("div");
  main.className = "leave-party-main";
  const copy = document.createElement("p");
  copy.id = "youtube-pick-body";
  copy.className = "leave-party-body";
  const list = document.createElement("div");
  list.id = "youtube-pick-list";
  list.className = "youtube-pick-list";
  main.appendChild(copy);
  main.appendChild(list);
  const footer = document.createElement("div");
  footer.className = "leave-party-footer";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost-btn";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => cancelYoutubePick());
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.id = "youtube-pick-confirm";
  confirm.className = "pill-btn";
  confirm.textContent = "Connect";
  confirm.disabled = true;
  confirm.addEventListener("click", () => submitYoutubePick());
  footer.appendChild(cancel);
  footer.appendChild(confirm);
  modal.appendChild(header);
  modal.appendChild(main);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cancelYoutubePick();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) cancelYoutubePick();
  });
  document.body.appendChild(overlay);
}

function paintConnections(host) {
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "These are accounts from other platforms. Connecting them here can unlock new features on Oneira, like sharing what you're playing or listening to, and more.";
  host.appendChild(blurb);

  const addTitle = document.createElement("div");
  addTitle.className = "settings-opt-title";
  addTitle.textContent = "Add a new connection";
  host.appendChild(addTitle);

  const row = document.createElement("div");
  row.className = "connections-add-row";
  CONNECTION_PROVIDERS.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "connection-provider";
    btn.title = item.name;
    btn.setAttribute("aria-label", item.name);
    const live = LIVE_CONNECTION_SLUGS.indexOf(item.slug) >= 0;
    btn.disabled = !live;
    if (live) {
      btn.addEventListener("click", () => {
        window.location.href = `https://${serverAddress}/connections/${item.slug}/start`;
      });
    }
    btn.appendChild(paintConnectionIcon(item));
    row.appendChild(btn);
  });
  const more = document.createElement("button");
  more.type = "button";
  more.className = "connection-provider is-more";
  more.title = "More";
  more.setAttribute("aria-label", "More");
  more.disabled = true;
  more.textContent = "\u203a";
  row.appendChild(more);
  host.appendChild(row);

  const list = document.createElement("div");
  list.className = "connection-list";
  host.appendChild(list);
  loadConnectionList(list);
}

function paintAuthorizedApps(host) {
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "These include third-party services you've given permission to access your Oneira account. You can review what each app can do and revoke access anytime.";
  host.appendChild(blurb);

  const search = document.createElement("input");
  search.type = "search";
  search.className = "settings-activity-search";
  search.placeholder = "Search installed apps";
  search.autocomplete = "off";
  search.disabled = true;
  host.appendChild(search);

  const empty = document.createElement("div");
  empty.className = "settings-empty-card is-left";
  const emptyTitle = document.createElement("div");
  emptyTitle.className = "settings-opt-title";
  emptyTitle.textContent = "No authorized apps";
  const emptyBody = document.createElement("div");
  emptyBody.className = "settings-opt-desc";
  emptyBody.textContent = "Games and bots you authorize show here, with what they can access and a way to deauthorize them.";
  empty.appendChild(emptyTitle);
  empty.appendChild(emptyBody);
  host.appendChild(empty);
  host.appendChild(appsLaterNote("developer platform"));
}

function renderConnectedAppsSettings(pane, jumpChildId) {
  ensureConnectionDisconnect();
  ensureYoutubePick();
  pane.innerHTML = "";
  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("connected-apps");
  const heading = document.createElement("h2");
  heading.className = "settings-block-title";
  heading.textContent = "Connected Apps";
  block.appendChild(heading);

  const sections = [
    ["connections", "Connections", paintConnections],
    ["authorized-apps", "Authorized Apps", paintAuthorizedApps]
  ];
  sections.forEach(row => {
    const sub = document.createElement("div");
    sub.className = "settings-subblock";
    sub.id = settingsTargetId(row[0]);
    const subTitle = document.createElement("h3");
    subTitle.className = "settings-subblock-title";
    subTitle.textContent = row[1];
    sub.appendChild(subTitle);
    row[2](sub);
    block.appendChild(sub);
  });

  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}
