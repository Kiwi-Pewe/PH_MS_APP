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
  "YouTube",
  "Battle.net",
  "Bluesky",
  "Patreon",
  "Reddit",
  "Steam",
  "X",
  "eBay",
  "Crunchyroll",
  "PlayStation"
];

function connectionLetter(name) {
  if (name === "Battle.net") return "Bn";
  if (name === "PlayStation") return "PS";
  if (name === "Crunchyroll") return "Cr";
  return (name || "?").slice(0, 1);
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
  CONNECTION_PROVIDERS.forEach(name => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "connection-provider";
    btn.title = name;
    btn.setAttribute("aria-label", name);
    btn.disabled = true;
    btn.textContent = connectionLetter(name);
    row.appendChild(btn);
  });
  const more = document.createElement("button");
  more.type = "button";
  more.className = "connection-provider is-more";
  more.title = "More";
  more.setAttribute("aria-label", "More");
  more.disabled = true;
  more.textContent = ">";
  row.appendChild(more);
  host.appendChild(row);

  const count = document.createElement("div");
  count.className = "settings-opt-title";
  count.style.marginTop = "18px";
  count.textContent = "0 connections";
  host.appendChild(count);

  const empty = document.createElement("div");
  empty.className = "settings-empty-card is-left";
  const emptyTitle = document.createElement("div");
  emptyTitle.className = "settings-opt-title";
  emptyTitle.textContent = "No connections";
  const emptyBody = document.createElement("div");
  emptyBody.className = "settings-opt-desc";
  emptyBody.textContent = "Accounts you link here can show on your profile. Display on profile would be a toggle on each connection.";
  empty.appendChild(emptyTitle);
  empty.appendChild(emptyBody);
  host.appendChild(empty);
  host.appendChild(appsLaterNote("Linking accounts like Steam or Roblox isn't built yet. That's why the list is empty."));
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
