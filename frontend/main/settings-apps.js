// ==================================================================
// settings-apps.js - Connected Apps. Connections are other-platform
// accounts. Authorized Apps are games/bots that were granted account
// access. Both wait — no OAuth, bots, or third-party games yet.
// Nitro Rewards are Billing; they are not on this page.
// ==================================================================

const APPS_LATER = "This feature isn't built yet.";

function appsLaterNote(text) {
  return settingsNote(text || APPS_LATER, "later");
}

const CONNECTION_PROVIDERS = [
  { name: "YouTube", mark: "\u25b6", color: "#ff0033" },
  { name: "Battle.net", mark: "B", color: "#148eff" },
  { name: "Bluesky", mark: "B", color: "#1185fe" },
  { name: "Patreon", mark: "P", color: "#ff424d" },
  { name: "Reddit", mark: "R", color: "#ff4500" },
  { name: "Steam", mark: "S", color: "#1b2838", ink: "#66c0f4" },
  { name: "X", mark: "X", color: "#0f0f0f", ink: "#e7e9ea" },
  { name: "eBay", mark: "e", color: "#e53238" },
  { name: "Crunchyroll", mark: "C", color: "#f47521" },
  { name: "PlayStation", mark: "PS", color: "#003791" }
];

const STEAM_CONNECTION_PARTS = [
  "Identity",
  "Playing now",
  "Recently played",
  "Library",
  "Achievements",
  "Level and badges"
];

function paintConnectionIcon(name, mark, color, ink) {
  const face = document.createElement("span");
  face.className = "connection-face";
  face.style.background = color;
  face.style.color = ink || "#fff";
  face.textContent = mark;
  face.title = name;
  return face;
}

function paintConnectionCard(service, parts) {
  const card = document.createElement("div");
  card.className = "connection-card";
  const head = document.createElement("div");
  head.className = "connection-card-head";
  const provider = CONNECTION_PROVIDERS.find(item => item.name === service);
  head.appendChild(paintConnectionIcon(service, provider ? provider.mark : service.slice(0, 1), provider ? provider.color : "var(--panel)", provider && provider.ink));
  const who = document.createElement("div");
  who.className = "connection-card-who";
  const account = document.createElement("div");
  account.className = "connection-card-name is-empty";
  account.textContent = service + " name";
  const label = document.createElement("div");
  label.className = "connection-card-service";
  label.textContent = service;
  who.appendChild(account);
  who.appendChild(label);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "connection-card-remove";
  remove.disabled = true;
  remove.setAttribute("aria-label", "Disconnect " + service);
  remove.textContent = "\u00d7";
  head.appendChild(who);
  head.appendChild(remove);
  card.appendChild(head);
  parts.forEach(part => {
    const row = document.createElement("div");
    row.className = "connection-part";
    const title = document.createElement("div");
    title.className = "connection-part-title";
    title.textContent = part;
    row.appendChild(title);
    row.appendChild(settingsToggle(false, true));
    card.appendChild(row);
  });
  return card;
}

function paintConnections(host) {
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "These are accounts from other platforms. Connecting them here can unlock new features on Oneira, like the ability to share what you're currently listening to, get paid safely and securely, and more.";
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
    btn.disabled = true;
    btn.appendChild(paintConnectionIcon(item.name, item.mark, item.color, item.ink));
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

  const count = document.createElement("div");
  count.className = "settings-opt-title connection-count";
  count.textContent = "1 connection";
  host.appendChild(count);
  host.appendChild(paintConnectionCard("Steam", STEAM_CONNECTION_PARTS));
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
  emptyBody.textContent = "Games and bots you authorize would show here, with what they can access and a way to deauthorize them.";
  empty.appendChild(emptyTitle);
  empty.appendChild(emptyBody);
  host.appendChild(empty);
  host.appendChild(appsLaterNote("This waits on a developer platform so games and bots can ask for access — email, username, and banner at minimum. Some apps would request more. None of that exists yet."));
}

function renderConnectedAppsSettings(pane, jumpChildId) {
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
