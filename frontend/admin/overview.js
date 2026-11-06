function overviewHeading(host, title, note) {
  const heading = document.createElement("h1");
  heading.className = "admin-page-title";
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.className = "admin-page-note";
  copy.textContent = note;
  host.appendChild(heading);
  host.appendChild(copy);
}

function overviewTile(label, value, sub) {
  const tile = document.createElement("div");
  tile.className = "overview-tile is-placeholder";
  const name = document.createElement("div");
  name.className = "overview-tile-label";
  name.textContent = label;
  const number = document.createElement("div");
  number.className = "overview-tile-value";
  number.textContent = value;
  tile.appendChild(name);
  tile.appendChild(number);
  if (sub) {
    const line = document.createElement("div");
    line.className = "overview-tile-sub";
    line.textContent = sub;
    tile.appendChild(line);
  }
  return tile;
}

function overviewSplitTile(label, parts) {
  const tile = overviewTile(label, parts.total);
  const split = document.createElement("div");
  split.className = "overview-split";
  parts.items.forEach((item) => {
    const bit = document.createElement("div");
    bit.className = "overview-split-item";
    const n = document.createElement("div");
    n.className = "overview-split-n";
    n.textContent = item.value;
    const k = document.createElement("div");
    k.className = "overview-split-k";
    k.textContent = item.label;
    bit.appendChild(n);
    bit.appendChild(k);
    split.appendChild(bit);
  });
  tile.appendChild(split);
  return tile;
}

function overviewList(host, title, rows) {
  const block = document.createElement("div");
  block.className = "overview-block";
  const heading = document.createElement("h2");
  heading.className = "overview-block-title";
  heading.textContent = title;
  const list = document.createElement("div");
  list.className = "overview-list";
  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "overview-row is-placeholder";
    const face = document.createElement("div");
    face.className = "overview-face";
    const text = document.createElement("div");
    text.className = "overview-row-text";
    const name = document.createElement("div");
    name.className = "overview-row-name";
    name.textContent = row.name;
    const sub = document.createElement("div");
    sub.className = "overview-row-sub";
    sub.textContent = row.sub;
    text.appendChild(name);
    text.appendChild(sub);
    const meta = document.createElement("div");
    meta.className = "overview-row-meta";
    meta.textContent = row.meta;
    item.appendChild(face);
    item.appendChild(text);
    item.appendChild(meta);
    list.appendChild(item);
  });
  block.appendChild(heading);
  block.appendChild(list);
  host.appendChild(block);
}

function overviewGrid(host, tiles) {
  const grid = document.createElement("div");
  grid.className = "overview-grid";
  tiles.forEach((tile) => grid.appendChild(tile));
  host.appendChild(grid);
}

function paintOverviewStatistics(main) {
  overviewHeading(main, "Statistics", "A briefing of what is happening on Oneira.");
  overviewGrid(main, [
    overviewTile("Total accounts", "0"),
    overviewTile("Online now", "0"),
    overviewTile("New accounts today", "0"),
    overviewSplitTile("Open reports", {
      total: "0",
      items: [
        { label: "Bug", value: "0" },
        { label: "Feature", value: "0" },
        { label: "Inquiry", value: "0" },
        { label: "User/Server", value: "0" }
      ]
    }),
    overviewTile("Auto-mod flags", "0", "Silent flags only. Never warns, bans, or deletes."),
    overviewTile("Servers", "0", "0 created today"),
    overviewSplitTile("Community", {
      total: "0",
      items: [
        { label: "Posts", value: "0" },
        { label: "Rooms", value: "0" },
        { label: "Finder", value: "0" }
      ]
    }),
    overviewTile("Active site bans", "0")
  ]);
}

function paintOverviewAccounts(main) {
  overviewHeading(main, "Accounts", "Who has joined Oneira and who is on the site right now.");
  overviewGrid(main, [
    overviewTile("Total accounts", "0"),
    overviewTile("Online now", "0"),
    overviewTile("New today", "0"),
    overviewTile("New last 7 days", "0"),
    overviewTile("Warned", "0"),
    overviewTile("Banned", "0")
  ]);
  overviewList(main, "Recent signups", [
    { name: "New account", sub: "Username", meta: "Today" },
    { name: "New account", sub: "Username", meta: "Today" },
    { name: "New account", sub: "Username", meta: "Yesterday" },
    { name: "New account", sub: "Username", meta: "Yesterday" },
    { name: "New account", sub: "Username", meta: "This week" }
  ]);
}

function paintOverviewReports(main) {
  overviewHeading(main, "Reports", "Feedback notes waiting for review. Completing a ticket happens on Reports.");
  overviewGrid(main, [
    overviewTile("Open", "0"),
    overviewTile("In review", "0"),
    overviewTile("Completed", "0")
  ]);
  overviewGrid(main, [
    overviewTile("Bug Report", "0"),
    overviewTile("Feature Request", "0"),
    overviewTile("General Inquiries", "0"),
    overviewTile("User/Server Report", "0")
  ]);
  overviewList(main, "Recent tickets", [
    { name: "Bug Report", sub: "Username", meta: "New" },
    { name: "Feature Request", sub: "Username", meta: "Viewed" },
    { name: "User/Server Report", sub: "Username", meta: "In review" },
    { name: "General Inquiries", sub: "Username", meta: "New" },
    { name: "Bug Report", sub: "Username", meta: "Viewed" }
  ]);
}

function paintOverviewAutoMod(main) {
  overviewHeading(main, "Auto mod", "Silent flags on public posts, users, and pages. Auto moderation never warns, bans, or deletes.");
  overviewGrid(main, [
    overviewTile("Open flags", "0"),
    overviewTile("Posts", "0"),
    overviewTile("Users", "0"),
    overviewTile("Public pages", "0")
  ]);
  overviewList(main, "Recent flags", [
    { name: "Flagged post", sub: "Community", meta: "Today" },
    { name: "Flagged user", sub: "Accounts", meta: "Today" },
    { name: "Flagged listing", sub: "Finder", meta: "Yesterday" },
    { name: "Flagged room", sub: "Rooms", meta: "Yesterday" },
    { name: "Flagged post", sub: "Community", meta: "This week" }
  ]);
}

function paintOverviewServers(main) {
  overviewHeading(main, "Servers", "How many servers exist and how fast new ones appear.");
  overviewGrid(main, [
    overviewTile("Total servers", "0"),
    overviewTile("Created today", "0"),
    overviewTile("Created last 7 days", "0")
  ]);
  overviewList(main, "Recent servers", [
    { name: "Server", sub: "Owner", meta: "Today" },
    { name: "Server", sub: "Owner", meta: "Today" },
    { name: "Server", sub: "Owner", meta: "Yesterday" },
    { name: "Server", sub: "Owner", meta: "Yesterday" },
    { name: "Server", sub: "Owner", meta: "This week" }
  ]);
}

function paintOverviewCommunity(main) {
  overviewHeading(main, "Community", "Public Communities load across posts, rooms, and the server finder.");
  overviewGrid(main, [
    overviewTile("Posts", "0"),
    overviewTile("Rooms", "0"),
    overviewTile("Finder listings", "0")
  ]);
  overviewList(main, "Recent posts", [
    { name: "Post", sub: "Author", meta: "Today" },
    { name: "Post", sub: "Author", meta: "Today" },
    { name: "Post", sub: "Author", meta: "Yesterday" }
  ]);
  overviewList(main, "Recent rooms", [
    { name: "Room", sub: "Host", meta: "Today" },
    { name: "Room", sub: "Host", meta: "Yesterday" }
  ]);
  overviewList(main, "Recent finder listings", [
    { name: "Listing", sub: "Server", meta: "Today" },
    { name: "Listing", sub: "Server", meta: "Yesterday" }
  ]);
}

function paintOverview(main, sectionId) {
  if (sectionId === "accounts") return paintOverviewAccounts(main);
  if (sectionId === "reports") return paintOverviewReports(main);
  if (sectionId === "auto-mod") return paintOverviewAutoMod(main);
  if (sectionId === "servers") return paintOverviewServers(main);
  if (sectionId === "community") return paintOverviewCommunity(main);
  paintOverviewStatistics(main);
}

registerAdminPage({
  id: "overview",
  label: "Overview",
  sections: [
    { id: "statistics", label: "Statistics" },
    { id: "accounts", label: "Accounts" },
    { id: "reports", label: "Reports" },
    { id: "auto-mod", label: "Auto mod" },
    { id: "servers", label: "Servers" },
    { id: "community", label: "Community" }
  ],
  paint: paintOverview
});
