function paintOverviewStatistics(main) {
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Statistics"],
    title: "Statistics",
    note: "Your site at a glance. Activity, growth and signals worth knowing about.",
    badge: "Read only",
    range: "Last 24 hours · compared with previous day"
  }));
  main.appendChild(adminBanner(
    "All systems operational",
    "38 open reports, including 8 high priority. Account growth is above the weekly baseline."
  ));
  adminKpiRow(main, [
    { label: "Accounts", value: "12,480", icon: "users", detail: "186 new in the last 24h", delta: "↑ 6.9% new vs previous day", tone: "up" },
    { label: "Reports", value: "38", icon: "flag", detail: "Open reports · 8 high priority", delta: "↓ 4 open vs previous day", tone: "down" },
    { label: "Auto mod", value: "126", icon: "shield", detail: "88 blocked · 28 flagged", delta: "↑ 14.5% events vs previous day", tone: "up" },
    { label: "Servers", value: "842", icon: "grid", detail: "612 active in the last 24h", delta: "+14 created in the last 24h", tone: "flat" },
    { label: "Community", value: "2,416", icon: "share", detail: "Posts submitted in the last 24h", delta: "↑ 9.4% vs previous day", tone: "up" }
  ]);
  const dash = adminEl("div", "overview-dash");
  const left = adminEl("div", "overview-stack");
  const growth = adminPanel({ title: "Account growth", meta: "31 Oct – 06 Nov · 7 days" });
  const line = adminEl("div", "overview-growth-line");
  const total = adminEl("div", "overview-growth-n", "1,084");
  total.appendChild(adminEl("span", "", "new accounts this week"));
  line.appendChild(total);
  line.appendChild(adminEl("div", "overview-delta is-up", "↑ 13.3% vs previous week"));
  growth.body.appendChild(line);
  growth.body.appendChild(adminBarChart({
    max: 200,
    scale: ["200", "100", "0"],
    bars: [
      { label: "31 Oct", value: 122 },
      { label: "01 Nov", value: 148 },
      { label: "02 Nov", value: 124 },
      { label: "03 Nov", value: 167 },
      { label: "04 Nov", value: 153 },
      { label: "05 Nov", value: 174 },
      { label: "06 Nov", value: 186, hot: true }
    ]
  }));
  left.appendChild(growth.panel);
  const queue = adminPanel({
    title: "Report queue snapshot",
    meta: "Read only · 38 open",
    foot: "Snapshot data · Updates every 5 minutes"
  });
  queue.body.appendChild(adminTable(
    ["Priority", "Open", "Oldest", "Share"],
    [
      ["High priority", "8", "2h 14m", "21%"],
      ["Normal priority", "19", "5h 32m", "50%"],
      ["Low priority", "11", "8h 06m", "29%"]
    ]
  ));
  left.appendChild(queue.panel);
  const right = adminEl("div", "overview-stack");
  const pulse = adminPanel({ title: "Site pulse", meta: "Last 24h" });
  pulse.body.appendChild(adminPulse(
    [
      { label: "Platform availability", pill: "Operational" },
      { label: "Active accounts", value: "3,248", delta: "+8.2%", tone: "up" },
      { label: "Messages", value: "18,720", delta: "+6.1%", tone: "up" },
      { label: "New servers", value: "14", delta: "+4 today", tone: "up" }
    ],
    "No service incidents in the last 24 hours."
  ));
  right.appendChild(pulse.panel);
  const noting = adminPanel({ title: "Worth noting", meta: "Today" });
  noting.body.appendChild(adminNotes([
    {
      title: "Spam is the leading auto mod signal",
      copy: "88 of 126 events came from spam detection."
    },
    {
      title: "Community participation is growing",
      copy: "1,854 people contributed across 612 active servers."
    }
  ]));
  right.appendChild(noting.panel);
  dash.appendChild(left);
  dash.appendChild(right);
  main.appendChild(dash);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function paintOverviewAccounts(main) {
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Accounts"],
    title: "Accounts",
    note: "Who has joined Oneira and who is on the site right now.",
    badge: "Read only"
  }));
  adminKpiRow(main, [
    { label: "Total accounts", value: "12,480", icon: "users" },
    { label: "Online now", value: "3,248", icon: "eye" },
    { label: "New today", value: "186", icon: "users", delta: "↑ 6.9% vs previous day", tone: "up" },
    { label: "Warned", value: "0", icon: "flag" },
    { label: "Banned", value: "0", icon: "shield" }
  ]);
}

function paintOverviewReports(main) {
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Reports"],
    title: "Reports",
    note: "Feedback notes waiting for review. Completing a ticket happens on Reports.",
    badge: "Read only"
  }));
  adminKpiRow(main, [
    { label: "Open", value: "38", icon: "flag" },
    { label: "High priority", value: "8", icon: "flag" },
    { label: "In review", value: "0", icon: "eye" },
    { label: "Completed", value: "0", icon: "chart" },
    { label: "User/Server", value: "0", icon: "users" }
  ]);
}

function paintOverviewAutoMod(main) {
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Auto mod"],
    title: "Auto mod",
    note: "Silent flags on public posts, users, and pages. Auto moderation never warns, bans, or deletes.",
    badge: "Read only"
  }));
  adminKpiRow(main, [
    { label: "Open flags", value: "126", icon: "shield" },
    { label: "Blocked", value: "88", icon: "shield" },
    { label: "Flagged", value: "28", icon: "flag" },
    { label: "Posts", value: "0", icon: "share" },
    { label: "Users", value: "0", icon: "users" }
  ]);
}

function paintOverviewServers(main) {
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Servers"],
    title: "Servers",
    note: "How many servers exist and how fast new ones appear.",
    badge: "Read only"
  }));
  adminKpiRow(main, [
    { label: "Total servers", value: "842", icon: "grid" },
    { label: "Active last 24h", value: "612", icon: "eye" },
    { label: "Created today", value: "14", icon: "grid", delta: "+14 created in the last 24h", tone: "flat" }
  ]);
}

function paintOverviewCommunity(main) {
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Community"],
    title: "Community",
    note: "Public Communities load across posts, rooms, and the server finder.",
    badge: "Read only"
  }));
  adminKpiRow(main, [
    { label: "Posts", value: "2,416", icon: "share" },
    { label: "Rooms", value: "0", icon: "users" },
    { label: "Finder listings", value: "0", icon: "grid" }
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
    { id: "statistics", label: "Statistics", icon: "chart" },
    { id: "accounts", label: "Accounts", icon: "users" },
    { id: "reports", label: "Reports", icon: "flag" },
    { id: "auto-mod", label: "Auto mod", icon: "shield" },
    { id: "servers", label: "Servers", icon: "grid" },
    { id: "community", label: "Community", icon: "share" }
  ],
  paint: paintOverview
});
