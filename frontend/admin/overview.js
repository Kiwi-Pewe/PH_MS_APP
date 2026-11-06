let overviewStats = null;
let overviewStatsAt = 0;
let overviewStatsLoading = false;

function overviewNum(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function overviewPct(now, prev, suffix) {
  const a = Number(now) || 0;
  const b = Number(prev) || 0;
  if (b <= 0) {
    if (a <= 0) return { text: "0% " + suffix, tone: "flat" };
    return { text: "↑ " + suffix, tone: "up" };
  }
  const pct = Math.round(((a - b) * 1000) / b) / 10;
  const tone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const arrow = pct > 0 ? "↑ " : pct < 0 ? "↓ " : "";
  return { text: arrow + Math.abs(pct) + "% " + suffix, tone: tone };
}

function overviewMax(bars) {
  let max = 0;
  (bars || []).forEach((bar) => {
    const n = Number(bar.value) || 0;
    if (n > max) max = n;
  });
  return max || 1;
}

function paintOverviewStatistics(main, stats) {
  main.className = "is-fit";
  const accounts = (stats && stats.accounts) || {};
  const reports = (stats && stats.reports) || {};
  const servers = (stats && stats.servers) || {};
  const community = (stats && stats.community) || {};
  const growth = (stats && stats.growth) || {};
  const pulse = (stats && stats.pulse) || {};
  const accountDelta = overviewPct(accounts.new_24h, accounts.new_prev_24h, "new vs previous day");
  const reportDelta = overviewPct(reports.new_24h, reports.new_prev_24h, "new vs previous day");
  const communityDelta = overviewPct(community.posts_24h, community.posts_prev_24h, "vs previous day");
  const weekDelta = overviewPct(growth.week, growth.prev_week, "vs previous week");
  const activeDelta = overviewPct(pulse.active_24h, pulse.active_prev_24h, "");
  const messageDelta = overviewPct(pulse.messages_24h, pulse.messages_prev_24h, "");
  const growthWord = growth.vs_week === "below" ? "below" : growth.vs_week === "even" ? "even with" : "above";
  const bars = growth.bars || [];
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Statistics"],
    title: "Statistics",
    note: "Oneira at a glance. Activity, growth, and signals worth knowing about.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  main.appendChild(adminBanner(
    "All systems operational",
    overviewNum(reports.open) + " open reports. Account growth is " + growthWord + " the weekly baseline."
  ));
  adminKpiRow(main, [
    {
      label: "Accounts",
      value: overviewNum(accounts.total),
      icon: "users",
      detail: overviewNum(accounts.new_24h) + " new in the last 24h",
      delta: accountDelta.text,
      tone: accountDelta.tone
    },
    {
      label: "Reports",
      value: overviewNum(reports.open),
      icon: "flag",
      detail: "Open reports",
      delta: reportDelta.text,
      tone: reportDelta.tone
    },
    {
      label: "Auto mod",
      value: "0",
      icon: "shield",
      detail: "Flags only · never acts on accounts",
      delta: "0% flags vs previous day",
      tone: "flat"
    },
    {
      label: "Servers",
      value: overviewNum(servers.total),
      icon: "grid",
      detail: overviewNum(servers.active_24h) + " active in the last 24h",
      delta: "+" + overviewNum(servers.created_24h) + " created in the last 24h",
      tone: Number(servers.created_24h) > 0 ? "up" : "flat"
    },
    {
      label: "Community",
      value: overviewNum(community.posts_24h),
      icon: "share",
      detail: "Posts submitted in the last 24h",
      delta: communityDelta.text,
      tone: communityDelta.tone
    }
  ]);
  const dash = adminEl("div", "overview-dash");
  const left = adminEl("div", "overview-stack");
  const growthPanel = adminPanel({ title: "Account growth", meta: growth.range || "Last 7 days" });
  const line = adminEl("div", "overview-growth-line");
  const total = adminEl("div", "overview-growth-n", overviewNum(growth.week));
  total.appendChild(adminEl("span", "", "new accounts this week"));
  line.appendChild(total);
  line.appendChild(adminEl("div", "overview-delta is-" + weekDelta.tone, weekDelta.text));
  growthPanel.body.appendChild(line);
  const max = overviewMax(bars);
  growthPanel.body.appendChild(adminBarChart({
    max: max,
    scale: [String(max), String(Math.round(max / 2)), "0"],
    bars: bars
  }));
  left.appendChild(growthPanel.panel);
  const queue = adminPanel({
    title: "Report queue snapshot",
    meta: overviewNum(reports.open) + " open",
    foot: "Snapshot data · Updates every 5 minutes"
  });
  queue.body.appendChild(adminTable(
    ["Priority", "Open", "Oldest", "Share"],
    [
      ["High priority", "—", "—", "—"],
      ["Normal priority", "—", "—", "—"],
      ["Low priority", "—", "—", "—"]
    ]
  ));
  left.appendChild(queue.panel);
  const right = adminEl("div", "overview-stack");
  const pulsePanel = adminPanel({ title: "Site pulse", meta: "Last 24h" });
  pulsePanel.body.appendChild(adminPulse(
    [
      { label: "Platform availability", pill: "Operational" },
      { label: "Active accounts", value: overviewNum(pulse.active_24h), delta: activeDelta.text.replace(/\s+$/, ""), tone: activeDelta.tone },
      { label: "Messages", value: overviewNum(pulse.messages_24h), delta: messageDelta.text.replace(/\s+$/, ""), tone: messageDelta.tone },
      {
        label: "New servers",
        value: overviewNum(pulse.servers_24h),
        delta: "+" + overviewNum(pulse.servers_today) + " today",
        tone: Number(pulse.servers_today) > 0 ? "up" : "flat"
      }
    ],
    "No service incidents in the last 24 hours."
  ));
  right.appendChild(pulsePanel.panel);
  right.appendChild(adminPanel({ title: "Worth noting", meta: "Today" }).panel);
  dash.appendChild(left);
  dash.appendChild(right);
  main.appendChild(dash);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function loadOverviewStats() {
  if (overviewStatsLoading) return;
  if (overviewStats && Date.now() - overviewStatsAt < 30000) return;
  overviewStatsLoading = true;
  adminApi("/admin/overview/stats").then((response) => response.json().then((data) => {
    overviewStatsLoading = false;
    if (!response.ok) return;
    overviewStats = data;
    overviewStatsAt = Date.now();
    if (adminPage === "overview" && (adminSection === "statistics" || adminSection === "accounts")) paintAdminMain();
  })).catch(() => {
    overviewStatsLoading = false;
  });
}

function overviewJoinedClock(raw) {
  if (!raw) return "";
  const when = new Date(String(raw).replace(" ", "T") + "Z");
  if (Number.isNaN(when.getTime())) return "";
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
  const diff = Math.round((today - day) / 86400000);
  const hm = adminPad(when.getUTCHours()) + ":" + adminPad(when.getUTCMinutes());
  if (diff <= 0) return "Today, " + hm;
  if (diff === 1) return "Yesterday, " + hm;
  return adminPad(when.getUTCDate()) + " " + ADMIN_MONTHS[when.getUTCMonth()] + ", " + hm;
}

function paintOverviewAccounts(main, stats) {
  main.className = "is-fit";
  const accounts = (stats && stats.accounts) || {};
  const pulse = (stats && stats.pulse) || {};
  const recent = accounts.recent || [];
  const total = Number(accounts.total) || 0;
  const fresh = Number(accounts.new_24h) || 0;
  const active = Number(pulse.active_24h) || 0;
  const verified = 0;
  const awaiting = 0;
  const newDelta = overviewPct(accounts.new_24h, accounts.new_prev_24h, "vs previous 24h");
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Accounts"],
    title: "Accounts",
    note: "Account growth, verification and recent registrations across the site.",
    filter: "Last 24 hours",
    range: "compared with previous day"
  }));
  adminKpiRow(main, [
    {
      label: "Total accounts",
      value: overviewNum(total),
      icon: "users",
      detail: "All registered accounts"
    },
    {
      label: "New accounts",
      value: overviewNum(fresh),
      icon: "plus",
      delta: newDelta.text.replace("↑ ", "+").replace("↓ ", "−"),
      tone: newDelta.tone
    },
    {
      label: "Verified accounts",
      value: overviewNum(verified),
      icon: "check",
      detail: (total > 0 ? ((verified * 1000) / total / 10).toFixed(1) : "0.0") + "% of all accounts"
    },
    {
      label: "Active accounts",
      value: overviewNum(active),
      icon: "activity",
      detail: "Signed in during the last 24h"
    }
  ]);
  const mid = adminEl("div", "overview-mid");
  const dash = adminEl("div", "overview-dash");
  const verify = adminPanel({ title: "Verification status", meta: overviewNum(total) + " accounts" });
  verify.body.appendChild(adminMeterList(
    [
      { label: "Verified", value: verified, total: total },
      { label: "Awaiting verification", value: awaiting, total: total }
    ],
    overviewNum(verified) + " of today's " + overviewNum(accounts.new_today) + " new accounts are verified."
  ));
  dash.appendChild(verify.panel);
  const sources = adminPanel({ title: "Registration sources", meta: overviewNum(fresh) + " new · Last 24h" });
  sources.body.appendChild(adminMeterList([
    { label: "Discovery & organic", value: 0, total: fresh },
    { label: "Server invitations", value: 0, total: fresh },
    { label: "Direct visits", value: 0, total: fresh }
  ]));
  dash.appendChild(sources.panel);
  mid.appendChild(dash);
  main.appendChild(mid);
  const list = adminPanel({
    title: "Recent registrations",
    meta: "Latest " + recent.length + " of " + overviewNum(fresh) + " · Last 24h",
    foot: "Snapshot data · Updates every 5 minutes"
  });
  list.panel.classList.add("is-fill");
  const rows = recent.map((row) => [
    row.username ? "@" + row.username : "—",
    overviewJoinedClock(row.created_at),
    "—",
    "—"
  ]);
  list.body.appendChild(adminTable(
    ["Account", "Joined", "Source", "Verification"],
    rows.length ? rows : [["No recent registrations", "", "", ""]],
    "is-start"
  ));
  main.appendChild(list.panel);
  main.appendChild(adminEl("div", "overview-page-foot", "All times UTC · Site-wide"));
}

function paintOverviewReports(main) {
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Overview", "Reports"],
    title: "Reports",
    note: "Feedback notes waiting for review. Completing a ticket happens on Reports.",
    badge: "Read only"
  }));
  adminKpiRow(main, [
    { label: "Open", value: "0", icon: "flag" },
    { label: "High priority", value: "0", icon: "flag" },
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
    { label: "Open flags", value: "0", icon: "shield" },
    { label: "Flagged", value: "0", icon: "flag" },
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
    { label: "Total servers", value: "0", icon: "grid" },
    { label: "Active last 24h", value: "0", icon: "eye" },
    { label: "Created today", value: "0", icon: "grid" }
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
    { label: "Posts", value: "0", icon: "share" },
    { label: "Rooms", value: "0", icon: "users" },
    { label: "Finder listings", value: "0", icon: "grid" }
  ]);
}

function paintOverview(main, sectionId) {
  if (sectionId === "accounts") {
    paintOverviewAccounts(main, overviewStats);
    loadOverviewStats();
    return;
  }
  if (sectionId === "reports") return paintOverviewReports(main);
  if (sectionId === "auto-mod") return paintOverviewAutoMod(main);
  if (sectionId === "servers") return paintOverviewServers(main);
  if (sectionId === "community") return paintOverviewCommunity(main);
  paintOverviewStatistics(main, overviewStats);
  loadOverviewStats();
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
